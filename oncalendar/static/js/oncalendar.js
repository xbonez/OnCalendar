/**
 * Author: Mark Troyer <disco@box.com>
 * Created: 6 Dec 2013
 */

var oc = {
    month_strings: [
        'January',
        'February',
        'March',
        'April',
        'May',
        'June',
        'July',
        'August',
        'September',
        'October',
        'November',
        'December'
    ],
    day_strings: [
        'Sunday',
        'Monday',
        'Tuesday',
        'Wednesday',
        'Thursday',
        'Friday',
        'Saturday'
    ],
    basic_boolean: ['No', 'Yes'],
    roles: [
        'User',
        'Group Admin',
        'App Admin'
    ]
};

var oncalendar = {
    build_calendar: function(year, month, group) {
        var cal = this;
        cal.now = new Date();

        if (typeof group === "undefined") {
            cal.filter_group = false;
        } else {
            cal.filter_group = group;
        }

        if (typeof year === "undefined") {
            cal.current_year = cal.now.getFullYear();
        }
        else {
            cal.current_year = year;
        }
        if (typeof month === "undefined") {
            cal.current_month = cal.now.getMonth();
        }
        else {
            cal.current_month = month;
        }
        console.time('Getting boundaries');
        var cal_boundaries_query = $.ajax({
            url: window.location.origin + '/api/calendar/boundaries',
            type: 'GET',
            dataType: 'json',
            async: false
        });
        cal_boundaries_query.then(function(data) {
            cal.boundaries = data;
        });
        console.timeEnd('Getting boundaries');

        $('div#month-year h3').text(oc.month_strings[cal.current_month] + ' ' + cal.current_year);
        console.time('Creating date objects');
        cal.prev_month_object = new Date(cal.current_year,cal.current_month - 1,15).moveToLastDayOfMonth();
        cal.previous_month = cal.prev_month_object.getMonth();
        cal.previous_month_year = cal.prev_month_object.getFullYear();
        cal.next_month_object = new Date(cal.current_year,cal.current_month + 1,15).moveToFirstDayOfMonth();
        cal.next_month = cal.next_month_object.getMonth();
        cal.next_month_year = cal.next_month_object.getFullYear();
        cal.real_month=cal.current_month+1;
        cal.day_count = Date.getDaysInMonth(cal.current_year, cal.current_month);
        cal.first_day = new Date(cal.current_year, cal.current_month, 15).moveToFirstDayOfMonth();
        cal.first_day_number = cal.first_day.getDay();
        cal.last_day = new Date(cal.current_year, cal.current_month, 15).moveToLastDayOfMonth();
        cal.last_day_number = cal.last_day.getDay();
        console.timeEnd('Creating date objects');

        if (cal.previous_month == 11 && cal.previous_month_year < cal.boundaries['start'][0]) {
            $('#prev-month-button').addClass('hide');
        } else if (cal.previous_month_year == cal.boundaries['start'][0] && cal.previous_month < cal.boundaries['start'][1] - 1) {
            $('#prev-month-button').addClass('hide');
        } else {
            $('#prev-month-button').removeClass('hide');
        }
        if (cal.next_month_year == 0 && cal.next_month_year > cal.boundaries['end'][0]) {
            $('#next-month-button').addClass('hide');
        } else if (cal.next_month_year == cal.boundaries['end'][0] && cal.next_month > cal.boundaries['end'][1] - 1) {
            $('#next-month-button').addClass('hide');
        } else {
            $('#next-month-button').removeClass('hide');
        }

        cal.view_start = new Date(cal.first_day);
        if (cal.first_day_number > 0) {
            cal.view_start.addDays(-cal.first_day_number);
        }
        cal.view_end = new Date(cal.last_day);
        if (cal.last_day_number < 6) {
            cal.post_month_padding = 6 - cal.last_day_number;
            cal.view_end.addDays(cal.post_month_padding);
        } else {
            cal.post_month_padding = 0;
        }

        console.time('Getting victims list');
        var victim_api_query = new $.Deferred();
        $.when(cal.get_calendar_victims(cal.filter_group)
            .done(function(data) {
                cal.victims = data;
                console.timeEnd('Getting victims list');
                victim_api_query.resolve(data);
            })
            .fail(function(data) {
                cal.victims = data;
                victim_api_query.resolve(data);
            })
        );

        return victim_api_query.promise();

    },
    display_calendar: function() {
        var cal = this;
        var current_day = new Date(cal.view_start);
        var today = Date.today();
        var today_string = today.toString('yyyy-M-d');
        var current_week = 0,
            calday,
            day_cell,
            week_row,
            current_date_string,
            current_victim = {};
        var p_group_class = {};
        var calendar_table_fragment = document.createDocumentFragment();
        $.each(oncalendar.oncall_groups, function(group, data) {
            p_group_class[group] = "victim-group info-tooltip";
            if (typeof sessionStorage['display_group'] !== "undefined" && sessionStorage['display_group'] !== null) {
                if (group !== sessionStorage['display_group']) {
                    p_group_class[group] = "victim-group info-tooltip hide";
                }
            }
        });
        console.time('Pre month');
        if (cal.first_day_number > 0) {
            current_week = 1;
            week_row = document.createDocumentFragment();
            week_row.appendChild(document.createElement('tr'));
            week_row.firstChild.setAttribute('id', 'week' + current_week);
            for (i=1; i<=cal.first_day_number; i++) {
                current_date_string = cal.previous_month_year + '-' + (cal.previous_month + 1) + '-' + current_day.toString('d');
                day_cell = document.createDocumentFragment();
                day_cell.appendChild(document.createElement('td'));
                day_cell.firstChild.setAttribute('id', current_date_string);
                day_cell.firstChild.setAttribute('class', 'calendar-day prev-day');
                day_cell.firstChild.appendChild(document.createElement('div'));
                day_cell.firstChild.firstChild.setAttribute('class', 'calendar-daystring');
                day_cell.firstChild.firstChild.innerText = current_day.toString('d');
                day_cell.firstChild.appendChild(document.createElement('div'));
                day_cell.firstChild.lastChild.setAttribute('class', 'calendar-day-victims');
                calday = cal.victims.map[current_date_string];
                if ((typeof calday !== "undefined") && (Object.keys(cal.victims[calday].slots).length !== 0)) {
                    $.each(Object.keys(cal.victims[calday].slots).sort(), function(i, slot) {
                        slot_groups = cal.victims[calday].slots[slot];
                        $.each(slot_groups, function(group, victims) {
                            if (typeof current_victim[group] === "undefined") {
                                current_victim[group] = {
                                    oncall: null,
                                    shadow: null,
                                    backup: null
                                }
                            }
                            if ((current_day.getDay() === cal.oncall_groups[group].turnover_day && slot === cal.oncall_groups[group].turnover_string) || slot === "00-00") {
                                if (victims.oncall !== current_victim[group].oncall) {
                                    current_victim[group].oncall = victims.oncall;
                                    current_victim[group].oncall_name = victims.oncall_name;
                                }
                                day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group]);
                                day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' oncall - ' + current_victim[group].oncall_name);
                                day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' +
                                    (current_victim[group].oncall == null ? '--' : current_victim[group].oncall);
                                if (cal.oncall_groups[group].shadow && victims.shadow != null) {
                                    if (victims.shadow !== current_victim[group].shadow) {
                                        current_victim[group].shadow = victims.shadow;
                                        current_victim[group].shadow_name = victims.shadow_name;
                                    }
                                    day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group]);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' shadow - ' + current_victim[group].shadow_name);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                    day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' + current_victim[group].shadow + ' (S)';
                                }
                                if (cal.oncall_groups[group].backup && victims.backup != null) {
                                    if (victims.backup !== current_victim[group].backup) {
                                        current_victim[group].backup = victims.backup;
                                        current_victim[group].backup_name = victims.backup_name;
                                    }
                                    day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group]);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' backup - ' + current_victim[group].backup_name);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                    day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' + current_victim[group].backup + ' (B)';
                                }
                            } else {
                                if (victims.oncall !== current_victim[group].oncall) {
                                    current_victim[group].oncall = victims.oncall;
                                    current_victim[group].oncall_name = victims.oncall_name;
                                    day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group]);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' oncall - ' + current_victim[group].oncall_name);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                    day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' +
                                        (current_victim[group].oncall == null ? '--' : current_victim[group].oncall);
                                }
                                if (cal.oncall_groups[group].shadow) {
                                    if (victims.shadow !== current_victim[group].shadow) {
                                        current_victim[group].shadow = victims.shadow;
                                        current_victim[group].shadow_name = victims.shadow_name;
                                        day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group]);
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' shadow - ' + current_victim[group].shadow_name);
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                        day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' +
                                            (current_victim[group].shadow == null ? '--' : current_victim[group].shadow) + ' (S)';
                                    }
                                }
                                if (cal.oncall_groups[group].backup) {
                                    if (victims.backup !== current_victim[group].backup) {
                                        current_victim[group].backup = victims.backup;
                                        current_victim[group].backup_name = victims.backup_name;
                                        day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group]);
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' backup - ' + current_victim[group].backup_name);
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                        day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' +
                                            (current_victim[group].backup == null ? '--' : current_victim[group].backup) + ' (B)';
                                    }
                                }
                            }
                        });
                    });
                    if (current_day >= today) {
                        day_cell.firstChild.appendChild(document.createElement('span'));
                        day_cell.firstChild.lastChild.setAttribute('class', 'edit-day-menu hide');
                        day_cell.firstChild.lastChild.setAttribute('data-calday', calday);
                    }
                }
                week_row.firstChild.appendChild(day_cell);
                current_day.add(1).days();
            }
        }
        console.timeEnd('Pre month');
        console.time('Current month');
        for (i=1; i<=cal.day_count; i++) {
            current_date_string = cal.current_year + '-' + cal.real_month + '-' + current_day.toString('d');
            if (current_day.getDay() == 0) {
                if (typeof week_row !== "undefined") {
                    calendar_table_fragment.appendChild(week_row);
                    current_week++;
                }
                week_row = document.createDocumentFragment();
                week_row.appendChild(document.createElement('tr'));
                week_row.firstChild.setAttribute('id', 'week' + current_week);
            }
            day_cell = document.createDocumentFragment();
            day_cell.appendChild(document.createElement('td'));
            day_cell.firstChild.setAttribute('id', current_date_string);
            day_cell.firstChild.setAttribute('class', 'calendar-day');
            day_cell.firstChild.appendChild(document.createElement('div'));
            day_cell.firstChild.firstChild.setAttribute('class', 'calendar-daystring');
            day_cell.firstChild.firstChild.innerText = current_day.toString('d');
            day_cell.firstChild.appendChild(document.createElement('div'));
            day_cell.firstChild.lastChild.setAttribute('class', 'calendar-day-victims');

            if (current_date_string === today_string) {
                day_cell.firstChild.classList.add('today');
            }
            calday = cal.victims.map[current_date_string];
            if ((typeof calday !== "undefined") && (Object.keys(cal.victims[calday].slots).length !== 0)) {
                $.each(Object.keys(cal.victims[calday].slots).sort(), function(i, slot) {
                    slot_groups = cal.victims[calday].slots[slot];
                    $.each(slot_groups, function(group, victims) {
                        if (typeof current_victim[group] === "undefined") {
                            current_victim[group] = {
                                oncall: null,
                                shadow: null,
                                backup: null
                            }
                        }
                        if ((current_day.getDay() === cal.oncall_groups[group].turnover_day && slot === cal.oncall_groups[group].turnover_string) || slot === "00-00") {
                            if (victims.oncall !== current_victim[group].oncall) {
                                current_victim[group].oncall = victims.oncall;
                                current_victim[group].oncall_name = victims.oncall_name;
                            }
                            day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                            day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group] + ' info-tooltip');
                            day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                            day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' oncall - ' + current_victim[group].oncall_name);
                            day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                            day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' +
                                (current_victim[group].oncall == null ? '--' : current_victim[group].oncall);
                            if (cal.oncall_groups[group].shadow && victims.shadow != null) {
                                if (victims.shadow !== current_victim[group].shadow) {
                                    current_victim[group].shadow = victims.shadow;
                                    current_victim[group].shadow_name = victims.shadow_name;
                                }
                                day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group]);
                                day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' shadow - ' + current_victim[group].shadow_name);
                                day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' + current_victim[group].shadow + ' (S)';
                            }
                            if (cal.oncall_groups[group].backup && victims.backup != null) {
                                if (victims.backup !== current_victim[group].backup) {
                                    current_victim[group].backup = victims.backup;
                                    current_victim[group].backup_name = victims.backup_name;
                                }
                                day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group]);
                                day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' backup - ' + current_victim[group].backup_name);
                                day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' + current_victim[group].backup + ' (B)';
                            }
                        } else {
                            if (victims.oncall !== current_victim[group].oncall) {
                                current_victim[group].oncall = victims.oncall;
                                current_victim[group].oncall_name = victims.oncall_name;
                                day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group] + ' info-tooltip');
                                day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' oncall - ' + current_victim[group].oncall_name);
                                day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' +
                                    (current_victim[group].oncall == null ? '--' : current_victim[group].oncall);
                            }
                            if (cal.oncall_groups[group].shadow) {
                                if (victims.shadow !== current_victim[group].shadow) {
                                    current_victim[group].shadow = victims.shadow;
                                    current_victim[group].shadow_name = victims.shadow_name;
                                    day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group]);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' shadow - ' + current_victim[group].shadow_name);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                    day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' +
                                        (current_victim[group].shadow == null ? '--' : current_victim[group].shadow) + ' (S)';
                                }
                            }
                            if (cal.oncall_groups[group].backup) {
                                if (victims.backup !== current_victim[group].backup) {
                                    current_victim[group].backup = victims.backup;
                                    current_victim[group].backup_name = victims.backup_name;
                                    day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group]);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' backup - ' + current_victim[group].backup_name);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                    day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' +
                                        (current_victim[group].backup == null ? '--' : current_victim[group].backup) + ' (B)';
                                }
                            }
                        }
                    });
                });
                if (current_day >= today) {
                    day_cell.firstChild.appendChild(document.createElement('span'));
                    day_cell.firstChild.lastChild.setAttribute('class', 'edit-day-menu hide');
                    day_cell.firstChild.lastChild.setAttribute('data-calday', calday);
                }
            }
            week_row.firstChild.appendChild(day_cell);
            current_day = current_day.add(1).days();
        }
        console.timeEnd('Current month');
        console.time('Post month');
        if (cal.post_month_padding > 0) {
            for (i=1; i<=cal.post_month_padding; i++) {
                current_date_string = cal.current_year + '-' + (cal.next_month + 1) + '-' + current_day.toString('d');
                day_cell = document.createDocumentFragment();
                day_cell.appendChild(document.createElement('td'));
                day_cell.firstChild.setAttribute('id', current_date_string);
                day_cell.firstChild.setAttribute('class', 'calendar-day post-day');
                day_cell.firstChild.appendChild(document.createElement('div'));
                day_cell.firstChild.firstChild.setAttribute('class', 'calendar-daystring');
                day_cell.firstChild.firstChild.innerText = current_day.toString('d');
                day_cell.firstChild.appendChild(document.createElement('div'));
                day_cell.firstChild.lastChild.setAttribute('class', 'calendar-day-victims');
                calday = cal.victims.map[current_date_string];
                if ((typeof calday !== "undefined") && (Object.keys(cal.victims[calday].slots).length !== 0)) {
                    $.each(Object.keys(cal.victims[calday].slots).sort(), function(i, slot) {
                        slot_groups = cal.victims[calday].slots[slot];
                        $.each(slot_groups, function(group, victims) {
                            if (typeof current_victim[group] === "undefined") {
                                current_victim[group] = {
                                    oncall: null,
                                    shadow: null,
                                    backup: null
                                }
                            }
                            if ((current_day.getDay() === cal.oncall_groups[group].turnover_day && slot === cal.oncall_groups[group].turnover_string) || slot === "00-00") {
                                if (victims.oncall !== current_victim[group].oncall) {
                                    current_victim[group].oncall = victims.oncall;
                                    current_victim[group].oncall_name = victims.oncall_name;
                                }
                                day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group] + ' info-tooltip');
                                day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' oncall - ' + current_victim[group].oncall_name);
                                day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' +
                                    (current_victim[group].oncall == null ? '--' : current_victim[group].oncall);
                                if (cal.oncall_groups[group].shadow && victims.shadow != null) {
                                    if (victims.shadow !== current_victim[group].shadow) {
                                        current_victim[group].shadow = victims.shadow;
                                        current_victim[group].shadow_name = victims.shadow_name;
                                    }
                                    day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group]);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' shadow - ' + current_victim[group].shadow_name);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                    day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' + current_victim[group].shadow + ' (S)';
                                }
                                if (cal.oncall_groups[group].backup && victims.backup != null) {
                                    if (victims.backup !== current_victim[group].backup) {
                                        current_victim[group].backup = victims.backup;
                                        current_victim[group].backup_name = victims.backup_name;
                                    }
                                    day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group]);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' backup - ' + current_victim[group].backup_name);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                    day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' + current_victim[group].backup + ' (B)';
                                }
                            } else {
                                if (victims.oncall !== current_victim[group].oncall) {
                                    current_victim[group].oncall = victims.oncall;
                                    current_victim[group].oncall_name = victims.oncall_name;
                                    day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group] + ' info-tooltip');
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' oncall - ' + current_victim[group].oncall_name);
                                    day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                    day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' +
                                        (current_victim[group].oncall == null ? '--' : current_victim[group].oncall);
                                }
                                if (cal.oncall_groups[group].shadow) {
                                    if (victims.shadow !== current_victim[group].shadow) {
                                        current_victim[group].shadow = victims.shadow;
                                        current_victim[group].shadow_name = victims.shadow_name;
                                        day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group]);
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' shadow - ' + current_victim[group].shadow_name);
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                        day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' +
                                            (current_victim[group].shadow == null ? '--' : current_victim[group].shadow) + ' (S)';
                                    }
                                }
                                if (cal.oncall_groups[group].backup) {
                                    if (victims.backup !== current_victim[group].backup) {
                                        current_victim[group].backup = victims.backup;
                                        current_victim[group].backup_name = victims.backup_name;
                                        day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('class', p_group_class[group]);
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('data-group', group);
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('title', group + ' backup - ' + current_victim[group].backup_name);
                                        day_cell.firstChild.lastChild.lastChild.setAttribute('style', 'color: ' + cal.group_color_map[group] + ';');
                                        day_cell.firstChild.lastChild.lastChild.innerText = slot.replace('-', ':') + ' ' +
                                            (current_victim[group].backup == null ? '--' : current_victim[group].backup) + ' (B)';
                                    }
                                }
                            }
                        });
                    });
                    if (current_day >= today) {
                        day_cell.firstChild.appendChild(document.createElement('span'));
                        day_cell.firstChild.lastChild.setAttribute('class', 'edit-day-menu hide');
                        day_cell.firstChild.lastChild.setAttribute('data-calday', calday);
                    }
                }
                week_row.firstChild.appendChild(day_cell);
                current_day = current_day.add(1).days();
            }
        }
        calendar_table_fragment.appendChild(week_row);
        console.timeEnd('Post month');

        console.time('Insert table data');
        $('table#calendar-table').append(calendar_table_fragment);
        console.timeEnd('Insert table data');

        $('p.victim-group.info-tooltip').tooltip({placement: 'top', delay: {show: 500, hide: 100}});

    },
    display_calendar_edit: function(group) {
        var cal = this;
        var current_day = new Date(cal.view_start);
        var today = Date.today();
        var today_string = today.toString('yyyy-M-d');
        var day_victims = {};
        var victim_options = '<li class="oncall-option" data-victim="--"><span>--</span></li>';
        var shadow_options = '<li class="shadow-option" data-victim="--"><span>--</span></li>';
        var backup_options = '<li class="backup-option" data-victim="--"><span>--</span></li>';
        var current_week = 0,
            calday,
            day_cell,
            week_row,
            current_date_string,
            shadow_fragment,
            backup_fragment,
            victim_string,
            shadow_string,
            backup_string;
        var calendar_table_fragment = document.createDocumentFragment();

        if (cal.current_month == today.getMonth()) {
            $('#prev-month-button').addClass('hide');
        }

        $.each(Object.keys(cal.victims.map).sort(), function(i, date) {
            var calday = cal.victims.map[date];
            if (typeof cal.victims[calday].slots[cal.oncall_groups[group].turnover_string] !== "undefined") {
                if (typeof cal.victims[calday].slots[cal.oncall_groups[group].turnover_string][group] !== "undefined") {
                    day_victims[calday] = cal.victims[calday].slots[cal.oncall_groups[group].turnover_string][group];
                }
            }
        });

        $.each(cal.oncall_groups[group].victims, function(i, v) {
            if (v.group_active === 1) {
                victim_options += '<li class="oncall-option" data-victim="' + v.username + '"><span>' + v.username + '</span></li>';
                shadow_options += '<li class="shadow-option" data-victim="' + v.username + '"><span>' + v.username + '</span></li>';
                backup_options += '<li class="backup-option" data-victim="' + v.username + '"><span>' + v.username + '</span></li>';
            }
        });

        if (cal.first_day_number > 0) {
            current_week = 1;
            week_row = document.createDocumentFragment();
            week_row.appendChild(document.createElement('tr'));
            week_row.firstChild.setAttribute('id', 'week' + current_week);
            for (i=1; i<=cal.first_day_number; i++) {
                current_date_string = cal.current_year + '-' + (cal.previous_month + 1) + '-' + current_day.toString('d');
                calday = cal.victims.map[current_date_string];
                victim_string = '--';
                shadow_string = '--';
                backup_string = '--';
                if (typeof day_victims[calday] !== "undefined") {
                    if (typeof day_victims[calday].oncall !== "undefined" && day_victims[calday].oncall !== null) {
                        victim_string = day_victims[calday].oncall;
                    }
                    if (cal.oncall_groups[group].shadow == 1 && typeof day_victims[calday].shadow !== "undefined"
                        && day_victims[calday].shadow !== null) {
                        shadow_string = day_victims[calday].shadow;
                    }
                    if (cal.oncall_groups[group].backup == 1 && typeof day_victims[calday].backup !== "undefined"
                        && day_victims[calday].backup !== null) {
                        backup_string = day_victims[calday].backup;
                    }
                }
                day_cell = document.createDocumentFragment();
                day_cell.appendChild(document.createElement('td'));
                day_cell.firstChild.setAttribute('id', current_date_string);
                day_cell.firstChild.setAttribute('class', 'calendar-day prev-day');
                day_cell.firstChild.appendChild(document.createElement('div'));
                day_cell.firstChild.firstChild.setAttribute('class', 'calendar-daystring');
                day_cell.firstChild.firstChild.innerText = current_day.toString('d');
                day_cell.firstChild.appendChild(document.createElement('div'));
                day_cell.firstChild.lastChild.setAttribute('class', 'calendar-day-victims');
                if (current_day < today || (current_date_string == today_string && Date.now().hours() > (cal.oncall_groups[group].turnover_hour + 1))) {
                    day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                    day_cell.firstChild.lastChild.lastChild.innerText = victim_string;
                    if (cal.oncall_groups[group].shadow == 1) {
                        day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                        day_cell.firstChild.lastChild.lastChild.innerText = shadow_string + ' (S)';
                    }
                    if (cal.oncall_groups[group].backup == 1) {
                        day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                        day_cell.firstChild.lastChild.lastChild.innerText = backup_string + ' (B)';
                    }
                } else {
                    day_cell.firstChild.lastChild.innerHTML = '<input type="hidden" id="' + current_date_string + '-oncall" name="' + current_date_string + '-oncall" value="' + victim_string + '">' +
                        '<input type="hidden" id="' + current_date_string + '-prev-oncall" name="' + current_date_string + '-prev-oncall" value="' + victim_string + '">' +
                        '<div><span>Oncall: </span><span id="' + current_date_string + '-oncall-menu" class="dropdown">' +
                        '<span data-toggle="dropdown"><button id="' + current_date_string + '-oncall-label">' + victim_string +
                        '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                        '<ul id="' + current_date_string + '-oncall-options" class="dropdown-menu" role="menu" data-day-id="' + current_date_string + '"></span></div>';
                    day_cell.firstChild.lastChild.lastChild.lastChild.lastChild.innerHTML = victim_options;
                    if (cal.oncall_groups[group].shadow == 1) {
                        shadow_fragment = document.createDocumentFragment();
                        shadow_fragment.appendChild(document.createElement('br'));
                        shadow_fragment.appendChild(document.createElement('input'));
                        shadow_fragment.lastChild.setAttribute('type', 'hidden');
                        shadow_fragment.lastChild.setAttribute('id', current_date_string + '-shadow');
                        shadow_fragment.lastChild.setAttribute('name', current_date_string + '-shadow');
                        shadow_fragment.lastChild.setAttribute('value', shadow_string);
                        shadow_fragment.appendChild(document.createElement('input'));
                        shadow_fragment.lastChild.setAttribute('type', 'hidden');
                        shadow_fragment.lastChild.setAttribute('id', current_date_string + '-prev-shadow');
                        shadow_fragment.lastChild.setAttribute('name', current_date_string + '-prev-shadow');
                        shadow_fragment.lastChild.setAttribute('value', shadow_string);
                        shadow_fragment.appendChild(document.createElement('div'));
                        shadow_fragment.lastChild.innerHTML = '<span>Shadow: </span>' +
                            '<span id="' + current_date_string + '-shadow-menu" class="dropdown"><span data-toggle="dropdown">' +
                            '<button id="' + current_date_string + '-shadow-label">' + shadow_string +
                            '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                            '<ul id="' + current_date_string + '-shadow-options" class="dropdown-menu role="menu" data-day-id="' + current_date_string + '"></span></ul>';
                        shadow_fragment.lastChild.lastChild.lastChild.innerHTML = shadow_options;
                        day_cell.firstChild.lastChild.appendChild(shadow_fragment);
                    }
                    if (cal.oncall_groups[group].backup == 1) {
                        backup_fragment = document.createDocumentFragment();
                        backup_fragment.appendChild(document.createElement('br'));
                        backup_fragment.appendChild(document.createElement('input'));
                        backup_fragment.lastChild.setAttribute('type', 'hidden');
                        backup_fragment.lastChild.setAttribute('id', current_date_string + '-backup');
                        backup_fragment.lastChild.setAttribute('name', current_date_string + '-backup');
                        backup_fragment.lastChild.setAttribute('value', backup_string);
                        backup_fragment.appendChild(document.createElement('input'));
                        backup_fragment.lastChild.setAttribute('type', 'hidden');
                        backup_fragment.lastChild.setAttribute('id', current_date_string + '-prev-backup');
                        backup_fragment.lastChild.setAttribute('name', current_date_string + '-prev-backup');
                        backup_fragment.lastChild.setAttribute('value', backup_string);
                        backup_fragment.appendChild(document.createElement('div'));
                        backup_fragment.lastChild.innerHTML = '<span>Backup: </span>' +
                            '<span id="' + current_date_string + '-backup-menu" class="dropdown"><span data-toggle="dropdown">' +
                            '<button id="' + current_date_string + '-backup-label">' + backup_string +
                            '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                            '<ul id="' + current_date_string + '-backup-options" class="dropdown-menu role="menu" data-day-id="' + current_date_string + '"></span></ul>';
                        backup_fragment.lastChild.lastChild.lastChild.innerHTML = backup_options;
                        day_cell.firstChild.lastChild.appendChild(backup_fragment);
                    }
                }
                week_row.firstChild.appendChild(day_cell);
                current_day.add(1).days();
            }
        }
        for (i=1; i<=cal.day_count; i++) {
            current_date_string = cal.current_year + '-' + cal.real_month + '-' + current_day.toString('d');
            calday = cal.victims.map[current_date_string];
            victim_string = '--';
            shadow_string = '--';
            backup_string = '--';
            if (typeof day_victims[calday] !== "undefined") {
                if (typeof day_victims[calday].oncall !== "undefined" && day_victims[calday].oncall !== null) {
                    victim_string = day_victims[calday].oncall;
                }
                if (cal.oncall_groups[group].shadow == 1 && typeof day_victims[calday].shadow !== "undefined"
                    && day_victims[calday].shadow !== null) {
                    shadow_string = day_victims[calday].shadow;
                }
                if (cal.oncall_groups[group].backup == 1 && typeof day_victims[calday].backup !== "undefined"
                    && day_victims[calday].backup !== null) {
                    backup_string = day_victims[calday].backup;
                }
            }
            if (current_day.getDay() == 0) {
                if (typeof week_row !== "undefined") {
                    calendar_table_fragment.appendChild(week_row);
                    current_week++;
                }
                week_row = document.createDocumentFragment();
                week_row.appendChild(document.createElement('tr'));
                week_row.firstChild.setAttribute('id', 'week' + current_week);
            }
            day_cell = document.createDocumentFragment();
            day_cell.appendChild(document.createElement('td'));
            day_cell.firstChild.setAttribute('id', current_date_string);
            day_cell.firstChild.setAttribute('class', 'calendar-day');
            day_cell.firstChild.appendChild(document.createElement('div'));
            day_cell.firstChild.firstChild.setAttribute('class', 'calendar-daystring');
            day_cell.firstChild.firstChild.innerText = current_day.toString('d');
            day_cell.firstChild.appendChild(document.createElement('div'));
            day_cell.firstChild.lastChild.setAttribute('class', 'calendar-day-victims');
            console.log(current_date_string, today_string, Date.now().hours());
            if (current_day < today || (current_date_string == today_string && Date.now().hours() > (cal.oncall_groups[group].turnover_hour + 1))) {
                day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                day_cell.firstChild.lastChild.lastChild.innerText = victim_string;
                if (cal.oncall_groups[group].shadow == 1) {
                    day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                    day_cell.firstChild.lastChild.lastChild.innerText = shadow_string + '(S)';
                }
                if (cal.oncall_groups[group].backup == 1) {
                    day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                    day_cell.firstChild.lastChild.lastChild.innerText = backup_string + ' (B)';
                }
            } else {
                day_cell.firstChild.lastChild.innerHTML = '<input type="hidden" id="' + current_date_string + '-oncall" name="' + current_date_string + '-oncall" value="' + victim_string + '">' +
                    '<input type="hidden" id="' + current_date_string + '-prev-oncall" name="' + current_date_string + '-prev-oncall" value="' + victim_string + '">' +
                    '<div><span>Oncall: </span><span id="' + current_date_string + '-oncall-menu" class="dropdown">' +
                    '<span data-toggle="dropdown"><button id="' + current_date_string + '-oncall-label">' + victim_string +
                    '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                    '<ul id="' + current_date_string + '-oncall-options" class="dropdown-menu" role="menu" data-day-id="' + current_date_string + '"></span></div>';
                day_cell.firstChild.lastChild.lastChild.lastChild.lastChild.innerHTML = victim_options;
                if (cal.oncall_groups[group].shadow == 1) {
                    shadow_fragment = document.createDocumentFragment();
                    shadow_fragment.appendChild(document.createElement('br'));
                    shadow_fragment.appendChild(document.createElement('input'));
                    shadow_fragment.lastChild.setAttribute('type', 'hidden');
                    shadow_fragment.lastChild.setAttribute('id', current_date_string + '-shadow');
                    shadow_fragment.lastChild.setAttribute('name', current_date_string + '-shadow');
                    shadow_fragment.lastChild.setAttribute('value', shadow_string);
                    shadow_fragment.appendChild(document.createElement('input'));
                    shadow_fragment.lastChild.setAttribute('type', 'hidden');
                    shadow_fragment.lastChild.setAttribute('id', current_date_string + '-prev-shadow');
                    shadow_fragment.lastChild.setAttribute('name', current_date_string + '-prev-shadow');
                    shadow_fragment.lastChild.setAttribute('value', shadow_string);
                    shadow_fragment.appendChild(document.createElement('div'));
                    shadow_fragment.lastChild.innerHTML = '<span>Shadow: </span>' +
                        '<span id="' + current_date_string + '-shadow-menu" class="dropdown"><span data-toggle="dropdown">' +
                        '<button id="' + current_date_string + '-shadow-label">' + shadow_string +
                        '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                        '<ul id="' + current_date_string + '-shadow-options" class="dropdown-menu role="menu" data-day-id="' + current_date_string + '"></span></ul>';
                    shadow_fragment.lastChild.lastChild.lastChild.innerHTML = shadow_options;
                    day_cell.firstChild.lastChild.appendChild(shadow_fragment);
                }
                if (cal.oncall_groups[group].backup == 1) {
                    backup_fragment = document.createDocumentFragment();
                    backup_fragment.appendChild(document.createElement('br'));
                    backup_fragment.appendChild(document.createElement('input'));
                    backup_fragment.lastChild.setAttribute('type', 'hidden');
                    backup_fragment.lastChild.setAttribute('id', current_date_string + '-backup');
                    backup_fragment.lastChild.setAttribute('name', current_date_string + '-backup');
                    backup_fragment.lastChild.setAttribute('value', backup_string);
                    backup_fragment.appendChild(document.createElement('input'));
                    backup_fragment.lastChild.setAttribute('type', 'hidden');
                    backup_fragment.lastChild.setAttribute('id', current_date_string + '-prev-backup');
                    backup_fragment.lastChild.setAttribute('name', current_date_string + '-prev-backup');
                    backup_fragment.lastChild.setAttribute('value', backup_string);
                    backup_fragment.appendChild(document.createElement('div'));
                    backup_fragment.lastChild.innerHTML = '<span>Backup: </span>' +
                        '<span id="' + current_date_string + '-backup-menu" class="dropdown"><span data-toggle="dropdown">' +
                        '<button id="' + current_date_string + '-backup-label">' + backup_string +
                        '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                        '<ul id="' + current_date_string + '-backup-options" class="dropdown-menu role="menu" data-day-id="' + current_date_string + '"></span></ul>';
                    backup_fragment.lastChild.lastChild.lastChild.innerHTML = backup_options;
                    day_cell.firstChild.lastChild.appendChild(backup_fragment);
                }
            }
            if (current_date_string === today_string) {
                day_cell.firstChild.classList.add('today');
            }
            week_row.firstChild.appendChild(day_cell);
            current_day.add(1).days();
        }

        if (cal.post_month_padding > 0) {
            for (i=1; i<=cal.post_month_padding; i++) {
                current_date_string = cal.current_year + '-' + (cal.next_month + 1) + '-' + current_day.toString('d');
                calday = cal.victims.map[current_date_string];
                victim_string = '--';
                shadow_string = '--';
                backup_string = '--';
                if (typeof day_victims[calday] !== "undefined" && day_victims[calday].oncall !== null) {
                    if (typeof day_victims[calday].oncall !== "undefined") {
                        victim_string = day_victims[calday].oncall;
                    }
                    if (cal.oncall_groups[group].shadow == 1 && typeof day_victims[calday].shadow !== "undefined"
                        && day_victims[calday].shadow !== null) {
                        shadow_string = day_victims[calday].shadow;
                    }
                    if (cal.oncall_groups[group].backup == 1 && typeof day_victims[calday].backup !== "undefined"
                        && day_victims[calday].backup !== null) {
                        backup_string = day_victims[calday].backup;
                    }
                }
                day_cell = document.createDocumentFragment();
                day_cell.appendChild(document.createElement('td'));
                day_cell.firstChild.setAttribute('id', current_date_string);
                day_cell.firstChild.setAttribute('class', 'calendar-day post-day');
                day_cell.firstChild.appendChild(document.createElement('div'));
                day_cell.firstChild.firstChild.setAttribute('class', 'calendar-daystring');
                day_cell.firstChild.firstChild.innerText = current_day.toString('d');
                day_cell.firstChild.appendChild(document.createElement('div'));
                day_cell.firstChild.lastChild.setAttribute('class', 'calendar-day-victims');
                if (current_day < today || (current_date_string == today_string && Date.now().hours() > (cal.oncall_groups[group].turnover_hour + 1))) {
                    day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                    day_cell.firstChild.lastChild.lastChild.innerText = victim_string;
                    if (cal.oncall_groups[group].shadow == 1) {
                        day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                        day_cell.firstChild.lastChild.lastChild.innerText = shadow_string + ' (S)';
                    }
                    if (cal.oncall_groups[group].backup == 1) {
                        day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                        day_cell.firstChild.lastChild.lastChild.innerText = backup_string + ' (B)';
                    }
                } else {
                    day_cell.firstChild.lastChild.innerHTML = '<input type="hidden" id="' + current_date_string + '-oncall" name="' + current_date_string + '-oncall" value="' + victim_string + '">' +
                        '<input type="hidden" id="' + current_date_string + '-prev-oncall" name="' + current_date_string + '-prev-oncall" value="' + victim_string + '">' +
                        '<div><span>Oncall: </span><span id="' + current_date_string + '-oncall-menu" class="dropdown">' +
                        '<span data-toggle="dropdown"><button id="' + current_date_string + '-oncall-label">' + victim_string +
                        '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                        '<ul id="' + current_date_string + '-oncall-options" class="dropdown-menu" role="menu" data-day-id="' + current_date_string + '"></span></div>';
                    day_cell.firstChild.lastChild.lastChild.lastChild.lastChild.innerHTML = victim_options;
                    if (cal.oncall_groups[group].shadow == 1) {
                        shadow_fragment = document.createDocumentFragment();
                        shadow_fragment.appendChild(document.createElement('br'));
                        shadow_fragment.appendChild(document.createElement('input'));
                        shadow_fragment.lastChild.setAttribute('type', 'hidden');
                        shadow_fragment.lastChild.setAttribute('id', current_date_string + '-shadow');
                        shadow_fragment.lastChild.setAttribute('name', current_date_string + '-shadow');
                        shadow_fragment.lastChild.setAttribute('value', shadow_string);
                        shadow_fragment.appendChild(document.createElement('input'));
                        shadow_fragment.lastChild.setAttribute('type', 'hidden');
                        shadow_fragment.lastChild.setAttribute('id', current_date_string + '-prev-shadow');
                        shadow_fragment.lastChild.setAttribute('name', current_date_string + '-prev-shadow');
                        shadow_fragment.lastChild.setAttribute('value', shadow_string);
                        shadow_fragment.appendChild(document.createElement('div'));
                        shadow_fragment.lastChild.innerHTML = '<span>Shadow: </span>' +
                            '<span id="' + current_date_string + '-shadow-menu" class="dropdown"><span data-toggle="dropdown">' +
                            '<button id="' + current_date_string + '-shadow-label">' + shadow_string +
                            '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                            '<ul id="' + current_date_string + '-shadow-options" class="dropdown-menu role="menu" data-day-id="' + current_date_string + '"></span></ul>';
                        shadow_fragment.lastChild.lastChild.lastChild.innerHTML = shadow_options;
                        day_cell.firstChild.lastChild.appendChild(shadow_fragment);
                    }
                    if (cal.oncall_groups[group].backup == 1) {
                        backup_fragment = document.createDocumentFragment();
                        backup_fragment.appendChild(document.createElement('br'));
                        backup_fragment.appendChild(document.createElement('input'));
                        backup_fragment.lastChild.setAttribute('type', 'hidden');
                        backup_fragment.lastChild.setAttribute('id', current_date_string + '-backup');
                        backup_fragment.lastChild.setAttribute('name', current_date_string + '-backup');
                        backup_fragment.lastChild.setAttribute('value', backup_string);
                        backup_fragment.appendChild(document.createElement('input'));
                        backup_fragment.lastChild.setAttribute('type', 'hidden');
                        backup_fragment.lastChild.setAttribute('id', current_date_string + '-prev-backup');
                        backup_fragment.lastChild.setAttribute('name', current_date_string + '-prev-backup');
                        backup_fragment.lastChild.setAttribute('value', backup_string);
                        backup_fragment.appendChild(document.createElement('div'));
                        backup_fragment.lastChild.innerHTML = '<span>Backup: </span>' +
                            '<span id="' + current_date_string + '-backup-menu" class="dropdown"><span data-toggle="dropdown">' +
                            '<button id="' + current_date_string + '-backup-label">' + backup_string +
                            '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                            '<ul id="' + current_date_string + '-backup-options" class="dropdown-menu role="menu" data-day-id="' + current_date_string + '"></span></ul>';
                        backup_fragment.lastChild.lastChild.lastChild.innerHTML = backup_options;
                        day_cell.firstChild.lastChild.appendChild(backup_fragment);
                    }
                }
                week_row.firstChild.appendChild(day_cell);
                current_day.add(1).days();
            }
        }
        calendar_table_fragment.appendChild(week_row);
        $('table#calendar-table').append(calendar_table_fragment);
    },
    display_calendar_weekly_edit: function(group) {
        var cal = this;
        var current_day = new Date(cal.view_start);
        var today = Date.today();
        var today_string = today.toString('yyyy-M-d');
        var day_victims = {};
        var victim_options = '<li class="oncall-option" data-victim="--"><span>--</span></li>';
        var shadow_options = '<li class="shadow-option" data-victim="--"><span>--</span></li>';
        var backup_options = '<li class="backup-option" data-victim="--"><span>--</span></li>';
        var current_week = 0,
            oncall_week = 0,
            week_row,
            current_date_string,
            shadow_fragment,
            backup_fragment,
            victim_string = '--';
            shadow_string = '--';
            backup_string = '--';
        var calendar_table_fragment = document.createDocumentFragment();
        var past_schedule;

        if (cal.current_month == today.getMonth()) {
            $('#prev-month-button').addClass('hide');
        }

        $.each(Object.keys(cal.victims.map).sort(), function(i, date) {
            var calday = cal.victims.map[date];
            if (typeof cal.victims[calday].slots[cal.oncall_groups[group].turnover_string] !== "undefined") {
                if (typeof cal.victims[calday].slots[cal.oncall_groups[group].turnover_string][group] !== "undefined") {
                    day_victims[calday] = cal.victims[calday].slots[cal.oncall_groups[group].turnover_string][group];
                }
            }
        });

        $.each(cal.oncall_groups[group].victims, function(i, v) {
            if (v.group_active === 1) {
                victim_options += '<li class="oncall-option" data-victim="' + v.username + '"><span>' + v.username + '</span></li>';
                shadow_options += '<li class="shadow-option" data-victim="' + v.username + '"><span>' + v.username + '</span></li>';
                backup_options += '<li class="backup-option" data-victim="' + v.username + '"><span>' + v.username + '</span></li>';
            }
        });

        if (cal.first_day_number > 0) {
            current_week = 1;
            week_row = document.createDocumentFragment();
            week_row.appendChild(document.createElement('tr'));
            week_row.firstChild.setAttribute('id', 'week' + current_week);
            for (i=1; i<=cal.first_day_number; i++) {
                current_date_string = cal.current_year + '-' + (cal.previous_month + 1) + '-' + current_day.toString('d');
                calday = cal.victims.map[current_date_string];
                if (current_day.getDay() < cal.oncall_groups[group].turnover_day) {
                    day_cell = document.createDocumentFragment();
                    day_cell.appendChild(document.createElement('td'));
                    day_cell.firstChild.setAttribute('class', 'calendar-day null-day');
                } else if (current_day.getDay() === cal.oncall_groups[group].turnover_day) {
                    oncall_week++;
                    if (typeof day_victims[calday] !== "undefined") {
                        if (typeof day_victims[calday].oncall !== "undefined" && day_victims[calday].oncall !== null) {
                            victim_string = day_victims[calday].oncall;
                        }
                        if (cal.oncall_groups[group].shadow == 1 && typeof day_victims[calday].shadow !== "undefined"
                            && day_victims[calday].shadow !== null) {
                            shadow_string = day_victims[calday].shadow;
                        }
                        if (cal.oncall_groups[group].backup == 1 && typeof day_victims[calday].backup !== "undefined"
                            && day_victims[calday].backup !== null) {
                            backup_string = day_victims[calday].backup;
                        }
                    }
                    day_cell = document.createDocumentFragment();
                    day_cell.appendChild(document.createElement('td'));
                    day_cell.firstChild.setAttribute('id', current_date_string);
                    day_cell.firstChild.setAttribute('class', 'calendar-day prev-day');
                    day_cell.firstChild.appendChild(document.createElement('div'));
                    day_cell.firstChild.firstChild.setAttribute('class', 'calendar-daystring');
                    day_cell.firstChild.firstChild.innerText = current_day.toString('d');
                    day_cell.firstChild.appendChild(document.createElement('div'));
                    day_cell.firstChild.lastChild.setAttribute('class', 'calendar-day-victims');
                    if (current_day < today) {
                        past_schedule = true;
                        day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                        day_cell.firstChild.lastChild.lastChild.innerText = victim_string;
                        if (cal.oncall_groups[group].shadow == 1) {
                            day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                            day_cell.firstChild.lastChild.lastChild.innerText = shadow_string + ' (S)';
                        }
                        if (cal.oncall_groups[group].backup == 1) {
                            day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                            day_cell.firstChild.lastChild.lastChild.innerText = backup_string + ' (B)';
                        }
                    } else {
                        day_cell.firstChild.lastChild.innerHTML = '<input type="hidden" id="' + current_date_string + '-oncall" name="' + current_date_string + '-oncall" class="victim-week-' + oncall_week + '" value="' + victim_string + '">' +
                            '<input type="hidden" id="' + current_date_string + '-prev-oncall" name="' + current_date_string + '-prev-oncall" class="prev-victim-week-' + oncall_week + '" value="' + victim_string + '">' +
                            '<div><span>Oncall: </span><span id="' + current_date_string + '-oncall-menu" class="dropdown">' +
                            '<span data-toggle="dropdown"><button id="' + current_date_string + '-oncall-label" data-oncall-week="' + oncall_week + '">' + victim_string +
                            '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                            '<ul id="' + current_date_string + '-oncall-options" class="dropdown-menu" role="menu" data-day-id="' + current_date_string + '"></div></div>';
                        day_cell.firstChild.lastChild.lastChild.lastChild.lastChild.innerHTML = victim_options;
                        if (cal.oncall_groups[group].shadow == 1) {
                            shadow_fragment = document.createDocumentFragment();
                            shadow_fragment.appendChild(document.createElement('br'));
                            shadow_fragment.appendChild(document.createElement('input'));
                            shadow_fragment.lastChild.setAttribute('type', 'hidden');
                            shadow_fragment.lastChild.setAttribute('id', current_date_string + '-shadow');
                            shadow_fragment.lastChild.setAttribute('name', current_date_string + '-shadow');
                            shadow_fragment.lastChild.setAttribute('class', 'shadow-week-' + oncall_week);
                            shadow_fragment.lastChild.setAttribute('value', shadow_string);
                            shadow_fragment.appendChild(document.createElement('input'));
                            shadow_fragment.lastChild.setAttribute('type', 'hidden');
                            shadow_fragment.lastChild.setAttribute('id', current_date_string + '-prev-shadow');
                            shadow_fragment.lastChild.setAttribute('name', current_date_string + '-prev-shadow');
                            shadow_fragment.lastChild.setAttribute('class', 'prev-shadow-week' + oncall_week);
                            shadow_fragment.lastChild.setAttribute('value', shadow_string);
                            shadow_fragment.appendChild(document.createElement('div'));
                            shadow_fragment.lastChild.innerHTML = '<span>Shadow: </span>' +
                                '<span id="' + current_date_string + '-shadow-menu" class="dropdown"><span data-toggle="dropdown">' +
                                '<button id="' + current_date_string + '-shadow-label" data-shadow-week="' + oncall_week + '">' + shadow_string +
                                '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                                '<ul id="' + current_date_string + '-shadow-options" class="dropdown-menu role="menu" data-day-id="' + current_date_string + '"></span></ul>';
                            shadow_fragment.lastChild.lastChild.lastChild.innerHTML = shadow_options;
                            day_cell.firstChild.lastChild.appendChild(shadow_fragment);
                        }
                        if (cal.oncall_groups[group].backup == 1) {
                            backup_fragment = document.createDocumentFragment();
                            backup_fragment.appendChild(document.createElement('br'));
                            backup_fragment.appendChild(document.createElement('input'));
                            backup_fragment.lastChild.setAttribute('type', 'hidden');
                            backup_fragment.lastChild.setAttribute('id', current_date_string + '-backup');
                            backup_fragment.lastChild.setAttribute('name', current_date_string + '-backup');
                            backup_fragment.lastChild.setAttribute('class', 'backup-week-' + oncall_week);
                            backup_fragment.lastChild.setAttribute('value', backup_string);
                            backup_fragment.appendChild(document.createElement('input'));
                            backup_fragment.lastChild.setAttribute('id', current_date_string + '-prev-backup');
                            backup_fragment.lastChild.setAttribute('name', current_date_string + '=prev-backup');
                            backup_fragment.lastChild.setAttribute('class', 'prev-backup-week' + oncall_week);
                            backup_fragment.appendChild(document.createElement('div'));
                            backup_fragment.lastChild.innerHTML = '<span>Backup: </span>' +
                                '<span id="' + current_date_string + '-backup-menu" class="dropdown"><span data-toggle="dropdown">' +
                                '<button id="' + current_date_string + '-backup-label" data-backup-week="' + oncall_week + '">' + backup_string +
                                '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                                '<ul id="' + current_date_string + '-backup-options" class="dropdown-menu role="menu" data-day-id="' + current_date_string + '"></span></ul>';
                            backup_fragment.lastChild.lastChild.lastChild.innerHTML = backup_options;
                            day_cell.firstChild.lastChild.appendChild(backup_fragment);
                        }
                    }
                } else {
                    day_cell = document.createDocumentFragment();
                    day_cell.appendChild(document.createElement('td'));
                    day_cell.firstChild.setAttribute('id', current_date_string);
                    day_cell.firstChild.setAttribute('class', 'calendar-day prev-day');
                    day_cell.firstChild.appendChild(document.createElement('div'));
                    day_cell.firstChild.firstChild.setAttribute('class', 'calendar-daystring');
                    day_cell.firstChild.firstChild.innerText = current_day.toString('d');
                    day_cell.firstChild.appendChild(document.createElement('div'));
                    day_cell.firstChild.lastChild.setAttribute('class', 'calendar-day-victims');
                    if (! past_schedule) {
                        day_cell.firstChild.lastChild.innerHTML = '<input type="hidden" id="' + current_date_string + '-oncall" name="' + current_date_string + '-oncall" class="victim-week-' + oncall_week + '" value="' + victim_string + '">' +
                            '<input type="hidden" id="' + current_date_string + '-prev-oncall" name="' + current_date_string + '-prev-oncall" class="prev-victim-week-' + oncall_week + '" value="' + victim_string + '">';
                        if (cal.oncall_groups[group].shadow == 1) {
                            shadow_fragment = document.createDocumentFragment();
                            shadow_fragment.appendChild(document.createElement('br'));
                            shadow_fragment.appendChild(document.createElement('input'));
                            shadow_fragment.lastChild.setAttribute('type', 'hidden');
                            shadow_fragment.lastChild.setAttribute('id', current_date_string + '-shadow');
                            shadow_fragment.lastChild.setAttribute('name', current_date_string + '-shadow');
                            shadow_fragment.lastChild.setAttribute('class', 'shadow-week-' + oncall_week);
                            shadow_fragment.lastChild.setAttribute('value', shadow_string);
                            shadow_fragment.appendChild(document.createElement('input'));
                            shadow_fragment.lastChild.setAttribute('type', 'hidden');
                            shadow_fragment.lastChild.setAttribute('id', current_date_string + '-prev-shadow');
                            shadow_fragment.lastChild.setAttribute('name', current_date_string + '-prev-shadow');
                            shadow_fragment.lastChild.setAttribute('class', 'prev-shadow-week-' + oncall_week);
                            shadow_fragment.lastChild.setAttribute('value', shadow_string);
                            day_cell.firstChild.lastChild.appendChild(shadow_fragment);
                        }
                        if (cal.oncall_groups[group].backup == 1) {
                            backup_fragment = document.createDocumentFragment();
                            backup_fragment.appendChild(document.createElement('br'));
                            backup_fragment.appendChild(document.createElement('input'));
                            backup_fragment.lastChild.setAttribute('type', 'hidden');
                            backup_fragment.lastChild.setAttribute('id', current_date_string + '-backup');
                            backup_fragment.lastChild.setAttribute('name', current_date_string + '-backup');
                            backup_fragment.lastChild.setAttribute('class', 'backup-week-' + oncall_week);
                            backup_fragment.lastChild.setAttribute('value', backup_string);
                            backup_fragment.appendChild(document.createElement('input'));
                            backup_fragment.lastChild.setAttribute('type', 'hidden');
                            backup_fragment.lastChild.setAttribute('id', current_date_string + '-prev-backup');
                            backup_fragment.lastChild.setAttribute('name', current_date_string + '-prev-backup');
                            backup_fragment.lastChild.setAttribute('class', 'prev-backup-week-' + oncall_week);
                            backup_fragment.lastChild.setAttribute('value', backup_string);
                            day_cell.firstChild.lastChild.appendChild(backup_fragment);
                        }
                    }
                }
                week_row.firstChild.appendChild(day_cell);
                current_day.add(1).days();
            }
        }
        for (i=1; i<=cal.day_count; i++) {
            current_date_string = cal.current_year + '-' + cal.real_month + '-' + current_day.toString('d');
            calday = cal.victims.map[current_date_string];
            if (current_day.getDay() == 0) {
                if (typeof week_row !== "undefined") {
                    calendar_table_fragment.appendChild(week_row);
                    current_week++;
                }
                week_row = document.createDocumentFragment();
                week_row.appendChild(document.createElement('tr'));
                week_row.firstChild.setAttribute('id', 'week' + current_week);
            }
            if (current_day.getDay() === cal.oncall_groups[group].turnover_day) {
                oncall_week++;
                victim_string = '--';
                shadow_string = '--';
                backup_string = '--';
                if (typeof day_victims[calday] !== "undefined") {
                    if (typeof day_victims[calday].oncall !== "undefined" && day_victims[calday].oncall !== null) {
                        victim_string = day_victims[calday].oncall;
                    }
                    if (cal.oncall_groups[group].shadow == 1 && typeof day_victims[calday].shadow !== "undefined"
                        && day_victims[calday].shadow !== null) {
                        shadow_string = day_victims[calday].shadow;
                    }
                    if (cal.oncall_groups[group].backup == 1 && typeof day_victims[calday].backup !== "undefined"
                        && day_victims[calday].backup !== null) {
                        backup_string = day_victims[calday].backup;
                    }
                }
                day_cell = document.createDocumentFragment();
                day_cell.appendChild(document.createElement('td'));
                day_cell.firstChild.setAttribute('id', current_date_string);
                day_cell.firstChild.setAttribute('class', 'calendar-day');
                day_cell.firstChild.appendChild(document.createElement('div'));
                day_cell.firstChild.firstChild.setAttribute('class', 'calendar-daystring');
                day_cell.firstChild.firstChild.innerText = current_day.toString('d');
                day_cell.firstChild.appendChild(document.createElement('div'));
                day_cell.firstChild.lastChild.setAttribute('class', 'calendar-day-victims');
                if (current_day < today) {
                    past_schedule = true;
                    day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                    day_cell.firstChild.lastChild.lastChild.innerText = victim_string;
                    if (cal.oncall_groups[group].shadow == 1) {
                        day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                        day_cell.firstChild.lastChild.lastChild.innerText = shadow_string + ' (S)';
                    }
                    if (cal.oncall_groups[group].backup == 1) {
                        day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                        day_cell.firstChild.lastChild.lastChild.innerText = backup_string + ' (B)';
                    }
                } else {
                    past_schedule = false;
                    day_cell.firstChild.lastChild.innerHTML = '<input type="hidden" id="' + current_date_string + '-oncall" name="' + current_date_string + '-oncall" class="victim-week-' + oncall_week + '" value="' + victim_string + '">' +
                        '<input type="hidden" id="' + current_date_string + '-prev-oncall" name="' + current_date_string + '-prev-oncall" class="prev-victim-week-' + oncall_week + '" value="' + victim_string + '">' + '<div><span>Oncall: </span><span id="' + current_date_string + '-oncall-menu" class="dropdown">' +
                        '<span data-toggle="dropdown"><button id="' + current_date_string + '-oncall-label" data-oncall-week="' + oncall_week + '">' + victim_string +
                        '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                        '<ul id="' + current_date_string + '-oncall-options" class="dropdown-menu" role="menu" data-day-id="' + current_date_string + '"></div></div>';
                    day_cell.firstChild.lastChild.lastChild.lastChild.lastChild.innerHTML = victim_options;
                    if (cal.oncall_groups[group].shadow == 1) {
                        shadow_fragment = document.createDocumentFragment();
                        shadow_fragment.appendChild(document.createElement('br'));
                        shadow_fragment.appendChild(document.createElement('input'));
                        shadow_fragment.lastChild.setAttribute('type', 'hidden');
                        shadow_fragment.lastChild.setAttribute('id', current_date_string + '-shadow');
                        shadow_fragment.lastChild.setAttribute('name', current_date_string + '-shadow');
                        shadow_fragment.lastChild.setAttribute('class', 'shadow-week-' + oncall_week);
                        shadow_fragment.lastChild.setAttribute('value', shadow_string);
                        shadow_fragment.appendChild(document.createElement('input'));
                        shadow_fragment.lastChild.setAttribute('type', 'hidden');
                        shadow_fragment.lastChild.setAttribute('id', current_date_string + '-prev-shadow');
                        shadow_fragment.lastChild.setAttribute('name', current_date_string + '-prev-shadow');
                        shadow_fragment.lastChild.setAttribute('class', 'prev-shadow-week-' + oncall_week);
                        shadow_fragment.lastChild.setAttribute('value', shadow_string);
                        shadow_fragment.appendChild(document.createElement('div'));
                        shadow_fragment.lastChild.innerHTML = '<span>Shadow: </span>' +
                            '<span id="' + current_date_string + '-shadow-menu" class="dropdown"><span data-toggle="dropdown">' +
                            '<button id="' + current_date_string + '-shadow-label" data-shadow-week="' + oncall_week + '">' + shadow_string +
                            '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                            '<ul id="' + current_date_string + '-shadow-options" class="dropdown-menu role="menu" data-day-id="' + current_date_string + '"></span></ul>';
                        shadow_fragment.lastChild.lastChild.lastChild.innerHTML = shadow_options;
                        day_cell.firstChild.lastChild.appendChild(shadow_fragment);
                    }
                    if (cal.oncall_groups[group].backup == 1) {
                        backup_fragment = document.createDocumentFragment();
                        backup_fragment.appendChild(document.createElement('br'));
                        backup_fragment.appendChild(document.createElement('input'));
                        backup_fragment.lastChild.setAttribute('type', 'hidden');
                        backup_fragment.lastChild.setAttribute('id', current_date_string + '-backup');
                        backup_fragment.lastChild.setAttribute('name', current_date_string + '-backup');
                        backup_fragment.lastChild.setAttribute('class', 'backup-week-' + oncall_week);
                        backup_fragment.lastChild.setAttribute('value', backup_string);
                        backup_fragment.appendChild(document.createElement('input'));
                        backup_fragment.lastChild.setAttribute('type', 'hidden');
                        backup_fragment.lastChild.setAttribute('id', current_date_string + '-prev-backup');
                        backup_fragment.lastChild.setAttribute('name', current_date_string + '-prev-backup');
                        backup_fragment.lastChild.setAttribute('class', 'prev-backup-week-' + oncall_week);
                        backup_fragment.lastChild.setAttribute('value', backup_string);
                        backup_fragment.appendChild(document.createElement('div'));
                        backup_fragment.lastChild.innerHTML = '<span>Backup: </span>' +
                            '<span id="' + current_date_string + '-backup-menu" class="dropdown"><span data-toggle="dropdown">' +
                            '<button id="' + current_date_string + '-backup-label" data-backup-week="' + oncall_week + '">' + backup_string +
                            '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                            '<ul id="' + current_date_string + '-backup-options" class="dropdown-menu role="menu" data-day-id="' + current_date_string + '"></span></ul>';
                        backup_fragment.lastChild.lastChild.lastChild.innerHTML = backup_options;
                        day_cell.firstChild.lastChild.appendChild(backup_fragment);
                    }
                }
            } else {
                day_cell = document.createDocumentFragment();
                day_cell.appendChild(document.createElement('td'));
                day_cell.firstChild.setAttribute('id', current_date_string);
                day_cell.firstChild.setAttribute('class', 'calendar-day');
                day_cell.firstChild.appendChild(document.createElement('div'));
                day_cell.firstChild.firstChild.setAttribute('class', 'calendar-daystring');
                day_cell.firstChild.firstChild.innerText = current_day.toString('d');
                day_cell.firstChild.appendChild(document.createElement('div'));
                day_cell.firstChild.lastChild.setAttribute('class', 'calendar-day-victims');
                if (! past_schedule) {
                    day_cell.firstChild.lastChild.innerHTML = '<input type="hidden" id="' + current_date_string + '-oncall" name="' + current_date_string + '-oncall" class="victim-week-' + oncall_week + '" value="' + victim_string + '">' +
                        '<input type="hidden" id="' + current_date_string + '-prev-oncall" name="' + current_date_string + '-prev-oncall" class="prev-victim-week-' + oncall_week + '" value="' + victim_string + '">';
                    if (cal.oncall_groups[group].shadow == 1) {
                        shadow_fragment = document.createDocumentFragment();
                        shadow_fragment.appendChild(document.createElement('br'));
                        shadow_fragment.appendChild(document.createElement('input'));
                        shadow_fragment.lastChild.setAttribute('type', 'hidden');
                        shadow_fragment.lastChild.setAttribute('id', current_date_string + '-shadow');
                        shadow_fragment.lastChild.setAttribute('name', current_date_string + '-shadow');
                        shadow_fragment.lastChild.setAttribute('class', 'shadow-week-' + oncall_week);
                        shadow_fragment.lastChild.setAttribute('value', shadow_string);
                        shadow_fragment.appendChild(document.createElement('input'));
                        shadow_fragment.lastChild.setAttribute('type', 'hidden');
                        shadow_fragment.lastChild.setAttribute('id', current_date_string + '-prev-shadow');
                        shadow_fragment.lastChild.setAttribute('name', current_date_string + '-prev-shadow');
                        shadow_fragment.lastChild.setAttribute('class', 'prev-shadow-week-' + oncall_week);
                        shadow_fragment.lastChild.setAttribute('value', shadow_string);
                        day_cell.firstChild.lastChild.appendChild(shadow_fragment);
                    }
                    if (cal.oncall_groups[group].backup == 1) {
                        backup_fragment = document.createDocumentFragment();
                        backup_fragment.appendChild(document.createElement('br'));
                        backup_fragment.appendChild(document.createElement('input'));
                        backup_fragment.lastChild.setAttribute('type', 'hidden');
                        backup_fragment.lastChild.setAttribute('id', current_date_string + '-backup');
                        backup_fragment.lastChild.setAttribute('name', current_date_string + '-backup');
                        backup_fragment.lastChild.setAttribute('class', 'backup-week-' + oncall_week);
                        backup_fragment.lastChild.setAttribute('value', backup_string);
                        backup_fragment.appendChild(document.createElement('input'));
                        backup_fragment.lastChild.setAttribute('type', 'hidden');
                        backup_fragment.lastChild.setAttribute('id', current_date_string + '-prev-backup');
                        backup_fragment.lastChild.setAttribute('name', current_date_string + '-prev-backup');
                        backup_fragment.lastChild.setAttribute('class', 'prev-backup-week-' + oncall_week);
                        backup_fragment.lastChild.setAttribute('value', backup_string);
                        day_cell.firstChild.lastChild.appendChild(backup_fragment);
                    }
                }
            }
            if (current_date_string == today_string) {
                day_cell.firstChild.classList.add('today');
            }
            week_row.firstChild.appendChild(day_cell);
            current_day.add(1).days();
        }

        if (cal.post_month_padding > 0) {
            for (i=1; i<=cal.post_month_padding; i++) {
                current_date_string = cal.current_year + '-' + (cal.next_month + 1) + '-' + current_day.toString('d');
                calday = cal.victims.map[current_date_string];
                if (current_day.getDay() === cal.oncall_groups[group].turnover_day) {
                    victim_string = '--';
                    shadow_string = '--';
                    backup_string = '--';
                    if (typeof day_victims[calday] !== "undefined") {
                        if (typeof day_victims[calday].oncall !== "undefined" && day_victims[calday].oncall !== null) {
                            victim_string = day_victims[calday].oncall;
                        }
                        if (cal.oncall_groups[group].shadow == 1 && typeof day_victims[calday].shadow !== "undefined"
                            && day_victims[calday].shadow !== null) {
                            shadow_string = day_victims[calday].shadow;
                        }
                        if (cal.oncall_groups[group].backup == 1 && typeof day_victims[calday].backup !== "undefined"
                            && day_victims[calday].backup !== null) {
                            backup_string = day_victims[calday].backup;
                        }
                    }
                    oncall_week++;
                    day_cell = document.createDocumentFragment();
                    day_cell.appendChild(document.createElement('td'));
                    day_cell.firstChild.setAttribute('id', current_date_string);
                    day_cell.firstChild.setAttribute('class', 'calendar-day post-day');
                    day_cell.firstChild.appendChild(document.createElement('div'));
                    day_cell.firstChild.firstChild.setAttribute('class', 'calendar-daystring');
                    day_cell.firstChild.firstChild.innerText = current_day.toString('d');
                    day_cell.firstChild.appendChild(document.createElement('div'));
                    day_cell.firstChild.lastChild.setAttribute('class', 'calendar-day-victims');
                    if (current_day < today) {
                        past_schedule = true;
                        day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                        day_cell.firstChild.lastChild.lastChild.innerText = victim_string;
                        if (cal.oncall_groups[group].shadow == 1) {
                            day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                            day_cell.firstChild.lastChild.lastChild.innerText = shadow_string + ' (S)';
                        }
                        if (cal.oncall_groups[group].backup == 1) {
                            day_cell.firstChild.lastChild.appendChild(document.createElement('p'));
                            day_cell.firstChild.lastChild.lastChild.innerText = backup_string + ' (B)';
                        }
                    } else {
                        past_schedule = false;
                        day_cell.firstChild.lastChild.innerHTML = '<input type="hidden" id="' + current_date_string + '-oncall" name="' + current_date_string + '-oncall" class="victim-week-' + oncall_week + '" value="' + victim_string + '">' +
                            '<input type="hidden" id="' + current_date_string + '-prev-oncall" name="' + current_date_string + '-prev-oncall" class="prev-victim-week-' + oncall_week + '" value="' + victim_string + '">' + '<div><span>Oncall: </span><span id="' + current_date_string + '-oncall-menu" class="dropdown">' +
                            '<span data-toggle="dropdown"><button id="' + current_date_string + '-oncall-label" data-oncall-week="' + oncall_week + '">' + victim_string +
                            '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                            '<ul id="' + current_date_string + '-oncall-options" class="dropdown-menu" role="menu" data-day-id="' + current_date_string + '"></div></div>';
                        day_cell.firstChild.lastChild.lastChild.lastChild.lastChild.innerHTML = victim_options;
                        if (cal.oncall_groups[group].shadow == 1) {
                            shadow_fragment = document.createDocumentFragment();
                            shadow_fragment.appendChild(document.createElement('br'));
                            shadow_fragment.appendChild(document.createElement('input'));
                            shadow_fragment.lastChild.setAttribute('type', 'hidden');
                            shadow_fragment.lastChild.setAttribute('id', current_date_string + '-shadow');
                            shadow_fragment.lastChild.setAttribute('name', current_date_string + '-shadow');
                            shadow_fragment.lastChild.setAttribute('class', 'shadow-week-' + oncall_week);
                            shadow_fragment.lastChild.setAttribute('value', shadow_string);
                            shadow_fragment.appendChild(document.createElement('input'));
                            shadow_fragment.lastChild.setAttribute('type', 'hidden');
                            shadow_fragment.lastChild.setAttribute('id', current_date_string + '-prev-shadow');
                            shadow_fragment.lastChild.setAttribute('name', current_date_string + '-prev-shadow');
                            shadow_fragment.lastChild.setAttribute('class', 'prev-shadow-week-' + oncall_week);
                            shadow_fragment.lastChild.setAttribute('value', shadow_string);
                            shadow_fragment.appendChild(document.createElement('div'));
                            shadow_fragment.lastChild.innerHTML = '<span>Shadow: </span>' +
                                '<span id="' + current_date_string + '-shadow-menu" class="dropdown"><span data-toggle="dropdown">' +
                                '<button id="' + current_date_string + '-shadow-label" data-shadow-week="' + oncall_week + '">' + shadow_string +
                                '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                                '<ul id="' + current_date_string + '-shadow-options" class="dropdown-menu role="menu" data-day-id="' + current_date_string + '"></span></ul>';
                            shadow_fragment.lastChild.lastChild.lastChild.innerHTML = shadow_options;
                            day_cell.firstChild.lastChild.appendChild(shadow_fragment);
                        }
                        if (cal.oncall_groups[group].backup == 1) {
                            backup_fragment = document.createDocumentFragment();
                            backup_fragment.appendChild(document.createElement('br'));
                            backup_fragment.appendChild(document.createElement('input'));
                            backup_fragment.lastChild.setAttribute('type', 'hidden');
                            backup_fragment.lastChild.setAttribute('id', current_date_string + '-backup');
                            backup_fragment.lastChild.setAttribute('name', current_date_string + '-backup');
                            backup_fragment.lastChild.setAttribute('class', 'backup-week-' + oncall_week);
                            backup_fragment.lastChild.setAttribute('value', backup_string);
                            backup_fragment.lastChild.setAttribute('type', 'hidden');
                            backup_fragment.lastChild.setAttribute('id', current_date_string + '-prev-backup');
                            backup_fragment.lastChild.setAttribute('name', current_date_string + '-prev-backup');
                            backup_fragment.lastChild.setAttribute('class', 'prev-backup-week-' + oncall_week);
                            backup_fragment.lastChild.setAttribute('value', backup_string);
                            backup_fragment.appendChild(document.createElement('div'));
                            backup_fragment.lastChild.innerHTML = '<span>Backup: </span>' +
                                '<span id="' + current_date_string + '-backup-menu" class="dropdown"><span data-toggle="dropdown">' +
                                '<button id="' + current_date_string + '-backup-label" data-backup-week="' + oncall_week + '">' + backup_string +
                                '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                                '<ul id="' + current_date_string + '-backup-options" class="dropdown-menu role="menu" data-day-id="' + current_date_string + '"></span></ul>';
                            backup_fragment.lastChild.lastChild.lastChild.innerHTML = backup_options;
                            day_cell.firstChild.lastChild.appendChild(backup_fragment);
                        }
                    }
                } else {
                    day_cell = document.createDocumentFragment();
                    day_cell.appendChild(document.createElement('td'));
                    day_cell.firstChild.setAttribute('id', current_date_string);
                    day_cell.firstChild.setAttribute('class', 'calendar-day post-day');
                    day_cell.firstChild.appendChild(document.createElement('div'));
                    day_cell.firstChild.firstChild.setAttribute('class', 'calendar-daystring');
                    day_cell.firstChild.firstChild.innerText = current_day.toString('d');
                    day_cell.firstChild.appendChild(document.createElement('div'));
                    day_cell.firstChild.lastChild.setAttribute('class', 'calendar-day-victims');
                    if (!past_schedule) {
                        day_cell.firstChild.lastChild.innerHTML = '<input type="hidden" id="' + current_date_string + '-oncall" name="' + current_date_string + '-oncall" class="victim-week-' + oncall_week + '" value="--">' +
                            '<input type="hidden" id="' + current_date_string + '-prev-oncall" name="' + current_date_string + '-prev-oncall" class="prev-victim-week-' + oncall_week + '" value="--">';
                        if (cal.oncall_groups[group].shadow == 1) {
                            shadow_fragment = document.createDocumentFragment();
                            shadow_fragment.appendChild(document.createElement('br'));
                            shadow_fragment.appendChild(document.createElement('input'));
                            shadow_fragment.lastChild.setAttribute('type', 'hidden');
                            shadow_fragment.lastChild.setAttribute('id', current_date_string + '-shadow');
                            shadow_fragment.lastChild.setAttribute('name', current_date_string + '-shadow');
                            shadow_fragment.lastChild.setAttribute('class', 'shadow-week-' + oncall_week);
                            shadow_fragment.lastChild.setAttribute('value', shadow_string);
                            shadow_fragment.appendChild(document.createElement('input'));
                            shadow_fragment.lastChild.setAttribute('type', 'hidden');
                            shadow_fragment.lastChild.setAttribute('id', current_date_string + '-prev-shadow');
                            shadow_fragment.lastChild.setAttribute('name', current_date_string + '-prev-shadow');
                            shadow_fragment.lastChild.setAttribute('class', 'prev-shadow-week-' + oncall_week);
                            shadow_fragment.lastChild.setAttribute('value', shadow_string);
                            day_cell.firstChild.lastChild.appendChild(shadow_fragment);
                        }
                        if (cal.oncall_groups[group].backup == 1) {
                            backup_fragment = document.createDocumentFragment();
                            backup_fragment.appendChild(document.createElement('br'));
                            backup_fragment.appendChild(document.createElement('input'));
                            backup_fragment.lastChild.setAttribute('type', 'hidden');
                            backup_fragment.lastChild.setAttribute('id', current_date_string + '-backup');
                            backup_fragment.lastChild.setAttribute('name', current_date_string + '-backup');
                            backup_fragment.lastChild.setAttribute('class', 'backup-week-' + oncall_week);
                            backup_fragment.lastChild.setAttribute('value', backup_string);
                            backup_fragment.appendChild(document.createElement('input'));
                            backup_fragment.lastChild.setAttribute('type', 'hidden');
                            backup_fragment.lastChild.setAttribute('id', current_date_string + '-prev-backup');
                            backup_fragment.lastChild.setAttribute('name', current_date_string + '-prev-backup');
                            backup_fragment.lastChild.setAttribute('class', 'prev-backup-week-' + oncall_week);
                            backup_fragment.lastChild.setAttribute('value', backup_string);
                            day_cell.firstChild.lastChild.appendChild(backup_fragment);
                        }
                    }
                }
                week_row.firstChild.appendChild(day_cell);
                current_day.add(1).days();
            }
        }
        calendar_table_fragment.appendChild(week_row);

        if (cal.oncall_groups[group].turnover_day > 0) {
            calendar_table_fragment.appendChild(week_row);
            current_week++;
            week_row = document.createDocumentFragment();
            week_row.appendChild(document.createElement('tr'));
            week_row.firstChild.setAttribute('id', 'week' + current_week);
            for (i = 0; i <= 6; i++) {
                current_date_string = cal.current_year + '-' + (cal.next_month + 1) + '-' + current_day.toString('d');
                calday = cal.victims.map[current_date_string];
                victim_string = '--';
                shadow_string = '--';
                backup_string = '--';
                if (typeof day_victims[calday] !== "undefined") {
                    if (typeof day_victims[calday].oncall !== "undefined" && day_victims[calday].oncall !== null) {
                        victim_string = day_victims[calday].oncall;
                    }
                    if (cal.oncall_groups[group].shadow == 1 && typeof day_victims[calday].shadow !== "undefined"
                        && day_victims[calday].shadow !== null) {
                        shadow_string = day_victims[calday].shadow;
                    }
                    if (cal.oncall_groups[group].backup == 1 && typeof day_victims[calday].backup !== "undefined"
                        && day_victims[calday].backup !== null) {
                        backup_string = day_victims[calday].backup;
                    }
                }
                if (current_day.getDay() >= cal.oncall_groups[group].turnover_day) {
                    day_cell = document.createDocumentFragment();
                    day_cell.appendChild(document.createElement('td'));
                    day_cell.firstChild.setAttribute('class', 'calendar-day null-day');
                } else {
                    day_cell = document.createDocumentFragment();
                    day_cell.appendChild(document.createElement('td'));
                    day_cell.firstChild.setAttribute('id', current_date_string);
                    day_cell.firstChild.setAttribute('class', 'calendar-day post-day');
                    day_cell.firstChild.appendChild(document.createElement('div'));
                    day_cell.firstChild.firstChild.setAttribute('class', 'calendar-daystring');
                    day_cell.firstChild.firstChild.innerText = current_day.toString('d');
                    day_cell.firstChild.appendChild(document.createElement('div'));
                    day_cell.firstChild.lastChild.setAttribute('class', 'calendar-day-victims');
                    if (!past_schedule) {
                        day_cell.firstChild.lastChild.innerHTML = '<input type="hidden" id="' + current_date_string + '-oncall" name="' + current_date_string + '-oncall" class="victim-week-' + oncall_week + '" value="' + victim_string + '">' +
                            '<input type="hidden" id="' + current_date_string + '-prev-oncall" name="' + current_date_string + '-prev-oncall" class="prev-victim-week-' + oncall_week + '" value="' + victim_string + '">';
                        if (cal.oncall_groups[group].shadow == 1) {
                            shadow_fragment = document.createDocumentFragment();
                            shadow_fragment.appendChild(document.createElement('br'));
                            shadow_fragment.appendChild(document.createElement('input'));
                            shadow_fragment.lastChild.setAttribute('type', 'hidden');
                            shadow_fragment.lastChild.setAttribute('id', current_date_string + '-shadow');
                            shadow_fragment.lastChild.setAttribute('name', current_date_string + '-shadow');
                            shadow_fragment.lastChild.setAttribute('class', 'shadow-week-' + oncall_week);
                            shadow_fragment.lastChild.setAttribute('value', shadow_string);
                            shadow_fragment.appendChild(document.createElement('input'));
                            shadow_fragment.lastChild.setAttribute('type', 'hidden');
                            shadow_fragment.lastChild.setAttribute('id', current_date_string + '-prev-shadow');
                            shadow_fragment.lastChild.setAttribute('name', current_date_string + '-prev-shadow');
                            shadow_fragment.lastChild.setAttribute('class', 'prev-shadow-week-' + oncall_week);
                            shadow_fragment.lastChild.setAttribute('value', shadow_string);
                            day_cell.firstChild.lastChild.appendChild(shadow_fragment);
                        }
                        if (cal.oncall_groups[group].backup == 1) {
                            backup_fragment = document.createDocumentFragment();
                            backup_fragment.appendChild(document.createElement('br'));
                            backup_fragment.appendChild(document.createElement('input'));
                            backup_fragment.lastChild.setAttribute('type', 'hidden');
                            backup_fragment.lastChild.setAttribute('id', current_date_string + '-backup');
                            backup_fragment.lastChild.setAttribute('name', current_date_string + '-backup');
                            backup_fragment.lastChild.setAttribute('class', 'backup-week-' + oncall_week);
                            backup_fragment.lastChild.setAttribute('value', backup_string);
                            backup_fragment.appendChild(document.createElement('input'));
                            backup_fragment.lastChild.setAttribute('type', 'hidden');
                            backup_fragment.lastChild.setAttribute('id', current_date_string + '-prev-backup');
                            backup_fragment.lastChild.setAttribute('name', current_date_string + '-prev-backup');
                            backup_fragment.lastChild.setAttribute('class', 'prev-backup-week-' + oncall_week);
                            backup_fragment.lastChild.setAttribute('value', backup_string);
                            day_cell.firstChild.lastChild.appendChild(backup_fragment);
                        }
                    }
                }
                week_row.firstChild.appendChild(day_cell);
                current_day.add(1).days();
            }
        }
        calendar_table_fragment.appendChild(week_row);
        $('table#calendar-table').append(calendar_table_fragment);
    },
    go_to_next_month: function() {
        var cal = this;
        $('table#calendar-table').addClass('hide');
        $('table#calendar-table tbody').empty();
        $.when(cal.build_calendar(cal.next_month_year, cal.next_month)).then(
            function() {
                oncalendar.display_calendar();
                window.history.pushState(
                    '',
                    cal.current_year + '-' + cal.real_month,
                    '/calendar/' + cal.current_year + '/' + cal.real_month
                );
                $('table#calendar-table').removeClass('hide');
            }
        );
    },
    go_to_prev_month: function() {
        var cal = this;
        $('table#calendar-table').addClass('hide');
        $('table#calendar-table tbody').empty();
        $.when(cal.build_calendar(cal.previous_month_year, cal.previous_month)).then(
            function() {
                oncalendar.display_calendar();
                window.history.pushState(
                    '',
                    cal.current_year + '-' + cal.real_month,
                    '/calendar/' + cal.current_year + '/' + cal.real_month
                );
                $('table#calendar-table').removeClass('hide');
            }
        )
    },
    go_to_next_edit_month: function(edit_view) {
        var cal = this;
        $('table#calendar-table').addClass('hide');
        $('table#calendar-table tbody').empty();
        $.when(cal.build_calendar(cal.next_month_year, cal.next_month, cal.filter_group)).then(
            function() {
                if (edit_view === "day") {
                    oncalendar.display_calendar_edit(cal.filter_group);
                    window.history.pushState(
                        '',
                        cal.current_year + '-' + cal.real_month,
                        '/edit/month/' + cal.filter_group + '/' + cal.current_year + '/' + cal.real_month
                    );
                } else if (edit_view === "week") {
                    oncalendar.display_calendar_weekly_edit(cal.filter_group);
                    window.history.pushState(
                        '',
                        cal.current_year + '-' + cal.real_month,
                        '/edit/weekly/' + cal.filter_group + '/' + cal.current_year + '/' + cal.real_month
                    );
                }
                $('table#calendar-table').removeClass('hide');
            }
        );
    },
    go_to_prev_edit_month: function(edit_view) {
        var cal = this;
        $('table#calendar-table').addClass('hide');
        $('table#calendar-table tbody').empty();
        $.when(cal.build_calendar(cal.previous_month_year, cal.previous_month, cal.filter_group)).then(
            function() {
                if (edit_view === "day") {
                    oncalendar.display_calendar_edit(cal.filter_group);
                    window.history.pushState(
                        '',
                        cal.current_year + '-' + cal.real_month,
                        '/edit/month/' + cal.filter_group + '/' + cal.current_year + '/' + cal.real_month
                    );
                } else if (edit_view === "week") {
                    oncalendar.display_calendar_weekly_edit(cal.filter_group);
                    window.history.pushState(
                        '',
                        cal.current_year + '-' + cal.real_month,
                        '/edit/weekly/' + cal.filter_group + '/' + cal.current_year + '/' + cal.real_month
                    );
                }
                $('table#calendar-table').removeClass('hide');
            }
        );
    },
    get_calendar_victims: function(group) {
        var cal = this;
        if (group) {
            var get_calendar_victims_api = window.location.origin + '/api/calendar/month/' + cal.current_year + '/' + cal.real_month + '/' + group;
        } else {
            var get_calendar_victims_api = window.location.origin + '/api/calendar/month/' + cal.current_year + '/' + cal.real_month;
        }

        if (typeof cal.victims_api_request !== "undefined") {
            cal.victims_api_request.abort();
        }

        cal.victims_ajax_object = new $.Deferred();
        cal.victims_api_request = $.ajax({
            url: get_calendar_victims_api,
            type: 'GET',
            dataType: 'json'
        });
        var chain = cal.victims_api_request.then(function(data) {
            if (data.length == 0) {
                data = "No victims found";
            }
            return data;
        });

        chain.done(function(data) {
            cal.victims_ajax_object.resolve(data);
        });

        return cal.victims_ajax_object.promise();
    },
    get_group_info: function(group_id) {
        var cal = this;
        group_info_query_url = window.location.origin + '/api/groups/';
        if (typeof group_id !== "undefined") {
            group_info_query_url += group_id;
        }
        cal.group_info_object = new $.Deferred();
        cal.group_info_request = $.ajax({
            url: group_info_query_url,
            type: 'GET',
            dataType: 'json'
        });
        var chain = cal.group_info_request.then(function(data) {
            if (data.length == 0) {
                data = "No groups configured";
            }
            return data;
        });

        chain
            .done(function(data) {
                cal.group_info_object.resolve(data);
            })
            .fail(function(data) {
                var error = data.responseJSON.error_message;
                cal.group_info_object.reject(error);
            });

        return cal.group_info_object.promise();
    },
    get_last_group_edit: function(groupid) {
        var cal = this;
        var edit_query_url = window.location.origin + '/api/edits/' + groupid + '/last';
        cal.get_last_edit_object = new $.Deferred();
        cal.get_last_edit_request = $.ajax({
            url: edit_query_url,
            type: 'GET',
            dataType: 'json'
        });
        var chain = cal.get_last_edit_request.then(function(data) {
            if (Object.keys(data).length == 0) {
                data = {
                    ts: false,
                    updater: '',
                    note: "No schedule edits found"
                };
            }
            return data;
        });

        chain
            .done(function(data) {
                cal.get_last_edit_object.resolve(data);
            })
            .fail(function(data) {
                var error = data.responseJSON.error_message;
                cal.get_last_edit_object.reject(error);
            });

        return cal.get_last_edit_object.promise();
    },
    get_victims: function() {
        var cal = this;
        var victims_query_url = window.location.origin + '/api/victims/';
        cal.get_victims_object = new $.Deferred();
        cal.get_victims_request = $.ajax({
            url: victims_query_url,
            type: 'GET',
            dataType: 'json'
        });
        var chain = cal.get_victims_request.then(function(data) {
            if (data.length == 0) {
                data = "No users configured";
            }
            return data;
        });

        chain
            .done(function(data) {
                cal.get_victims_object.resolve(data);
            })
            .fail(function(data) {
                var error = data.responseJSON.error_message;
                cal.get_victims_object.reject(error);
            });

        return cal.get_victims_object.promise();
    },
    get_victim_info: function(key, victim_id) {
        var cal = this;
        var victim_info_url = window.location.origin + '/api/victim/' + key + '/' + victim_id;
        cal.get_victim_info_object = new $.Deferred();
        cal.get_victim_info_request = $.ajax({
            url: victim_info_url,
            type: 'GET',
            dataType: 'json'
        });
        var chain = cal.get_victim_info_request.then(function(data) {
            if (data.length == 0) {
                data = "User not found";
            }
            return data;
        });

        chain
            .done(function(data) {
                cal.get_victim_info_object.resolve(data);
            })
            .fail(function(data) {
                var error = data.responseJSON.error_message;
                cal.get_victim_info_object.reject(error);
            });

        return cal.get_victim_info_object.promise();
    },
    update_victim_info: function(victim_id, victim_data) {
        var update_victim_url = window.location.origin + '/api/victim/' + victim_id;
        var update_victim_info_object = new $.Deferred();
        var update_victim_info_request = $.ajax({
            url: update_victim_url,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(victim_data),
            dataType: 'json'
        }),
        chain = update_victim_info_request.then(function(data) {
            return(data);
        });

        chain
            .done(function(data) {
                update_victim_info_object.resolve(data);
            })
            .fail(function(data) {
                var error = data.responseText.error_message;
                update_victim_info_object.reject(error);
            });

        return update_victim_info_object.promise();

    },
    update_victim_status: function(victims_data) {
        update_victim_status_url = window.location.origin + '/api/admin/group/victims';
        var update_victim_status_object = new $.Deferred();
        var update_victim_status_request = $.ajax({
                url: update_victim_status_url,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(victims_data),
                dataTye: 'json'
            }),
            chain = update_victim_status_request.then(function(data) {
                return (data);
            });

        chain
            .done(function(data) {
                update_victim_status_object.resolve(data);
            })
            .fail(function(data) {
                var error = data.responseJSON.error_message;
                update_victim_status_object.reject(error);
            });

        return update_victim_status_object.promise();

    },
    add_new_victim: function(victim_data) {
        var add_victim_url = window.location.origin + '/api/admin/victim/add';
        var add_victim_object = new $.Deferred();
        var add_victim_request = $.ajax({
                url: add_victim_url,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(victim_data),
                dataType: 'json'
            }),
            chain = add_victim_request.then(function(data) {
                return(data);
            });

        chain
            .done(function(data) {
                if ($.inArray('api_error_status', Object.keys(data)) != -1) {
                    add_victim_object.reject(data.api_error_message);
                } else {
                    add_victim_object.resolve(data);
                }
            })
            .fail(function(data) {
                var error = data.responseJSON.error_message;
                add_victim_object.reject(error);
            });

        return add_victim_object.promise();

    },
    delete_victim: function(victim_id) {
        var delete_victim_url = window.location.origin + '/api/admin/victim/delete/' + victim_id;
        var delete_victim_object = new $.Deferred();
        var delete_victim_request = $.ajax({
            url: delete_victim_url,
            type: 'GET',
            dataType: 'json'
        }),
        chain = delete_victim_request.then(function(data) {
            return data;
        });

        chain
            .done(function(data) {
                if ($.inArray('api_error_status', Object.keys(data)) != -1) {
                    delete_victim_object.reject(data.api_error_message);
                } else {
                    delete_victim_object.resolve(data);
                }
            })
            .fail(function(data) {
                var error = data.responseJSON.error_message;
                delete_victim_object.reject(error);
            });

        return delete_victim_object.promise();
    },
    update_group: function(group_data) {
        var update_group_object = new $.Deferred();
        var update_group_url = window.location.origin + '/api/admin/group/update';
        var update_group_request = $.ajax({
                url: update_group_url,
                type: 'POST',
                contentType: 'application/json',
                data: JSON.stringify(group_data),
                dataType: 'json'
            }),
            chain = update_group_request.then(function(data) {
                return data;
            });

        chain
            .done(function(data) {
                update_group_object.resolve(data);
            })
            .fail(function(data) {
                var error = data.responseJSON.error_message;
                update_group_object.reject(error);
            });

        return update_group_object.promise();
    },
    add_new_group: function(group_data) {
        var add_group_url = window.location.origin + '/api/admin/group/add';
        var add_group_object = new $.Deferred();
        var add_group_request = $.ajax({
            url: add_group_url,
            type: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(group_data),
            dataType: 'json'
        }),
        chain = add_group_request.then(function(data) {
            return data;
        });

        chain
            .done(function(data) {
                add_group_object.resolve(data);
            })
            .fail(function(data) {
                var error = data.responseJSON.error_message;
                add_group_object.reject(error);
            });

        return add_group_object.promise();
    },
    delete_group: function(group_id) {
        var delete_group_url = window.location.origin + '/api/admin/group/delete/' + group_id;
        var delete_group_object = new $.Deferred();
        var delete_group_request = $.ajax({
            url: delete_group_url,
            type: 'GET',
            dataType: 'json'
        }),
        chain = delete_group_request.then(function(data) {
            return data;
        });

        chain
            .done(function(data) {
                delete_group_object.resolve(data);
            })
            .fail(function(data) {
                var error = data.responseJSON.error_message;
                delete_group_object.reject(error);
            });

        return delete_group_object.promise();
    },
    get_calendar_end: function() {
        var calendar_end_object = new $.Deferred();
        var calendar_end_url = window.location.origin + '/api/calendar/end';
        var calendar_end_request = $.ajax({
            url: calendar_end_url,
            type: 'GET',
            dataType: 'json'
        });
        var chain = calendar_end_request.then(function(data) {
            return data;
        });

        chain
            .done(function(data) {
                calendar_end_object.resolve(data);
            })
            .fail(function(data) {
                var error = $.parseJSON(data.responseText);
                calendar_end_object.reject(error);
            });

        return calendar_end_object.promise();
    },
    extend_calendar: function(extend_days) {
        var calendar_extend_object = new $.Deferred();
        var extend_calendar_url = window.location.origin + '/api/admin/calendar/extend/' + extend_days;
        var calendar_extend_request = $.ajax({
            url: extend_calendar_url,
            type: 'GET',
            dataType: 'json'
        });
        var chain = calendar_extend_request.then(function(data) {
            return data;
        });

        chain
            .done(function(data) {
                calendar_extend_object.resolve(data);
            })
            .fail(function(data) {
                var error = $.parseJSON(data.responseText);
                calendar_extend_object.reject(error);
            });

        return calendar_extend_object.promise();
    },
    update_month: function(month_data) {
        var update_month_object = new $.Deferred();
        var update_month_url = window.location.origin + '/api/calendar/month';
        var update_month_request = $.ajax({
            url: update_month_url,
            type: 'POST',
            data: JSON.stringify(month_data),
            contentType: 'application/json; charset=utf-8',
            dataType: 'json'
        }),
        chain = update_month_request.then(function(data) {
            return data;
        });

        chain
            .done(function(data) {
                update_month_object.resolve(data);
            })
            .fail(function(data) {
                var error = data.responseJSON.error_message;
                update_month_object.reject(error);
            });

        return update_month_object.promise();
    },
    update_day: function(day_data) {
        var update_day_object = new $.Deferred();
        var update_day_url = window.location.origin + '/api/calendar/update/day';
        var update_day_request = $.ajax({
            url: update_day_url,
            type: 'POST',
            data: JSON.stringify(day_data),
            contentType: 'application/json; charset=utf-8',
            dataType: 'json'
        }),
            chain = update_day_request.then(function(data) {
                return data;
            });

        chain
            .done(function(data) {
                update_day_object.resolve(data);
            })
            .fail(function(data) {
                var error = data.responseJSON.error_message;
                update_day_object.reject(error);
            });

        return update_day_object.promise();
    },
    send_oncall_sms: function(group, sender, message) {
        var send_oncall_sms_object = new $.Deferred();
        var send_oncall_sms_url = window.location.origin + '/api/notification/sms/oncall/' + group;
        var oncall_sms_data = {
            type: 'adhoc',
            sender: sender,
            body: message
        };
        var send_oncall_sms_request = $.ajax({
            url: send_oncall_sms_url,
            type: 'POST',
            data: oncall_sms_data,
            dataType: 'json'
        }),
            chain = send_oncall_sms_request.then(function(data) {
                return data;
            });

        chain
            .done(function(data) {
                if (data.sms_status === "ERROR") {
                    send_oncall_sms_object.reject(data.sms_error);
                } else {
                    send_oncall_sms_object.resolve(data);
                }

            })
            .fail(function(data) {
                var error = data.responseJSON.error_message;
                send_oncall_sms_object.reject(error);
            });

        return send_oncall_sms_object.promise();
    },
    send_panic_sms: function(group, sender, message) {
        var send_panic_sms_object = new $.Deferred();
        var send_panic_sms_url = window.location.origin + '/api/notification/sms/group/' + group;
        var panic_sms_data = {
            type: 'adhoc',
            sender: sender,
            body: message
        };
        var send_panic_sms_request = $.ajax({
            url: send_panic_sms_url,
            type: 'POST',
            data: panic_sms_data,
            dataType: 'json'
        }),
            chain = send_panic_sms_request.then(function(data) {
                return data;
            });

        chain
            .done(function(data) {
                if (data.sms_status === "ERROR") {
                    send_panic_sms_object.reject(data.sms_error);
                } else {
                    send_panic_sms_object.resolve(data);
                }
            })
            .fail(function(data) {
                var error = data.responseJSON.error_message;
                send_panic_sms_object.reject(error);
            });

        return send_panic_sms_object.promise();
    }
};
