import calendar
import datetime as dt
import logging
import MySQLdb as mysql
from oncalendar.api_exceptions import OnCalendarAPIError, ocapi_err
import os
import sys


OCDB_ERROR = 1

class OnCalendarDBError(Exception):
    """ Class for Database errors in the app. """
    pass


class OnCalendarDBInitTSError(OnCalendarDBError):
    """ Class for errors when dealing with the DB init timestamp file. """
    pass


class OnCalendarDB(object):
    """
    Class to handle interactions with the OnCalendar database
    """

    def __init__(self, config):
        """
        Create the connection to the OnCalendar database.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """
        self.version = None

        try:
            OnCalendarDB.oncalendar_db = mysql.connect(config.DBHOST, config.DBUSER, config.DBPASSWORD, config.DBNAME)
            cursor = OnCalendarDB.oncalendar_db.cursor()
            cursor.execute("SELECT VERSION()")

            self.version = cursor.fetchone()
        except mysql.Error, error:
            raise OnCalendarDBError(error.args[0], error.args[1])


    @classmethod
    def verify_database(cls):
        """
        Verify the table structure of the OnCalendar database

        Returns:
            (dict): The number of missing tables and the current
                    initialization timestamp.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """
        expected_tables = [
            'caldays',
            'calendar',
            'groups',
            'victims',
            'groupmap',
            'edits',
            'sms_send'
        ]
        table_list = []
        missing_tables = 0
        initcheck = '{0}/oncalendar/app/etc/.db_init'.format(os.getcwd())
        db_init_ts = 0
        if os.path.isfile(initcheck):
            with open(initcheck, 'r') as f:
                db_init_ts = f.read()
                f.close()

        cursor = cls.oncalendar_db.cursor()
        try:
            cursor.execute('SHOW TABLES')
        except mysql.Error, error:
            raise OnCalendarDBError(error.args[0], error.args[1])
        rows = cursor.fetchall()
        for row in rows:
            table_list.append(row[0])
        for table in expected_tables:
            if not table in table_list:
                missing_tables += 1
        return {'missing_tables': missing_tables, 'db_init_ts': db_init_ts}


    @classmethod
    def initialize_database(cls, force_init=False):
        """
        Initialize the table structure of the OnCalendar database.

        First checks for the existence of the .db_init file indicating
        that the database has already been initialized and containing
        the timestamp of the current initialization. If that file exists
        and the force flag is not set it will bail out on initialization.

        Args:
            (boolean): Set to true to force initialization even if
                       the .db_init file is found.

        Returns:
            (dict): Init status as OK and the timestamp of initialization.

        Raises:
            (OnCalendarDBError): Passes error code for OCDB_ERROR and message
                                 that DB has already been initialized if the
                                 .db_init file is found and force=False.

            (OnCalendarDBError): Passes the mysql error code and message.

            (OnCalendarDBInitTSError): Passes errors encountered when trying
                                       to write the .db_init file.
        """
        # Table structure of the OnCalendar database.
        expected_tables = {
            'caldays': [
                "id int(11) unsigned NOT NULL AUTO_INCREMENT",
                "year int(4) NOT NULL",
                "month int(2) NOT NULL",
                "day int(2) NOT NULL",
                "PRIMARY KEY (id)"
            ],
            'calendar': [
                "calday int(11) unsigned NOT NULL",
                "hour int(2) NOT NULL",
                "min int(2) NOT NULL",
                "groupid int(11) unsigned NOT NULL",
                "victimid int(11) unsigned NOT NULL",
                "shadowid int(11) unsigned DEFAULT NULL",
                "backupid int(11) unsigned DEFAULT NULL",
                "KEY FK_calday (calday)",
                "KEY FK_victimid (victimid)",
                "KEY FK_shadowid (shadowid)",
                "KEY FK_backupid (backupid)",
                "CONSTRAINT FK_backupid FOREIGN KEY (backupid) REFERENCES victims (id) ON DELETE SET NULL ON UPDATE SET NULL",
                "CONSTRAINT FK_calday FOREIGN KEY (calday) REFERENCES caldays (id) ON DELETE CASCADE ON UPDATE CASCADE",
                "CONSTRAINT FK_shadowid FOREIGN KEY (shadowid) REFERENCES victims (id) ON DELETE SET NULL ON UPDATE SET NULL",
                "CONSTRAINT FK_victimid FOREIGN KEY (victimid) REFERENCES victims (id)"
            ],
            'groups': [
                "id int(11) unsigned NOT NULL AUTO_INCREMENT",
                "name varchar(254) DEFAULT NULL",
                "active tinyint(1) DEFAULT 0",
                "autorotate tinyint(1) DEFAULT 0",
                "turnover_day int(2) DEFAULT 1",
                "turnover_hour int(2) DEFAULT 9",
                "turnover_min int(2) DEFAULT 30",
                "backup tinyint(1) DEFAULT 0",
                "shadow tinyint(1) DEFAULT 0",
                "failsafe int(1) DEFAULT 0",
                "alias varchar(128) DEFAULT NULL",
                "backup_alias varchar(128) DEFAULT NULL",
                "failsafe_alias varchar(128) DEFAULT NULL",
                "email varchar(128) DEFAULT NULL",
                "auth_group varchar(128) DEFAULT NULL",
                "PRIMARY KEY (id)"
            ],
            'victims': [
                "id int(11) unsigned NOT NULL AUTO_INCREMENT",
                "active tinyint(1) DEFAULT 1",
                "username varchar(32) DEFAULT NULL",
                "firstname varchar(32) DEFAULT NULL",
                "lastname varchar(32) DEFAULT NULL",
                "phone varchar(32) DEFAULT NULL",
                "email varchar(128) DEFAULT NULL",
                "sms_email varchar(128) DEFAULT NULL",
                "app_role int(2) DEFAULT 0",
                "throttle int(4) NOT NULL DEFAULT 6",
                "throttle_until timestamp NOT NULL DEFAULT '0000-00-00 00:00:00'",
                "truncate tinyint(1) NOT NULL DEFAULT 0",
                "PRIMARY KEY (id)"
            ],
            'groupmap': [
                "groupid int(11) unsigned NOT NULL",
                "victimid int(11) unsigned NOT NULL",
                "active tinyint(1) DEFAULT 1",
                "KEY FK_group (groupid)",
                "KEY FK_victim (victimid)",
                "CONSTRAINT FK_group FOREIGN KEY (groupid) REFERENCES groups (id) ON DELETE CASCADE ON UPDATE CASCADE",
                "CONSTRAINT FK_victim FOREIGN KEY (victimid) REFERENCES victims (id) ON DELETE CASCADE ON UPDATE CASCADE"
            ],
            'edits': [
                "ts timestamp NOT NULL default '0000-00-00 00:00:00' ON UPDATE CURRENT_TIMESTAMP",
                "updaterid int(11) DEFAULT NULL",
                "updated_group int(11) DEFAULT NULL",
                "update_note VARCHAR(1024) DEFAULT NULL"
            ],
            'send_sms': [
                "id int(11) unsigned NOT NULL AUTO_INCREMENT",
                "ts timestamp NOT NULL DEFAULT '0000-00-00 00:00:00' ON UPDATE CURRENT_TIMESTAMP",
                "groupid int(11) DEFAULT NULL",
                "victimid int(11) DEFAULT NULL",
                "type varchar(32) DEFAULT NULL",
                "sms_hash varchar(32) DEFAULT NULL",
                "PRIMARY KEY (id)"
            ]
        }

        # Location of the .db_init file
        initcheck = '{0}/oncalendar/app/etc/.db_init'.format(os.getcwd())
        db_init_ts = 0
        if os.path.isfile(initcheck):
            with open(initcheck, 'r') as f:
                db_init_ts = f.read()
                f.close()

        if db_init_ts and not force_init:
            raise OnCalendarDBError(OCDB_ERROR, 'DB Already Initialized at {0}'.format(db_init_ts))
        else:
            with cls.oncalendar_db:
                for table in expected_tables:
                    cursor = cls.oncalendar_db.cursor()
                    try:
                        cursor.execute('DROP TABLE IF EXISTS {0}'.format(table))
                        cursor.execute('CREATE TABLE {0}({1})'.format(table,",".join(expected_tables[table])))
                        if table == "caldays":
                            today = dt.date.today()
                            cursor.execute('INSERT INTO caldays (year,month,day) VALUES({0},{1},1)'.format(today.year, today.month))
                    except mysql.Error, error:
                        raise OnCalendarDBError(error.args[0], error.args[1])
            now = dt.datetime.today()
            db_init_ts = now.strftime("%A, %d %B %Y, %H:%M")
            try:
                with open(initcheck, 'w') as f:
                    f.write(db_init_ts)
                    f.close()
            except EnvironmentError, error:
                raise OnCalendarDBInitTSError(error.args[1], error.args[1])
        return {'init_status': 'OK', 'db_init_ts': db_init_ts}


    @classmethod
    def get_caldays_end(cls):
        """
        Get the last configured day in the caldays table.

        Returns:
            current_end (datetime.date): The year, month, day of the
                                         current end date.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """
        fetch_cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)
        try:
            fetch_cursor.execute('SELECT * FROM caldays WHERE id=(SELECT MAX(id) FROM caldays)')
        except mysql.Error, error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        row = fetch_cursor.fetchone()
        current_end = dt.date(
            year=row['year'],
            month=row['month'],
            day=row['day']
        )

        return current_end


    @classmethod
    def get_caldays_start(cls):
        """
        Get the first configured day in the caldays table.

        Returns:
            current_start (datetime.date): The year, month, day of the
                                           current start date.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """
        fetch_cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)
        try:
            fetch_cursor.execute('SELECT * FROM caldays WHERE id=(SELECT MIN(id) FROM caldays)')
        except mysql.Error, error:
            raise OnCalendarDBError(error.args[0], error.argw[1])

        row = fetch_cursor.fetchone()
        current_start = dt.date(
            year=row['year'],
            month=row['month'],
            day=row['day']
        )

        return current_start


    @classmethod
    def extend_caldays(cls, days):
        """
        Extend the caldays table

        Args:
            days (string): The number of days to add to the table.

        Returns:
            new_end (datetime.date): The new end date.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """
        current_end = cls.get_caldays_end()
        end_tuple = current_end.timetuple()
        end_year, end_month, end_day = end_tuple[0:3]
        day = dt.timedelta(days=1)
        insert_date = dt.date(
            year=int(end_year),
            month=int(end_month),
            day=int(end_day)
        ) + day

        insert_cursor = cls.oncalendar_db.cursor()

        for i in range(days):
            insert_query = "INSERT INTO caldays (year,month,day) VALUES({0},{1},{2})".format(
                int(insert_date.year),
                int(insert_date.month),
                int(insert_date.day)
            )
            try:
                insert_cursor.execute(insert_query)
            except mysql.Error, error:
                cls.oncalendar_db.rollback()
                raise OnCalendarDBError(error.args[0], error.args[1])
            insert_date = insert_date + day

        cls.oncalendar_db.commit()

        new_end = cls.get_caldays_end()
        return new_end


    @classmethod
    def get_calendar(cls, year, month, group=None):
        year = int(year)
        month = int(month)
        start_dow, month_days = calendar.monthrange(year, month)
        pre_differential = dt.timedelta(days=0)
        post_differential = dt.timedelta(days=0)

        if start_dow == 6:
            start_dow = 0
        else:
            start_dow = start_dow + 1

        if start_dow > 0:
            pre_differential = dt.timedelta(days=start_dow)

        last_dow = calendar.weekday(year, month, month_days)

        if last_dow == 6:
            last_dow = 0
        else:
            last_dow = last_dow + 1

        if last_dow < 6:
            post_days = 6 - last_dow
            post_differential = dt.timedelta(days=post_days)


        calendar_start = cls.get_caldays_start().timetuple()
        calendar_end = cls.get_caldays_end().timetuple()

        # If the month is in the same year, but more than one month before
        # the start of the calendar we're out of bounds
        if year == calendar_start.tm_year and month < calendar_start.tm_mon - 1:
            raise OnCalendarDBError(ocapi_err.PARAM_OUT_OF_BOUNDS, 'Query dates fall outside the configured calendar range.')

        # Conversely, if the month is in the same year, but more than one
        # month after the end of the calendar we're out of bounds.
        if year == calendar_end.tm_year and month > calendar_end.tm_mon + 1:
            raise OnCalendarDBError(ocapi_err.PARAM_OUT_OF_BOUNDS, 'Query dates fall outside the configured calendar range.')

        # Edge case, if the search is for December of the previous year
        # and the calendar starts on January 1, we're only going to have
        # searchable days for the post-month days on the calendar, otherwise
        # we're out of bounds again.
        if year < calendar_start.tm_year:
            if year == calendar_start.tm_year - 1 and month == 12 and calendar_start.tm_mon == 1:
                first_day = dt.date(
                    year=calendar_start.tm_year,
                    month=calendar_start.tm_mon,
                    day=calendar_start.tm_mday
                )
                last_day = dt.date(
                    year=first_day.year,
                    month=first_day.month,
                    day=first_day.day
                ) + post_differential
            else:
                raise OnCalendarDBError(ocapi_err.PARAM_OUT_OF_BOUNDS, 'Query dates fall outside the configured calendar range.')
        # Edge case for the end, if the search is for January of the next year
        # and the calendar ends on December 31, we're only going to have
        # searchable days for the pre-month days on the calendar, otherwise
        # we're out of bounds again.
        elif year > calendar_end.tm_year:
            if year == calendar_end.tm_year + 1 and month == 1 and calendar_end.tm_mon == 12:
                last_day = dt.date(
                    year=calendar_end.tm_year,
                    month=calendar_end.tm_mon,
                    day=calendar_end.tm_mday
                )
                first_day = dt.date(
                    year=calendar_end.tm_year,
                    month=calendar_end.tm_mon,
                    day=calendar_end.tm_mday
                ) - pre_differential
            else:
                raise OnCalendarDBError(ocapi_err.PARAM_OUT_OF_BOUNDS, 'Query dates fall outside the configured calendar range.')
        # If the search month immediately precedes the calendar start we'll
        # only have searchable days for the post-month days on the calendar.
        elif month == calendar_start.tm_mon - 1:
            first_day = dt.date(
                year=calendar_start.tm_year,
                month=calendar_start.tm_mon,
                day=calendar_start.tm_mday
            )
            last_day = dt.date(
                year=first_day.year,
                month=first_day.month,
                day=first_day.day
            ) + post_differential
        # If the search month immediately follows the calendar end we'll
        # only have searchable days for the pre-month days on the calendar.
        elif month == calendar_end.tm_mon + 1:
            last_day = dt.date(
                year=calendar_end.tm_year,
                month=calendar_end.tm_mon,
                day=calendar_end.tm_mday
            )
            first_day = dt.date(
                year=calendar_end.tm_year,
                month=calendar_end.tm_mon,
                day=calendar_end.tm_mday
            ) - pre_differential
        # Or, finally, the search is within the configured calendar range.
        else:
            first_day = dt.date(
                year=year,
                month=month,
                day=1
            ) - pre_differential
            last_day = dt.date(
                year=year,
                month=month,
                day=month_days
            ) + post_differential

        cursor = cls.oncalendar_db.cursor()
        try:
            cursor.execute('SELECT id FROM caldays WHERE \
                            id >= (SELECT id from caldays WHERE year={0} AND month={1} AND day={2}) AND \
                            id <= (SELECT id from caldays WHERE year={3} AND month={4} AND day={5})'.format(
                first_day.year,
                first_day.month,
                first_day.day,
                last_day.year,
                last_day.month,
                last_day.day
            ))
        except mysql.Error, error:
            error_string = "Database error {0}: {1}".format(error.args[0], error.args[1])
            raise OnCalendarDBError(error.args[0], error.args[1])

        rows = cursor.fetchall()
        if not rows:
            raise OnCalendarDBError(ocapi_err.DBSELECT_EMPTY, 'Search returned no results')

        view_days = []
        cal_month = { 'map': {} }
        for row in rows:
            view_days.append(str(row[0]))
            cal_month[row[0]] = { 'slots': {}}

        cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)

        query_string = """SELECT c.calday, d.year, d.month, d.day, c.hour, c.min, g.name as group_name,
        v1.username AS victim, v1.firstname as victim_first, v1.lastname as victim_last,
        v2.username AS shadow, v2.firstname as shadow_first, v2.lastname as shadow_last,
        v3.username AS backup, v3.firstname as backup_first, v3.lastname as backup_last
        FROM calendar c
        LEFT OUTER JOIN caldays AS d ON c.calday=d.id
        LEFT OUTER JOIN victims AS v1 ON c.victimid=v1.id
        LEFT OUTER JOIN victims AS v2 ON c.shadowid=v2.id
        LEFT OUTER JOIN victims AS v3 ON c.backupid=v3.id
        LEFT OUTER JOIN groups AS g ON c.groupid=g.id
        WHERE calday IN ({0})
        """.format(','.join(view_days))
        if group:
            query_string += " AND g.name='{0}'".format(group)
        query_string += " ORDER BY calday, c.hour, c.min, c.groupid"

        try:
            cursor.execute(query_string)
        except mysql.Error, error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        for row in cursor.fetchall():
            daystring = "{0}-{1}-{2}".format(row['year'], row['month'], row['day'])
            slot = "{0:02d}-{1:02d}".format(row['hour'], row['min'])
            if not daystring in cal_month['map']:
                cal_month['map'][daystring] = row['calday']
            if not row['calday'] in cal_month:
                cal_month[row['calday']] = {
                    'slots': {}
                }
            if not slot in cal_month[row['calday']]['slots']:
                cal_month[row['calday']]['slots'][slot] = {}

            cal_month[row['calday']]['slots'][slot][row['group_name']] = {
                'oncall': row['victim'],
                'oncall_name': ' '.join([row['victim_first'], row['victim_last']]),
                'shadow': row['shadow'],
                'shadow_name': None,
                'backup': row['backup'],
                'backup_name': None
            }

            if row['shadow_first'] is not None and row['shadow_last'] is not None:
                cal_month[row['calday']]['slots'][slot][row['group_name']]['shadow_name'] = ' '.join([row['shadow_first'], row['shadow_last']])

            if row['backup_first'] is not None and row['backup_last'] is not None:
                cal_month[row['calday']]['slots'][slot][row['group_name']]['backup_name'] = ' '.join([row['backup_first'], row['backup_last']])

        return cal_month


    @classmethod
    def update_calendar_month(cls, group_name=False, update_day_data=False):
        cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)
        group_info = cls.get_group_info(False, group_name)
        day_slots = [[group_info[group_name]['turnover_hour'], group_info[group_name]['turnover_min']]]
        post_slots = [[0, 0], [0, 30]]
        if day_slots[0][1] == 0:
            day_slots.append([group_info[group_name]['turnover_hour'], '30'])

        first_hour = day_slots[0][0]
        slot_range = 23 - first_hour
        post_range = first_hour - 1
        increment_day = dt.timedelta(days=1)

        for i in range(slot_range):
            day_slots.append([first_hour + i + 1, 0])
            day_slots.append([first_hour + i + 1, 30])
        for i in range(post_range):
            post_slots.append([i + 1, 0])
            post_slots.append([i + 1, 30])

        if day_slots[0][1] == 30:
            post_slots.append([day_slots[0][0], 0])

        for day in sorted(update_day_data.keys()):
            victim = None
            shadow = None
            backup = None
            if 'oncall' in update_day_data[day] and update_day_data[day]['oncall'] != "--":
                victim = update_day_data[day]['oncall']

            if 'shadow' in update_day_data[day] and update_day_data[day]['shadow'] != "--":
                shadow = update_day_data[day]['shadow']

            if 'backup' in update_day_data[day] and update_day_data[day]['backup'] != "--":
                backup = update_day_data[day]['backup']

            if victim is None and shadow is None and backup is None:
                continue

            year, month, date = day.split('-')

            slot_check = {}
            slot_check_query = """SELECT * FROM calendar WHERE calday=(SELECT id FROM caldays
            WHERE year='{0}' AND month='{1}' AND day='{2}') AND groupid={3}""".format(year, month, date, group_info[group_name]['id'])
            try:
                cursor.execute(slot_check_query)
            except mysql.Error, error:
                raise OnCalendarDBError(error.args[0], error.args[1])

            for row in cursor.fetchall():
                slot_key = "{0}-{1}".format(row['hour'], row['min'])
                slot_check[slot_key] = {'victimid': row['victimid'], 'shadowid': row['shadowid'], 'backupid': row['backupid']}

            for slot in day_slots:
                update_slot_key = "{0}-{1}".format(slot[0], slot[1])
                if update_slot_key in slot_check:
                    update_month_query = "UPDATE calendar SET "
                    if victim is not None:
                        update_month_query += "victimid=(SELECT id FROM victims WHERE username='{0}')".format(victim)
                        if shadow is not None:
                            update_month_query += ", shadowid=(SELECT id FROM victims WHERE username='{0}')".format(shadow)
                        if backup is not None:
                            update_month_query += ", backupid=(SELECT id FROM victims WHERE username='{0}')".format(backup)
                    elif shadow is not None:
                        update_month_query += " shadowid=(SELECT id FROM victims WHERE username='{0}')".format(shadow)
                        if backup is not None:
                            update_month_query += ", backupid=(SELECT id FROM victims WHERE username='{0}')".format(backup)
                    elif backup is not None:
                        update_month_query += " backupid=(SELECT id FROM victims WHERE username='{0}')".format(backup)
                    update_month_query += """ WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
                    AND month='{1}' AND day='{2}') AND hour='{3}' AND min='{4}' AND groupid={5}""".format(
                        year,
                        month,
                        date,
                        slot[0],
                        slot[1],
                        group_info[group_name]['id']
                    )
                else:
                    update_month_query = "INSERT INTO calendar SET calday=(SELECT id FROM caldays\
                    WHERE year='{0}' AND month='{1}' AND day='{2}'), hour='{3}', min='{4}', \
                    groupid='{5}', ".format(
                        year,
                        month,
                        date,
                        slot[0],
                        slot[1],
                        group_info[group_name]['id'],
                    )
                    if victim is not None:
                        update_month_query += "victimid=(SELECT id FROM victims WHERE username='{0}')".format(victim)
                        if shadow is not None:
                            update_month_query += ", shadowid=(SELECT id FROM victims WHERE username='{0}')".format(shadow)
                        if backup is not None:
                            update_month_query += ", backupid=(SELECT id FROM victims WHERE username='{0}')".format(backup)
                    elif shadow is not None:
                        update_month_query += "shadowid=(SELECT id FROM victims WHERE username='{0}')".format(shadow)
                        if backup is not None:
                            update_month_query += ", backupid=(SELECT id FROM victims WHERE username='{0}')".format(backup)
                    elif backup is not None:
                        update_month_query += "backupid=(SELECT id FROM victims WHERE username='{0}')".format(backup)
                try:
                    cursor.execute(update_month_query)
                except mysql.Error, error:
                    raise OnCalendarDBError(error.args[0], error.args[1])

            next_date = dt.date(int(year), int(month), int(date)) + increment_day

            post_slot_check = {}
            slot_check_query = """SELECT * FROM calendar WHERE calday=(SELECT id FROM caldays
            WHERE year='{0}' AND month='{1}' AND day='{2}') AND groupid={3}""".format(next_date.year, next_date.month, next_date.day, group_info[group_name]['id'])
            try:
                cursor.execute(slot_check_query)
            except mysql.Error, error:
                raise OnCalendarDBError(error.args[0], error.args[1])

            for row in cursor.fetchall():
                post_slot_key = "{0}-{1}".format(row['hour'], row['min'])
                post_slot_check[post_slot_key] = {'victimid': row['victimid'], 'shadowid': row['shadowid'], 'backupid': row['backupid']}

            for slot in post_slots:
                update_slot_key = "{0}-{1}".format(slot[0], slot[1])
                if update_slot_key in post_slot_check:
                    update_month_query = "UPDATE calendar SET "
                    if victim is not None:
                        update_month_query += "victimid=(SELECT id FROM victims WHERE username='{0}')".format(victim)
                        if shadow is not None:
                            update_month_query += ", shadowid=(SELECT id FROM victims WHERE username='{0}')".format(shadow)
                        if backup is not None:
                            update_month_query += ", backupid=(SELECT id FROM victims WHERE username='{0}')".format(backup)
                    elif shadow is not None:
                        update_month_query += "shadowid=(SELECT id FROM victims WHERE username='{0}')".format(shadow)
                        if backup is not None:
                            update_month_query += ", backupid=(SELECT id FROM victims WHERE username='{0}')".format(backup)
                    elif backup is not None:
                        update_month_query += "backupid=(SELECT id FROM victims WHERE username='{0}')".format(backup)
                    update_month_query += """ WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
                            AND month='{1}' AND day='{2}') AND hour='{3}' AND min='{4}' AND groupid={5}""".format(
                        next_date.year,
                        next_date.month,
                        next_date.day,
                        slot[0],
                        slot[1],
                        group_info[group_name]['id']
                    )
                else:
                    update_month_query = "INSERT INTO calendar SET calday=(SELECT id FROM caldays\
                            WHERE year='{0}' AND month='{1}' AND day='{2}'), hour='{3}', min='{4}', \
                            groupid='{5}', ".format(
                        next_date.year,
                        next_date.month,
                        next_date.day,
                        slot[0],
                        slot[1],
                        group_info[group_name]['id'],
                        )
                    if victim is not None:
                        update_month_query += "victimid=(SELECT id FROM victims WHERE username='{0}')".format(victim)
                        if shadow is not None:
                            update_month_query += ", shadowid=(SELECT id FROM victims WHERE username='{0}')".format(shadow)
                        if backup is not None:
                            update_month_query += ", backupid=(SELECT id FROM victims WHERE username='{0}')".format(backup)
                    elif shadow is not None:
                        update_month_query += "shadowid=(SELECT id FROM victims WHERE username='{0}')".format(shadow)
                        if backup is not None:
                            update_month_query += ", backupid=(SELECT id FROM victims WHERE username='{0}'".format(backup)
                    elif backup is not None:
                        update_month_query += "backupid=(SELECT id FROM victims WHERE username='{0}')".format(backup)

                try:
                    cursor.execute(update_month_query)
                except mysql.Error, error:
                    raise OnCalendarDBError(error.args[0], error.args[1])

        cls.oncalendar_db.commit()

        return "Success"


    @classmethod
    def update_calendar_day(cls, update_day_data):
        """
        Update specific oncall/shadow slots for a given day

        Args:
            update_day_data (dict): The day, group and slots to update

        Returns:
            (dict): Updated schedule data for the day

        Raises:
            OnCalendarDBError
        """
        cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)
        update_group = update_day_data['group']
        update_calday = update_day_data['calday']
        update_slots = update_day_data['slots']

        for slot in update_slots:
            slot_bits = slot.split('-')
            slot_hour = int(slot_bits[0])
            slot_min = int(slot_bits[1])
            update_day_query = "UPDATE calendar SET"
            if 'oncall' in update_slots[slot]:
                update_day_query += " victimid=(SELECT id FROM victims WHERE username='" + update_slots[slot]['oncall'] + "')"
                if 'shadow' in update_slots[slot]:
                    update_day_query += ", shadowid=(SELECT id FROM victims WHERE username='" + update_slots[slot]['shadow'] + "')"
                if 'backup' in update_slots[slot]:
                    update_day_query += ", backupid=(SELECT id FROM victims WHERE username='" + update_slots[slot]['backup'] + "')"
            elif 'shadow' in update_slots[slot]:
                update_day_query += " shadowid=(SELECT id FROM victims WHERE username='" + update_slots[slot]['shadow'] + "')"
                if 'backup' in update_slots[slot]:
                    update_day_query += ", backupid=(SELECT id FROM victims WHERE username='" + update_slots[slot]['backup'] + "')"
            elif 'backup' in update_slots[slot]:
                update_day_query += " backupid=(SELECT id FROM victims WHERE username='" + update_slots[slot]['backup'] + "')"
            else:
                continue

            update_day_query += " WHERE groupid=(SELECT id FROM groups WHERE name='" + update_group + "')"
            update_day_query += " AND calday='" + update_calday + "' AND hour={0} AND min={1}".format(slot_hour, slot_min)

            try:
                cursor.execute(update_day_query)
            except mysql.Error, error:
                raise OnCalendarDBError(error.args[0], error.args[1])

        cls.oncalendar_db.commit()

        new_day_query = """SELECT c.hour, c.min,
        v1.username AS victim, v1.firstname AS victim_first, v1.lastname AS victim_last,
        v2.username AS shadow, v2.firstname AS shadow_first, v2.lastname AS shadow_last,
        v3.username AS backup, v3.firstname AS backup_first, v3.lastname AS backup_last
        FROM calendar c
        LEFT OUTER JOIN caldays AS d ON c.calday=d.id
        LEFT OUTER JOIN victims AS v1 ON c.victimid=v1.id
        LEFT OUTER JOIN victims AS v2 ON c.shadowid=v2.id
        LEFT OUTER JOIN victims AS v3 ON c.backupid=v3.id
        WHERE calday={0} AND c.groupid=(SELECT id FROM groups WHERE name='{1}')
        """.format(update_calday, update_group)

        cursor.execute(new_day_query)
        slots = {}
        for row in cursor.fetchall():
            slot = "{0:02d}-{1:02d}".format(row['hour'], row['min'])
            slots[slot] = {
                'oncall': row['victim'],
                'oncall_name': ' '.join([row['victim_first'], row['victim_last']]),
                'shadow': row['shadow'],
                'shadow_name': None,
                'backup': row['backup'],
                'backup_name': None
            }

            if row['shadow_first'] is not None and row['shadow_last'] is not None:
                slots[slot] = ' '.join([row['shadow_first'], row['shadow_last']])

            if row['backup_first'] is not None and row['backup_last'] is not None:
                slots[slot] = ' '.join([row['backup_first'], row['backup_last']])

        return slots


    @classmethod
    def get_group_info(cls, group_id=False, group_name=False):
        """
        Get information on all groups, or a single group if
        group_id is provided

        Args:
            group_id (string): The ID of the group to query.

        Returns:
            group (dict): Information the group or groups queried.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)
        group_info_query = 'SELECT * FROM groups'
        if group_id:
            group_info_query += ' WHERE id={0}'.format(group_id)
        elif group_name:
            group_info_query += " WHERE name='{0}'".format(group_name)

        try:
            cursor.execute(group_info_query)
        except mysql.Error, error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        groups = {}
        for row in cursor.fetchall():
            groups[row['name']] = row
            groups[row['name']]['victims'] = {}

        for group in groups:
            group_victims = cls.get_group_victims(group)
            groups[group]['victims'] = group_victims

        return groups


    @classmethod
    def get_group_victims(cls, group_name):
        """
        Get all victims associated with a group.

        Args:
            group_name (str): The group to search on.

        Returns:
            (dict): The info for all victims associated with the group.

        Raises:
            (OnCalendarDBError): Passes MySQL error code and message.
        """
        cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)
        group_victim_query = "SELECT v.id, v.username, v.firstname,\
        v.lastname, v.phone, v.email, v.sms_email, v.app_role, v.throttle,\
        IFNULL(TIMESTAMPDIFF(SECOND, NOW(), throttle_until), 0) AS throttle_time_remaining,\
        v.truncate, gm.active AS group_active FROM victims v, groups g, groupmap gm\
        WHERE v.active=1 AND g.name='{0}' AND gm.groupid=g.id AND gm.victimid=v.id".format(group_name)

        try:
            cursor.execute(group_victim_query)
        except mysql.Error, error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        group_victims = {}
        for row in cursor.fetchall():
            group_victims[row['id']] = row

        return group_victims


    @classmethod
    def add_group(cls, group_data):
        """
        Insert a new group record in the OnCalendar database.

        Args:
            group_data (dict): The information for the group to add.

        Returns:
            (dict): The information for the created group.

        Raises:
            (OnCalendarDBError): Error code for GROUPEXISTS, message if group
                                 name is found in the database.

            (OnCalendarDBError): Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor()
        add_group_query = 'INSERT INTO groups (name, active, autorotate, turnover_day, turnover_hour, turnover_min, backup, shadow, failsafe, alias, backup_alias, failsafe_alias, email, auth_group) \
            VALUES(\'{0}\',\'{1}\',\'{2}\',\'{3}\',\'{4}\',\'{5}\',\'{6}\',\'{7}\',\'{8}\',\'{9}\',\'{10}\',\'{11}\',\'{12}\',\'{13}\')'.format(
                group_data['name'],
                group_data['active'],
                group_data['autorotate'],
                group_data['turnover_day'],
                group_data['turnover_hour'],
                group_data['turnover_min'],
                group_data['backup'],
                group_data['shadow'],
                group_data['failsafe'],
                group_data['alias'],
                group_data['backup_alias'],
                group_data['failsafe_alias'],
                group_data['email'],
                group_data['auth_group']

        )

        try:
            cursor.execute('SELECT id FROM groups WHERE name=\'{0}\''.format(group_data['name']))
            rows = cursor.fetchall()
            if rows:
                raise OnCalendarDBError(ocapi_err.GROUPEXISTS, 'Group {0} already exists'.format(group_data['name']))
            cursor.execute(add_group_query)
            cls.oncalendar_db.commit()
            cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)
            cursor.execute('SELECT * FROM groups WHERE name=\'{0}\''.format(group_data['name']))
            row = cursor.fetchone()
            return row
        except mysql.Error, error:
            raise OnCalendarDBError(error.args[0], 'Failed to add group to database - {0}'.format(error.args[1]))


    @classmethod
    def delete_group(cls, group_id=False):
        """
        Delete a group record from the OnCalendar database.

        Args:
            group_id (string): The ID of the group to delete.

        Returns:
            (string): The count of remaining records in the group table.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor()
        if group_id:
            try:
                cursor.execute('DELETE FROM groups WHERE id={0}'.format(group_id))
                cls.oncalendar_db.commit()
            except mysql.Error, error:
                cls.oncalendar_db.rollback()
                raise OnCalendarDBError(error.args[0], error.args[1])

            cursor.execute('SELECT COUNT(*) FROM groups')
            row = cursor.fetchone()
            return row[0]
        else:
            raise OnCalendarAPIError(ocapi_err.NOPARAM, 'No group id given for deletion')


    @classmethod
    def update_group(cls, group_data):
        """
        Update the information for a group in the OnCalendar database.

        Args:
            group_data (dict): The updated information for the group entry.

        Returns:
            (dict): The post-update information for the group.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor()
        update_query = "UPDATE groups SET name='{0}',active='{1}',autorotate='{2}',turnover_day='{3}',\
                       turnover_hour='{4}',turnover_min='{5}',shadow='{6}',backup='{7}',failsafe='{8}',\
                       alias='{9}',backup_alias='{10}',failsafe_alias='{11}',email='{12}' \
                       WHERE id='{13}'".format(
            group_data['name'],
            group_data['active'],
            group_data['autorotate'],
            group_data['turnover_day'],
            group_data['turnover_hour'],
            group_data['turnover_min'],
            group_data['shadow'],
            group_data['backup'],
            group_data['failsafe'],
            group_data['alias'],
            group_data['backup_alias'],
            group_data['failsafe_alias'],
            group_data['email'],
            group_data['id']
        )
        try:
            cursor.execute(update_query)
            cls.oncalendar_db.commit()
            cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)
            cursor.execute('SELECT * FROM groups WHERE id=\'{0}\''.format(group_data['id']))
        except mysql.Error, error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        row = cursor.fetchone()
        return row


    @classmethod
    def update_group_victims(cls, group_victim_changes):
        """
        Change the active status or remove a user from the group.

        Args:
            group_victim_changes (dict): Status changes for the victims of the group

        Raises:
            OnCalendarDBError: Passes the MySQL error code and message.
        """
        cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)
        for victim in group_victim_changes['victims']:
            if victim['remove']:
                try:
                    cursor.execute("DELETE FROM groupmap where groupid={0} AND victimid={1}".format(
                        group_victim_changes['groupid'],
                        victim['victimid']
                    ))
                except mysql.Error, error:
                    raise OnCalendarDBError(error.args[0], error.args[1])
            else:
                print "adding victim id {0} to group {1}".format(victim['victimid'], group_victim_changes['groupid'])
                try:
                    cursor.execute("REPLACE INTO groupmap (groupid, victimid, active) VALUES ({0}, {1}, {2})".format(
                        group_victim_changes['groupid'],
                        victim['victimid'],
                        victim['active'],
                    ))
                except mysql.Error, error:
                    raise OnCalendarDBError(error.args[0], error.args[1])

        cls.oncalendar_db.commit()

        try:
            cursor.execute("SELECT v.id, v.username, v.firstname,\
            v.lastname, v.phone, v.email, v.sms_email, v.app_role, v.throttle,\
            IFNULL(TIMESTAMPDIFF(SECOND, NOW(), throttle_until), 0) AS throttle_time_remaining,\
            v.truncate, gm.active as group_active FROM victims v, groupmap gm\
            WHERE gm.victimid=v.id AND gm.groupid={0}".format(group_victim_changes['groupid']))
        except mysql.Error, error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        victims = {}
        for row in cursor.fetchall():
            victims[row['id']] = {
                'id': row['id'],
                'username': row['username'],
                'firstname': row['firstname'],
                'lastname': row['lastname'],
                'phone': row['phone'],
                'email': row['email'],
                'sms_email': row['sms_email'],
                'app_role': row['app_role'],
                'group_active': row['group_active']
            }

        return victims


    @classmethod
    def get_victim_info(cls, search_key=False, search_value=False):
        """
        Get information on all victims, or a single victim if
        a search_key and search_value are provided

        Args:
            search_key (string): Key to search by, either username or id.
            search_value (string): The username or id of the victim to query.

        Returns:
            victims (dict): Information the victim or victims queried.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)
        victim_info_query = """SELECT v.id, v.active, v.username, v.firstname,
        v.lastname, v.phone, v.email, v.sms_email, v.app_role, v.throttle,
        IFNULL(TIMESTAMPDIFF(SECOND, NOW(), throttle_until), 0) AS throttle_time_remaining,
        v.truncate, m.groupid AS gid, g.name FROM victims v
        LEFT OUTER JOIN groupmap AS m ON v.id=m.victimid
        LEFT OUTER JOIN groups AS g ON g.id=m.groupid"""
        if search_key:
            if search_value:
                victim_info_query += " WHERE v.{0}='{1}'".format(search_key, search_value)
            else:
                raise OnCalendarDBError(ocapi_err.NOPARAM, 'No {0} provided to search on.'.format(search_key))

        try:
            cursor.execute(victim_info_query)
        except mysql.Error, error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        victims = {}
        for row in cursor.fetchall():
            if row['id']in victims:
                victims[row['id']]['groups'].append(row['name'])
            else:
                victims[row['id']] = {
                    'id': row['id'],
                    'active': row['active'],
                    'username': row['username'],
                    'firstname': row['firstname'],
                    'lastname': row['lastname'],
                    'phone': row['phone'],
                    'email': row['email'],
                    'sms_email': row['sms_email'],
                    'app_role': row['app_role'],
                    'throttle': row['throttle'],
                    'throttle_time_remaining': row['throttle_time_remaining'],
                    'truncate': row['truncate'],
                    'groups': [row['name']]
                }

        return victims


    @classmethod
    def add_victim(cls, victim_data):
        """
        Insert a new victim record in the OnCalendar database.

        Args:
            victim_data (dict): The information for the victim to add.

        Returns:
            (dict): The information for the created victim.

        Raises:
            (OnCalendarDBError): Error code for VICTIMEXISTS, message if victim
                                 username is found in the database.

            (OnCalendarDBError): Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor()
        add_victim_query = "INSERT INTO victims (active, username, firstname, lastname, phone, email, sms_email, app_role) \
        VALUES('{0}','{1}','{2}','{3}','{4}','{5}','{6}','{7}')".format(
            victim_data['active'],
            victim_data['username'],
            victim_data['firstname'],
            victim_data['lastname'],
            victim_data['phone'],
            victim_data['email'],
            victim_data['sms_email'],
            victim_data['app_role']
        )

        try:
            cursor.execute('SELECT id FROM victims WHERE username=\'{0}\''.format(victim_data['username']))
            rows = cursor.fetchall()
            if rows:
                raise OnCalendarDBError(ocapi_err.VICTIMEXISTS, 'User {0} already exists'.format(victim_data['username']))
            cursor.execute(add_victim_query)
            cls.oncalendar_db.commit()
            cursor.execute("SELECT LAST_INSERT_ID()")
        except mysql.Error, error:
            cls.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], 'Failed to add user to database - {0}'.format(error.args[1]))

        new_victim_id_tuple = cursor.fetchone()
        new_victim_id = new_victim_id_tuple[0]

        try:
            for group in victim_data['groups']:
                cursor.execute('REPLACE INTO groupmap (groupid, victimid, active) VALUES ({0}, {1}, 1)'.format(
                        group,
                        new_victim_id
                    )
                )
            cls.oncalendar_db.commit()
        except mysql.Error, error:
            cls.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], 'Failed to add user to groups - {0}'.format(error.args[1]))

        new_victim = cls.get_victim_info('username', victim_data['username'])

        return new_victim[new_victim_id]


    @classmethod
    def add_victim_to_group(cls, victim_id, group_id):
        """
        Adds an already existing victim to a group

        Args:
            victim_id (str): The id of the victim
            group_id (str): The group to add the victim to

        Returns:
            (dict): The victim's information

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """

        cursor = cls.oncalendar_db.cursor()
        group_add_query = """REPLACE INTO groupmap (groupid, victimid, active)
        VALUES ({0}, {1}, 1""".format(group_id, victim_id)
        try:
            cursor.execute(group_add_query)
            cls.oncalendar_db.commit()
        except mysql.Error as error:
            cls.oncalendar_db.rollback()
            raise OnCalendarDBError(
                error.args[0],
                "Failed to add user to groups - {0}".format(error.args[1])
            )

        updated_victim = cls.git_victim_info('id', victim_id)

        return updated_victim[victim_id]


    @classmethod
    def delete_victim(cls, victim_id=False):
        """
        Delete a victim record from the OnCalendar database.

        Args:
            victim_id (string): The ID of the victim to delete.

        Returns:
            (string): The count of remaining records in the victims table.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor()
        if victim_id:
            try:
                cursor.execute('DELETE FROM victims WHERE id={0}'.format(victim_id))
                cursor.execute('DELETE FROM groupmap WHERE victimid={0}'.format(victim_id))
                cls.oncalendar_db.commit()
            except mysql.Error, error:
                cls.oncalendar_db.rollback()
                raise OnCalendarDBError(error.args[0], error.args[1])

            cursor.execute('SELECT COUNT(*) FROM victims')
            row = cursor.fetchone()
            return row[0]
        else:
            raise OnCalendarAPIError(ocapi_err.NOPARAM, 'No userid given for deletion')

    @classmethod
    def update_victim(cls, victim_data):
        """
        Update the information for a victim record in the OnCalendar database.

        Args:
            victim_data (dict): The updated information for the victim.

        Returns:
            (dict): The post-update information for the victim.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor()
        update_victim_query = """UPDATE victims SET username='{0}',
        firstname='{1}', lastname='{2}', phone='{3}', active='{4}',
        sms_email='{5}', app_role='{6}', email='{7}'
        WHERE id={8}""".format(
            victim_data['username'],
            victim_data['firstname'],
            victim_data['lastname'],
            victim_data['phone'],
            victim_data['active'],
            victim_data['sms_email'],
            victim_data['app_role'],
            victim_data['email'],
            victim_data['id']
        )

        try:
            cursor.execute(update_victim_query)
            cls.oncalendar_db.commit()
        except mysql.Error, error:
            cls.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], 'User update failed - {0}'.format(error.args[1]))

        try:
            for group in victim_data['groups']:
                gid, value = group.split('-')
                cursor.execute("SELECT COUNT(*) FROM groupmap WHERE groupid='{0}' and victimid='{1}'".format(
                    gid,
                    victim_data['id']
                ))
                row = cursor.fetchone()
                if row[0] == 0 and int(value) == 1:
                    cursor.execute('INSERT INTO groupmap (groupid, victimid, active) VALUES ({0}, {1}, {2})'.format(
                        gid,
                        victim_data['id'],
                        value
                    ))
                elif row[0] == 1 and int(value) == 0:
                    cursor.execute("DELETE FROM groupmap WHERE groupid='{0}' AND victimid='{1}'".format(
                        gid,
                        victim_data['id']
                    ))
            cls.oncalendar_db.commit()
        except mysql.Error, error:
            cls.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], 'Failed to update user groups - {0}'.format(error.args[1]))

        updated_victim = cls.get_victim_info('username', victim_data['username'])

        return updated_victim


    @classmethod
    def set_victim_preference(cls, victimid, pref, value):
        """
        Updates the preference fields in the user record

        Args:
            victimid (str): The id of the user to update
            pref (str): The preference to adjust (truncate, throttle)
            value (int): The new value (0|1 for truncate, # for throttle)

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor()
        update_pref_query = """UPDATE victims SET {0}={1} WHERE id='{2}'""".format(
            pref,
            value,
            victimid
        )

        try:
            cursor.execute(update_pref_query)
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])


    @classmethod
    def get_current_victims(cls, group=False):
        """
        Queries the calendar for the current scheduled victims, optionally filtered by group name.

        Args:
            group (str): Name of the group to filter by.

        Returns:
            (dict): Oncall, shadow and backup for each group

        Raises:
            OnCalendarDBError: Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)
        get_victims_query = """SELECT name, id AS groupid, email AS group_email,
        victimid, shadowid, backupid
        FROM groups"""
        if group:
            get_victims_query += " WHERE id=(SELECT id FROM groups WHERE name='{0}')".format(group)

        try:
            cursor.execute(get_victims_query)
        except mysql.Error, error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        current_victims = {}

        for row in cursor.fetchall():
            current_victims[row['name']] = {}
            current_victims[row['name']]['groupid'] = row['groupid']
            current_victims[row['name']]['group_email'] = row['group_email']
            current_victims[row['name']]['oncall'] = None
            current_victims[row['name']]['shadow'] = None
            current_victims[row['name']]['backup'] = None
            if row['victimid'] is not None:
                victim_info = cls.get_victim_info('id', row['victimid'])
                current_victims[row['name']]['oncall'] = victim_info[row['victimid']]
            if row['shadowid'] is not None:
                shadow_info = cls.get_victim_info('id', row['shadowid'])
                current_victims[row['name']]['shadow'] = shadow_info[row['shadowid']]
            if row['backupid'] is not None:
                backup_info = cls.get_victim_info('id', row['backupid'])
                current_victims[row['name']]['backup'] = backup_info[row['backupid']]

        return current_victims


    @classmethod
    def get_suggested_victims(cls, stub):
        """
        Queries the victims table for any usernames matching the stub.

        Args:
            stub (str): String to match against victim usernames

        Returns:
            (dict): The matched victims

        Raises:
            OnCalendarDBError: Passes the mysql error code and message.
        """

        cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)
        victim_stub_query = """SELECT id, username, firstname, lastname,
        phone, email, sms_email FROM victims
        WHERE username like '{0}%'""".format(stub)

        try:
            cursor.execute(victim_stub_query)
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        suggested_victims = {'suggestions': []}
        for row in cursor.fetchall():
            victim_data = {
                'id': row['id'],
                'firstname': row['firstname'],
                'lastname': row['lastname'],
                'phone': row['phone'],
                'email': row['email'],
                'sms_email': row['sms_email']
            }
            suggested_victims['suggestions'].append(
                {
                    'value': row['username'],
                    'data': victim_data
                }
            )

        return suggested_victims


    @classmethod
    def check_schedule(cls):
        """
        Queries the calendar and checks against list of current victims,
        updates the list if necessary

        Returns:
            (dict): Status of the check for each group, previous and new
                    victims if there was a change.
        """
        cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)
        current_victims_query = "SELECT name, id, victimid, shadowid, backupid FROM groups"
        try:
            cursor.execute(current_victims_query)
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        current_victims = {}

        for row in cursor.fetchall():
            current_victims[row['name']] = row

        today = dt.datetime.now()
        slot_min = 30 if today.minute > 29 else 0
        calendar_victims_query = """SELECT g.name, g.id AS groupid,
        c.victimid, c.shadowid, c.backupid
        FROM calendar c, groups g
        WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
        AND month='{1}' AND day='{2}')
        AND hour='{3}' AND min='{4}' AND c.groupid=g.id""".format(
            today.year,
            today.month,
            today.day,
            today.hour,
            slot_min,
        )
        try:
            cursor.execute(calendar_victims_query)
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        schedule_status = {}
        phone_query = "SELECT phone FROM victims WHERE id='{0}'"
        phones_query = """SELECT v1.phone as new_phone, v2.phone as prev_phone
        FROM victims v1, victims v2
        WHERE v1.id='{0}' AND v2.id='{1}'"""
        rotate_query = "UPDATE groups SET {0}='{1}' WHERE id='{2}'"

        for row in cursor.fetchall():
            schedule_status[row['name']] = {}
            if row['victimid'] is not None:
                if row['victimid'] != current_victims[row['name']]['victimid']:
                    try:
                        if current_victims[row['name']]['victimid'] is None:
                            victim_phone_query = phone_query.format(row['victimid'])
                            cursor.execute(victim_phone_query)
                            phone = cursor.fetchone()
                            schedule_status[row['name']]['oncall'] = {
                                'updated': True,
                                'previous': None,
                                'prev_phone': None,
                                'new': row['victimid'],
                                'new_phone': phone['phone']
                            }
                        else:
                            victim_phones_query = phones_query.format(
                                row['victimid'],
                                current_victims[row['name']]['victimid']
                            )
                            cursor.execute(victim_phones_query)
                            phones = cursor.fetchone()
                            schedule_status[row['name']]['oncall'] = {
                                'updated': True,
                                'previous': current_victims[row['name']]['victimid'],
                                'prev_phone': phones['prev_phone'],
                                'new': row['victimid'],
                                'new_phone': phones['new_phone']
                            }
                        update_victim_query = rotate_query.format(
                            'victimid',
                            row['victimid'],
                            row['groupid']
                        )
                        cursor.execute(update_victim_query)
                        cls.oncalendar_db.commit()
                    except mysql.Error as error:
                        raise OnCalendarDBError(error.args[0], error.args[1])
                else:
                    schedule_status[row['name']]['oncall'] = {'updated': False}

            if row['shadowid'] is not None:
                if row['shadowid'] != current_victims[row['name']]['shadowid']:
                    try:
                        if current_victims[row['name']]['shadowid'] is None:
                            shadow_phone_query = phone_query.format(row['shadowid'])
                            cursor.execute(shadow_phone_query)
                            phone = cursor.fetchone()
                            schedule_status[row['name']]['shadow'] = {
                                'updated': True,
                                'previous': None,
                                'prev_phone': None,
                                'new': row['shadowid'],
                                'new_phone': phone['new_phone']
                            }
                        else:
                            shadow_phones_query = phones_query.format(
                                row['shadowid'],
                                current_victims[row['name']]['shadowid']
                            )
                            cursor.execute(shadow_phones_query)
                            phones = cursor.fetchone()
                            schedule_status[row['name']]['shadow'] = {
                                'updated': True,
                                'previous': current_victims[row['name']]['shadowid'],
                                'prev_phone': phones['prev_phone'],
                                'new': row['shadowid'],
                                'new_phone': phones['new_phone']
                            }
                        update_shadow_query = rotate_query.format(
                            'shadowid',
                            row['shadowid'],
                            row['groupid']
                        )
                        cursor.execute(update_shadow_query)
                        cls.oncalendar_db.commit()
                    except mysql.Error as error:
                        raise OnCalendarDBError(error.args[0], error.args[1])
                else:
                    schedule_status[row['name']]['shadow'] = {'updated': False}

            if row['backupid'] is not None:
                if row['backupid'] != current_victims[row['name']]['backupid']:
                    try:
                        if current_victims[row['name']]['backupid'] is None:
                            backup_phone_query = phone_query.format(row['backupid'])
                            cursor.execute(backup_phone_query)
                            phone = cursor.fetchone()
                            schedule_status[row['name']]['backup'] = {
                                'updated': True,
                                'previous': None,
                                'prev_phone': None,
                                'new': row['backupid'],
                                'new_phone': phone['new_phone']
                            }
                        else:
                            backup_phones_query = phones_query.format(
                                row['backupid'],
                                current_victims[row['name']]['backupid']
                            )
                            cursor.execute(backup_phones_query)
                            phones = cursor.fetchone()
                            schedule_status[row['name']]['backup'] = {
                                'updated': True,
                                'previous': current_victims[row['name']]['backupid'],
                                'prev_phone': phones['prev_phone'],
                                'new': row['backupid'],
                                'new_phone': phones['new_phone']
                            }
                        update_backup_query = rotate_query.format(
                            'backupid',
                            row['backupid'],
                            row['groupid']
                        )
                        cursor.execute(update_backup_query)
                        cls.oncalendar_db.commit()
                    except mysql.Error as error:
                        raise OnCalendarDBError(error.args[0], error.args[1])
                else:
                    schedule_status[row['name']]['backup'] = {'updated': False}

        return schedule_status


    @classmethod
    def check_8hour_gaps(cls):
        """
        Checks the next 8 hours of all schedules and reports
        if there are gaps.

        Returns:
            (dict): The result of the check for each group.

        Raises:
            OnCalendarDBError: Passes the mysql error code and message.
        """

        start = dt.datetime.now()
        period_delta = dt.timedelta(hours=8)
        end = start + period_delta

        if start.minute > 29:
            start = start + dt.timedelta(hours=1)
            end = end + dt.timedelta(hours=1)

        date_cross = True if end.day != start.day else False
        gap_check = {}

        cursor = cls.oncalendar_db.cursor()

        if date_cross:
            today_query = """SELECT g.name, g.id as groupid, c.hour, c.min
            FROM calendar c, groups g
            WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
            AND month='{1}' AND day='{2}') AND hour>='{3}'
            AND c.groupid=g.id AND c.victimid IS NULL""".format(
                start.year,
                start.month,
                start.day,
                start.hour
            )
            tomorrow_query = """SELECT g.name, g.id as groupid, c.hour, c.min
            FROM calendar c, groups g
            WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
            AND month='{1}' AND day='{2}') AND hour<'{3}'
            AND c.groupid=g.id AND c.victimid IS NULL""".format(
                end.year,
                end.month,
                end.day,
                end.hour
            )
            try:
                cursor.execute(today_query)
                for row in cursor.fetchall():
                    if row['name'] in gap_check:
                        gap_check[row['name']].append(row)
                    else:
                        gap_check[row['name']] = [row]
                cursor.execute(tomorrow_query)
                for row in cursor.fetchall():
                    if row in cursor.fetchall():
                        if row['name'] in gap_check:
                            gap_check[row['name']].append(row)
                        else:
                            gap_check[row['name']] = [row]
            except mysql.Error as error:
                raise OnCalendarDBError(error.args[0], error.args[1])

        else:
            gap_query = """SELECT g.name, g.id as groupid, c.hour, c.min
            FROM calendar c, group g
            WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
            AND month='{1}' AND day='{2}') AND hour>='{3}' AND hour<'{4}'
            AND c.groupid=g.id AND c.victimid IS NULL""".format(
                start.year,
                start.month,
                start.day,
                start.hour,
                end.hour
            )
            try:
                cursor.execute(gap_query)
                for row in cursor.fetchall():
                    if row['name'] in gap_check:
                        gap_check[row['name']].append(row)
                    else:
                        gap_check[row['name']] = [row]
            except mysql.Error as error:
                raise OnCalendarDBError(error.args[0], error.args[1])

        return gap_check


    @classmethod
    def get_victim_message_count(cls, victim, throttle_time):
        """
        Retrieves the count of SMS messages sent to the user within the
        last <throttle_time> seconds.

        Args:
            victim (str): The name of the user.
            throttle_time: The threshold in seconds to check against.

        Returns:
            (int): The number of messages sent.

        Raises:
            OnCalendarDBError: Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor()
        message_count_query = """SELECT COUNT(*) FROM sms_send
        WHERE victimid=(SELECT id FROM victims WHERE username='{0}')
        AND ts > DATE_SUB(NOW(), INTERVAL {1} SECOND)""".format(
            victim,
            throttle_time
        )

        try:
            cursor.execute(message_count_query)
        except mysql.Error, error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        message_count = cursor.fetchone()

        return message_count


    @classmethod
    def set_throttle(cls, victim, throttle_time):
        """
        Sets the "throttle until" timestamp for the user

        Args:
            victim (str): The name of the user.
            throttle_time: The number of seconds to add for throttle until.

        Raises:
            OnCalendarDBError: Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor()
        set_throttle_query = """UPDATE victims
        SET throttle_until=DATE_ADD(NOW(), INTERVAL {0} SECOND)
        WHERE username='{1}'""".format(throttle_time, victim)

        try:
            cursor.execute(set_throttle_query)
            cls.oncalendar_db.commit()
        except mysql.Error, error:
            cls.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], error.args[1])


    @classmethod
    def add_sms_record(cls, groupid, victimid, alert_type, type, host, service, nagios_master):
        """
        Adds a record for a sent SMS message to the sms_send table.

        Args:
            group: The group the alert was triggered for.
            victim: The user that the SMS was sent to.
            type: The alert type.

        Raises:
            OnCalendarDBError: Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor()
        add_record_query = """INSERT INTO sms_send (groupid, victimid, alert_type, type, host, service, nagios_master)
        VALUES({0}, {1}, '{2}')""".format(groupid, victimid, alert_type, type, host, service, nagios_master)

        try:
            cursor.execute(add_record_query)
            cls.oncalendar_db.commit()
            cursor.execute("SELECT LAST_INSERT_ID()")
        except mysql.Error, error:
            cls.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], error.args[1])

        sms_id = cursor.fetchone()

        return sms_id


    @classmethod
    def get_sms_record(cls, userid, hash):
        """
        Retrieves a record of a sent SMS alert

        Args:
            userid (str): The id of the user
            hash (str): The keyword associated with the alert

        Returns:
            (dict): The record of the sent SMS

        Raises:
            OnCalendarDBError: Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor(mysql.cursors.DictCursor)
        get_record_query = """SELECT * FROM sms_send
        WHERE victimid='{0}' AND sms_hash='{1}'""".format(
            userid,
            hash
        )

        try:
            cursor.execute(get_record_query)
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        row = cursor.fetchone()
        return row


    @classmethod
    def set_sms_hash(cls, id, hash):
        """
        Adds the generated hash word to the sms_send record.

        Args:
            id (int): The id of the record.
            hash (str): The keyword assigned to the message.

        Raises:
            OnCalendarDBError: Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor()
        set_hash_query = """UPDATE sms_send SET sms_hash='{0}' WHERE id='{1}'""".format(hash, id)

        try:
            cursor.execute(set_hash_query)
            cls.oncalendar_db.commit()
        except mysql.Error, error:
            cls.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], error.args[1])


    @classmethod
    def set_sms_sid(cls, id, sid):
        """
        Adds the Twilio SMS SID to the sms_send record.

        Args:
            id (int): The id of the record.
            sid (str): The SID returned by Twilio.

        Raises:
            OnCalendarDBError: Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor()
        set_sid_query = """UPDATE sms_send SET twilio_sms_sid='{0}' WHERE id='{1}'""".format(sid, id)

        try:
            cursor.execute(set_sid_query)
            cls.oncalendar_db.commit()
        except mysql.Error, error:
            cls.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], error.args[1])


    @classmethod
    def get_last_incoming_sms(cls):
        """
        Queries for the Twilio SID of the last incoming SMS that was processed.

        Returns:
            (str): The Twilio SID

        Raises:
            OnCalendarDBError: Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor()
        get_last_sid_query = "SELECT twilio_sms_sid FROM sms_state WHERE name='last_incoming_sms"
        sid = None

        try:
            cursor.execute(get_last_sid_query)
            row = cursor.fetchone()
            if row is not None:
                sid = row[0]
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        return sid


    @classmethod
    def update_last_incoming_sms(cls, sid):
        """
        Updates the record for the last processed incoming SMS

        Args:
            (str): The SID for the message

        Raises:
            OnCalendarDBError: Passes the mysql error code and message.
        """
        cursor = cls.oncalendar_db.cursor()
        update_sid_query = "UPDATE sms_state SET twilio_sms_sid='{0}' WHERE name='last_incoming_sms'".format(sid)

        try:
            cursor.execute(update_sid_query)
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])
