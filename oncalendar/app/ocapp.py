from apscheduler.scheduler import Scheduler
import datetime as dt
from flask import Flask, render_template, url_for, request, flash, redirect, g
import flask.ext.login as flogin
import json
import logging
import MySQLdb as mysql
import oncalendar as oc
from oncalendar.app import forms
from oncalendar.app import auth
import os
import re

ocapp = Flask(__name__)
ocapp.config.from_object(oc.config)
login_manager = flogin.LoginManager()
login_manager.login_view = 'oc_login'
login_manager.init_app(ocapp)

# Set up logging for the app
ocapp.app_log_handler = logging.FileHandler(oc.config.APP_LOG_FILE)
ocapp.schedule_log_handler = logging.FileHandler(oc.config.SCHEDULE_LOG_FILE)
ocapp.log_formatter = logging.Formatter(oc.config.LOG_FORMAT)
ocapp.app_log_handler.setFormatter(ocapp.log_formatter)
ocapp.schedule_log_handler.setFormatter(ocapp.log_formatter)
ocapp.logger.setLevel(getattr(logging, oc.config.LOG_LEVEL))
ocapp.logger.addHandler(ocapp.app_log_handler)

# Start the scheduler and set up logging for it
ocapp_scheduler = Scheduler()
ocapp_scheduler.start()
ocapp.aps_logger = logging.getLogger('apscheduler')
ocapp.aps_logger.setLevel(getattr(logging, oc.config.LOG_LEVEL))
ocapp.aps_logger.addHandler(ocapp.schedule_log_handler)


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


@ocapp_scheduler.interval_schedule(minutes=1)
def check_current_victims():
    """
    Scheduled job to check the current oncall/shadow/backup for each
    group and update if necessary. If a change occurs the incoming
    and outgoing oncall/shadow/backup users are notified via
    SMS of their new status.
    """

    ocdb = oc.OnCalendarDB(oc.config)
    ocapp.aps_logger.debug("Checking oncall schedules")
    try:
        oncall_check_status = ocdb.check_schedule()
        rotate_on_message = "You are now {0} oncall for group {1}"
        rotate_off_message = "You are no longer {0} oncall for group {1}"

        ocsms = oc.OnCalendarSMS(oc.config)

        for group in oncall_check_status.keys():
            if oncall_check_status[group]['oncall']['updated']:
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

    except oc.OnCalendarDBError as error:
        ocapp.aps_logger.error("Oncall rotation checked failed - {0}: {1}".format(
            error.args[0],
            error.args[1])
        )
        ocsms = oc.OnCalendarSMS(oc.config)
        ocsms.send_failsafe("OnCalendar scheduled rotation check failed: {0}".format(error.args[1]))


@login_manager.user_loader
def load_user(id):
    return auth.User.get('id', id)


@ocapp.before_request
def before_request():
    g.user = flogin.current_user


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
                           main_js=js,
                           stylesheet_url=url_for('static', filename='css/oncalendar.css'),
                           jquery_url=url_for('static', filename='js/jquery.js'),
                           datejs_url=url_for('static', filename='js/date.js'),
                           ocjs_url=url_for('static', filename='js/oncalendar.js'),
                           colorwheel_url=url_for('static', filename='js/color_wheel.js'),
                           magnific_url=url_for('static', filename='js/magnific-popup.js'),
                           bootstrapjs_url=url_for('static', filename='js/bootstrap.js'))


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
        except oc.OnCalendarAuthError, error:
            raise oc.OnCalendarAuthError(error[0]['desc'])

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
                           bootstrapjs_url=url_for('static', filename='js/bootstrap.js'))


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
        ocdb = oc.OnCalendarDB(oc.config)
        victims = ocdb.get_calendar(year, month, group)
    except oc.OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(victims)


@ocapp.route('/api/calendar/month', methods=['POST'])
def api_calendar_update_month():
    month_data = request.get_json()
    if not month_data:
        raise OnCalendarAppError(
            payload = [oc.ocapi_err.NOPOSTDATA, 'No data received']
        )
    else:
        update_group = month_data['filter_group']
        days = month_data['days']

    try:
        ocdb = oc.OnCalendarDB(oc.config)
        response = ocdb.update_calendar_month(update_group, days)
    except oc.OnCalendarDBError, error:
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
        ocdb = oc.OnCalendarDB(oc.config)
        cal_start = ocdb.get_caldays_start()
        cal_end = ocdb.get_caldays_end()
    except oc.OnCalendarDBError, error:
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
        ocdb = oc.OnCalendarDB(oc.config)
        cal_end = ocdb.get_caldays_end()
    except oc.OnCalendarDBError, error:
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
        ocdb = oc.OnCalendarDB(oc.config)
        cal_start = ocdb.get_caldays_start()
    except oc.OnCalendarDBError, error:
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
            payload = [oc.ocapi_err.NOPOSTDATA, 'No data received']
        )

    try:
        ocdb = oc.OnCalendarDB(oc.config)
        response = ocdb.update_calendar_day(update_day_data)
    except oc.OnCalendarDBError, error:
        ocapp.logger.error("Could not update calendar day - {0}: {1}".format(
            error.args[0],
            error.args[1]
        ))
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(response)


@ocapp.route('/api/groups/')
def api_get_all_groups_info():
    """
    API interface to get information on all configured groups.

    Returns:
        (string): The dict of all configured groups rendered as JSON.

        (string): On error returns a list of the error code and error message
                  as JSON with an HTTP return code of 500.
    """

    try:
        ocdb = oc.OnCalendarDB(oc.config)
        groups = ocdb.get_group_info()
    except oc.OnCalendarDBError, error:
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
        ocdb = oc.OnCalendarDB(oc.config)
        group_info = ocdb.get_group_info(False, group)
    except oc.OnCalendarDBError, error:
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
        ocdb = oc.OnCalendarDB(oc.config)
        group_info = ocdb.get_group_info(gid, False)
    except oc.OnCalendarDBError, error:
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
        ocdb = oc.OnCalendarDB(oc.config)
        group_victims = ocdb.get_group_victims(group)
    except oc.OnCalendarDBError, error:
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
        ocdb = oc.OnCalendarDB(oc.config)
        victims = ocdb.get_victim_info()
    except oc.OnCalendarDBError, error:
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
        ocdb = oc.OnCalendarDB(oc.config)
        victims = ocdb.get_current_victims(group)
    except oc.OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(victims)


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
        return json.dumps(oc.ocapi_err.NOPARAM, 'Invalid search key: {0}'.format(key))
    try:
        ocdb = oc.OnCalendarDB(oc.config)
        victim_info = ocdb.get_victim_info(key, id)
    except oc.OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(victim_info)


#######################################
# Admin interface APIs
#######################################

# Configuration APIs
#--------------------------------------
@ocapp.route('/api/admin/get_config')
def api_get_config():
    """
    API interface to get the app config variables.

    Returns:
        (string): JSON formatted app config.
    """

    config_vars = [attr for attr in dir(oc.config()) if not attr.startswith('__')]
    oc_config = {}
    for cv in config_vars:
        oc_config[cv] = ocapp.config[cv]
    return json.dumps(oc_config)


@ocapp.route('/api/admin/update_config', methods=['POST'])
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

    config_file = '{0}/oncalendar/oc_config.py'.format(os.getcwd())
    config_vars = [attr for attr in dir(oc.config()) if not attr.startswith('__')]
    updates = [key for key in request.form if request.form[key]]
    current_config = {}
    for cv in config_vars:
        current_config[cv] = ocapp.config[cv]
    for key in updates:
        current_config[key] = request.form[key]

    if (os.path.isfile(config_file)):
        try:
            with open(config_file, 'w') as cf:
                cf.write('class config(object):\n')
                for cv in current_config:
                    cf.write('    {0} = \'{1}\'\n'.format(cv, current_config[cv]))
                cf.close()
        except EnvironmentError, error:
            raise OnCalendarAppError(
                payload = [error.args[0], error.args[1]]
            )
    else:
        error_string = 'Config file {0} does not exist'.format(config_file)
        raise OnCalendarAppError(
            payload = [oc.API_NOCONFIG, error_string]
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
            payload = [oc.ocapi_err.NOPOSTDATA, 'No data received']
        )
    else:
        form_keys = [key for key in request.form if request.form[key]]

    for key in form_keys:
        group_data[key] = request.form[key]

    try:
        ocdb = oc.OnCalendarDB(oc.config)
        new_group = ocdb.add_group(group_data)
    except oc.OnCalendarDBError, error:
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
        ocdb = oc.OnCalendarDB(oc.config)
        group_count = ocdb.delete_group(group_id)
    except oc.OnCalendarDBError, error:
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
            payload = [oc.ocapi_err.NOPOSTDATA, 'No data received']
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
        ocdb = oc.OnCalendarDB(oc.config)
        group_info = ocdb.update_group(group_data)
    except oc.OnCalendarDBError, error:
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
            payload = [oc.ocapi_error.NOPOSTDATA, 'No data received']
        )
    else:
        group_victims_data = request.json

    try:
        ocdb = oc.OnCalendarDB(oc.config)
        group_victims = ocdb.update_group_victims(group_victims_data)
    except oc.OnCalendarDBError, error:
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
            payload = [oc.ocapi_err.NOPOSTDATA, 'No data received']
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
        ocdb = oc.OnCalendarDB(oc.config)
        new_victim = ocdb.add_victim(victim_data)
    except oc.OnCalendarDBError, error:
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
        ocdb = oc.OnCalendarDB(oc.config)
        victim_count = ocdb.delete_victim(victim_id)
    except (oc.OnCalendarDBError, oc.OnCalendarAPIError), error:
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
            payload = [oc.ocapi_err.NOPOSTDATA, 'No data received']
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
        ocdb = oc.OnCalendarDB(oc.config)
        victim_info = ocdb.update_victim(victim_data)
    except oc.OnCalendarDBError, error:
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
        ocdb = oc.OnCalendarDB(oc.config)
    except oc.OnCalendarDBError, error:
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
    except oc.OnCalendarDBError, error:
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
        ocdb = oc.OnCalendarDB(oc.config)
        init_status = ocdb.verify_database()
    except oc.OnCalendarDBError, error:
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
        db = mysql.connect(oc.config.DBHOST, request.form['mysql_user'], request.form['mysql_password'])
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
        ocdb = oc.OnCalendarDB(oc.config)
        init_status = ocdb.initialize_database()
    except (oc.OnCalendarDBError, oc.OnCalendarDBInitTSError), error:
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
        ocdb = oc.OnCalendarDB(oc.config)
        init_status = ocdb.initialize_database(True)
    except (oc.OnCalendarDBError, oc.OnCalendarDBInitTSError), error:
        raise OnCalendarAppError(
            payload = [error.args[0], error.args[1]]
        )

    return json.dumps(init_status)


if __name__ == '__main__':
    ocapp.run()


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
                'sms_error': "{0}: Unknown SMS target: {1}".format(oc.ocapi_err.NOPARAM, victim_type)
            }
        )

    if not request.form:
        raise OnCalendarBadRequest(
            payload = {
                'sms_status': 'ERROR',
                'sms_error': "{0}: No data received".format(oc.ocapi_err.NOPOSTDATA)
            }
        )
    elif request.form['type'] == 'host':
        try:
            notification_data = parse_host_form(request.form)
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
        except OnCalendarFormParseError as error:
            raise OnCalendarBadRequest(
                payload = {
                    'sms_status': 'ERROR',
                    'sms_error': "{0}: {1}".format(error.args[0], error.args[1])
                }
            )
        sms_message = render_template('service_sms.jinja2', data=notification_data)
    else:
        raise OnCalendarBadRequest(
            payload = {
                'sms_status': 'ERROR',
                'sms_error': "{0}: Request my specify either host or service type".format(oc.ocapi_err.NOPARAM)
            }
        )

    shadow = None
    throttle_message = 'Alert limit reached, throttling further pages'
    api_send_email(victim_type, group)

    if victim_type == 'group':
        print "Panic page for group {0}".format(group)
        try:
            ocdb = oc.OnCalendarDB(oc.config)
            group_info = ocdb.get_group_info(group_name=group)
            groupid = group_info[group]['id']
            victim_ids = group_info[group]['victims'].keys()
        except oc.OnCalendarDBError as error:
            raise OnCalendarAppError(
                payload = {
                    'sms_status': 'ERROR',
                    'sms_error': "{0}: {1}".format(error.args[0], error.args[1])
                }
            )

        ocsms = oc.OnCalendarSMS(oc.config)
        panic_status = {
            'throttled': 0,
            'successful': 0,
            'sms_errors': 0
        }

        for victimid in victim_ids:
            target = group_info[group]['victims'][victimid]
            if target['throttle_time_remaining'] <= 0:
                try:
                    target_sent_messages = ocdb.get_victim_message_count(
                        target['username'],
                        oc.config.SMS_THROTTLE_TIME
                    )[0]
                except oc.OnCalendarDBError as error:
                    raise OnCalendarAppError(
                        payload = {
                            'sms_status': 'ERROR',
                            'sms_error': "{0}: {1}".format(error.args[0], error.args[1])
                        }
                    )
                if target_sent_messages >= target['throttle']:
                    try:
                        ocdb.set_throttle(target['username'], oc.config.SMS_THROTTLE_TIME)
                    except oc.OnCalendarDBError as error:
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
                        ocsms.send_sms_alert(groupid, target['id'], target['phone'], sms_message, notification_data['notification_type'])
                        panic_status['successful'] += 1
                    except oc.OnCalendarSMSError as error:
                        if target['sms_email'] is not None and valid_email_address(target['sms_email']):
                            try:
                                ocsms.send_email_alert(target['sms_email'], sms_message, target['truncate'])
                            except oc.OnCalendarSMSError, error:
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
            ocdb = oc.OnCalendarDB(oc.config)
            current_victims = ocdb.get_current_victims(group)
            groupid = current_victims[group]['groupid']
            if victim_type == 'backup':
                target = current_victims[group]['backup']
            else:
                target = current_victims[group]['oncall']
                if current_victims[group]['shadow'] is not None:
                    shadow = current_victims[group]['shadow']
        except oc.OnCalendarDBError, error:
            raise OnCalendarAppError(
                payload = {
                    'sms_status': 'ERROR',
                    'sms_error': "{0}: {1}".format(error.args[0], error.args[1])
                }
            )

        ocsms = oc.OnCalendarSMS(oc.config)

        if target['throttle_time_remaining'] > 0:
            return json.dumps({
                'sms_status': 'Throttle limit for {0} has been reached, throttling for {1} more seconds'.format(
                    target['username'],
                    target['throttle_time_remaining'])
            })

        try:
            target_sent_messages = ocdb.get_victim_message_count(target['username'], oc.config.SMS_THROTTLE_TIME)[0]
        except oc.OnCalendarDBError, error:
            raise OnCalendarAppError(
                payload = {
                    'sms_status': 'ERROR',
                    'sms_error': "{0}: {1}".format(error.args[0], error.args[1])
                }
            )

        if target_sent_messages >= target['throttle']:
            try:
                ocdb.set_throttle(target['username'], oc.config.SMS_THROTTLE_TIME)
            except oc.OnCalendarDBError, error:
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
            ocsms.send_sms_alert(groupid, target['id'], target['phone'], sms_message, notification_data['notification_type'])
            sms_status = 'SMS handoff to Twilio successful'
        except oc.OnCalendarSMSError, error:
            if target['sms_email'] is not None and valid_email_address(target['sms_email']):
                try:
                    ocsms.send_email_alert(target['sms_email'], sms_message, target['truncate'])
                    sms_status = 'Twilio handoff failed ({0}), sending via SMS email address'.format(error)
                except oc.OnCalendarSMSError, error:
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
            ocsms.send_sms_alert(groupid, shadow['id'], shadow['phone'], sms_message, notification_data['notification_type'])

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
            payload = {'email_status': 'ERROR', 'email_error': "{0}: Unknown email target {1}".format(oc.ocapi_err.NOPARAM, victim_type)}
        )

    if not request.form:
        raise OnCalendarAppError(
            payload = {'email_status': 'ERROR', 'email_error': "{0}: {1}".format(oc.ocapi_err.NOPOSTDATA, 'No data received')}
        )
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
            host_query = oc.config.MONITOR_URL + oc.config.HOST_QUERY
            host_query = host_query.format(notification_data['host_address'])
            host_info = oc.config.MONITOR_URL + oc.config.HOST_INFO_QUERY
            host_info = host_info.format(notification_data['host_address'])
            hostgroup_query = oc.config.MONITOR_URL + oc.config.HOSTGROUP_QUERY
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
            service_query = oc.config.MONITOR_URL + oc.config.SERVICE_QUERY
            service_query = service_query.format(
                notification_data['host_address'],
                notification_data['service']
            )
            host_query = oc.config.MONITOR_URL + oc.config.HOST_QUERY
            host_query = host_query.format(notification_data['host_address'])
            email_message = render_template('service_email_html.jinja2',
                                            data=notification_data,
                                            service_query=service_query,
                                            host_query=host_query,
                                            color_map=color_map)
        else:
            message_format = 'plain'
            email_message = render_template('service_email_plain.jinja2', data=notification_data)
    else:
        raise OnCalendarAppError(
            payload = {
                'email_status': 'ERROR',
                'email_error': "{0}: {1}".format(oc.ocapi_err.NOPARAM, 'Request must specify either host or service type')
            }
        )

    ocsms = oc.OnCalendarSMS(oc.config)

    shadow = None
    try:
        ocdb = oc.OnCalendarDB(oc.config)
        current_victims = ocdb.get_current_victims(group)
        if victim_type == 'backup':
            target = current_victims[group]['backup']
        elif victim_type == 'group':
            try:
                group_info = ocdb.get_group_info(group_name=group)
            except oc.OnCalendarDBError as error:
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
                shadow = current_victims[group]['shadow']
    except oc.OnCalendarDBError, error:
        raise OnCalendarAppError(
            payload = {
                'email_status': 'ERROR',
                'email_error': "{0}: {1}".format(error.args[0], error.args[1])
            }
        )

    try:
        ocsms.send_email(target['email'], email_message, email_subject, message_format)
        if victim_type == 'oncall' and shadow is not None:
            ocsms.send_email(shadow['email'], email_message, email_subject, message_format)
    except oc.OnCalendarSMSError, error:
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
            raise OnCalendarFormParseError(oc.ocapi_err.NOPARAM, 'Required field {0} missing'.format(field))

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
        'comments': form_data['comments']
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
            raise OnCalendarFormParseError(oc.ocapi_err.NOPARAM, 'Required field {0} missing'.format(field))

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
        'comments': form_data['comments']
    }

    return notification_data


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
