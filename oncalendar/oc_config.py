class config(object):
    basic = {
        'SECRET_KEY': '',
        'APP_BASE_DIR': '',
        'CLUSTERED': False,
        'CLUSTER_NAME': '',
        'JOB_MASTER': True,
        'EMAIL_DOMAIN': '',
        'CSRF_ENABLED': True,
        'API_ACCESS_DOMAINS': False
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
        'EMAIL_HOST': '',
        'CARRIER_GATEWAYS': [
            {'txt.att.net': 'ATT'},
            {'vtext.com': 'Verizon'},
            {'tmomail.net': 'T-Mobile'},
            {'messaging.sprintpcs.com': 'Sprint'},
            {'sms.airfiremobile.com': 'AirFire Mobile'},
            {'mms.aiowireless.net': 'Aio Wireless'},
            {'msg.acsalaska.com': 'Alaska Communications'},
            {'message.alltel.com': 'Alltel'},
            {'myboostmobile.com': 'Boost Mobile'},
            {'cellcom.quiktxt.com': 'CellCom'},
            {'csouth1.com': 'Cellular South'},
            {'mail.msgsender.com': 'Chat Mobility'},
            {'cspire1.com': 'CSpire'},
            {'sms.edgewireless.com': 'Edge Wireless'},
            {'sms.elementmobile.com': 'Element Mobile'},
            {'hawaii.sprintpcs.com': 'Hawaii Telecom'},
            {'iwirelesshometext.com': 'I-wireless'},
            {'mobile.kajeet.net': 'Kajeet'},
            {'text.longlines.com': 'LongLines'},
            {'mymetropcs.com': 'Metro PCS'},
            {'sms.ntwls.net': 'Nextech'},
            {'zsend.com': 'Pioneer'},
            {'qwestmp.com': 'Qwest'},
            {'smtext.com': 'Simple Mobile'},
            {'page.southernlinc.com': 'Southernlinc'},
            {'rinasms.com': 'South Central'},
            {'teleflip.com': 'Teleflip'},
            {'message.ting.com': 'Ting'},
            {'utext.com': 'Unicel'},
            {'union-tel.com': 'Union Wireless'},
            {'email.uscc.net': 'US Cellular'},
            {'usamobility.net': 'USA Mobility'},
            {'viaerosms.com': 'Viaero'},
            {'vmobl.com': 'Virgin Mobile'},
            {'text.voyagermobile.com': 'Voyager Mobile'},
            {'sms.wcc.net': 'West Central Wireless'}
        ]
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
