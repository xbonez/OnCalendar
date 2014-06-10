from email.mime.text import MIMEText
from logging import getLogger
import MySQLdb as mysql
from oncalendar.oc_config import config
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
        OnCalendarSMS.client = TwilioRestClient(config.TWILIO_SID, config.TWILIO_TOKEN)
        OnCalendarSMS.wordlist = [w.strip() for w in open(config.SMS_WORDLIST_FILE).readlines()]
        OnCalendarSMS.testing = config.SMS_TEST_MODE
        OnCalendarSMS.logger = getLogger(__name__)


    @classmethod
    def send_sms(cls, phone_number, body, callback=False):

        if cls.testing:
            cls.logger.debug("SMS message to {0}:, body: {1}".format(
                phone_number,
                body
            ))

            return "TestingSID"

        else:
            try:
                if callback:
                    msg = cls.client.sms.messages.create(
                        to=phone_number,
                        from_=config.TWILIO_NUMBER,
                        body=body,
                        status_callback=config.TWILIO_CALLBACK_URL
                    )
                else:
                    msg = cls.client.sms.messages.create(
                        to=phone_number,
                        from_=config.TWILIO_NUMBER,
                        body=body
                    )
            except TwilioRestException as error:
                raise OnCalendarSMSError(error)

            return msg.sid


    @classmethod
    def send_sms_alert(cls, groupid, victimid, phone_number, body, alert_type='UNKNOWN', type='', host='', service='NA', nagios_master=None):

        if cls.testing:
            cls.logger.debug("send_sms_alert: groupid {0}, victimid {1}, alert_type {2}, type {3}, host {4}, service {5}, nagios_master {6}".format(
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
                ocdb = OnCalendarDB(config)
                sms_id = ocdb.add_sms_record(groupid, victimid, alert_type, type, host, service, nagios_master)[0]
                sms_hash = cls.wordlist[sms_id % len(cls.wordlist)]
                ocdb.set_sms_hash(sms_id, sms_hash)
            except OnCalendarDBError, error:
                raise OnCalendarSMSError([error.args[0], error.args[1]])

            response_key = "[[{0}]]\n".format(sms_hash)
            body = response_key + body[:config.SMS_CLIP - len(response_key)]

            try:
                sms_sid = cls.send_sms(phone_number, body, False)
                ocdb.set_sms_sid(sms_id, sms_sid)
            except OnCalendarDBError, error:
                raise OnCalendarSMSError([error.args[0], error.args[1]])
            except TwilioRestException as error:
                raise OnCalendarSMSError(error)


    @classmethod
    def send_email(cls, address, body, subject='', format='html', sender=None):

        if format == 'html':
            message = MIMEText(body, 'html')
            message.set_charset('utf-8')
        else:
            message = MIMEText(body)

        message['Subject'] = subject
        message['From'] = sender if sender is not None else config.EMAIL_FROM
        message['To'] = address

        if cls.testing:
            cls.logger.debug("send_email: to: {0}, {1}".format([address], message.as_string))
        else:
            try:
                smtp = smtplib.SMTP(config.EMAIL_HOST)
                smtp.sendmail(config.EMAIL_FROM, [address], message.as_string())
                smtp.quit()
            except IOError as error:
                raise OnCalendarSMSError(error.args[0], error.args[1])
            except smtplib.SMTPException as error:
                raise OnCalendarSMSError(error[0][address][0], error[0][address][1])


    @classmethod
    def send_email_alert(cls, address, body, clip=False):

        if clip:
            body = body[:config.SMS_CLIP]

        cls.send_email(address, body, '', 'plain')


    @classmethod
    def send_failsafe(cls, body):

        for failsafe_email in config.SMS_FAILSAFES:
            cls.send_email(failsafe_email, body, '<<FAILSAFE>> - Paging Issue', True)


    @classmethod
    def get_incoming(cls):

        try:
            messages = cls.client.sms.messages.list(to=config.TWILIO_NUMBER)
        except TwilioRestException as error:
            raise OnCalendarSMSError(error)

        return messages


if __name__ == '__main__':

    ocsms = OnCalendarSMS(config)
    ocsms.send_failsafe('Test message from OnCalendar notification system.')

