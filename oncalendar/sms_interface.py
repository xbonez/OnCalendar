from email.mime.text import MIMEText
from logging import getLogger
import MySQLdb as mysql
from oncalendar.db_interface import OnCalendarDB, OnCalendarDBError
import os
import smtplib
import sys
from twilio import twiml
from twilio.rest import TwilioRestClient
from twilio import TwilioRestException

"""
Interface for sending SMS alerts via Twilio
"""


class OnCalendarSMSError(Exception):
    pass


class OnCalendarSMS(object):

    def __init__(self, config):
        """
        Initialize the Twilio client object
        """
        self.client = TwilioRestClient(config.sms['TWILIO_SID'], config.sms['TWILIO_TOKEN'])
        self.wordlist = [w.strip() for w in open(config.sms['SMS_WORDLIST_FILE']).readlines()]
        self.testing = config.sms['SMS_TEST_MODE']
        self.smsconfig = config.sms
        self.dbconfig = config.database
        self.logger = getLogger(__name__)


    def send_sms(self, phone_number, body, clip, callback=False):

        if clip:
            body = body[:self.smsconfig['SMS_CLIP']]

        if self.testing:
            self.logger.debug("SMS message to {0}:, body: {1}".format(
                phone_number,
                body
            ))

            return "TestingSID"

        else:
            try:
                if callback:
                    msg = self.client.sms.messages.create(
                        to=phone_number,
                        from_=self.smsconfig['TWILIO_NUMBER'],
                        body=body,
                        status_callback=self.smsconfig['TWILIO_CALLBACK_URL']
                    )
                else:
                    msg = self.client.sms.messages.create(
                        to=phone_number,
                        from_=self.smsconfig['TWILIO_NUMBER'],
                        body=body
                    )
            except TwilioRestException as error:
                raise OnCalendarSMSError([error.args[0]], error.args[1])

            return msg.sid


    def send_sms_alert(self, groupid, victimid, phone_number, body, clip, alert_type='UNKNOWN', type='', host='', service='NA', nagios_master=None):
        if self.testing:
            self.logger.debug("send_sms_alert: groupid {0}, victimid {1}, alert_type {2}, type {3}, host {4}, service {5}, nagios_master {6}".format(
                groupid,
                victimid,
                alert_type,
                type,
                host,
                service,
                nagios_master
            ))
        else:
            try:
                ocdb = OnCalendarDB(self.dbconfig)
                sms_id = ocdb.add_sms_record(groupid, victimid, alert_type, type, host, service, nagios_master, body)[0]
                sms_hash = self.wordlist[sms_id % len(self.wordlist)]
                ocdb.set_sms_hash(sms_id, sms_hash)
            except OnCalendarDBError, error:
                raise OnCalendarSMSError([error.args[0], error.args[1]])

            response_key = "[{0}]\n".format(sms_hash)
            body = response_key + body

            try:
                sms_sid = self.send_sms(phone_number, body, clip, callback=self.smsconfig['TWILIO_USE_CALLBACK'])
                ocdb.set_sms_sid(sms_id, sms_sid)
            except OnCalendarDBError, error:
                raise OnCalendarSMSError([error.args[0], error.args[1]])
            except TwilioRestException as error:
                raise OnCalendarSMSError([error.args[0]], error.args[1])


    def send_email(self, address, body, subject='', format='html', sender=None):
        if format == 'html':
            message = MIMEText(body, 'html')
            message.set_charset('utf-8')
        else:
            message = MIMEText(body)

        message['Subject'] = subject
        message['From'] = sender if sender is not None else self.smsconfig['EMAIL_FROM']
        message['To'] = address

        if self.testing:
            self.logger.debug("send_email: to: {0}, {1}".format([address], message.as_string))
        else:
            try:
                smtp = smtplib.SMTP(self.smsconfig['EMAIL_HOST'])
                smtp.sendmail(self.smsconfig['EMAIL_FROM'], [address], message.as_string())
                smtp.quit()
            except IOError as error:
                raise OnCalendarSMSError(error.args[0], error.args[1])
            except smtplib.SMTPException as error:
                raise OnCalendarSMSError(error[0][address][0], error[0][address][1])


    def send_email_alert(self, address, body, clip=False):
        if clip:
            body = body[:self.smsconfig['SMS_CLIP']]

        self.send_email(address, body, '', 'plain')


    def send_failsafe(self, body):
        for failsafe_email in self.smsconfig['SMS_FAILSAFES']:
            self.send_email(failsafe_email, body, '<<FAILSAFE>> - Paging Issue', True)


    def get_incoming(self):
        try:
            messages = self.client.sms.messages.list(to=self.smsconfig['TWILIO_NUMBER'])
        except TwilioRestException as error:
            raise OnCalendarSMSError([error.args[0]], error.args[1])

        return messages


