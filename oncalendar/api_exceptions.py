class OnCalendarAPIError(Exception):
    """
    Exception class for errors returned by API requests. Will
    return a success (200) code, but the client should parse the
    response to determine success or error status

    """
    def __init__(self, payload):
        Exception.__init__(self)
        self.status_code = 200
        self.payload = payload


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