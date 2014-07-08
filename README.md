OnCalendar
==========

OnCalendar is an open-source calendar and notification management tool
designed to automate on-call rotations. Some key features:

* Easy calendar interface for viewing and scheduling your on-call rotations
    * Rotations can be edited in full-week or one-day increments for
      ease of scheduling.
    * Each day can be edited in 1/2 hour increments for quick
      coverage swaps.
    * Groups are color-coded on the calendar, and groups can be hidden
      or shown
        * "Hide Other Groups" to hide all groups but the one you want.
        * "Hide This Group" to hide a single group.
        * "Show This Group" to bring back a single group to the calendar.
        * "Show All Groups" to return all groups to the calendar.
* Multi-level scheduling and notification:
	* Supports on-call shadowing, the shadow user will receive all
	  notifications along with the primary.
	* Supports a backup on-call for a tier-2 escalation.
	* Each group is also enabled for panic paging, all users
	  associated with the group will be paged.
	* Each SMS sent through the system will also be sent as an
	  email copy to the user(s).
* Schedules are checked at 1-minute intervals and notification
  path is updated accordingly.
    * When a scheduled user changes, both the incoming and outgoing
      users are notified via SMS that they are now either on- or
      off-call.
* Schedules are periodically checked for gaps in coverage, and alerts
  are sent to the group if any are found.
* Authentication - calendars can be viewed without logging in, but
  changes can be made only by logged-in users.
    * Users can only update the schedule(s) for groups of which
      they are a member.
    * Each group has at least one admin user who is able to update
      the group's configuration and add or remove members.
    * Logged-in users are also able to send an SMS to any on-call
      or send a panic SMS to any group from the group info panel.
* Groups are configurable for turnover day and time.
    * Default turnover is Monday at 09:30, but can be set to any day
      or time (on 30-minute boundaries).
* Twilio and Nagios integration to enable responding to SMS messages.
    * Ack an alert or downtime a host by responding to an alert SMS.
	  
## Copyright and License

Copyright 2014 Mark Troyer - http://blackops.io - All rights reserved

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

   http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
