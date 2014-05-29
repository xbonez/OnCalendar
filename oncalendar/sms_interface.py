from email.mime.text import MIMEText
import MySQLdb as mysql
import oncalendar as oc
import os
import smtplib
import sys
from twilio import twiml
from twilio.rest import TwilioRestClient

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
        self.client = TwilioRestClient(config.TWILIO_SID, config.TWILIO_TOKEN)
        self.wordlist = [w.strip() for w in open(oc.config.SMS_WORDLIST_FILE).readlines()]


    def send_sms(self, phone_number, body, callback=True):

        if callback:
            msg = self.client.sms.message.create(
                to=phone_number,
                from_=oc.config.TWILIO_NUMBER,
                body=body,
                status_callback=TWILIO_CALLBACK_URL
            )
        else:
            msg = self.client.sms.message.create(
                to=phone_number,
                from_=oc.config.TWILIO_NUMBER,
                body=body
            )

        return msg.sid


    def send_sms_alert(self, group, victim, phone_number, body, type='<<UNKNOWN>>'):

        try:
            ocdb = oc.OnCalendarDB(oc.config)
            sms_id = ocdb.add_sms_record(group, victim, type)
            sms_hash = self.wordlist[sms_id % len(self.wordlist)]
            ocdb.set_sms_hash(sms_id, sms_hash)
        except oc.OnCalendarDBError, error:
            raise OnCalendarSMSError([error.args[0], error.args[1]])

        response_key = "[[{0}]]\n".format(sms_hash)
        body = response_key + body[:oc.config.SMS_CLIP - len(response_key)]

        sms_sid = self.send_sms(phone_number, body)

        try:
            ocdb.set_sms_sid(sms_id, sms_sid)
        except oc.OnCalendarDBError, error:
            raise OnCalendarSMSError([error.args[0], error.args[1]])


    def send_email(self, address, body, subject='', clip=False):

        if clip:
            message = MIMEText(body[:oc.config.SMS_CLIP])
        else:
            message = MIMEText(body)

        message['Subject'] = subject
        message['From'] = oc.config.EMAIL_FROM
        message['To'] = address

        try:
            smtp = smtplib.SMTP(oc.config.EMAIL_HOST)
            smtp.sendmail(oc.config.EMAIL_FROM, [address], message.as_string())
            smtp.quit()
        except IOError as error:
            raise OnCalendarSMSError(error.args[0], error.args[1])
        except smtplib.SMTPException as error:
            raise OnCalendarSMSError(error[0][address][0], error[0][address][1])


    def send_email_alert(self, address, body, type='<<UNKNOWN>>'):

        try:
            ocdb = oc.OnCalendarDB(oc.config)
            (victim, sms_email_address) = ocdb.get_sms_email(victimid)
        except oc.OnCalendarDBError, error:
            raise OnCalendarSMSError([error.args[0], error.args[1]])

        if sms_email_address is not None:
            self.send_email(sms_email_address, body)
        else:
            raise OnCalendarSMSError(oc.ocapi_err.DBSELECT_EMPTY, "User {0} has no SMS email address configured".format(victim))


    def send_failsafe(self, body):

        for failsafe_email in oc.config.SMS_FAILSAFES:
            self.send_email(failsafe_email, body, '<<FAILSAFE>> - Paging Issue', True)


if __name__ == '__main__':

    ocsms = OnCalendarSMS(oc.config)
    ocsms.send_failsafe('Test message from OnCalendar notification system.')

