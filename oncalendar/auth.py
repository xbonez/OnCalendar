import ldap
from logging import getLogger
from oncalendar.db_interface import OnCalendarDB, OnCalendarDBError
from oncalendar.oc_config import config
from oncalendar.api_exceptions import OnCalendarAuthError

class User(object):
    id = ''
    active = '0'
    username = ''
    firstname = ''
    lastname = ''
    app_role = ''
    groups = []


    def __init__(self):
        self.logger = getLogger(__name__)


    @classmethod
    def test(cls):
        ocdb = OnCalendarDB(config.database)
        print ocdb.version


    @classmethod
    def get(cls, search_key=False, search_value=False):
        if search_value:
            try:
                ocdb = OnCalendarDB(config.database)
                victim_info = ocdb.get_victim_info(search_key, search_value)
            except OnCalendarDBError, error:
                raise OnCalendarDBError(error.args[0], error.args[1])
            for id in victim_info:
                cls.id = unicode(id)
                cls.username = victim_info[id]['username']
                cls.active = victim_info[id]['active']
                cls.groups = victim_info[id]['groups']
                cls.firstname = victim_info[id]['firstname']
                cls.lastname = victim_info[id]['lastname']
                cls.app_role = victim_info[id]['app_role']

            return cls
        else:
            return None


    @classmethod
    def is_authenticated(cls):
        return True


    @classmethod
    def is_active(cls):
        if cls.active:
            return True
        else:
            return False


    @classmethod
    def is_anonymous(cls):
        return False


    @classmethod
    def get_id(cls):
        return unicode(cls.id)


    @classmethod
    def __repr__(cls):
        return '<User {0}>'.format(cls.username)


class ldap_auth(object):

    def __init__(self):
        self.logger = getLogger(__name__)


    def authenticate_user(self, username=None, password=None):
        user = User.get('username', username)
        if user is not None:
            try:
                ocldap = ldap.initialize(config.ldap_auth['LDAP_URL'])
                ocldap.bind_s(config.ldap_auth['LDAP_BINDDN'], config.ldap_auth['LDAP_BINDPW'])
                user_info = ocldap.search_s(config.ldap_auth['LDAP_BASEDN'], ldap.SCOPE_SUBTREE, 'uid={0}'.format(username))
            except ldap.LDAPError, error:
                ocldap.unbind_s()
                raise OnCalendarAuthError(error[0])

            if len(user_info) != 0:
                user_dn =  user_info[0][0]
                try:
                    ocldap.bind_s(user_dn, password)
                    ocldap.unbind_s()
                    return user
                except ldap.LDAPError, error:
                    ocldap.unbind_s()
                    raise OnCalendarAuthError(error[0])
            else:
                raise OnCalendarAuthError({'desc': 'Invalid login'})
        else:
            raise OnCalendarAuthError({'desc': 'Invalid login'})