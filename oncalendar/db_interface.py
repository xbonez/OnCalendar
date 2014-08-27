import calendar
import datetime as dt
from logging import getLogger
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

    def __init__(self, dbconfig):
        """
        Create the connection to the OnCalendar database.

        Args:
            dbconfig (dict): The database config from oc_config.py

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """
        self.version = None
        self.logger = getLogger(__name__)

        try:
            self.oncalendar_db = mysql.connect(dbconfig['DBHOST'], dbconfig['DBUSER'], dbconfig['DBPASSWORD'], dbconfig['DBNAME'])
            cursor = self.oncalendar_db.cursor()
            cursor.execute("SELECT VERSION()")

            self.version = cursor.fetchone()
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])


    def verify_database(self):
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
        initcheck = '{0}/oncalendar/etc/.db_init'.format(os.getcwd())
        db_init_ts = 0
        if os.path.isfile(initcheck):
            with open(initcheck, 'r') as f:
                db_init_ts = f.read()
                f.close()

        cursor = self.oncalendar_db.cursor()
        try:
            cursor.execute('SHOW TABLES')
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])
        rows = cursor.fetchall()
        for row in rows:
            table_list.append(row[0])
        for table in expected_tables:
            if not table in table_list:
                missing_tables += 1
        return {'missing_tables': missing_tables, 'db_init_ts': db_init_ts}


    def initialize_database(self, force_init=False):
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
            'auth': [
                "id int(11) unsigned NOT NULL",
                "passwd varchar(64) DEFAULT NULL",
                "PRIMARY key (id)",
                "CONSTRAINT fk_auth_id FOREIGN KEY (id) REFERENCES victims (id) ON DELETE CASCADE"
            ],
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
                "victimid int(11) unsigned DEFAULT NULL",
                "shadowid int(11) unsigned DEFAULT NULL",
                "backupid int(11) unsigned DEFAULT NULL",
                "KEY FK_calday (calday)",
                "KEY FK_victimid (victimid)",
                "KEY FK_shadowid (shadowid)",
                "KEY FK_backupid (backupid)",
                "KEY FK_groupid (groupid)",
                "CONSTRAINT FK_groupid FOREIGN KEY (groupid) REFERENCES groups (id) ON DELETE CASCADE ON UPDATE CASCADE",
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
                "victimid int(11) unsigned DEFAULT NULL",
                "backup tinyint(1) DEFAULT 0",
                "backupid int(11) unsigned DEFAULT NULL",
                "shadow tinyint(1) DEFAULT 0",
                "shadowid int(11) unsigned DEFAULT NULL",
                "failsafe int(1) DEFAULT 0",
                "alias varchar(128) DEFAULT NULL",
                "backup_alias varchar(128) DEFAULT NULL",
                "failsafe_alias varchar(128) DEFAULT NULL",
                "email varchar(128) DEFAULT NULL",
                "auth_group varchar(128) DEFAULT NULL",
                "PRIMARY KEY (id)",
                "KEY FK_current_victim (victimid)",
                "KEY FK_current_shadow (shadowid)",
                "KEY FK_current_backup (backupid)",
                "CONSTRAINT FK_current_victim FOREIGN KEY (victimid) REFERENCES victims (id)",
                "CONSTRAINT FK_current_shadow FOREIGN KEY (shadowid) REFERENCES victims (id)",
                "CONSTRAINT FK_current_backup FOREIGN KEY (backupid) REFERENCES victims (id)"
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
            'sms_send': [
                "id int(11) unsigned NOT NULL AUTO_INCREMENT",
                "ts timestamp NOT NULL DEFAULT '0000-00-00 00:00:00' ON UPDATE CURRENT_TIMESTAMP",
                "groupid int(11) DEFAULT NULL",
                "victimid int(11) DEFAULT NULL",
                "type varchar(32) DEFAULT NULL",
                "host varchar(255) DEFAULT NULL",
                "service varchar(255) DEFAUL NULL",
                "sms_hash varchar(32) DEFAULT NULL",
                "twilio_sms_id varchar(64) DEFAULT NULL",
                "nagios_master varchar(255) DEFAULT NULL",
                "message text",
                "PRIMARY KEY (id)"
            ],
            'sms_state': [
                "id int(11) unsigned NOT NULL AUTO_INCREMENT",
                "name varchar(32) DEFAULT NULL",
                "twilio_sms_id varchar(64) DEFAULT NULL",
                "ts timestamp NOT NULL DEFAULT '0000-00-00 00:00:00' ON UPDATE CURRENT_TIMESTAMP",
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
            with self.oncalendar_db:
                for table in expected_tables:
                    cursor = self.oncalendar_db.cursor()
                    try:
                        cursor.execute('DROP TABLE IF EXISTS {0}'.format(table))
                        cursor.execute('CREATE TABLE {0}({1})'.format(table,",".join(expected_tables[table])))
                        if table == "caldays":
                            today = dt.date.today()
                            cursor.execute('INSERT INTO caldays (year,month,day) VALUES({0},{1},1)'.format(today.year, today.month))
                    except mysql.Error as error:
                        raise OnCalendarDBError(error.args[0], error.args[1])
            now = dt.datetime.today()
            db_init_ts = now.strftime("%A, %d %B %Y, %H:%M")
            try:
                with open(initcheck, 'w') as f:
                    f.write(db_init_ts)
                    f.close()
            except EnvironmentError as error:
                raise OnCalendarDBInitTSError(error.args[1], error.args[1])
        return {'init_status': 'OK', 'db_init_ts': db_init_ts}


    def update_edits(self, updater, update_group, update_note):
        """
        Adds a new record to the edits table

        Args:
            updater (str): The id of the user making the update

            update_group (str): The name of the group being updated

            update_note (str): The reason text for the upgrade

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor()
        update_edits_query = """INSERT INTO edits SET ts=CURRENT_TIMESTAMP(),
            updaterid='{0}', updated_group=(SELECT id FROM groups WHERE name='{1}'),
            update_note='{2}'""".format(
            updater,
            update_group,
            update_note,
            )

        try:
            cursor.execute(update_edits_query)
            self.oncalendar_db.commit()
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])


    def get_edit_history(self, groupid):
        """
        Gets the edit log for a group

        Args:
            groupid (str): The id of the group to return the edit history for

        Returns:
            (dict): The edit history log for the group
        """

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        if groupid:
            history_query = """SELECT e.ts, v.username, g.name, e.update_note
            FROM edits e, victims v, groups g
            WHERE updated_group={0} AND v.id=e.updaterid AND g.id=e.updated_group
            ORDER BY ts""".format(groupid)
        else:
            history_query = """SELECT e.ts, v.username, g.name, e.update_note
            FROM edits e, victims v, groups g
            WHERE v.id=e.updaterid AND g.id=e.updated_group ORDER BY ts"""
        try:
            cursor.execute(history_query)
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        edit_history = []
        for row in cursor.fetchall():
            timestamp = row['ts'].ctime()
            edit_history.append({
                'ts': timestamp,
                'updater': row['username'],
                'group': row['name'],
                'note': row['update_note']
            })

        return edit_history


    def get_last_edit(self, groupid):
        """
        Finds the last entry in the edit history for a group

        Args:
            groupid (str): The ID of the group

        Returns:
            (dict): The record for the last edit history entry

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        last_edit_query = """SELECT e.ts, v.username, g.name, e.update_note
        FROM edits e, victims v, groups g
        WHERE ts=(SELECT MAX(ts) FROM edits WHERE updated_group={0})
        AND v.id=e.updaterid AND g.id=e.updated_group""".format(groupid)

        try:
            cursor.execute(last_edit_query)
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        row = cursor.fetchone()
        if row is not None:
            last_edit = {
                'ts': row['ts'].ctime(),
                'updater': row['username'],
                'group': row['name'],
                'note': row['update_note']
            }
        else:
            last_edit = {}

        return last_edit


    def get_caldays_end(self):
        """
        Get the last configured day in the caldays table.

        Returns:
            (datetime.date): The year, month, day of the
                             current end date.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """

        fetch_cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        try:
            fetch_cursor.execute('SELECT * FROM caldays WHERE id=(SELECT MAX(id) FROM caldays)')
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        row = fetch_cursor.fetchone()
        current_end = dt.date(
            year=row['year'],
            month=row['month'],
            day=row['day']
        )

        return current_end


    def get_caldays_start(self):
        """
        Get the first configured day in the caldays table.

        Returns:
            (datetime.date): The year, month, day of the
                             current start date.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """

        fetch_cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        try:
            fetch_cursor.execute('SELECT * FROM caldays WHERE id=(SELECT MIN(id) FROM caldays)')
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        row = fetch_cursor.fetchone()
        current_start = dt.date(
            year=row['year'],
            month=row['month'],
            day=row['day']
        )

        return current_start


    def extend_caldays(self, days):
        """
        Extend the caldays table

        Args:
            days (str): The number of days to add to the table.

        Returns:
            (datetime.date): The new end date.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """

        current_end = self.get_caldays_end()
        end_tuple = current_end.timetuple()
        end_year, end_month, end_day = end_tuple[0:3]
        day = dt.timedelta(days=1)
        insert_date = dt.date(
            year=int(end_year),
            month=int(end_month),
            day=int(end_day)
        ) + day

        insert_cursor = self.oncalendar_db.cursor()

        for i in range(days):
            insert_query = "INSERT INTO caldays (year,month,day) VALUES({0},{1},{2})".format(
                int(insert_date.year),
                int(insert_date.month),
                int(insert_date.day)
            )
            try:
                insert_cursor.execute(insert_query)
            except mysql.Error as error:
                self.oncalendar_db.rollback()
                raise OnCalendarDBError(error.args[0], error.args[1])
            insert_date = insert_date + day

        self.oncalendar_db.commit()

        new_end = self.get_caldays_end()
        return new_end


    def get_calendar(self, year, month, group=None):
        """
        Get the complete oncall schedule for a given month, optionally
        filtered by group.

        Args:
            year (str): e.g. '2014'
            month (str): e.g. '7'
            group (str): The name of the group to filter on

        Returns:
            (dict): The complete schedule for the month

        Raises:
            OnCalendarDBError
        """

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


        calendar_start = self.get_caldays_start().timetuple()
        calendar_end = self.get_caldays_end().timetuple()

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

        cursor = self.oncalendar_db.cursor()
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
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        rows = cursor.fetchall()
        if not rows:
            raise OnCalendarDBError(ocapi_err.DBSELECT_EMPTY, 'Search returned no results')

        view_days = []
        cal_month = { 'map': {} }
        for row in rows:
            view_days.append(str(row[0]))
            cal_month[row[0]] = { 'slots': {}}

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)

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
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        for row in cursor.fetchall():
            victim = None
            shadow = None
            backup = None

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

            if row['victim'] is not None and row['victim'] != "null":
                victim = row['victim']
            if row['shadow'] is not None and row['shadow'] != "null":
                shadow = row['shadow']
            if row['backup'] is not None and row['backup'] != "null":
                backup = row['backup']

            cal_month[row['calday']]['slots'][slot][row['group_name']] = {
                'oncall': victim,
                'oncall_name': None,
                'shadow': shadow,
                'shadow_name': None,
                'backup': backup,
                'backup_name': None
            }

            if row['victim_first'] is not None and row['victim_last'] is not None:
                cal_month[row['calday']]['slots'][slot][row['group_name']]['oncall_name'] = ' '.join([row['victim_first'], row['victim_last']])

            if row['shadow_first'] is not None and row['shadow_last'] is not None:
                cal_month[row['calday']]['slots'][slot][row['group_name']]['shadow_name'] = ' '.join([row['shadow_first'], row['shadow_last']])

            if row['backup_first'] is not None and row['backup_last'] is not None:
                cal_month[row['calday']]['slots'][slot][row['group_name']]['backup_name'] = ' '.join([row['backup_first'], row['backup_last']])

        return cal_month


    def add_day_slots(self, calday, groupid):
        """
        Adds empty slots for a group to the specified day

        Args:
            calday (int): The day index to update

            groupid (int): The id of the group to add slots for

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        day_slots = [[0, 0], [0, 30]]
        for i in range(1,24):
            day_slots.append([i, 0])
            day_slots.append([i, 30])

        try:
            cursor.execute("""SELECT COUNT(*) AS slots
                FROM calendar WHERE calday='{0}' AND groupid='{1}'""".format(
                calday,
                groupid
            ))
            for row in cursor.fetchall():
                if row['slots'] == 0:
                    self.logger.debug('calday {0} is empty, populating'.format(calday))
                    for slot in day_slots:
                        cursor.execute("""INSERT INTO calendar
                            (calday, hour, min, groupid)
                            VALUES ('{0}','{1}','{2}','{3}')""".format(
                            calday,
                            slot[0],
                            slot[1],
                            groupid
                        ))
                    self.oncalendar_db.commit()
                elif row['slots'] < 48:
                    self.logger.debug('calday {0} not complete, filling in'.format(calday))
                    slot_check = []
                    cursor.execute("""SELECT hour, min FROM calendar
                        WHERE calday='{0}' AND groupid='{1}'""".format(
                        calday,
                        groupid
                    ))
                    for row in cursor.fetchall():
                        slot_check.append('{0}-{1}'.format(
                            row['hour'],
                            row['min']
                        ))
                    for slot in day_slots:
                        if str(slot[0]) + '-' + str(slot[1]) not in slot_check:
                            cursor.execute("""INSERT INTO calendar
                                (calday, hour, min, groupid)
                                VALUES('{0}','{1}','{2}','{3}')""".format(
                                calday,
                                slot[0],
                                slot[1],
                                groupid
                            ))
                    self.oncalendar_db.commit()
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])


    def update_calendar_month(self, updater, reason, group_name, update_day_data=False):
        """
        Updates an entire monthly schedule for the give group.

        Args:
            updater (str): The id of the user making the update.

            reason (str): The reason for the update.

            group_name (str): Name of the group whose schedule is being updated

            update_day_data (dict): The updated schedule info for the month

        Returns:
            (str): Success status

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        group_info = self.get_group_info(False, group_name)

        calday_query = "SELECT id FROM caldays WHERE year='{0}' AND month='{1}' AND day='{2}'"

        first_slot_query = """UPDATE calendar
        SET {0}=(SELECT id FROM victims WHERE username='{1}')
        WHERE calday='{2}' AND groupid='{3}' AND hour='{4}' AND min='{5}'"""

        day_update_query = """UPDATE calendar
        SET {0}=(SELECT id FROM victims WHERE username='{1}')
        WHERE calday='{2}' AND groupid='{3}' AND hour>='{4}'"""

        post_day_update_query = """UPDATE calendar
        SET {0}=(SELECT id FROM victims WHERE username='{1}')
        WHERE calday='{2}' AND groupid='{3}' AND HOUR<'{4}'"""

        last_slot_query = """UPDATE calendar
        SET {0}=(SELECT id FROM victims WHERE username='{1}')
        WHERE calday='{2}' AND groupid='{3}' AND hour='{4}' AND min='{5}'"""

        filter_tag = " AND {0}=(SELECT id FROM victims WHERE username='{1}')"
        null_filter = " AND {0} IS NULL"

        for day in sorted(update_day_data.keys()):
            victims = {
                'victim': None,
                'prev_victim': None,
                'shadow': None,
                'prev_shadow': None,
                'backup': None,
                'prev_backup': None
            }
            if 'oncall' in update_day_data[day]:
                victims['victim'] = update_day_data[day]['oncall']
                victims['prev_victim'] = update_day_data[day]['prev_oncall']

            if 'shadow' in update_day_data[day]:
                victims['shadow'] = update_day_data[day]['shadow']
                victims['prev_shadow'] = update_day_data[day]['prev_shadow']

            if 'backup' in update_day_data[day]:
                victims['backup'] = update_day_data[day]['backup']
                victims['prev_backup'] = update_day_data[day]['prev_backup']

            if victims['victim'] is None and victims['shadow'] is None and victims['backup'] is None:
                continue

            year, month, date = day.split('-')

            try:
                self.logger.debug(calday_query.format(year, month, date))
                cursor.execute(calday_query.format(year, month, date))
            except mysql.Error as error:
                raise OnCalendarDBError(error.args[0], error.args[1])

            for row in cursor.fetchall():
                calday = row['id']

            self.add_day_slots(calday, group_info[group_name]['id'])
            self.add_day_slots(calday + 1, group_info[group_name]['id'])

            for victim_type in ['victim', 'shadow', 'backup']:
                prev_victim_type = 'prev_' + victim_type
                if victims[victim_type] is not None:
                    try:
                        if victims[prev_victim_type] == "--":
                            if group_info[group_name]['turnover_min'] == 30:
                                cursor.execute(first_slot_query.format(
                                    victim_type + 'id',
                                    victims[victim_type],
                                    calday,
                                    group_info[group_name]['id'],
                                    group_info[group_name]['turnover_hour'],
                                    '30'
                                ) + null_filter.format(victim_type + 'id'))
                                cursor.execute(day_update_query.format(
                                    victim_type + 'id',
                                    victims[victim_type],
                                    calday,
                                    group_info[group_name]['id'],
                                    group_info[group_name]['turnover_hour'] + 1
                                ) + null_filter.format(victim_type + 'id'))
                            else:
                                cursor.execute(day_update_query.format(
                                    victim_type + 'id',
                                    victims[victim_type],
                                    calday,
                                    group_info[group_name]['id'],
                                    group_info[group_name]['turnover_hour']
                                ) + null_filter.format(victim_type + 'id'))
                            cursor.execute(post_day_update_query.format(
                                victim_type + 'id',
                                victims[victim_type],
                                calday + 1,
                                group_info[group_name]['id'],
                                group_info[group_name]['turnover_hour']
                            ) + null_filter.format(victim_type + 'id'))
                            if group_info[group_name]['turnover_min'] == 30:
                                cursor.execute(last_slot_query.format(
                                    victim_type + 'id',
                                    victims[victim_type],
                                    calday + 1,
                                    group_info[group_name]['id'],
                                    group_info[group_name]['turnover_hour'],
                                    '0'
                                ) + null_filter.format(victim_type + 'id'))
                        else:
                            if group_info[group_name]['turnover_min'] == 30:
                                cursor.execute(first_slot_query.format(
                                    victim_type + 'id',
                                    victims[victim_type],
                                    calday,
                                    group_info[group_name]['id'],
                                    group_info[group_name]['turnover_hour'],
                                    '30'
                                ) + filter_tag.format(
                                    victim_type + 'id',
                                    victims[prev_victim_type]
                                ))
                                cursor.execute(day_update_query.format(
                                    victim_type + 'id',
                                    victims[victim_type],
                                    calday,
                                    group_info[group_name]['id'],
                                    group_info[group_name]['turnover_hour'] + 1
                                ) + filter_tag.format(
                                    victim_type + 'id',
                                    victims[prev_victim_type]
                                ))
                            else:
                                cursor.execute(day_update_query.format(
                                    victim_type + 'id',
                                    victims[victim_type],
                                    calday,
                                    group_info[group_name]['id'],
                                    group_info[group_name]['turnover_hour']
                                ) + filter_tag.format(
                                    victim_type + 'id',
                                    victims[prev_victim_type]
                                ))
                            cursor.execute(post_day_update_query.format(
                                victim_type + 'id',
                                victims[victim_type],
                                calday + 1,
                                group_info[group_name]['id'],
                                group_info[group_name]['turnover_hour']
                            ) + filter_tag.format(
                                victim_type + 'id',
                                victims[prev_victim_type]
                            ))
                            if group_info[group_name]['turnover_min'] == 30:
                                cursor.execute(last_slot_query.format(
                                    victim_type + 'id',
                                    victims[victim_type],
                                    calday + 1,
                                    group_info[group_name]['id'],
                                    group_info[group_name]['turnover_hour'],
                                    '0'
                                ) + filter_tag.format(
                                    victim_type + 'id',
                                    victims[prev_victim_type]
                                ))
                    except mysql.Error as error:
                        raise OnCalendarDBError(error.args[0], error.args[1])

        try:
            self.update_edits(updater, group_name, reason)
        except OnCalendarDBError as error:
            self.oncalendar_db.rollback()
            raise OnCalendarDBError(error)

        self.oncalendar_db.commit()

        return "Success"


    def update_calendar_day(self, updater, update_day_data):
        """
        Update specific oncall/shadow slots for a given day

        Args:
            update_day_data (dict): The day, group and slots to update

        Returns:
            (dict): Updated schedule data for the day

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        update_group = update_day_data['group']
        update_calday = update_day_data['calday']
        update_slots = update_day_data['slots']

        try:
            self.update_edits(updater, update_group, update_day_data['note'])
        except OnCalendarDBError as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        for slot in update_slots:
            slot_bits = slot.split('-')
            slot_hour = int(slot_bits[0])
            slot_min = int(slot_bits[1])
            update_day_query = "UPDATE calendar SET"
            if 'oncall' in update_slots[slot] and update_slots[slot]['oncall'] != "--":
                update_day_query += " victimid=(SELECT id FROM victims WHERE username='" + update_slots[slot]['oncall'] + "')"
                if 'shadow' in update_slots[slot]:
                    if update_slots[slot]['shadow'] == "--":
                        update_day_query += ", shadowid=NULL"
                    else:
                        update_day_query += ", shadowid=(SELECT id FROM victims WHERE username='" + update_slots[slot]['shadow'] + "')"
                if 'backup' in update_slots[slot] and update_slots[slot]['backup'] != "--":
                    update_day_query += ", backupid=(SELECT id FROM victims WHERE username='" + update_slots[slot]['backup'] + "')"
            elif 'shadow' in update_slots[slot]:
                if update_slots[slot]['shadow'] == "--":
                    update_day_query += " shadowid=NULL"
                else:
                    update_day_query += " shadowid=(SELECT id FROM victims WHERE username='" + update_slots[slot]['shadow'] + "')"
                if 'backup' in update_slots[slot] and update_slots[slot]['backup'] != "--":
                    update_day_query += ", backupid=(SELECT id FROM victims WHERE username='" + update_slots[slot]['backup'] + "')"
            elif 'backup' in update_slots[slot] and update_slot[slot]['backup'] != "--":
                update_day_query += " backupid=(SELECT id FROM victims WHERE username='" + update_slots[slot]['backup'] + "')"
            else:
                continue

            update_day_query += " WHERE groupid=(SELECT id FROM groups WHERE name='" + update_group + "')"
            update_day_query += " AND calday='" + update_calday + "' AND hour={0} AND min={1}".format(slot_hour, slot_min)

            try:
                cursor.execute(update_day_query)
            except mysql.Error as error:
                raise OnCalendarDBError(error.args[0], error.args[1])

        self.oncalendar_db.commit()

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
                slots[slot]['shadow_name'] = ' '.join([row['shadow_first'], row['shadow_last']])

            if row['backup_first'] is not None and row['backup_last'] is not None:
                slots[slot]['backup_name'] = ' '.join([row['backup_first'], row['backup_last']])

        return slots


    def get_oncall_report(self, year, month, group_name=False):
        """
        Get information on who was oncall and for how many hours for
        each week of the given month

        Args:
            group_name (str): The group to report on.

            month (int): The month of the report.

            year (int): The year of the report.

        Returns:
            (dict): The report for the group.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """
        year = int(year)
        month = int(month)
        start_day = dt.date(year, month, 1)
        start_dow, month_days = calendar.monthrange(year, month)
        last_day = dt.date(year, month, month_days)

        # Report weeks start on Monday, so we need to find the first Monday of the month
        if start_dow != 0:
            offset = 7 - start_dow
            start_day = start_day + dt.timedelta(days=offset)

        week_end = start_day + dt.timedelta(days=6)
        report_weeks = [(
            {'month': start_day.month, 'day': start_day.day},
            {'month': week_end.month, 'day': week_end.day}
        )]

        in_month = True
        while in_month:
            start_day = week_end + dt.timedelta(days=1)
            week_end = start_day + dt.timedelta(days=6)
            report_weeks.append((
                {'month': start_day.month, 'day': start_day.day},
                {'month': week_end.month, 'day': week_end.day}
            ))
            if week_end >= last_day:
                in_month = False
        self.logger.debug(report_weeks)

        if group_name:
            group_list = self.get_group_info(group_name=group_name)
        else:
            group_list = self.get_group_info()

        victims_report = {}
        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        week_caldays_query = 'SELECT id FROM caldays WHERE year=' + str(year) + ' AND month={0} AND day BETWEEN {1} AND {2}'
        victims_report_query = """SELECT c.groupid, g.name, c.victimid,
        COUNT(c.victimid) AS slots
        FROM calendar c
        LEFT OUTER JOIN groups AS g ON g.id=c.groupid
        WHERE c.calday IN ({0})"""
        if (group_name):
            victims_report_query += """ AND c.groupid=(SELECT id FROM groups WHERE name='{0}')
            GROUP BY c.victimid, c.groupid ORDER BY c.groupid""".format(group_name)
        else:
            victims_report_query += ' GROUP BY c.victimid, c.groupid ORDER BY c.groupid'

        for week in report_weeks:
            week_index = report_weeks.index(week)
            victims_report[week_index] = {'week_start': str(week[0]['month']) + '/' + str(week[0]['day'])}
            victims_report[week_index]['groups'] = {}
            week_caldays = []
            try:
                if week[0]['month'] != week[1]['month']:
                    cursor.execute(week_caldays_query.format(week[0]['month'], week[0]['day'], last_day.day))
                    for row in cursor.fetchall():
                        week_caldays.append(str(row['id']))
                    cursor.execute(week_caldays_query.format(week[1]['month'], 1, week[1]['day']))
                    for row in cursor.fetchall():
                        week_caldays.append(str(row['id']))
                else:
                    cursor.execute(week_caldays_query.format(week[0]['month'], week[0]['day'], week[1]['day']))
                    for row in cursor.fetchall():
                        week_caldays.append(str(row['id']))
            except mysql.Error as error:
                raise OnCalendarDBError(error.args[0], error.args[1])

            self.logger.debug(week_caldays)

            try:
                self.logger.debug(victims_report_query.format(','.join(week_caldays)))
                cursor.execute(victims_report_query.format(','.join(week_caldays)))
                for row in cursor.fetchall():
                    if row['name'] in victims_report[week_index]['groups']:
                        victims_report[week_index]['groups'][row['name']][row['victimid']] = row
                    else:
                        victims_report[week_index]['groups'][row['name']] = {}
                        victims_report[week_index]['groups'][row['name']][row['victimid']] = row
                    victims_report[week_index]['groups'][row['name']][row['victimid']]['name'] = group_list[row['name']]['victims'][row['victimid']]['firstname'] + ' ' + group_list[row['name']]['victims'][row['victimid']]['lastname']
                for group in group_list:
                    cursor.execute("SELECT victimid FROM calendar WHERE groupid='{0}' AND hour='{1}' AND min='{2}' and calday='{3}'".format(
                        group_list[group]['id'],
                        group_list[group]['turnover_hour'],
                        group_list[group]['turnover_min'],
                        week_caldays[group_list[group]['turnover_day'] - 1]
                    ))
                    row = cursor.fetchone()
                    if row is not None:
                        victims_report[week_index]['groups'][group]['scheduled_victim'] = group_list[group]['victims'][row['victimid']]['firstname'] + ' ' + group_list[group]['victims'][row['victimid']]['lastname']
            except mysql.Error as error:
                raise OnCalendarDBError(error.args[0], error.args[1])

        self.logger.debug(victims_report)
        return victims_report


    def get_slumber_data(self, year, month, day, report_start, report_end):
        """
        Pull the SMS alerting data for the specified day to build the
        slumber report

        Args:
            year (str)

            month (str)

            day (str)

        Returns:
            (dict): The gathered alert information

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        report_day = dt.date(int(year), int(month), int(day))
        prev_day = report_day - dt.timedelta(days=1)
        start_ts = '{0}-{1:02d}-{2:02d} {3:02d}:00:00'.format(
            prev_day.year,
            prev_day.month,
            prev_day.day,
            report_start
        )
        end_ts = '{0}-{1:02d}-{2:02d} {3:02d}:00:00'.format(
            report_day.year,
            report_day.month,
            report_day.day,
            report_end
        )
        slumber_query = """SELECT s.id as alert_id, s.alert_type, s.ts, s.host,
        s.service, g.name, v.username, v.firstname, v.lastname
        FROM sms_send s
        LEFT OUTER JOIN groups AS g ON g.id=s.groupid
        LEFT OUTER JOIN victims AS v ON v.id=s.victimid
        WHERE s.ts > '{0}' AND s.ts < '{1}'""".format(start_ts, end_ts)

        try:
            self.logger.debug(slumber_query)
            cursor.execute(slumber_query)
            slumber_data = {}
            for row in cursor.fetchall():
                if row['alert_type'] in ("PROBLEM", "RECOVERY", "ACKNOWLEDGEMENT"):
                    if row['name'] not in slumber_data:
                        slumber_data[row['name']] = {}
                    if row['username'] not in slumber_data[row['name']]:
                        slumber_data[row['name']][row['username']] = {
                            'name': "{0} {1}".format(row['firstname'], row['lastname'])
                        }
                    if row['alert_type'] not in slumber_data[row['name']][row['username']]:
                        slumber_data[row['name']][row['username']][row['alert_type']] = {}
                    slumber_data[row['name']][row['username']][row['alert_type']][row['alert_id']] = {
                        'host': row['host'],
                        'service': row['service'],
                        'time': row['ts']
                    }
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        return slumber_data


    def get_group_info(self, group_id=False, group_name=False):
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

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        group_info_query = 'SELECT * FROM groups'
        if group_id:
            self.logger.debug("Getting group info for group id {0}".format(group_id))
            group_info_query += ' WHERE id={0}'.format(group_id)
        elif group_name:
            self.logger.debug("Getting group info for group {0}".format(group_name))
            group_info_query += " WHERE name='{0}'".format(group_name)

        try:
            cursor.execute(group_info_query)
        except mysql.Error as error:
            self.logger.error("Failed to get group info for {0} = {1}: {2}".format(
                group_id if group_id else group_name,
                error.args[0],
                error.args[1]
            ))
            raise OnCalendarDBError(error.args[0], error.args[1])

        groups = {}
        for row in cursor.fetchall():
            groups[row['name']] = row
            groups[row['name']]['victims'] = {}

        for group in groups:
            group_victims = self.get_group_victims(group)
            groups[group]['victims'] = group_victims

        return groups


    def get_group_victims(self, group_name):
        """
        Get all victims associated with a group.

        Args:
            group_name (str): The group to search on.

        Returns:
            (dict): The info for all victims associated with the group.

        Raises:
            (OnCalendarDBError): Passes MySQL error code and message.
        """

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        group_victim_query = "SELECT v.id, v.username, v.firstname,\
        v.lastname, v.phone, v.email, v.sms_email, v.app_role, v.throttle,\
        IFNULL(TIMESTAMPDIFF(SECOND, NOW(), throttle_until), 0) AS throttle_time_remaining,\
        v.truncate, gm.active AS group_active FROM victims v, groups g, groupmap gm\
        WHERE v.active=1 AND g.name='{0}' AND gm.groupid=g.id AND gm.victimid=v.id".format(group_name)

        try:
            cursor.execute(group_victim_query)
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        group_victims = {}
        for row in cursor.fetchall():
            group_victims[row['id']] = row

        return group_victims


    def add_group(self, group_data):
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

        cursor = self.oncalendar_db.cursor()
        group_keys = []
        group_values = []
        for key in group_data:
            group_keys.append(key)
            group_values.append(group_data[key])

        keys_string = ','.join(group_keys)
        values_string = "','".join(group_values)
        add_group_query = "INSERT INTO groups ({0}) VALUES ('{1}')".format(keys_string, values_string)

        try:
            cursor.execute('SELECT id FROM groups WHERE name=\'{0}\''.format(group_data['name']))
            rows = cursor.fetchall()
            if rows:
                raise OnCalendarDBError(ocapi_err.GROUPEXISTS, 'Group {0} already exists'.format(group_data['name']))
            cursor.execute(add_group_query)
            self.oncalendar_db.commit()
            cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
            cursor.execute('SELECT * FROM groups WHERE name=\'{0}\''.format(group_data['name']))
            row = cursor.fetchone()
            return row
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], 'Failed to add group to database - {0}'.format(error.args[1]))


    def delete_group(self, group_id=False):
        """
        Delete a group record from the OnCalendar database.

        Args:
            group_id (string): The ID of the group to delete.

        Returns:
            (string): The count of remaining records in the group table.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """

        cursor = self.oncalendar_db.cursor()
        if group_id:
            try:
                cursor.execute('DELETE FROM groups WHERE id={0}'.format(group_id))
                self.oncalendar_db.commit()
            except mysql.Error as error:
                self.oncalendar_db.rollback()
                raise OnCalendarDBError(error.args[0], error.args[1])

            cursor.execute('SELECT COUNT(*) FROM groups')
            row = cursor.fetchone()
            return row[0]
        else:
            raise OnCalendarAPIError(ocapi_err.NOPARAM, 'No group id given for deletion')


    def update_group(self, group_data):
        """
        Update the information for a group in the OnCalendar database.

        Args:
            group_data (dict): The updated information for the group entry.

        Returns:
            (dict): The post-update information for the group.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """

        group_id = group_data['id']
        update_items = []

        for key in group_data:
            update_items.append(key + "='" + group_data[key] + "'")

        cursor = self.oncalendar_db.cursor()
        update_group_query = "UPDATE groups SET {0} WHERE id={1}".format(
            ','.join(update_items),
            group_id
        )

        try:
            cursor.execute(update_group_query)
            self.oncalendar_db.commit()
            cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
            cursor.execute('SELECT * FROM groups WHERE id=\'{0}\''.format(group_data['id']))
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        row = cursor.fetchone()
        return row


    def update_group_victims(self, group_victim_changes):
        """
        Change the active status or remove a user from the group.

        Args:
            group_victim_changes (dict): Status changes for the victims of the group

        Raises:
            OnCalendarDBError: Passes the MySQL error code and message.
        """

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        try:
            cursor.execute('DELETE FROM groupmap WHERE groupid={0}'.format(group_victim_changes['groupid']))
            victim_list = []
            for victim in group_victim_changes['victims']:
                victim_list.append('({0},{1},{2})'.format(
                    group_victim_changes['groupid'],
                    victim['victimid'],
                    victim['active']
                ))

            victim_values = ','.join(victim_list)
            cursor.execute('INSERT INTO groupmap VALUES {0}'.format(victim_values))
        except mysql.Error as error:
            self.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], error.args[1])

        self.oncalendar_db.commit()

        try:
            cursor.execute("SELECT v.id, v.username, v.firstname,\
            v.lastname, v.phone, v.email, v.sms_email, v.app_role, v.throttle,\
            IFNULL(TIMESTAMPDIFF(SECOND, NOW(), throttle_until), 0) AS throttle_time_remaining,\
            v.truncate, gm.active as group_active FROM victims v, groupmap gm\
            WHERE gm.victimid=v.id AND gm.groupid={0}".format(group_victim_changes['groupid']))
        except mysql.Error as error:
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


    def get_victim_info(self, search_key=False, search_value=False):
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

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        victim_info_query = """SELECT v.id, v.active, v.username, v.firstname,
        v.lastname, v.phone, v.email, v.sms_email, v.app_role, v.throttle,
        IFNULL(TIMESTAMPDIFF(SECOND, NOW(), throttle_until), 0) AS throttle_time_remaining,
        v.truncate, m.groupid AS gid, m.active as gactive, g.name FROM victims v
        LEFT OUTER JOIN groupmap AS m ON v.id=m.victimid
        LEFT OUTER JOIN groups AS g ON g.id=m.groupid"""
        if search_key:
            if search_value:
                victim_info_query += " WHERE v.{0}='{1}'".format(search_key, search_value)
            else:
                raise OnCalendarDBError(ocapi_err.NOPARAM, 'No {0} provided to search on.'.format(search_key))

        try:
            cursor.execute(victim_info_query)
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        victims = {}
        for row in cursor.fetchall():
            if row['id']in victims:
                victims[row['id']]['groups'][row['name']] = row['gactive']
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
                    'groups': {row['name']: row['gactive']}
                }

        return victims


    def add_victim(self, victim_data):
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

        cursor = self.oncalendar_db.cursor()
        victim_groups = victim_data.pop('groups')
        victim_keys = []
        victim_values = []
        for key in victim_data:
            victim_keys.append(key)
            victim_values.append(victim_data[key])

        keys_string = ','.join(victim_keys)
        values_string = "','".join(victim_values)
        add_victim_query = "INSERT INTO victims ({0}) VALUES ('{1}')".format(keys_string, values_string)

        try:
            cursor.execute('SELECT id FROM victims WHERE username=\'{0}\''.format(victim_data['username']))
            rows = cursor.fetchall()
            if rows:
                raise OnCalendarAPIError(ocapi_err.VICTIMEXISTS, 'User {0} already exists'.format(victim_data['username']))
            cursor.execute(add_victim_query)
            self.oncalendar_db.commit()
            cursor.execute("SELECT LAST_INSERT_ID()")
            new_victim_id_tuple = cursor.fetchone()
            new_victim_id = new_victim_id_tuple[0]
        except mysql.Error as error:
            self.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], 'Failed to add user to database - {0}'.format(error.args[1]))


        try:
            for group in victim_groups:
                cursor.execute("INSERT INTO groupmap (groupid, victimid, active) VALUES ((SELECT id FROM groups WHERE name='{0}'), {1}, {2})".format(
                        group,
                        new_victim_id,
                        victim_groups[group]
                    )
                )
            self.oncalendar_db.commit()
        except mysql.Error as error:
            self.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], 'Failed to add user to groups - {0}'.format(error.args[1]))

        new_victim = self.get_victim_info('username', victim_data['username'])

        return new_victim[new_victim_id]


    def add_victim_to_group(self, victim_id, group_id):
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

        cursor = self.oncalendar_db.cursor()
        group_add_query = """REPLACE INTO groupmap (groupid, victimid, active)
        VALUES ({0}, {1}, 1""".format(group_id, victim_id)
        try:
            cursor.execute("SELECT * FROM groupmap WHERE groupid='{0}' AND victimid='{1}'".format(group_id, victim_id))
            rows = cursor.fetchall()
            if rows:
                raise OnCalendarAPIError(ocapi_err.GROUPEXISTS, 'User is already a member of this group')
            cursor.execute(group_add_query)
            self.oncalendar_db.commit()
        except mysql.Error as error:
            self.oncalendar_db.rollback()
            raise OnCalendarDBError(
                error.args[0],
                "Failed to add user to groups - {0}".format(error.args[1])
            )

        updated_victim = self.get_victim_info('id', victim_id)

        return updated_victim[victim_id]


    def delete_victim(self, victim_id=False):
        """
        Delete a victim record from the OnCalendar database.

        Args:
            victim_id (string): The ID of the victim to delete.

        Returns:
            (string): The count of remaining records in the victims table.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """

        cursor = self.oncalendar_db.cursor()
        if victim_id:
            try:
                cursor.execute('DELETE FROM victims WHERE id={0}'.format(victim_id))
                self.oncalendar_db.commit()
            except mysql.Error as error:
                self.oncalendar_db.rollback()
                raise OnCalendarDBError(error.args[0], error.args[1])

            cursor.execute('SELECT COUNT(*) FROM victims')
            row = cursor.fetchone()
            return row[0]
        else:
            raise OnCalendarAPIError(ocapi_err.NOPARAM, 'No userid given for deletion')


    def update_victim(self, victim_id, victim_data):
        """
        Update the information for a victim record in the OnCalendar database.

        Args:
            victim_data (dict): The updated information for the victim.

        Returns:
            (dict): The post-update information for the victim.

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """

        victim_groups = victim_data.pop('groups')
        victim_data.pop('id')
        update_items = []

        for key in victim_data:
            update_items.append(key + "='" + victim_data[key] + "'")

        cursor = self.oncalendar_db.cursor()
        update_victim_query = "UPDATE victims SET {0} WHERE id={1}""".format(
            ','.join(update_items),
            victim_id
        )

        try:
            cursor.execute(update_victim_query)
            self.oncalendar_db.commit()
        except mysql.Error as error:
            self.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], 'User update failed - {0}'.format(error.args[1]))

        try:
            current_groups = []
            cursor.execute('SELECT g.name FROM groups g, groupmap m WHERE g.id=m.groupid AND m.victimid={0}'.format(victim_id))
            for row in cursor.fetchall():
                current_groups.append(row[0])


            for group in victim_groups:
                if group in current_groups:
                    cursor.execute("UPDATE groupmap SET active={0} WHERE victimid={1} AND groupid=(SELECT id FROM groups WHERE name='{2}')".format(
                        victim_groups[group],
                        victim_id,
                        group
                    ))
                    current_groups.pop(current_groups.index(group))
                else:
                    cursor.execute("INSERT INTO groupmap (groupid, victimid, active) VALUES((SELECT id FROM groups WHERE name='{0}'), {1}, {2})".format(
                        group,
                        victim_id,
                        victim_groups[group]
                    ))

            if (len(current_groups) > 0):
                for group in current_groups:
                    cursor.execute("DELETE FROM groupmap WHERE groupid=(SELECT id FROM groups WHERE name='{0}') AND victimid={1}".format(
                        group,
                        victim_id
                    ))

            self.oncalendar_db.commit()
        except mysql.Error as error:
            self.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], 'Failed to update user groups - {0}'.format(error.args[1]))

        updated_victim = self.get_victim_info('username', victim_data['username'])
        self.logger.debug(updated_victim[int(victim_id)])

        return updated_victim[int(victim_id)]


    def set_victim_preference(self, victimid, pref, value):
        """
        Updates the preference fields in the user record

        Args:
            victimid (str): The id of the user to update
            pref (str): The preference to adjust (truncate, throttle)
            value (int): The new value (0|1 for truncate, # for throttle)

        Raises:
            (OnCalendarDBError): Passes the mysql error code and message.
        """

        cursor = self.oncalendar_db.cursor()
        update_pref_query = """UPDATE victims SET {0}={1} WHERE id='{2}'""".format(
            pref,
            value,
            victimid
        )

        try:
            cursor.execute(update_pref_query)
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])


    def get_current_victims(self, group=False):
        """
        Queries the calendar for the current scheduled victims, optionally filtered by group name.

        Args:
            group (str): Name of the group to filter by.

        Returns:
            (dict): Oncall, shadow and backup for each group

        Raises:
            OnCalendarDBError: Passes the mysql error code and message.
        """

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        get_victims_query = """SELECT name, id AS groupid, email AS group_email,
        victimid, shadow, shadowid, backup, backupid
        FROM groups"""
        if group:
            get_victims_query += " WHERE id=(SELECT id FROM groups WHERE name='{0}')".format(group)

        try:
            cursor.execute(get_victims_query)
        except mysql.Error as error:
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
                victim_info = self.get_victim_info('id', row['victimid'])
                current_victims[row['name']]['oncall'] = victim_info[row['victimid']]
            if row['shadow'] == 1 and row['shadowid'] is not None:
                shadow_info = self.get_victim_info('id', row['shadowid'])
                current_victims[row['name']]['shadow'] = shadow_info[row['shadowid']]
            if row['backup'] == 1 and row['backupid'] is not None:
                backup_info = self.get_victim_info('id', row['backupid'])
                current_victims[row['name']]['backup'] = backup_info[row['backupid']]

        return current_victims


    def get_suggested_victims(self, stub):
        """
        Queries the victims table for any usernames matching the stub.

        Args:
            stub (str): String to match against victim usernames

        Returns:
            (dict): The matched victims

        Raises:
            OnCalendarDBError: Passes the mysql error code and message.
        """

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        victim_stub_query = """SELECT v.id, v.username, v.firstname,
        v.lastname, v.phone, v.email, v.sms_email,
        m.groupid AS gid, m.active as gactive, g.name FROM victims v
        LEFT OUTER JOIN groupmap AS m ON v.id=m.victimid
        LEFT OUTER JOIN groups AS g ON g.id=m.groupid
        WHERE v.active=1 AND v.username like '{0}%'""".format(stub)


        try:
            cursor.execute(victim_stub_query)
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        victims = {}
        for row in cursor.fetchall():
            if row['id']in victims:
                victims[row['id']]['groups'][row['name']] = row['gactive']
            else:
                victims[row['id']] = {
                    'id': row['id'],
                    'username': row['username'],
                    'firstname': row['firstname'],
                    'lastname': row['lastname'],
                    'phone': row['phone'],
                    'email': row['email'],
                    'sms_email': row['sms_email'],
                    'groups': {row['name']: row['gactive']}
                }


        suggested_victims = {'suggestions': []}
        for victim_id in victims:
            suggested_victims['suggestions'].append(
                {
                    'value': victims[victim_id]['username'],
                    'data': victims[victim_id]
                }
            )

        return suggested_victims


    def check_schedule(self):
        """
        Queries the calendar and checks against list of current victims,
        updates the list if necessary

        Returns:
            (dict): Status of the check for each group, previous and new
                    victims if there was a change.

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        current_victims_query = """SELECT name, id, victimid, shadowid, backupid
        FROM groups WHERE autorotate=1"""
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
        AND hour='{3}' AND min='{4}' AND c.groupid=g.id AND g.autorotate=1""".format(
            today.year,
            today.month,
            today.day,
            today.hour,
            slot_min,
        )
        try:
            cursor.execute(calendar_victims_query)
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1] + ' calendar_victims_query')

        schedule_status = {}
        phone_query = "SELECT phone FROM victims WHERE id='{0}'"
        phones_query = """SELECT v1.phone as new_phone, v2.phone as prev_phone
        FROM victims v1, victims v2
        WHERE v1.id='{0}' AND v2.id='{1}'"""
        rotate_query = "UPDATE groups SET {0}='{1}' WHERE id='{2}'"
        phone_cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        rotate_cursor = self.oncalendar_db.cursor()

        for row in cursor.fetchall():
            self.logger.debug('db_interface: checking primary for {0}'.format(row['name']))
            schedule_status[row['name']] = {}
            if row['victimid'] is not None:
                if row['victimid'] != current_victims[row['name']]['victimid']:
                    self.logger.debug('db_interface: New primary found, updating')
                    try:
                        if current_victims[row['name']]['victimid'] is None:
                            victim_phone_query = phone_query.format(row['victimid'])
                            phone_cursor.execute(victim_phone_query)
                            phone = phone_cursor.fetchone()
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
                            phone_cursor.execute(victim_phones_query)
                            phones = phone_cursor.fetchone()
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
                        self.logger.debug('Update query for {0}: {1}'.format(
                            row['name'],
                            update_victim_query,
                        ))
                        rotate_cursor.execute(update_victim_query)
                    except mysql.Error as error:
                        raise OnCalendarDBError(error.args[0], error.args[1] + ' (checking primary for {0})'.format(row['name']))
                else:
                    schedule_status[row['name']]['oncall'] = {'updated': False}

            if row['shadowid'] is not None:
                if row['shadowid'] != current_victims[row['name']]['shadowid']:
                    try:
                        if current_victims[row['name']]['shadowid'] is None:
                            shadow_phone_query = phone_query.format(row['shadowid'])
                            phone_cursor.execute(shadow_phone_query)
                            phone = phone_cursor.fetchone()
                            schedule_status[row['name']]['shadow'] = {
                                'updated': True,
                                'previous': None,
                                'prev_phone': None,
                                'new': row['shadowid'],
                                'new_phone': phone['phone']
                            }
                        else:
                            shadow_phones_query = phones_query.format(
                                row['shadowid'],
                                current_victims[row['name']]['shadowid']
                            )
                            phone_cursor.execute(shadow_phones_query)
                            phones = phone_cursor.fetchone()
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
                        rotate_cursor.execute(update_shadow_query)
                    except mysql.Error as error:
                        raise OnCalendarDBError(error.args[0], error.args[1] + ' (checking shadow for {0})'.format(row['name']))
                else:
                    schedule_status[row['name']]['shadow'] = {'updated': False}
            else:
                if current_victims[row['name']]['shadowid'] is not None:
                    try:
                        rotate_cursor.execute("UPDATE groups SET shadowid=NULL WHERE id='{0}'".format(row['groupid']))
                    except mysql.Error as error:
                        raise OnCalendarDBError(error.args[0], error.args[1] + ' (setting shadowid to empty for {0})'.format(row['name']))

            if row['backupid'] is not None:
                if row['backupid'] != current_victims[row['name']]['backupid']:
                    try:
                        if current_victims[row['name']]['backupid'] is None:
                            backup_phone_query = phone_query.format(row['backupid'])
                            phone_cursor.execute(backup_phone_query)
                            phone = phone_cursor.fetchone()
                            schedule_status[row['name']]['backup'] = {
                                'updated': True,
                                'previous': None,
                                'prev_phone': None,
                                'new': row['backupid'],
                                'new_phone': phone['phone']
                            }
                        else:
                            backup_phones_query = phones_query.format(
                                row['backupid'],
                                current_victims[row['name']]['backupid']
                            )
                            phone_cursor.execute(backup_phones_query)
                            phones = phone_cursor.fetchone()
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
                        rotate_cursor.execute(update_backup_query)
                    except mysql.Error as error:
                        raise OnCalendarDBError(error.args[0], error.args[1] + ' (checking backup for {0})'.format(row['name']))
                else:
                    schedule_status[row['name']]['backup'] = {'updated': False}

        self.oncalendar_db.commit()
        return schedule_status


    def check_8hour_gaps(self):
        """
        Checks the next 8 hours of all schedules and reports
        if there are gaps.

        Returns:
            (dict): The result of the check for each group.

        Raises:
            OnCalendarDBError
        """

        start = dt.datetime.now()
        period_delta = dt.timedelta(hours=8)
        end = start + period_delta

        if start.minute > 29:
            start = start + dt.timedelta(hours=1)
            end = end + dt.timedelta(hours=1)

        date_cross = True if end.day != start.day else False
        gap_check = {}
        active_groups = {}

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)

        try:
            cursor.execute("SELECT g.id, g.name, v.username, v.phone FROM groups g, victims v WHERE g.active=1 AND g.autorotate=1 AND g.victimid=v.id")
            for row in cursor.fetchall():
                active_groups[row['id']] = {'name': row['name'], 'victim': row['username'], 'phone': row['phone'] }
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])


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
            today_empty_query = """SELECT d.id as calday, g.name,
            g.id AS groupid, c.hour, c.min, c.victimid
            FROM calendar c, groups g, caldays d
            WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
            AND month='{1}' AND day='{2}') AND hour>='{3}'
            AND c.groupid=g.id AND d.id=c.calday AND g.id='{4}'"""

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
            tomorrow_empty_query = """SELECT d.id as calday, g.name,
            g.id as groupid, c.hour, c.min, c.victimid
            FROM calendar c, groups g, caldays d
            WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
            AND month='{1}' AND day='{2}') AND hour<'{3}'
            AND c.groupid=g.id AND d.id=c.calday AND g.id='{4}'"""

            try:
                cursor.execute(today_query)
                for row in cursor.fetchall():
                    if row['name'] not in gap_check:
                        gap_check[row['name']] = active_groups[row['id']]['victim']
                cursor.execute(tomorrow_query)
                for row in cursor.fetchall():
                    if row['name'] not in gap_check:
                        gap_check[row['name']] = active_groups[row['id']]['victim']

                for groupid in active_groups:
                    if active_groups[groupid]['name'] not in gap_check:
                        cursor.execute(today_empty_query.format(
                            start.year,
                            start.month,
                            start.day,
                            start.hour,
                            groupid
                        ))
                        rows = cursor.fetchall()
                        if len(rows) == 0 and active_groups[groupid]['name'] not in gap_check:
                            gap_check[active_groups[groupid]['name']] = active_groups[groupid]['victim']
                            continue

                        cursor.execute(tomorrow_empty_query.format(
                            end.year,
                            end.month,
                            end.day,
                            end.hour,
                            groupid
                        ))
                        rows = cursor.fetchall()
                        if len(rows) == 0 and active_groups[groupid]['name'] not in gap_check:
                            gap_check[active_groups[groupid]['name']] = active_groups[groupid]['victim']

            except mysql.Error as error:
                raise OnCalendarDBError(error.args[0], error.args[1])

        else:
            gap_query = """SELECT g.name, g.id as groupid, c.hour, c.min
            FROM calendar c, groups g
            WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
            AND month='{1}' AND day='{2}') AND hour>='{3}' AND hour<'{4}'
            AND c.groupid=g.id AND c.victimid IS NULL""".format(
                start.year,
                start.month,
                start.day,
                start.hour,
                end.hour
            )
            empty_query = """SELECT d.id as calday, g.name,
            g.id AS groupid, c.hour, c.min, c.victimid
            FROM calendar c, groups g, caldays d
            WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
            AND month='{1}' AND day='{2}') AND hour>='{3}' AND hour<'{4}'
            AND c.groupid=g.id AND d.id=c.calday AND g.id='{5}'"""
            try:
                cursor.execute(gap_query)
                for row in cursor.fetchall():
                    if row['name'] not in gap_check:
                        gap_check[row['name']] = active_groups[row['id']]['victim']

                for groupid in active_groups:
                    if active_groups[groupid]['name'] not in gap_check:
                        cursor.execute(empty_query.format(
                            start.year,
                            start.month,
                            start.day,
                            start.hour,
                            end.hour,
                            groupid
                        ))
                        rows = cursor.fetchall()
                        if len(rows) == 0 and active_groups[groupid]['name'] not in gap_check:
                            gap_check[active_groups[groupid]['name']] = active_groups[groupid]['phone']

            except mysql.Error as error:
                raise OnCalendarDBError(error.args[0], error.args[1])

        return gap_check


    def check_48hour_gaps(self):
        """
        Checks the next 48 hours of all schedules and reports
        if there are gaps.

        Returns:
            (dict): The result of the check for each group.

        Raises:
            OnCalendarDBError
        """

        start = dt.datetime.now() + dt.timedelta(hours=8)
        mid = start + dt.timedelta(days=1)
        period_delta = dt.timedelta(hours=40)
        end = start + period_delta

        if start.minute > 29:
            start = start + dt.timedelta(hours=1)
            end = end + dt.timedelta(hours=1)

        gap_check = {}
        active_groups = {}

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)

        cursor.execute("SELECT g.id, g.name, g.email, v.email as oncall_email FROM groups g, victims v WHERE g.active=1 AND g.autorotate=1 AND g.victimid=v.id")
        for row in cursor.fetchall():
            if row['email']:
                address = row['email']
            else:
                address = row['oncall_email']
            active_groups[row['id']] = { 'name': row['name'], 'email': address }

        day1_empty_query = """SELECT d.id as calday, g.name,
        g.id AS groupid, c.hour, c.min, c.victimid
        FROM calendar c, groups g, caldays d
        WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
        AND month='{1}' AND day='{2}') AND hour>='{3}'
        AND c.groupid=g.id AND d.id=c.calday AND g.id='{4}'"""

        day2_empty_query = """SELECT d.id as calday, g.name,
        g.id AS groupid, c.hour, c.min, c.victimid
        FROM calendar c, groups g, caldays d
        WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
        AND month='{1}' AND day='{2}') AND c.groupid=g.id
        AND d.id=c.calday AND g.id='{3}'"""

        day3_empty_query = """SELECT d.id as calday, g.name,
        g.id AS groupid, c.hour, c.min, c.victimid
        FROM calendar c, groups g, caldays d
        WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
        AND month='{1}' AND day='{2}') AND hour<'{3}'
        AND c.groupid=g.id AND d.id=c.calday AND g.id='{4}'"""

        day1_query = """SELECT g.name, g.id as groupid, c.hour, c.min
        FROM calendar c, groups g
        WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
        AND month='{1}' AND day='{2}') AND hour>='{3}'
        AND c.groupid=g.id AND c.victimid IS NULL""".format(
            start.year,
            start.month,
            start.day,
            start.hour
        )
        day2_query = """SELECT g.name, g.id as groupid, c.hour, c.min
        FROM calendar c, groups g
        WHERE calday=(SELECT id FROM caldays WHERE year='{0}'
        AND month='{1}' AND day='{2}') AND c.groupid=g.id AND c.victimid IS NULL""".format(
            mid.year,
            mid.month,
            mid.day
        )
        day3_query = """SELECT g.name, g.id as groupid, c.hour, c.min
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
            cursor.execute(day1_query)
            for row in cursor.fetchall():
                if row['name'] not in gap_check:
                    gap_check[row['name']] = active_groups[row['id']]['email']
            cursor.execute(day2_query)
            for row in cursor.fetchall():
                if row['name'] not in gap_check:
                    gap_check[row['name']] = active_groups[row['id']]['email']
            cursor.execute(day3_query)
            for row in cursor.fetchall():
                if row['name'] in gap_check:
                    gap_check[row['name']] = active_groups[row['id']]['email']

            for groupid in active_groups:
                if active_groups[groupid]['name'] not in gap_check:
                    cursor.execute(day1_empty_query.format(
                        start.year,
                        start.month,
                        start.day,
                        start.hour,
                        groupid
                    ))
                    rows = cursor.fetchall()
                    if len(rows) == 0 and active_groups[groupid]['name'] not in gap_check:
                        gap_check[active_groups[groupid]['name']] = active_groups[groupid]['email']
                        continue
                    cursor.execute(day2_empty_query.format(
                        mid.year,
                        mid.month,
                        mid.day,
                        groupid
                    ))
                    rows = cursor.fetchall()
                    if len(rows) == 0 and active_groups[groupid]['name'] not in gap_check:
                        gap_check[active_groups[groupid]['name']] = active_groups[groupid]['email']
                        continue
                    cursor.execute(day3_empty_query.format(
                        end.year,
                        end.month,
                        end.day,
                        end.hour,
                        groupid
                    ))
                    rows = cursor.fetchall()
                    if len(rows) == 0 and active_groups[groupid]['name'] not in gap_check:
                        gap_check[active_groups[groupid]['name']] = active_groups[groupid]['email']

        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        return gap_check


    def get_victim_message_count(self, victim, throttle_time):
        """
        Retrieves the count of SMS messages sent to the user within the
        last <throttle_time> seconds.

        Args:
            victim (str): The name of the user.

            throttle_time: The threshold in seconds to check against.

        Returns:
            (int): The number of messages sent.

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor()
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


    def set_throttle(self, victim, throttle_time):
        """
        Sets the "throttle until" timestamp for the user

        Args:
            victim (str): The name of the user.

            throttle_time: The number of seconds to add for throttle until.

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor()
        set_throttle_query = """UPDATE victims
        SET throttle_until=DATE_ADD(NOW(), INTERVAL {0} SECOND)
        WHERE username='{1}'""".format(throttle_time, victim)

        try:
            cursor.execute(set_throttle_query)
            self.oncalendar_db.commit()
        except mysql.Error, error:
            self.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], error.args[1])


    def add_sms_record(self, groupid, victimid, alert_type, type, host, service, nagios_master, message):
        """
        Adds a record for a sent SMS message to the sms_send table.

        Args:
            group: The group the alert was triggered for.

            victim: The user that the SMS was sent to.

            type: The alert type.

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor()
        add_record_query = """INSERT INTO sms_send (groupid, victimid, alert_type, type, host, service, nagios_master, message)
        VALUES({0}, {1}, '{2}', '{3}', '{4}', '{5}', '{6}', '{7}')""".format(
            groupid,
            victimid,
            alert_type,
            type,
            host,
            service,
            nagios_master,
            message
        )

        try:
            cursor.execute(add_record_query)
            self.oncalendar_db.commit()
            cursor.execute("SELECT LAST_INSERT_ID()")
        except mysql.Error as error:
            self.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], error.args[1])

        sms_id = cursor.fetchone()

        return sms_id


    def get_sms_record(self, userid, hash=False):
        """
        Retrieves a record of a sent SMS alert

        Args:
            userid (str): The id of the user

            hash (str): The keyword associated with the alert

        Returns:
            (dict): The record of the sent SMS

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor(mysql.cursors.DictCursor)
        if hash:
            get_record_query = """SELECT * FROM sms_send WHERE victimid='{0}'
            AND sms_hash='{1}' ORDER BY ts DESC""".format(
                userid,
                hash
            )
        else:
            get_record_query = """SELECT * FROM sms_send WHERE victimid='{0}'
            ORDER BY ts DESC LIMIT 1""".format(userid)

        try:
            cursor.execute(get_record_query)
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        row = cursor.fetchone()
        return row


    def set_sms_hash(self, id, hash):
        """
        Adds the generated hash word to the sms_send record.

        Args:
            id (int): The id of the record.

            hash (str): The keyword assigned to the message.

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor()
        set_hash_query = """UPDATE sms_send SET sms_hash='{0}' WHERE id='{1}'""".format(hash, id)

        try:
            cursor.execute(set_hash_query)
            self.oncalendar_db.commit()
        except mysql.Error as error:
            self.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], error.args[1])


    def set_sms_sid(self, id, sid):
        """
        Adds the Twilio SMS SID to the sms_send record.

        Args:
            id (int): The id of the record.

            sid (str): The SID returned by Twilio.

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor()
        set_sid_query = """UPDATE sms_send SET twilio_sms_sid='{0}' WHERE id='{1}'""".format(sid, id)

        try:
            cursor.execute(set_sid_query)
            self.oncalendar_db.commit()
        except mysql.Error, error:
            self.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], error.args[1])


    def get_last_incoming_sms(self):
        """
        Queries for the Twilio SID of the last incoming SMS that was processed.

        Returns:
            (str): The Twilio SID

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor()
        get_last_sid_query = "SELECT twilio_sms_sid FROM sms_state WHERE name='last_incoming_sms'"
        sid = None

        try:
            cursor.execute(get_last_sid_query)
            row = cursor.fetchone()
            if row is not None:
                sid = row[0]
        except mysql.Error as error:
            raise OnCalendarDBError(error.args[0], error.args[1])

        return sid


    def update_last_incoming_sms(self, sid):
        """
        Updates the record for the last processed incoming SMS

        Args:
            (str): The SID for the message

        Raises:
            OnCalendarDBError
        """

        cursor = self.oncalendar_db.cursor()
        update_sid_query = "UPDATE sms_state SET twilio_sms_sid='{0}' WHERE name='last_incoming_sms'".format(sid)

        try:
            cursor.execute(update_sid_query)
            self.oncalendar_db.commit()
        except mysql.Error as error:
            self.oncalendar_db.rollback()
            raise OnCalendarDBError(error.args[0], error.args[1])
