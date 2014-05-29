#!/usr/bin/env python

"""
Utility script meant to be run from cron, queries the OnCalendar database
for the current oncall victims and updates the nagios config stubs
if there are any changes. This utility can also be run from the command
line to verify the nagios config stubs for victims, groups, etc.
"""

import argparse
import datetime as dt
from jinja2 import Environment, PackageLoader
import json
import MySQLdb as mysql
import os
import sys
import urllib2

sys.path.append(os.path.realpath('../..'))
import oncalendar as oc

#NAGIOS_DIR = '/etc/nagios/oncall'
NAGIOS_DIR = '/var/tmp/nagios'
ENV = Environment(loader=PackageLoader('oncalendar.utils', 'templates'))
VERBOSE = False
EMAIL = False
ONCALENDAR_API = 'http://localhost:5000/api'


def check_nagios_oncall(group, victim, shadow=None):
    """
    Reads the nagios config stubs for the specified group and checks to
    see if the oncall victim has changed.

    Args:
        group (str): Group name to check
        victim (str): Username of the current primary oncall
        shadow (str): Username of the shadow oncall
    """
    oncall_updated = False
    shadow_updated = False
    oncall_config = NAGIOS_DIR + '/contactgroup_' + group + 'oncall.cfg'
    oncall_sms_config = NAGIOS_DIR + '/contactgroup_' + group + 'oncall_sms.cfg'
    if os.path.isfile(oncall_config):
        group_file = open(oncall_config, 'r')
        for line in group_file:
            if 'members' in line:
                nagios_victims = line.split()[1]
                if ',' in nagios_victims:
                    current_primary, current_shadow = nagios_victims.split(',')
                else:
                    current_primary = nagios_victims
                    current_shadow = None
        if victim != current_primary:
            oncall_updated = True
            new_oncall = victim
            new_oncall_sms = victim + '_sms'
        if shadow and shadow != current_shadow:
            if oncall_updated:
                new_oncall += ',' + shadow
                new_oncall_sms += ',' + shadow + '_sms'
            else:
                shadow_updated = True
                new_oncall = current_primary + ',' + shadow
                new_oncall_sms = current_primary + '_sms,' + shadow + '_sms'
    else:
        oncall_updated = True
        new_oncall = victim
        new_oncall_sms = victim + '_sms'
        if shadow:
            shadow_updated = True
            new_oncall += ',' + shadow
            new_oncall_sms += victim + '_sms,' + shadow + '_sms'

    timestamp = dt.datetime.now()
    if oncall_updated or shadow_updated:
        oncall_template = ENV.get_template('contactgroup_oncall.cfg')
        group_file = open(oncall_config, 'w')
        group_file.write(oncall_template.render(timestamp=timestamp.ctime(),
                                                victim=new_oncall,
                                                group=group))
        group_file.close()
        oncall_sms_template = ENV.get_template('contactgroup_oncall_sms.cfg')
        group_sms_file = open(oncall_sms_config, 'w')
        group_sms_file.write(oncall_sms_template.render(timestamp=timestamp.ctime(),
                                                        victim=new_oncall_sms,
                                                        group=group))
        group_sms_file.close()

    if oncall_updated:
        validate_contact_files(victim)
        notify(victim, 'oncall')
    if shadow_updated:
        validate_contact_files(shadow)
        notify(shadow, 'shadow')


def check_nagios_secondary(group, backup):
    """
    Reads the nagios config stubs for the specified group's secondary
    oncall to see if the current user has changed

    Args:
        group (str): Group name to check
        backup (str): Username of the secondary oncall
    """
    backup_updated = False
    backup_config = NAGIOS_DIR + '/contactgroup_' + group + 'secondary.cfg'
    backup_sms_config = NAGIOS_DIR + '/contactgroup_' + group + 'secondary_sms.cfg'
    if backup is None:
        if os.path.isfile(backup_config):
            os.remove(backup_config)
        if os.path.isfile(backup_sms_config):
            os.remove(backup_sms_config)
    else:
        if os.path.isfile(backup_config):
            backup_file = open(backup_config, 'r')
            for line in backup_file:
                if 'members' in line:
                    current_backup = line.split()[1]
            if backup != current_backup:
                backup_updated = True
        else:
            backup_updated = True

        if backup_updated:
            backup_template = ENV.get_template('contactgroup_secondary.cfg')
            backup_file = open(backup_config, 'w')
            backup_file.write(backup_template.render(timestamp=timestamp.ctime(),
                                                     victim=backup,
                                                     group=group))
            backup_file.close()
            backup_sms_template = ENV.get_template('contactgroup_secondary_sms.cfg')
            backup_sms_file = open(backup_sms_config, 'w')
            backup_sms_file.write(backup_sms_template.render(timestamp=timestamp.ctime(),
                                                             victim=backup,
                                                             group=group))


def validate_contact_files(user):
    """
    Verifies that the user has the correct Nagios config stub file in place,
    creates them if not.

    Args:
        user (str): user to check
    """
    user_config = NAGIOS_DIR + '/contact_' + user + '.cfg'
    user_sms_config = NAGIOS_DIR + '/contact_' + user + '_sms.cfg'
    timestamp = dt.datetime.now()
    api_url = ONCALENDAR_API + '/victim/username/' + user
    try:
        raw_user_info = urllib2.urlopen(api_url, None, 10)
    except (urllib2.URLError, urllib2.HTTPError) as reason:
        print "Unable to get user info from OnCalendar API: {0}".format(reason)

    user_info = json.load(raw_user_info)
    user_id = user_info.keys()[0]
    full_name = user_info[user_id]['firstname'] + ' ' + user_info[user_id]['lastname']
    phone = user_info[user_id]['phone']
    email = user_info[user_id]['email']

    if not os.path.isfile(user_config):
        user_file = open(user_config, 'w')
        user_template = ENV.get_template('contact.cfg')
        user_file.write(user_template.render(timestamp=timestamp.ctime(),
                                             username=user,
                                             full_name=full_name,
                                             email=email))
        user_file.close()
        if len(phone) > 0:
            user_sms_file = open(user_sms_config, 'w')
            user_sms_template = ENV.get_template('contact_sms.cfg')
            user_sms_file.write(user_sms_template.render(timestamp=timestamp.ctime(),
                                                         username=user,
                                                         full_name=full_name,
                                                         phone=phone))
            user_sms_file.close()
    else:
        user_file = open(user_config, 'r')
        for line in user_config:
            if 'alias' in line:
                conf_full_name = line.split()[1]
            if 'email' in line:
                conf_email = line.split()[1]
        user_file.close()


def notify(user):
    return


def vprint(string):
    if VERBOSE:
        print string


def main():

    parser = argparse.ArgumentParser()
    parser.add_argument(
        '-g', '--group',
        dest='group',
        action='store',
        help="Limit schedule check to <group>."
    )
    parser.add_argument(
        '-m', '--email',
        dest='email',
        action='store',
        help="email script output and results to the specified address."
    )
    parser.add_argument(
        '-n', '--no-restart',
        dest='no_restart',
        action='store_true',
        help="Don't restart Nagios after updating the config stubs."
    )
    parser.add_argument(
        '-v', '--verbose',
        dest='verbose',
        action='store_true',
        help='Print status output for the checks (default is silence).'
    )

    parsed_args = parser.parse_args()

    if parsed_args.verbose:
        global VERBOSE
        VERBOSE = True

    if parsed_args.verbose:
        global EMAIL
        EMAIL = True

    try:
        ocdb = oc.OnCalendarDB(oc.config)
        current_victims = ocdb.get_current_victims(parsed_args.group)
    except oc.OnCalendarDBError, error:
        print "Schedule check failed, error: {0} - {1}".format(error.args[0], error.args[1])
        return error.args[0]

    # for group in current_victims:
    #     vprint('Checking oncall and shadow for {0}'.format(group))
    #     check_nagios_oncall(group, current_victims[group]['victim'], current_victims[group]['shadow'])
    #     vprint('Checking secondary for {0}'.format(group))
    #     check_nagios_secondary(group, current_victims[group]['backup'])

    validate_contact_files('lenny')


if __name__ == "__main__":
    sys.exit(main())