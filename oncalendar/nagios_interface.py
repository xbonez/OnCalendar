import datetime as dt
import socket


class OnCalendarNagiosError(Exception):

    pass


class OnCalendarNagiosLivestatus(object):

    def __init__(self, config):

        self.default_port = config.LIVESTATUS_PORT
        self.nagios_masters = config.NAGIOS_MASTERS


    @classmethod
    def query_livestatus(cls, nagios_master, port, query, wait=True):

        ls_socket = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        ls_socket.connect((nagios_master, int(port)))
        ls_socket.sendall(query)
        ls_socket.shutdown(socket.SHUT_WR)

        query_result = ''
        while wait:
            rcv_buf = ls_socket.recieve(8192)
            if not rcv_buf:
                break

            query_result += rcv_buf

        ls_socket.close()

        return query_result


    @classmethod
    def nagios_command(cls, nagios_master, port, command):

        ts = dt.datetime.now()

        query = "COMMAND [{0}] {1}\n\n".format(ts.strftime('%s'), command)
        cls.query_livestatus(nagios_master, port, query, False)


    @classmethod
    def calculate_downtime(cls):
        start = dt.datetime.today()
        tomorrow = start + dt.timedelta(days=1)
        stop = dt.datetime(
            year=tomorrow.year,
            month=tomorrow.month,
            day=tomorrow.day,
            hour=11,
            minute=0
        )
        delta = stop - start
        start_ts = int(start.strftime('%s'))
        stop_ts = int(stop.strftime('%s'))
        total_seconds = (delta.microseconds + (delta.seconds + delta.days * 24 * 3600) * 10**6) / 10**6

        return (start_ts, stop_ts, total_seconds)