class OnCalendarAPIError(Exception):
	pass


class OnCalendarAuthError(Exception):
	pass


class ocapi_err(object):
    NOCONFIG = 1
    GROUPEXISTS = 2
    NOPOSTDATA = 3
    VICTIMEXISTS = 4
    NOPARAM = 5
    DBSELECT_EMPTY = 6
    PARAM_OUT_OF_BOUNDS = 7