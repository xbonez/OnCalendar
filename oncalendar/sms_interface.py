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
        OnCalendarSMS.client = TwilioRestClient(config.TWILIO_SID, config.TWILIO_TOKEN)
        OnCalendarSMS.wordlist = [w.strip() for w in open(oc.config.SMS_WORDLIST_FILE).readlines()]


    @classmethod
    def send_sms(cls, phone_number, body, callback=True):

        if callback:
            msg = cls.client.sms.messages.create(
                to=phone_number,
                from_=oc.config.TWILIO_NUMBER,
                body=body,
                status_callback=oc.config.TWILIO_CALLBACK_URL
            )
        else:
            msg = cls.client.sms.messages.create(
                to=phone_number,
                from_=oc.config.TWILIO_NUMBER,
                body=body
            )

        return msg.sid


    @classmethod
    def send_sms_alert(cls, groupid, victimid, phone_number, body, type='UNKNOWN'):

        try:
            ocdb = oc.OnCalendarDB(oc.config)
            sms_id = ocdb.add_sms_record(groupid, victimid, type)[0]
            print "SMS ID: {0}".format(sms_id)
            sms_hash = cls.wordlist[sms_id % len(cls.wordlist)]
            ocdb.set_sms_hash(sms_id, sms_hash)
        except oc.OnCalendarDBError, error:
            raise OnCalendarSMSError([error.args[0], error.args[1]])

        response_key = "[[{0}]]\n".format(sms_hash)
        body = response_key + body[:oc.config.SMS_CLIP - len(response_key)]

        sms_sid = cls.send_sms(phone_number, body, False)

        try:
            ocdb.set_sms_sid(sms_id, sms_sid)
        except oc.OnCalendarDBError, error:
            raise OnCalendarSMSError([error.args[0], error.args[1]])


    @classmethod
    def send_email(cls, address, body, subject='', format='html'):

        if format == 'html':
            message = MIMEText(body, 'html')
            message.set_charset('utf-8')
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


    @classmethod
    def send_email_alert(cls, address, body, clip=False):

        if clip:
            body = body[:oc.config.SMS_CLIP]

        cls.send_email(address, body, '', 'plain')


    @classmethod
    def send_failsafe(cls, body):

        for failsafe_email in oc.config.SMS_FAILSAFES:
            cls.send_email(failsafe_email, body, '<<FAILSAFE>> - Paging Issue', True)


if __name__ == '__main__':

    ocsms = OnCalendarSMS(oc.config)
    ocsms.send_failsafe('Test message from OnCalendar notification system.')

