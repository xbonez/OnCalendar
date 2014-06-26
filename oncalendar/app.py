from apscheduler.scheduler import Scheduler
from flask import Flask, render_template, url_for, request, flash, redirect, g
import flask.ext.login as flogin
import json
import logging
import MySQLdb as mysql
import os
import re
import uwsgi

from oncalendar import default_log_handler
from oncalendar.api_exceptions import OnCalendarAPIError, OnCalendarAuthError, ocapi_err
import oncalendar.auth as auth
from oncalendar.db_interface import OnCalendarDB, OnCalendarDBError, OnCalendarDBInitTSError
import oncalendar.forms as forms
from oncalendar.nagios_interface import OnCalendarNagiosLivestatus, OnCalendarNagiosError
from oncalendar.oc_config import config
from oncalendar.sms_interface import OnCalendarSMS, OnCalendarSMSError



# -----------------------
# Scheduled job functions
# -----------------------
def start_scheduler(master_takeover=False):
    """
    Checks to make sure this instance is the job (and if necessary)
    cluster master, adds the scheduled jobs and starts them.
    """

    ocapp.aps_logger.debug('Starting the job scheduler')
    job_master = False
    if config.basic['JOB_MASTER']:
        ocapp.aps_logger.debug('I am the Job Master')
        job_master = True

        if config.basic['CLUSTERED']:
            if not master_takeover and not uwsgi.i_am_the_lord(config.basic['CLUSTER_NAME']):
                ocapp.aps_logger.debug('But I am not the Cluster Lord...')
                job_master = False

        if job_master:
            # event 64 = EVENT_JOB_EXECUTED, 256 = EVENT_JOB_MISSED
            ocapp.scheduler.add_listener(scheduled_job_listener, 64|256)

            ocapp.scheduler.add_interval_job(check_current_victims, minutes=1, coalesce=True)
            ocapp.scheduler.add_interval_job(check_calendar_gaps_8hour, hours=1)
            ocapp.scheduler.add_cron_job(check_calendar_gaps_48hour, hour='9,12,15,18')
            ocapp.scheduler.add_interval_job(get_incoming_sms, seconds=30, coalesce=True)

            ocapp.scheduler.start()

    return job_master


def stop_scheduler():
    """
    Stops scheduler and removes all scheduled jobs in the event this instance
    is no longer the job and/or cluster master
    """

    jobs = ocapp.scheduler.get_jobs()
    for job in jobs:
        ocapp.scheduler.unschedule_job(job)

    ocapp.scheduler.shutdown()

    return True


def scheduled_job_listener(event):
    """
    Listener for scheduled job events, watches for the frequently firing
    events and restarts the scheduler if they get hung up

    Args:
        (JobEvent): The event fired by the scheduled job
    """
    job = event.job.__str__().split()
    jobname = job[0]
    ocapp.aps_logger.debug("Job {0} has fired".format(jobname))
    if jobname in ocapp.job_misses:
        if 'skipped:' in job:
            ocapp.job_misses[jobname] += 1
            ocapp.aps_logger.debug("Job {0} has missed {1} consecutive runs".format(jobname, ocapp.job_misses[jobname]))
            if ocapp.job_misses[jobname] > 10:
                ocapp.aps_logger.error("Job {0} has more than 10 consecutive misses, restarting scheduler".format(jobname))
                # ocapp_scheduler.shutdown(wait=False)
                # ocapp_scheduler.start()
                # ocapp.job_misses = 0
        else:
            if ocapp.job_misses[jobname] > 0:
                ocapp.aps_logger.debug("Job {0} running successfully again, resetting miss count".format(jobname))
                ocapp.job_misses[jobname] = 0


def check_current_victims():
    """
    Scheduled job to check the current oncall/shadow/backup for each
    group and update if necessary. If a change occurs the incoming
    and outgoing oncall/shadow/backup users are notified via
    SMS of their new status.
    """

    ocdb = OnCalendarDB(config.database)
    ocapp.aps_logger.debug("Checking oncall schedules")
    try:
        oncall_check_status = ocdb.check_schedule()
        rotate_on_message = "You are now {0} oncall for group {1}"
        rotate_off_message = "You are no longer {0} oncall for group {1}"

        ocsms = OnCalendarSMS(config)

        for group in oncall_check_status.keys():
            ocapp.aps_logger.debug('Checking primary for group {0}'.format(group))
            if oncall_check_status[group]['oncall']['updated']:
                ocapp.aps_logger.debug('-- Primary has changed, now {0}'.format(oncall_check_status[group]['oncall']['new']))
                ocapp.aps_logger.info("{0} primary oncall updated".format(group))
                ocsms.send_sms(
                    oncall_check_status[group]['oncall']['new_phone'],
                    rotate_on_message.format('primary', group),
                    False
                )
                if oncall_check_status[group]['oncall']['prev_phone'] is not None:
                    ocsms.send_sms(
                        oncall_check_status[group]['oncall']['prev_phone'],
                        rotate_off_message.format('primary', group),
                        False
                    )
            if 'shadow' in oncall_check_status[group] and oncall_check_status[group]['shadow']['updated']:
                ocapp.aps_logger.info("{0} shadow oncall updated".format(group))
                ocsms.send_sms(
                    oncall_check_status[group]['shadow']['new_phone'],
                    rotate_on_message.format('shadow', group)
                )
                if oncall_check_status[group]['shadow']['prev_phone'] is not None:
                    ocsms.send_sms(
                        oncall_check_status[group]['shadow']['new_phone'],
                        rotate_off_message.format('shadow', group),
                        False
                    )
            if 'backup' in oncall_check_status[group] and oncall_check_status[group]['backup']['updated']:
                ocapp.aps_logger.info("{0} backup oncall updated".format(group))
                ocsms.send_sms(
                    oncall_check_status[group]['backup']['new_phone'],
                    rotate_on_message.format('backup', group)
                )
                if oncall_check_status[group]['backup']['prev_phone'] is not None:
                    ocsms.send_sms(
                        oncall_check_status[group]['backup']['prev_phone'],
                        rotate_off_message.format('backup', group),
                        False
                    )
        if ocapp.job_failures['check_current_victims'] > 0:
            ocapp.job_failures['check_current_victims'] = 0

    except OnCalendarDBError as error:
        ocapp.job_failures['check_current_victims'] += 1
        ocapp.aps_logger.error("Oncall rotation checked failed ({0} consecutive failures) - {1}: {2}".format(
            ocapp.job_failures['check_current_victims'],
            error.args[0],
            error.args[1])
        )
        if ocapp.job_failures['check_current_victims'] > 10:
            ocsms = OnCalendarSMS(config)
            ocsms.send_failsafe("OnCalendar scheduled rotation check failed: {0}".format(error.args[1]))


def check_calendar_gaps_8hour():
    """
    Checks the calendar for the next 8 hours and alerts
    if there are any gaps.
    """

    ocdb = OnCalendarDB(config.database)
    ocapp.aps_logger.debug("Checking for schedule gaps in the next 8 hours")
    try:
        gap_check = ocdb.check_8hour_gaps()
        ocsms = OnCalendarSMS(config)

        for group in gap_check.keys():
            ocapp.aps_logger.error("Schedule gap in the next 8 hours detected for group {0}".format(group))
            ocsms.send_sms(
                gap_check[group]['oncall'],
                "Your oncall schedule has gaps within the next 8 hours!",
                False
            )

        if ocapp.job_failures['check_calendar_gaps_8hour'] > 0:
            ocapp.job_failures['check_calendar_gaps_8hour'] = 0

    except OnCalendarDBError as error:
        ocapp.job_failures['check_calendar_gaps_8hour'] += 1
        ocapp.aps_logger.error("8 hour schedule gap check failed - {0}: {1}".format(
            error.args[0],
            error.args[1]
        ))


def check_calendar_gaps_48hour():
    """
    Checks the calendar for the next 48 hours and emails
    if there are any gaps.
    """

    ocdb = OnCalendarDB(config.database)
    ocapp.aps_logger.debug("Checking for schedule gaps in the next 48 hours")
    try:
        gap_check = ocdb.check_48hour_gaps()
        ocsms = OnCalendarSMS(config)

        for group in gap_check.keys():
            ocapp.aps_logger.error("Schedule gap in the next 48 hours detected for group {0}".format(group))
            ocsms.send_email(
                gap_check[group]['email'],
                "Your oncall schedule has gaps within the next 48 hours,\nplease login to OnCalendar and correct those.",
                "Oncall schedule gaps detected",
                'plain'
            )

        if ocapp.job_failures['check_calendar_gaps_48hour'] > 0:
            ocapp.job_failures['check_calendar_gaps_48hour'] = 0

    except OnCalendarDBError as error:
        ocapp.job_failures['check_calendar_gaps_48hour'] += 1
        ocapp.aps_logger.error("48 hour schedule gap check failed - {0}: {1}".format(
            error.args[0],
            error.args[1]
        ))


def get_incoming_sms():
    """
    Pulls the recent incoming SMS messages from Twilio for response parsing
    """

    ocsms = OnCalendarSMS(config)
    ocdb = OnCalendarDB(config.database)
    messages = None
    last_incoming_sms = None

    try:
        messages = ocsms.get_incoming()
        messages.reverse()
        ocapp.aps_logger.debug("Pulled {0} messages from Twilio".format(len(messages)))
        last_incoming_sms = ocdb.get_last_incoming_sms()
        ocapp.aps_logger.debug("Last saved SID is {0}".format(last_incoming_sms))
    except OnCalendarSMSError as error:
        ocapp.aps_logger.error("Failed to pull message list from Twilio: {0}".format(error))
    except OnCalendarDBError as error:
        ocapp.aps_logger.error("Failed to get last incoming SMS record - {0}: {1}".format(
            error.args[0],
            error.args[1]
        ))

    if messages is not None:
        message_sids = [x.sid for x in messages]
        if last_incoming_sms in message_sids:
            ocapp.aps_logger.debug("Last incoming SMS found in messages, adjusting start point")
            i = message_sids.index(last_incoming_sms)
            messages = messages[i+1:]
        else:
            ocapp.aps_logger.debug("Last incoming SMS not found in messages")

        ocapp.aps_logger.debug("{0} new messages to process".format(len(messages)))

        for message in messages:
            ocapp.aps_logger.debug("Updating last incoming SMS time")
            ocdb.update_last_incoming_sms(message.sid)

            from_number = message.from_.replace('+', '')
            matches = re.search(
                r'^(?:\s+|)(?:\[\[(?P<hash>\w+)\]\]|)(?:\s+|)(?P<command>\w+)(?:\s+|)(?P<extra>.*)$',
                message.body
            )
            if matches is None:
                ocapp.aps_logger.debug("No hash or command found in message")
                ocsms.send_sms(
                    from_number,
                    "Que?",
                    config.sms['TWILIO_USE_CALLBACK']
                )
                continue
            else:
                matches = matches.groupdict()

            try:
                sms_user_info = ocdb.get_victim_info('phone', from_number)
            except OnCalendarDBError as error:
                ocapp.aps_logger.error("Search for SMS user failed - {0}: {1}".format(
                    error.args[0],
                    error.args[1]
                ))
                continue

            if sms_user_info is None or len(sms_user_info.keys()) == 0:
                ocsms.send_sms(
                    from_number,
                    "You are not authorized to talk to me.",
                    config.sms['TWILIO_USE_CALLBACK']
                )
                continue

            k = sms_user_info.keys()[0]
            sms_user_info = sms_user_info[k]
            sms_response = process_incoming_sms(
                sms_user_info['id'],
                sms_user_info['username'],
                from_number,
                matches
            )

            try:
                ocsms.send_sms(
                    from_number,
                    sms_response,
                    config.sms['TWILIO_USE_CALLBACK']
                )
            except OnCalendarSMSError as error:
                ocapp.aps_logger.error("Response to {0} failed! {1}".format(
                    sms_user_info['username'],
                    error
                ))


ocapp = Flask(__name__)

ocapp.config.update(config.basic)
ocapp.login_manager = flogin.LoginManager()
ocapp.login_manager.login_view = 'oc_login'
ocapp.login_manager.init_app(ocapp)

if not ocapp.debug:
    del ocapp.logger.handlers[:]
    ocapp.logger.setLevel(getattr(logging, config.logging['LOG_LEVEL']))
    ocapp.logger.addHandler(default_log_handler)

# Start the scheduler and set up logging for it

ocapp.scheduler = Scheduler()

ocapp.aps_logger = logging.getLogger('apscheduler')
ocapp.aps_logger.setLevel(getattr(logging, config.logging['LOG_LEVEL']))
ocapp.aps_logger.addHandler(default_log_handler)

# These jobs run frequently and need to be watch in case they
# hang up and start missing executions
ocapp.job_misses = {
    'check_current_victims': 0,
    'get_incoming_sms': 0
}
ocapp.job_failures = {
    'check_current_victims': 0,
    'get_incoming_sms': 0,
    'check_calendar_gaps_8hour': 0,
    'check_calendar_gaps_48hour': 0
}

ocapp.scheduler_started = start_scheduler()


class OnCalendarFileWriteError(Exception):
    """
    Exception class for errors writing files from the app.
    """
    pass

class OnCalendarFormParseError(Exception):
    """
    Exception class for errors parsing incoming form data.
    """

    pass


class OnCalendarBadRequest(Exception):
    """
    Exception class for bad requests to the API.
    """

    def __init__(self, payload):
        Exception.__init__(self)
        self.status_code = 400
        self.payload = payload


class OnCalendarAppError(Exception):
    """
    Exception class for internal application errors
    """

    def __init__(self, payload):
        Exception.__init__(self)
        self.status_code = 500
        self.payload = payload


@ocapp.login_manager.user_loader
def load_user(id):
    return auth.User.get('id', id)


@ocapp.before_request
def before_request():
    g.user = flogin.current_user


@ocapp.after_request
def after_request(response):
    if 'Origin' in request.headers:
        if config.basic['API_ACCESS_DOMAINS'] and request.headers['Origin'] in config.basic['API_ACCESS_DOMAINS']:
            response.headers.add('Access-Control-Allow-Origin', request.headers['Origin'])

    return response


@ocapp.errorhandler(OnCalendarBadRequest)
def handle_bad_request(error):
    """
    Handler for BadRequest errors, HTTP code 400.
    """

    return json.dumps(error.payload), error.status_code


@ocapp.errorhandler(OnCalendarAppError)
def handle_app_error(error):
    """
    Handler for application errors, HTTP code 500
    """

    return json.dumps(error.payload), error.status_code


@ocapp.route('/')
def root():
    """
    The main page of the app.

    Returns:
        (string): Rendered template of the main page HTML and Javascript.
    """

    is_anonymous = g.user.is_anonymous()
    if not is_anonymous:
        user = {
            'username': g.user.username,
            'groups': g.user.groups,
            'app_role': g.user.app_role
        }
    else:
        user = {
            'username': 'anonymous',
            'groups': [],
            'app_role': 0
        }
    user_json = json.dumps(user)
    js = render_template('main.js.jinja2',
                         user_json=user_json)

    return render_template('oncalendar.html.jinja2',
                           anonymous=is_anonymous,
                           email_gateway=config.sms['EMAIL_GATEWAY'],
                           main_js=js,
                           stylesheet_url=url_for('static', filename='css/oncalendar.css'),
                           jquery_url=url_for('static', filename='js/jquery.js'),
                           datejs_url=url_for('static', filename='js/date.js'),
                           ocjs_url=url_for('static', filename='js/oncalendar.js'),
                           colorwheel_url=url_for('static', filename='js/color_wheel.js'),
                           magnific_url=url_for('static', filename='js/magnific-popup.js'),
                           bootstrapjs_url=url_for('static', filename='js/bootstrap.js'),
                           jq_autocomplete_url=url_for('static', filename='js/jquery.autocomplete.js'))


@ocapp.route('/login', methods=['GET', 'POST'])
def oc_login():
    """
     Login page for the app.

     Returns:
        (redirect): URL for the main index page of the site if the
                    user is already authenticated.

        (string): Rendered template of the login page if the user is
                  not logged in.
    """

    # if g.user is not None and g.user.is_authenticated():
    #    return redirect(url_for('root'))
    form = forms.LoginForm()
    if form.validate_on_submit():
        try:
            user = auth.ldap_auth.authenticate_user(form.username.data, form.password.data)
            flogin.login_user(user)
            return redirect(request.args.get('next') or url_for('root'))
        except OnCalendarAuthError, error:
            raise OnCalendarAuthError(error[0]['desc'])

    js = render_template('main_login.js.jinja2')
    login_next = ''
    if 'next' in request.args:
        login_next = '?next={0}'.format(request.args.get('next'))
    return render_template('oncalendar_login.html.jinja2',
                           stylesheet_url=url_for('static', filename='css/oncalendar.css'),
                           jquery_url=url_for('static', filename='js/jquery.js'),
                           main_js=js,
                           form=form,
                           login_next=login_next)


@ocapp.route('/logout')
def oc_logout():
    """
    Log out the current user.

    Returns:
        (redirect): URL for the main page of the site.
    """

    flogin.logout_user()
    return redirect(url_for('root'))


@ocapp.route('/admin/')
@flogin.login_required
def oc_admin():
    """
    The admin interface for the app.

    Returns:
        (string): Rendered template of the admin interface HTML and Javascript.
    """

    if g.user.app_role == 2:
        is_anonymous = g.user.is_anonymous()
        user = {
            'username': g.user.username,
            'groups': g.user.groups,
            'app_role': g.user.app_role
        }
        user_json = json.dumps(user)
        js = render_template('main_admin.js.jinja2',
                             user_json=user_json)
        return render_template('oncalendar_admin.html.jinja2',
                               main_js=js,
                               stylesheet_url=url_for('static', filename='css/oncalendar.css'),
                               jquery_url=url_for('static', filename='js/jquery.js'),
                               datejs_url=url_for('static', filename='js/date.js'),
                               ocjs_url=url_for('static', filename='js/oncalendar.js'),
                               ocadminjs_url=url_for('static', filename='js/oncalendar_admin.js'),
                               magnific_url=url_for('static', filename='js/magnific-popup.js'),
                               bootstrapjs_url=url_for('static', filename='js/bootstrap.js'))
    else:
        ocapp.logger.error("User {0} not authorized for /admin access".format(g.user.username))
        return redirect(url_for('root'))


@ocapp.route('/calendar/<year>/<month>')
def oc_calendar(year=None, month=None):
    """
    Access main page of the app with a specific calendar month.

    Returns:
        (string): Rendered template of the main page HTML and Javascript.
    """

    is_anonymous = g.user.is_anonymous()
    if not is_anonymous:
        user = {
            'username': g.user.username,
            'groups': g.user.groups,
            'app_role': g.user.app_role
        }
    else:
        user = {
            'username': 'anonymous',
            'groups': [],
            'app_role': 0
        }
    user_json = json.dumps(user)
    js = render_template('main.js.jinja2',
                         year=year,
                         month=int(month) - 1,
                         user_json=user_json)

    return render_template('oncalendar.html.jinja2',
                           anonymous=is_anonymous,
                           main_js=js,
                           stylesheet_url=url_for('static', filename='css/oncalendar.css'),
                           jquery_url=url_for('static', filename='js/jquery.js'),
                           datejs_url=url_for('static', filename='js/date.js'),
                           ocjs_url=url_for('static', filename='js/oncalendar.js'),
                           colorwheel_url=url_for('static', filename='js/color_wheel.js'),
                           magnific_url=url_for('static', filename='js/magnific-popup.js'),
                           bootstrapjs_url=url_for('static', filename='js/bootstrap.js'),
                           jq_autocomplete_url=url_for('static', filename='js/jquery.autocomplete.js'))


@ocapp.route('/edit/month/<group>/<year>/<month>')
@flogin.login_required
def edit_month_group(group=None, year=None, month=None):
    """
    The edit month interface for the app.

    Gives the user an editable month view of the oncall schedule for their group.

    Returns:
        (string): Rendered template of the edit month interface HTML and Javascript.
    """

    if g.user.app_role == 2 or (group in g.user.groups):
        user = {
            'username': g.user.username,
            'groups': g.user.groups,
            'app_role': g.user.app_role
        }
        user_json = json.dumps(user)
        js = render_template('main_edit_month.js.jinja2',
                             edit_year=year,
                             edit_month=int(month) - 1,
                             edit_group=group,
                             user_json=user_json,)
        return render_template('oncalendar_edit_month.html.jinja2',
                               main_js=js,
                               edit_year=year,
                               edit_month=month,
                               edit_group=group,
                               stylesheet_url=url_for('static', filename='css/oncalendar.css'),
                               jquery_url=url_for('static', filename='js/jquery.js'),
                               datejs_url=url_for('static', filename='js/date.js'),
                               ocjs_url=url_for('static', filename='js/oncalendar.js'),
                               colorwheel_url=url_for('static', filename='js/color_wheel.js'),
                               magnific_url=url_for('static', filename='js/magnific-popup.js'),
                               bootstrapjs_url=url_for('static', filename='js/bootstrap.js'))
    else:
        ocapp.logger.error("User {0} not authorized to edit calendar for {1}".format(g.user.username, group))
        return redirect(url_for('root'))


@ocapp.route('/edit/weekly/<group>/<year>/<month>')
@flogin.login_required
def edit_weekly_group(group=None, year=None, month=None):
    """
    The weekly edit interface.

    Gives the user an editable month view of the oncall schedule
    where the oncall/shadow/backup victims can be changed on a full
    week basis.

    Returns:
        (str): Rendered template of the weekly edit interface HTML and Javascript.
    """

    if g.user.app_role == 2 or (group in g.user.groups):
        user = {
            'username': g.user.username,
            'groups': g.user.groups,
            'app_role': g.user.app_role
        }
        user_json = json.dumps(user)
        js = render_template('main_edit_by_week.js.jinja2',
                             edit_year=year,
                             edit_month=int(month) - 1,
                             edit_group=group,
                             user_json=user_json,)
        return render_template('oncalendar_edit_by_week.html.jinja2',
                               main_js=js,
                               edit_year=year,
                               edit_month=month,
                               edit_group=group,
                               stylesheet_url=url_for('static', filename='css/oncalendar.css'),
                               jquery_url=url_for('static', filename='js/jquery.js'),
                               datejs_url=url_for('static', filename='js/date.js'),
                               ocjs_url=url_for('static', filename='js/oncalendar.js'),
                               colorwheel_url=url_for('static', filename='js/color_wheel.js'),
                               magnific_url=url_for('static', filename='js/magnific-popup.js'),
                               bootstrapjs_url=url_for('static', filename='js/bootstrap.js'))
    else:
        ocapp.logger.error("User {0} not authorized to edit calendar for {1}".format(g.user.username, group))
        return redirect(url_for('root'))


@ocapp.route('/api/session/ldap_groups')
def api_get_ldap_groups():
    if g.user.is_authenticated():
        return json.dumps(g.user.ldap_groups)
    else:
        return json.dumps([])


@ocapp.route('/api/calendar/month/<year>/<month>', methods=['GET'])
@ocapp.route('/api/calendar/month/<year>/<month>/<group>', methods=['GET'])
def api_get_calendar(year=None, month=None, group=None):

    try:
        ocdb = OnCalendarDB(config.database)
        victims = ocdb.get_calendar(year, month, group)
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(victims)


@ocapp.route('/api/calendar/month', methods=['POST'])
def api_calendar_update_month():
    month_data = request.get_json()
    if not month_data:
        raise OnCalendarAppError(
            payload = [ocapi_err.NOPOSTDATA, 'No data received']
        )
    else:
        update_group = month_data['filter_group']
        days = month_data['days']
        reason = month_data['note']

    try:
        ocdb = OnCalendarDB(config.database)
        response = ocdb.update_calendar_month(g.user.id, reason, update_group, days)
    except OnCalendarDBError, error:
        ocapp.logger.error("Could not update month - {0}: {1}".format(
            error.args[0],
            error.args[1]
        ))
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(response)


@ocapp.route('/api/calendar/boundaries')
def api_get_cal_boundaries():
    """
    API interface to get the first and last dates in the caldays table.

    Finds the first and last dates in the caldays table, the earliest
    and latest dates for which any calendar can be displayed and any
    oncall schedule can be created.

    Returns:
        (str): dict of the start and end year, month day as JSON, e.g.:
               start: [year, month, day], end: [year, month, day]

        (str): On error returns a list of the error code and error message
               as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = OnCalendarDB(config.database)
        cal_start = ocdb.get_caldays_start()
        cal_end = ocdb.get_caldays_end()
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    start_tuple = cal_start.timetuple()
    start_year, start_month, start_day = start_tuple[0:3]
    end_tuple = cal_end.timetuple()
    end_year, end_month, end_day = end_tuple[0:3]
    return json.dumps({'start': [start_year, start_month, start_day],
                       'end': [end_year, end_month, end_day]})


@ocapp.route('/api/calendar/calendar_end')
def api_get_cal_end():
    """
    API interface to get the last date in the caldays table.

    Finds the last date in the caldays table, the last date for which
    any calendar can be displayed and any oncall schedule can be created.

    Returns:
        (string): list of the year, month, day of the last entry as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = OnCalendarDB(config.database)
        cal_end = ocdb.get_caldays_end()
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    end_tuple = cal_end.timetuple()
    year, month, day = end_tuple[0:3]
    return json.dumps([year, month, day])


@ocapp.route('/api/calendar/calendar_start')
def api_get_cal_start():
    """
    API interface to get the first date in the caldays table.

    Finds the first date in the caldays table, the earliest date for which
    any calendar can be displayed and any oncall schedule can be created.

    Returns:
        (string): list of the year, month, day of the first entry as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = OnCalendarDB(config.database)
        cal_start = ocdb.get_caldays_start()
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    start_tuple = cal_start.timetuple()
    year, month, day = start_tuple[0:3]
    return json.dumps([year, month, day])


@ocapp.route('/api/calendar/update/day', methods=['POST'])
def api_calendar_update_day():
    update_day_data = request.get_json()
    if not update_day_data:
        raise OnCalendarAppError(
            payload = [ocapi_err.NOPOSTDATA, 'No data received']
        )

    try:
        ocdb = OnCalendarDB(config.database)
        response = ocdb.update_calendar_day(g.user.id, update_day_data)
    except OnCalendarDBError, error:
        ocapp.logger.error("Could not update calendar day - {0}: {1}".format(
            error.args[0],
            error.args[1]
        ))
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(response)


@ocapp.route('/api/edits')
@ocapp.route('/api/edits/<group>')
def api_get_edit_history(group=None):
    """
    API interface to get the edit log for a group (if user is a member), or
    for all groups (if user is an app admin)

    Args:
        group (str): The id of the group to view

    Returns:
        (str): The dict of all edits rendered as JSON

    Raises:
        OnCalendarAppError
    """
    try:
        ocdb = OnCalendarDB(config.database)
        edit_history = ocdb.get_edit_history(group)
    except OnCalendarDBError as error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(edit_history)


@ocapp.route('/api/edits/<group>/last')
def api_get_last_edit(group):
    """
    API interface to get the last entry in the edit log for a group.

    Args:
        group (str): The id of the group

    Returns:
        (str): The last edit log entry as JSON

    Raises:
        OnCalendarAppError
    """
    try:
        ocdb = OnCalendarDB(config.database)
        last_edit = ocdb.get_last_edit(group)
    except OnCalendarDBError as error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(last_edit)


@ocapp.route('/api/groups/')
def api_get_all_groups_info():
    """
    API interface to get information on all configured groups.

    Returns:
        (string): The dict of all configured groups rendered as JSON.

    Raises:
        OnCalendarAppError
    """

    try:
        ocdb = OnCalendarDB(config.database)
        groups = ocdb.get_group_info()
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(groups)


@ocapp.route('/api/group/by_name/<group>/')
def api_get_group_info_by_name(group=None):
    """
    API interface to get information on a specified group.

    Args:
        (string): The name of the requested group.

    Returns:
        (string): The dict of the requested group's info rendered as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = OnCalendarDB(config.database)
        group_info = ocdb.get_group_info(False, group)
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(group_info)


@ocapp.route('/api/group/by_id/<gid>/')
def api_get_group_info_by_id(gid=None):
    """
    API interface to get information on a specified group.

    Args:
        (string): The ID of the requested group.

    Returns:
        (string): The dict of the requested group's info rendered as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = OnCalendarDB(config.database)
        group_info = ocdb.get_group_info(gid, False)
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(group_info)


@ocapp.route('/api/group/victims/<group>')
def api_get_group_victims(group=None):
    """
    API interface to get all victims associated with a group.

    Args:
        (str): The name of the group

    Returns:
        (str): Dict of the group's victims rendered as JSON.

        (str): On error returns a list of the error code and error message
               as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = OnCalendarDB(config.database)
        group_victims = ocdb.get_group_victims(group)
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(group_victims)



@ocapp.route('/api/victims/')
def api_get_all_victims_info():
    """
    API interface to get information on all configured victims.

    Returns:
        (string): The dict of all configured victims rendered as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = OnCalendarDB(config.database)
        victims = ocdb.get_victim_info()
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(victims)


@ocapp.route('/api/victims/current', methods=(['GET']))
@ocapp.route('/api/victims/current/<group>', methods=(['GET']))
def api_get_current_victims(group=None):
    """
    API interface to get the list of current oncall victims.

    Returns:
        (str): The dict of current victims as JSON.
        (str): On error returns a list of the error code and error message
               as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = OnCalendarDB(config.database)
        victims = ocdb.get_current_victims(group)
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(victims)


@ocapp.route('/api/victims/suggest')
def api_suggest_victims():
    """
    API interface to suggest victim names for autocompletion.

    Returns:
        (str): dict of the suggested users' info as JSON.
    """

    query = request.args['query']

    try:
        ocdb = OnCalendarDB(config.database)
        suggested_victims = ocdb.get_suggested_victims(query)
    except OnCalendarDBError as error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(suggested_victims)


@ocapp.route('/api/victim/<key>/<id>/')
def api_get_victim_info(key=None, id=None):
    """
    API interface to get information on a specified victim.

    Args:
        key (string): The key to search by, supported keys are id and username.
        id (string): The username or id of the requested victim.

    Returns:
        (string): The dict of the requested victim's info as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    if key not in ['id', 'username']:
        return json.dumps(ocapi_err.NOPARAM, 'Invalid search key: {0}'.format(key))
    try:
        ocdb = OnCalendarDB(config.database)
        victim_info = ocdb.get_victim_info(key, id)
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(victim_info)


#######################################
# Admin interface APIs
#######################################

# Configuration APIs
#--------------------------------------
@ocapp.route('/api/admin/config', methods=['GET'])
def api_get_config():
    """
    API interface to get the app config variables.

    Returns:
        (string): JSON formatted app config.
    """

    config_vars = [attr for attr in dir(config()) if not attr.startswith('__')]
    oc_config = {}
    for cv in config_vars:
        oc_config[cv] = getattr(config, cv);
    return json.dumps(oc_config)


@ocapp.route('/api/admin/config', methods=['POST'])
def api_update_config():
    """
    API interface to update the app configuration file.

    Receives HTTP POST data containing the new configuration settings,
    updates the in-memory configuration and then writes the changes
    out to the config class in the oc_config.py file.

    Returns:
        (string): The updated (current) configuration settings as JSON.

        (string): On error returns a list of the error code and error message
              as JSON with an HTTP return code of 500.
    """

    if not request.form:
        raise OnCalendarBadRequest(
            payload= {
                'request_status': 'ERROR',
                'request_error': 'No updated configuration data found.'
            }
        )

    config_file = '{0}/oc_config.py'.format(config.basic['APP_BASE_DIR'])
    config_sections = [attr for attr in dir(config()) if not attr.startswith('__')]
    update_sections = [key for key in request.form if request.form[key]]
    current_config = {}
    for section in config_sections:
        current_config[section] = getattr(config, section)
    for section_key in update_sections:
        for key in request.form[section_key]:
            current_config[section_key][key] = request.form[section_key][key]

    if (os.path.isfile(config_file)):
        try:
            with open(config_file, 'w') as cf:
                cf.write('class config(object):\n')
                for cs in current_config:
                    cf.write('    {0} = {{\n'.format(cv))
                    for ck in current_config[cs]:
                        if current_config[cs][ck] is True or current_config[cs][ck] is False or isinstance(current_config[cs][ck], (int, long)):
                            cf.write('        {0:<19} = {1}\n'.format(ck, current_config[cs][ck]))
                        else:
                            cf.write('        {0:<19} = \'{1}\'\n'.format(ck, current_config[cs][ck]))
                    cf.write('    }\n')
                cf.close()
        except EnvironmentError, error:
            raise OnCalendarAppError(
                payload = [error.args[0], error.args[1]]
            )
    else:
        error_string = 'Config file {0} does not exist'.format(config_file)
        raise OnCalendarAppError(
            payload = [API_NOCONFIG, error_string]
        )

    return json.dumps(current_config)


# Group APIs
#--------------------------------------
@ocapp.route('/api/admin/group/add', methods=['POST'])
def api_add_group():
    """
    API interface to add a new group to the database.

    Receives HTTP POST data with the information for the new group.

    Returns:
        (string): dict of the new group's information as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    group_data = {
        'name': '',
        'active': '',
        'autorotate': '',
        'turnover_day': '',
        'turnover_hour': '',
        'turnover_min': '',
        'shadow': '',
        'backup': '',
        'failsafe': '',
        'alias': '',
        'backup_alias': '',
        'failsafe_alias': '',
        'email': '',
        'auth_group': ''
    }
    if not request.form:
        raise OnCalendarAppError(
            payload = [ocapi_err.NOPOSTDATA, 'No data received']
        )
    else:
        form_keys = [key for key in request.form if request.form[key]]

    for key in form_keys:
        group_data[key] = request.form[key]

    try:
        ocdb = OnCalendarDB(config.database)
        new_group = ocdb.add_group(group_data)
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(new_group)


@ocapp.route('/api/admin/group/delete/<group_id>')
def api_delete_group(group_id):
    """
    API interface to delete a group.

    Args:
        (string): The ID of the group to remove.

    Returns:
        (string): dict of the count of remaining groups as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = OnCalendarDB(config.database)
        group_count = ocdb.delete_group(group_id)
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps({'group_count': group_count})


@ocapp.route('/api/admin/group/update', methods=['POST'])
def api_update_group():
    """
    API interface to update the information for a group.

    Receives HTTP POST with the new information for the group.

     Returns:
        (string): dict of the updated group info as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    if not request.form:
        raise OnCalendarAppError(
            payload = [ocapi_err.NOPOSTDATA, 'No data received']
        )
    else:
        form_keys = [key for key in request.form if request.form[key]]

    group_data = {
        'id': '',
        'name': '',
        'active': '',
        'autorotate': '',
        'turnover_day': '',
        'turnover_hour': '',
        'turnover_min': '',
        'shadow': '',
        'backup': '',
        'failsafe': '',
        'alias': '',
        'backup_alias': '',
        'failsafe_alias': '',
        'email': '',
        'auth_group': ''
    }
    for key in form_keys:
        group_data[key] = request.form[key]

    print group_data

    try:
        ocdb = OnCalendarDB(config.database)
        group_info = ocdb.update_group(group_data)
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(group_info)


@ocapp.route('/api/admin/group/victims', methods=['POST'])
def api_group_victims():
    """
    API interface to update the victims associated with a group.

    Returns:
        (str): dict of the updated list of group victims as JSON.
        (str): On error returns a list of the error code and error message
               as JSON with an HTTP return code of 500.
    """

    if not request.json:
        raise OnCalendarAppError(
            payload = [ocapi_error.NOPOSTDATA, 'No data received']
        )
    else:
        group_victims_data = request.json

    try:
        ocdb = OnCalendarDB(config.database)
        group_victims = ocdb.update_group_victims(group_victims_data)
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(group_victims)


# Victim APIs
#--------------------------------------
@ocapp.route('/api/admin/victim/add', methods=['POST'])
def api_add_victim():
    """
    API interface to add a new victim to the database.

    Receives HTTP POST with the information on the new victim.

    Returns:
        (string): dict of the victim's information as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    victim_data = {
        'username': '',
        'firstname': '',
        'lastname': '',
        'phone': '',
        'active': '',
        'sms_email': '',
        'app_role': '',
        'groups': []
    }
    if not request.form:
        raise OnCalendarAppError(
            payload = [ocapi_err.NOPOSTDATA, 'No data received']
        )
    else:
        form_keys = [key for key in request.form if request.form[key]]

    for key in form_keys:
        if key == "groups[]":
            for gid in request.form.getlist('groups[]'):
                print gid
                victim_data['groups'].append(gid)
        else:
            victim_data[key] = request.form[key]

    try:
        ocdb = OnCalendarDB(config.database)
        new_victim = ocdb.add_victim(victim_data)
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(new_victim)


@ocapp.route('/api/admin/victim/delete/<victim_id>')
def api_delete_victim(victim_id):
    """
    API interface to delete a victim from the database.

    Args:
        (string): The ID of the victim to delete.

    Returns:
        (string): dict of the count of remaining victims as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = OnCalendarDB(config.database)
        victim_count = ocdb.delete_victim(victim_id)
    except (OnCalendarDBError, OnCalendarAPIError), error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps({'victim_count': victim_count})


@ocapp.route('/api/admin/victim/update', methods=['POST'])
def api_update_victim():
    """
    API interface to update the information for a victim.

    Receives HTTP POST with the new information for the victim.

     Returns:
        (string): dict of the updated victim info as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    if not request.form:
        raise OnCalendarAppError(
            payload = [ocapi_err.NOPOSTDATA, 'No data received']
        )
    else:
        form_keys = [key for key in request.form if request.form[key]]

    victim_data = {
    'id': '',
    'username': '',
    'firstname': '',
    'lastname': '',
    'phone': '',
    'active': '',
    'sms_email': '',
    'groups': []
    }

    for key in form_keys:
        if key == "groups[]":
            for gid in request.form.getlist('groups[]'):
                victim_data['groups'].append(gid)
        else:
            victim_data[key] = request.form[key]

    try:
        ocdb = OnCalendarDB(config.database)
        victim_info = ocdb.update_victim(victim_data)
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(victim_info)


# Calendar APIs
#--------------------------------------
@ocapp.route('/api/admin/calendar/extend/<days>')
def db_extend(days):
    """
    API interface to extend the configured calendar days in the database.

    Args:
        days (string): The number of days to add

    Returns:
        (string): list of the new end year, month, day as JSON

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = OnCalendarDB(config.database)
    except OnCalendarDBError, error:
        ocapp.logger.error("Unable to extend calendar - {0}: {1}".format(
            error.args[0],
            error.args[1]
        ))
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    try:
        new_end = ocdb.extend_caldays(int(days))
        end_tuple = new_end.timetuple()
        year, month, day = end_tuple[0:3]
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps([year, month, day])


# Database APIs
#--------------------------------------
@ocapp.route('/api/admin/db/verify')
def api_db_verify():
    """
    API interface to verify the validity of the OnCalendar database.

    Returns:
        (string): dict of the number of missing tables and the initialization
                  timestamp of the database as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = OnCalendarDB(config.database)
        init_status = ocdb.verify_database()
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(init_status)


@ocapp.route('/api/admin/db/create_db', methods=['POST'])
def api_create_db():
    """
    API interface to create the OnCalendar database.

    Creates the OnCalendar database. Assumes that the oncalendar user already
    has access to MySQL to verify that the database does indeed not exist. If
    no access the app will prompt to fix the config first. The app will also
    prompt for credentials in case the oncalendar user doesn't have
    permission to create the database, the API interface receives those
    credentials as an HTTP POST object.

    Returns:
        (string): list containing the 'OK' status as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    try:
        db = mysql.connect(config.database['DBHOST'], request.form['mysql_user'], request.form['mysql_password'])
        cursor = db.cursor()
        cursor.execute('CREATE DATABASE OnCalendar')
    except mysql.Error, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(['OK'])


@ocapp.route('/api/admin/db/init_db')
def api_db_init():
    """
    API interface to initialize the OnCalendar database.

    Creates the required table structure for the OnCalendar database.

    Returns:
        (string): dict of the init status OK and the initialization timestamp.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = OnCalendarDB(config.database)
        init_status = ocdb.initialize_database()
    except (OnCalendarDBError, OnCalendarDBInitTSError), error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(init_status)


@ocapp.route('/api/admin/db/init_db/force')
def api_db_init_force():
    """
    API interface to force reinitialization of the OnCalendar database.

    In the case where the app finds an initialization timestamp, this
    will force reinitialization in order to start clean or fix an
    improper original initialization.

    Returns:
        (string): dict of the init status OK and the initialization timestamp.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = OnCalendarDB(config.database)
        init_status = ocdb.initialize_database(True)
    except (OnCalendarDBError, OnCalendarDBInitTSError), error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(init_status)


if __name__ == '__main__':
    ocapp.run()


@ocapp.route('/api/scheduler/start')
def api_start_scheduler():
    """
    API interface to start the scheduled jobs, primarily used for cluster
    master change events.
    """

    master_takeover = False
    cluster_key = request.args['key']
    if 'master_takeover' in request.args:
        master_takeover = request.args['master_takeover']
    if cluster_key == config.basic['CLUSTER_NAME']:
        if not ocapp.scheduler.running:
            start_status = start_scheduler(master_takeover)
            return json.dumps({'Scheduler_running': start_status})
        else:
            return json.dumps({'Scheduler_running': ocapp.scheduler.running})
    else:
        return json.dumps({'ERROR': 'Invalid Key'})


@ocapp.route('/api/scheduler/stop')
def api_stop_scheduler():
    """
    API interface to stop the scheduled jobs, primarily used for cluster
    master change events.
    """

    cluster_key = request.args['key']
    if cluster_key == config.basic['CLUSTER_NAME']:
        stop_scheduler()
        return json.dumps({'Scheduler_running': ocapp.scheduler.running})
    else:
        return json.dumps({'ERROR': 'Invalid Key'})


@ocapp.route('/api/scheduler/status')
def api_scheduler_status():
    """
    Returns the current status of the job scheduler, and all scheduled jobs.
    """

    status = {'Running': 'False'}
    if ocapp.scheduler.running:
        status['Running'] = 'True'
        for idx, job in enumerate(ocapp.scheduler.get_jobs()):
            job_index = "Job_{0}".format(idx)
            status[job_index] = {
                'Name': job.name,
                'Next_fire_time': job.next_run_time.isoformat()
            }
            if job.name in ocapp.job_misses:
                status[job_index]['misses'] = ocapp.job_misses[job.name]
            if job.name in ocapp.job_failures:
                status[job_index]['failures'] = ocapp.job_failures[job.name]

    return json.dumps(status)


@ocapp.route('/api/cluster/master')
def api_cluster_master_status():
    """
    Returns the cluster master status of this instance
    """

    if uwsgi.i_am_the_lord(config.basic['CLUSTER_NAME']) == 1:
        return json.dumps({'cluster_master': 'True'})
    else:
        return json.dumps({'cluster_master': 'False'})


# Notification APIs
#--------------------------------------
@ocapp.route('/api/notification/sms/<victim_type>/<group>', methods=['POST'])
def api_send_sms(victim_type, group):
    """
    API interface to send an SMS alert to the scheduled oncall or backup for a group

    Returns:
        (str): Success or failure status as JSON
    """

    sms_status = 'UNKNOWN'

    if victim_type not in ('oncall', 'backup', 'group'):
        raise OnCalendarBadRequest(
            payload = {
                'sms_status': 'ERROR',
                'sms_error': "{0}: Unknown SMS target: {1}".format(ocapi_err.NOPARAM, victim_type)
            }
        )

    ocdb = OnCalendarDB(config.database)
    ocsms = OnCalendarSMS(config)

    if not request.form:
        raise OnCalendarBadRequest(
            payload = {
                'sms_status': 'ERROR',
                'sms_error': "{0}: No data received".format(ocapi_err.NOPOSTDATA)
            }
        )
    elif request.form['type'] == 'host':
        try:
            notification_data = parse_host_form(request.form)
            sms_service = 'NA'
        except OnCalendarFormParseError as error:
            raise OnCalendarBadRequest(
                payload = {
                    'sms_status': 'ERROR',
                    'sms_error': "{0}: {1}".format(error.args[1], error.args[1])
                }
            )
        sms_message = render_template('host_sms.jinja2', data=notification_data)
    elif request.form['type'] == 'service':
        try:
            notification_data = parse_service_form(request.form)
            sms_service = notification_data['service']
        except OnCalendarFormParseError as error:
            raise OnCalendarBadRequest(
                payload = {
                    'sms_status': 'ERROR',
                    'sms_error': "{0}: {1}".format(error.args[0], error.args[1])
                }
            )
        sms_message = render_template('service_sms.jinja2', data=notification_data)
    elif request.form['type'] == 'adhoc':
        try:
            sender = ocdb.get_victim_info(search_key='username', search_value=request.form['sender'])
            sender_id = sender.keys()[0]
            sender = sender[sender_id]
            sms_message = "Page from: {0}: {1}".format(
                ' '.join([sender['firstname'], sender['lastname']]),
                request.form['body']
            )
        except OnCalendarDBError as error:
            raise OnCalendarAppError(
                payload = {
                    'sms_status': 'ERROR',
                    'sms_error': '{0}: {1}'.format(error.args[0], error.args[1])
                }
            )
    else:
        raise OnCalendarBadRequest(
            payload = {
                'sms_status': 'ERROR',
                'sms_error': "{0}: Request must specify either host, service  or adhoc type".format(ocapi_err.NOPARAM)
            }
        )

    shadow = None
    throttle_message = 'Alert limit reached, throttling further pages'
    api_send_email(victim_type, group)

    if victim_type == 'group':
        try:
            group_info = ocdb.get_group_info(group_name=group)
            groupid = group_info[group]['id']
            victim_ids = group_info[group]['victims'].keys()
        except OnCalendarDBError as error:
            raise OnCalendarAppError(
                payload = {
                    'sms_status': 'ERROR',
                    'sms_error': "{0}: {1}".format(error.args[0], error.args[1])
                }
            )

        panic_status = {
            'throttled': 0,
            'successful': 0,
            'sms_errors': 0
        }

        for victimid in victim_ids:
            target = group_info[group]['victims'][victimid]
            if request.form['type'] == 'adhoc':
                try:
                    ocsms.send_sms(
                        target['phone'],
                        sms_message,
                        config.sms['TWILIO_USE_CALLBACK']
                    )
                    panic_status['successful'] += 1
                except OnCalendarSMSError:
                    if target['sms_email'] is not None and valid_email_address(target['sms_email']):
                        try:
                            ocsms.send_email_alert(target['sms_email'], sms_message, target['truncate'])
                        except OnCalendarSMSError:
                            panic_status['sms_errors'] += 1
                    else:
                        panic_status['sms_errors'] += 1
            else:
                if target['throttle_time_remaining'] <= 0:
                    try:
                        target_sent_messages = ocdb.get_victim_message_count(
                            target['username'],
                            config.sms['SMS_THROTTLE_TIME']
                        )[0]
                    except OnCalendarDBError as error:
                        raise OnCalendarAppError(
                            payload = {
                                'sms_status': 'ERROR',
                                'sms_error': "{0}: {1}".format(error.args[0], error.args[1])
                            }
                        )
                    if target_sent_messages >= target['throttle']:
                        try:
                            ocdb.set_throttle(target['username'], config.sms['SMS_THROTTLE_TIME'])
                        except OnCalendarDBError as error:
                            raise OnCalendarAppError(
                                payload = {
                                    'sms_status': 'Error',
                                    'sms_error': "{0}: {1}".format(error.args[0], error.args[1])
                                }
                            )
                        ocsms.send_sms(target['phone'], throttle_message, False)
                        panic_status['throttled'] += 1
                    else:
                        try:
                            ocsms.send_sms_alert(
                                groupid,
                                target['id'],
                                target['phone'],
                                sms_message,
                                notification_data['notification_type'],
                                notification_data['type'],
                                notification_data['hostname'],
                                sms_service,
                                notification_data['nagios_master']
                            )
                            panic_status['successful'] += 1
                        except OnCalendarSMSError as error:
                            if target['sms_email'] is not None and valid_email_address(target['sms_email']):
                                try:
                                    ocsms.send_email_alert(target['sms_email'], sms_message, target['truncate'])
                                except OnCalendarSMSError, error:
                                    panic_status['sms_errors'] += 1
                            else:
                                panic_status['sms_errors'] += 1
                else:
                    panic_status['throttle'] += 1

        sms_status = "Panic page results: {0} users - {1} SMS messages successful, {2} users throttled, {2} SMS failures".format(
            len(victim_ids),
            panic_status['successful'],
            panic_status['throttled'],
            panic_status['sms_errors']
        )
    else:
        try:
            current_victims = ocdb.get_current_victims(group)
            groupid = current_victims[group]['groupid']
            if victim_type == 'backup':
                target = current_victims[group]['backup']
            else:
                target = current_victims[group]['oncall']
                if current_victims[group]['shadow'] is not None:
                    shadow = current_victims[group]['shadow']
        except OnCalendarDBError, error:
            raise OnCalendarAppError(
                payload = {
                    'sms_status': 'ERROR',
                    'sms_error': "{0}: {1}".format(error.args[0], error.args[1])
                }
            )

        if request.form['type'] == 'adhoc':
            try:
                ocsms.send_sms(
                    target['phone'],
                    sms_message,
                    config.sms['TWILIO_USE_CALLBACK']
                )
            except OnCalendarSMSError as error:
                if target['sms_email'] is not None and valid_email_address(target['sms_email']):
                    try:
                        ocsms.send_email_alert(target['sms_email'], sms_message, target['truncate'])
                        sms_status = 'Twilio handoff failed ({0}), sending via SMS email address'.format(error)
                    except OnCalendarSMSError as error:
                        ocsms.send_failsafe(sms_message)
                        raise OnCalendarAppError(
                            payload = {
                                'sms_status': 'ERROR',
                                'sms_error': 'Alerting failed ({0})- sending to failsafe address(es)'.format(error)
                            }
                        )
                else:
                    raise OnCalendarAppError(
                        payload = {
                            'sms_status': 'ERROR',
                            'sms_error': 'Twilio handoff failed ({0}), user has no backup SMS email address confgured!'.format(error)
                        }
                    )

            if victim_type == 'oncall' and shadow is not None:
                ocsms.send_sms(
                    shadow['phone'],
                    sms_message,
                    config.sms['TWILIO_USE_CALLBACK']
                )
        else:
            if target['throttle_time_remaining'] > 0:
                return json.dumps({
                    'sms_status': 'Throttle limit for {0} has been reached, throttling for {1} more seconds'.format(
                        target['username'],
                        target['throttle_time_remaining'])
                })

            try:
                target_sent_messages = ocdb.get_victim_message_count(target['username'], config.sms['SMS_THROTTLE_TIME'])[0]
            except OnCalendarDBError, error:
                raise OnCalendarAppError(
                    payload = {
                        'sms_status': 'ERROR',
                        'sms_error': "{0}: {1}".format(error.args[0], error.args[1])
                    }
                )

            if target_sent_messages >= target['throttle']:
                try:
                    ocdb.set_throttle(target['username'], config.sms['SMS_THROTTLE_TIME'])
                except OnCalendarDBError, error:
                    raise OnCalendarAppError(
                        payload = {
                            'sms_status': 'ERROR',
                            'sms_error': "{0}: {1}".format(error.args[0], error.args[1])
                        }
                    )

                ocsms.send_sms(target['phone'], throttle_message, False)
                if victim_type == 'oncall' and shadow is not None:
                    ocsms.send_sms(shadow['phone'], throttle_message, False)

                return json.dumps({
                    'sms_status': 'Throttle limit for {0} has been reached, throttling for {1} more seconds'.format(
                        target['username'],
                        target['throttle_time_remaining'])
                })

            try:
                ocsms.send_sms_alert(
                    groupid,
                    target['id'],
                    target['phone'],
                    sms_message,
                    notification_data['notification_type'],
                    notification_data['type'],
                    notification_data['hostname'],
                    sms_service,
                    notification_data['nagios_master']
                )
                sms_status = 'SMS handoff to Twilio successful'
            except OnCalendarSMSError, error:
                if target['sms_email'] is not None and valid_email_address(target['sms_email']):
                    try:
                        ocsms.send_email_alert(target['sms_email'], sms_message, target['truncate'])
                        sms_status = 'Twilio handoff failed ({0}), sending via SMS email address'.format(error)
                    except OnCalendarSMSError, error:
                        ocsms.send_failsafe(sms_message)
                        raise OnCalendarAppError(
                            payload = {
                                'sms_status': 'ERROR',
                                'sms_error': 'Alerting failed ({0})- sending to failsafe address(es)'.format(error)
                            }
                        )
                else:
                    raise OnCalendarAppError(
                        payload = {
                            'sms_status': 'ERROR',
                            'sms_error': 'Twilio handoff failed ({0}), user has no backup SMS email address confgured!'.format(error)
                        }
                    )

            if victim_type == 'oncall' and shadow is not None:
                ocsms.send_sms_alert(
                    groupid,
                    shadow['id'],
                    shadow['phone'],
                    sms_message,
                    notification_data['notification_type'],
                    notification_data['type'],
                    notification_data['hostname'],
                    sms_service,
                    notification_data['nagios_master']
                )

    return json.dumps({'sms_status': sms_status})


@ocapp.route('/api/notification/email/<victim_type>/<group>', methods=['POST'])
def api_send_email(victim_type, group):
    """
    API interface to send an SMS alert to the scheduled oncall for a group

    Returns:
        (str): Success or failure status as JSON
    """

    message_format = None
    color_map = {
        'PROBLEM': '#FF8080',
        'RECOVERY': '#80FF80',
        'ACKNOWLEDGEMENT': '#FFFF80',
        'DOWNTIMESTART': '#80FFFF',
        'DOWNTIMEEND': '#80FF80',
        'DOWNTIMECANCELLED': '#FFFF80',
        'FLAPPINGSTART': '#FF8080',
        'FLAPPINGSTOP': '#80FF80',
        'FLAPPINGDISABLED': '#FFFF80',
        'TEST': '#80FFFF'
    }

    if victim_type not in ('oncall', 'backup', 'group'):
        raise OnCalendarBadRequest(
            payload = {'email_status': 'ERROR', 'email_error': "{0}: Unknown email target {1}".format(ocapi_err.NOPARAM, victim_type)}
        )

    if not request.form:
        raise OnCalendarAppError(
            payload = {'email_status': 'ERROR', 'email_error': "{0}: {1}".format(ocapi_err.NOPOSTDATA, 'No data received')}
        )

    ocdb = OnCalendarDB(config.database)
    ocsms = OnCalendarSMS(config)

    if request.form['type'] == 'host':
        try:
            notification_data = parse_host_form(request.form)
        except OnCalendarFormParseError as error:
            raise OnCalendarBadRequest(
                payload = {'email_status': 'ERROR', 'email_error': "{0}: {1}".format(error.args[0], error.args[1])}
            )
        email_subject = "** {0} {1} Alert: {2} is {3} **".format(
            notification_data['notification_type'],
            notification_data['type'],
            notification_data['host_address'],
            notification_data['host_status']
        )
        if 'format' in request.form and request.form['format'] == 'html':
            message_format = 'html'
            host_query = config.monitor['MONITOR_URL'] + config.monitor['HOST_QUERY']
            host_query = host_query.format(notification_data['host_address'])
            host_info = config.monitor['MONITOR_URL'] + config.monitor['HOST_INFO_QUERY']
            host_info = host_info.format(notification_data['host_address'])
            hostgroup_query = config.monitor['MONITOR_URL'] + config.monitor['HOSTGROUP_QUERY']
            hostgroup_query = hostgroup_query.format(notification_data['hostgroup'])
            email_message = render_template('host_email_html.jinja2',
                                            data=notification_data,
                                            host_query=host_query,
                                            host_info=host_info,
                                            hostgroup_query=hostgroup_query,
                                            color_map=color_map)
        else:
            message_format = 'plain'
            email_message = render_template('host_email_plain.jinja2', data=notification_data)
    elif request.form['type'] == 'service':
        try:
            notification_data = parse_service_form(request.form)
        except OnCalendarFormParseError as error:
            raise OnCalendarBadRequest(
                payload={'email_status': 'ERROR', 'email_error': "{0}: {1}".format(error.args[0], error.args[1])}
            )
        email_subject = "** {0} {1} Alert: {2}/{3} is {4} **".format(
            notification_data['notification_type'],
            notification_data['type'],
            notification_data['hostname'],
            notification_data['service'],
            notification_data['service_status']
        )
        if 'format' in request.form and request.form['format'] == 'html':
            message_format = 'html'
            service_query = config.monitor['MONITOR_URL'] + config.monitor['SERVICE_QUERY']
            service_query = service_query.format(
                notification_data['host_address'],
                notification_data['service']
            )
            host_query = config.monitor['MONITOR_URL'] + config.monitor['HOST_QUERY']
            host_query = host_query.format(notification_data['host_address'])
            email_message = render_template('service_email_html.jinja2',
                                            data=notification_data,
                                            service_query=service_query,
                                            host_query=host_query,
                                            color_map=color_map)
        else:
            message_format = 'plain'
            email_message = render_template('service_email_plain.jinja2', data=notification_data)
    elif request.form['type'] == 'adhoc':
        try:
            sender = ocdb.get_victim_info(search_key='username', search_value=request.form['sender'])
            sender_id = sender.keys()[0]
            sender = sender[sender_id]
            email_subject = "OnCalendar System Page from {0}".format(request.form['sender'])
            email_message = request.form['body']
            message_format = 'plain'
        except OnCalendarDBError as error:
            raise OnCalendarAppError(
                payload = {
                    'email_status': 'ERROR',
                    'email_error': '{0}: {1}'.format(error.args[0], error.args[1])
                }
            )
    else:
        raise OnCalendarAppError(
            payload = {
                'email_status': 'ERROR',
                'email_error': "{0}: {1}".format(ocapi_err.NOPARAM, 'Request must specify either host or service type')
            }
        )

    try:
        current_victims = ocdb.get_current_victims(group)
        if victim_type == 'backup':
            target = current_victims[group]['backup']
        elif victim_type == 'group':
            try:
                group_info = ocdb.get_group_info(group_name=group)
            except OnCalendarDBError as error:
                raise OnCalendarAppError(
                    payload = {
                        'email_status': 'ERROR',
                        'email_error': "{0}: {1}".format(error.args[0], error.args[1])
                    }
                )
            target = {}
            if group_info[group]['email'] is not None and valid_email_address(group_info[group]['email']):
                target['email'] = group_info[group]['email']
            else:
                victim_emails = []
                for victim_id in group_info[group]['victims']:
                    victim_emails.append(group_info[group]['victims'][victim_id]['email'])
                target['email'] = ','.join(victim_emails)

        else:
            target = current_victims[group]['oncall']
            if current_victims[group]['shadow'] is not None:
                target['email'] += ',' + current_victims[group]['shadow']['email']
    except OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = {
                'email_status': 'ERROR',
                'email_error': "{0}: {1}".format(error.args[0], error.args[1])
            }
        )

    try:
        if request.form['type'] == 'adhoc':
            ocsms.send_email(target['email'], email_message, email_subject, message_format, sender['email'])
        else:
            ocsms.send_email(target['email'], email_message, email_subject, message_format)
    except OnCalendarSMSError, error:
        raise OnCalendarAppError(
            payload = {'email_status': 'ERROR', 'email_error': "{0}: {1}".format(error.args[0], error.args[1])}
        )

    return json.dumps({'email_status': 'Notification email sent to {0}'.format(target['email'])})


def parse_host_form(form_data):

    required_fields = [
        'notification_type',
        'host_status',
        'hostname',
        'host_address',
        'hostgroup',
        'duration',
        'notification_number',
        'event_time',
        'info'
    ]

    for field in required_fields:
        if not field in form_data or form_data[field] is None:
            raise OnCalendarFormParseError(ocapi_err.NOPARAM, 'Required field {0} missing'.format(field))

    notification_data = {
        'type': 'Host',
        'notification_type': form_data['notification_type'],
        'host_status': form_data['host_status'],
        'hostname': form_data['hostname'],
        'host_address': form_data['host_address'],
        'hostgroup': form_data['hostgroup'],
        'duration': form_data['duration'],
        'notification_number': form_data['notification_number'],
        'event_time': form_data['event_time'],
        'info': form_data['info'],
        'comments': form_data['comments'],
        'nagios_master': form_data['nagios_master']
    }

    return notification_data


def parse_service_form(form_data):

    required_fields = [
        'notification_type',
        'service_status',
        'service',
        'hostname',
        'host_address',
        'duration',
        'notification_number',
        'event_time',
        'info'
    ]

    for field in required_fields:
        if not field in form_data or form_data[field] is None:
            raise OnCalendarFormParseError(ocapi_err.NOPARAM, 'Required field {0} missing'.format(field))

    notification_data = {
        'type': 'Service',
        'notification_type': form_data['notification_type'],
        'service_status': form_data['service_status'],
        'service': form_data['service_description'],
        'hostname': form_data['hostname'],
        'host_address': form_data['host_address'],
        'duration': form_data['duration'],
        'notification_number': form_data['notification_number'],
        'event_time': form_data['event_time'],
        'info': form_data['info'],
        'notes_url': form_data['notes_url'],
        'comments': form_data['comments'],
        'nagios_master': form_data['nagios_master']
    }

    return notification_data


def process_incoming_sms(userid, username, phone, sms):
    """
    Process responses to SMS alerts.

    Args:
        user (str): Username of the responder
        phone (str): Phone number of the responder
        sms (dict): The parsed response

    Returns:
        (str): Result of parsing the command, to send to the user
    """

    valid_commands = [
        'help',
        'ping',
        'ack',
        'unack',
        'dt',
        'downtime',
        'truncate',
        'throttle'
    ]

    ocapp.logger.debug("Checking incoming SMS - hash: {0}, command: {1}, extra: {2}".format(
        sms['hash'],
        sms['command'],
        sms['extra']
    ))

    if sms['hash'] is None:
        sms_response = "No keyword found in message, unable to comply"
        hash_word = None
    else:
        hash_word = sms['hash'].lower()

    command = sms['command'].lower()

    ocdb = OnCalendarDB(config.database)
    nagios = OnCalendarNagiosLivestatus(config.monitor)

    if command in valid_commands:

        if command == 'ping':
            sms_response = 'pong'

        elif command == 'help':
            sms_response = """[[<keyword>]] <command>
help: This output
ack: Ack an alert
unack: Unack an alert
dt|downtime: Downtime problem until 11AM tomorrow
truncate [on|off]: Set SMS truncate preference
throttle <#>: Set throttle threshold"""

        elif command == 'truncate':
            if not sms['extra'] in ('on', 'off'):
                sms_response = "Usage: truncate [on|off]"
            else:
                truncate = 1 if sms['extra'] == "on" else 0
                try:
                    ocdb.set_victim_preference(userid, 'truncate', truncate)
                    sms_response = "SMS truncate preference updated"
                except OnCalendarDBError as error:
                    ocapp.logger.error("DB error updating truncate pref - {0}: {1}".format(
                        error.args[0],
                        error.args[1]
                    ))
                    sms_response = "There was an error updating your truncate setting, please try again later"

        elif command == "throttle":
            if re.match('^\d+$', sms['extra']) is None:
                sms_response = "Usage: throttle [threshold]"
            else:
                throttle = int(sms['extra'])
                if throttle < config.sms['SMS_THROTTLE_MIN']:
                    sms_response = "Throttle setting must be larger than {0}".format(config.sms['SMS_THROTTLE_MIN'])
                else:
                    try:
                        ocdb.set_victim_preference(userid, 'throttle', throttle)
                        sms_response = "SMS throttle setting updated"
                    except OnCalendarDBError as error:
                        ocapp.logger.error("DB error updating throttle pref - {0}: {1}".format(
                            error.args[0],
                            error.args[1]
                        ))
                        sms_response = "There was an error updating your throttle setting, please try again later"

        elif command == 'ack' and hash_word is not None:
            sms_record = ocdb.get_sms_record(userid, hash_word)
            if sms_record is None:
                sms_response = "Alert for keyword {0} was not found.".format(hash_word)
            else:
                if sms_record['nagios_master'] is not None:
                    nagios_masters = [sms_record['nagios_master']]
                else:
                    nagios_masters = nagios.nagios_masters

                if len(sms['extra']) == 0:
                    sms['extra'] = "Acknowledged via SMS by {0}".format(username)

                if sms_record['type'] == "Host":
                    command = "ACKNOWLEDGE_HOST_PROBLEM;{0};1;1;0;{1};{2}".format(
                        sms_record['host'],
                        username,
                        sms['extra']
                    )
                    sms_response = "Alert for host {0} acked by {1}".format(
                        sms_record['host'],
                        username
                    )
                else:
                    command = "ACKNOWLEDGE_SVC_PROBLEM;{0};{1};1;1;0;{2};{3}".format(
                        sms_record['host'],
                        sms_record['service'],
                        username,
                        sms['extra']
                    )
                    sms_response = "Alert for service {0} on host {1} acked by {2}".format(
                        sms_record['service'],
                        sms_record['host'],
                        username
                    )

                for master in nagios_masters:
                    try:
                        ocapp.logger.debug("Sending command {0} to {1}".format(command, master))
                        nagios.nagios_command(master, nagios.default_port, command)
                    except OnCalendarNagiosError as error:
                        ocapp.logger.error("Nagios command failed - {0}: {1}".format(
                            error.args[0],
                            error.args[1]
                        ))

        elif command == 'unack' and hash_word is not None:
            sms_record = ocdb.get_sms_record(userid, hash_word)
            if sms_record is None:
                sms_response = "Alert for keyword {0} was not found.".format(hash_word)
            else:
                if sms_record['nagios_master'] is not None:
                    nagios_masters = [sms_record['nagios_master']]
                else:
                    nagios_masters = nagios.nagios_masters

                if sms_record['type'] == "Host":
                    command = "REMOVE_HOST_ACKNOWLEDGEMENT;{0}".format(sms_record['host'])
                    sms_response = "Acknowledgement for host {0} removed by {1}".format(
                        sms_record['host'],
                        username
                    )
                else:
                    command = "REMOVE_SVC_ACKNOWLEDGEMENT;{0};{1}".format(
                        sms_record['host'],
                        sms_record['service']
                    )
                    sms_response = "Acknowledgement for service {0} on host {1} removed by {2}".format(
                        sms_record['service'],
                        sms_record['host'],
                        username
                    )

                for master in nagios_masters:
                    ocapp.logger.debug("Sending command {0} to {1}".format(command, master))
                    nagios.nagios_command(master, nagios.default_port, command)

        elif command in ('dt', 'downtime') and hash_word is not None:
            sms_record = ocdb.get_sms_record(userid, hash_word)
            if sms_record is None:
                sms_response = "Alert for keyword {0} was not found.".format(hash_word)
            else:
                start, end, duration = nagios.calculate_downtime()

                if sms_record['nagios_master'] is not None:
                    nagios_masters = [sms_record['nagios_master']]
                else:
                    nagios_masters = nagios.nagios_masters

                if len(sms['extra']) == 0:
                    sms['extra'] = "Host downtimed via SMS byb {0}".format(username)

                if sms_record['type'] == "Host":
                    command = "SCHEDULE_HOST_DOWNTIME;{0};{1};{2};{3};{4};{5};{6};{7}".format(
                        sms_record['host'],
                        start,
                        end,
                        1,
                        0,
                        duration,
                        username,
                        phone,
                        sms['extra']
                    )
                    sms_response = "Host {0} downtimed by {1}".format(
                        sms_record['host'],
                        username
                    )
                else:
                    command = "SCHEDULE_SVC_DOWNTIME;{0};{1};{2};{3};{4};{5};{6};{7};{8}".format(
                        sms_record['host'],
                        sms_record['service'],
                        start,
                        end,
                        1,
                        0,
                        duration,
                        username,
                        phone,
                        sms['extra']
                    )
                    sms_response = "Service {0} on host {1} downtimed by {2}".format(
                        sms_record['service'],
                        sms_record['host'],
                        username
                    )

                for master in nagios_masters:
                    ocapp.logger.debug("Sending command {0} to {1}".format(command, master))
                    nagios.nagios_command(master, nagios.default_port, command)

    else:
        ocapp.logger.debug("Invalid command: {0}".format(command))
        sms_response = """[[<keyword>]] <command>
help: This output
ack: Ack an alert
unack: Unack an alert
dt|downtime: Downtime problem until 11AM tomorrow
truncate [on|off]: Set SMS truncate preference
throttle <#>: Set throttle threshold"""

    return sms_response


def valid_email_address(address):
    """
    Simple validation of email address format

    Args:
        address (str): The address to check
    """

    email_checker = re.compile("^[^\s]+@[^\s]+\.[^\s]{2,3}$")
    if email_checker.search(address) == None:
        return False

    return True
