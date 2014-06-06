class config(object):
    # App basic config
    SECRET_KEY          = ''
    APP_BASE_DIR        = ''
    # Database config
    DBUSER              = 'oncalendar'
    DBHOST              = 'localhost'
    DBNAME              = 'OnCalendar'
    DBPASSWORD          = 'oncalendar'
    CSRF_ENABLED        = 'true'
    # LDAP auth config
    LDAP_URL            = ''
    LDAP_BINDDN         = ''
    LDAP_BINDPW         = ''
    LDAP_BASEDN         = ''
    LDAP_GROUPSDN       = ''
    LDAP_USERATTR       = ''
    # Logging options
    LOG_LEVEL           = ''
    LOG_FORMAT          = '%(asctime)s %(name)s [%(levelname)s]: %(message)s:'
    APP_LOG_FILE        = ''
    SCHEDULE_LOG_FILE   = ''
    # SMS Notification configs
    SMS_TEST_MODE       = False
    TWILIO_NUMBER       = ''
    TWILIO_SID          = ''
    TWILIO_TOKEN        = ''
    TWILIO_USE_CALLBACK = False
    TWILIO_CALLBACK_URL = ''
    SMS_FAILSAFES       = []
    SMS_THROTTLE_MIN    = 6
    SMS_THROTTLE_TIME   = 180
    SMS_CLIP            = 160
    SMS_DEFAULT_MSG     = 'An alert was triggered, but no message was provided!'
    SMS_WORDLIST_FILE   = ''
    EMAIL_FROM          = ''
    EMAIL_HOST          = ''
    # Monitoring System Integration
    MONITOR_TYPE        = ''
    MONITOR_TEST_MODE   = False
    MONITOR_URL         = ''
    HOST_QUERY          = ''
    HOST_INFO_QUERY     = ''
    HOSTGROUP_QUERY     = ''
    SERVICE_QUERY       = ''
    # If MONITOR_TYPE == nagios, populate the following
    NAGIOS_MASTERS      = []
    LIVESTATUS_PORT     = 6557
