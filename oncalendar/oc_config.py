class config(object):
    basic = {
        'SECRET_KEY': '',
        'APP_BASE_DIR': '',
        'JOB_MASTER': True,
        'EMAIL_DOMAIN': '',
        'CSRF_ENABLED': True
    }
    database = {
        'DBUSER': 'oncalendar',
        'DBHOST': 'localhost',
        'DBNAME': 'OnCalendar',
        'DBPASSWORD': 'oncalendar',
    }
    ldap_auth = {
        'LDAP_URL': '',
        'LDAP_BINDDN': '',
        'LDAP_BINDPW': '',
        'LDAP_BASEDN': '',
        'LDAP_GROUPSDN': '',
        'LDAP_USERATTR': ''
    }
    logging = {
        'LOG_LEVEL': '',
        'LOG_FORMAT': '%(asctime)s %(name)s [%(levelname)s]: %(message)s:',
        'APP_LOG_FILE': '',
        'SCHEDULE_LOG_FILE': ''
    }
    sms = {
        'SMS_TEST_MODE': False,
        'EMAIL_GATEWAY': False,
        'TWILIO_NUMBER': '',
        'TWILIO_SID': '',
        'TWILIO_TOKEN': '',
        'TWILIO_USE_CALLBACK': False,
        'TWILIO_CALLBACK_URL': '',
        'SMS_FAILSAFES': [],
        'SMS_THROTTLE_MIN': 6,
        'SMS_THROTTLE_TIME': 180,
        'SMS_CLIP': 160,
        'SMS_DEFAULT_MSG': 'An alert was triggered, but no message was provided!',
        'SMS_WORDLIST_FILE': '',
        'EMAIL_FROM': '',
        'EMAIL_HOST': ''
    }
    # If MONITOR_TYPE is nagios, populate the
    # NAGIOS_MASTERS and LIVESTATUS_PORT items
    monitor = {
        'MONITOR_TYPE': '',
        'MONITOR_TEST_MODE': False,
        'MONITOR_URL': '',
        'HOST_QUERY': '',
        'HOST_INFO_QUERY': '',
        'HOSTGROUP_QUERY': '',
        'SERVICE_QUERY': '',
        'NAGIOS_MASTERS': [],
        'LIVESTATUS_PORT': 6557
    }
