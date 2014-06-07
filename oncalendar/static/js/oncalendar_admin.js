/**
 * Author: Mark Troyer <disco@box.com>
 * Created: 8 Dec 2013
 */

var cal_months = {
    01: 'January',
    02: 'February',
    03: 'March',
    04: 'April',
    05: 'May',
    06: 'June',
    07: 'July',
    08: 'August',
    09: 'September',
    10: 'October',
    11: 'November',
    12: 'December'
};
var cal_days = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday'
];
var app_roles = [
    'User',
    'Group Admin',
    'App Admin'
];
var basic_boolean = ['No', 'Yes'];

var oncalendar_admin = {
    confirm_config: function() {
        var oca = this;
        oca.config_data = oca.get_config_data();
        var expected_keys = ['DBHOST', 'DBUSER', 'DBPASSWORD', 'DBNAME'];
        var missing_keys = [];
        $.each(expected_keys, function(i, key) {
            if (typeof oca.config_data[key] === "undefined") {
                missing_keys.push(key);
            }
        });
        console.log(missing_keys);
        if (missing_keys.length) {
            return false;
        } else {
            return true;
        }
    },
    populate_admin_console: function() {
        var oca = this;
        var group_display_keys = [
            'id',
            'name',
            'active',
            'autorotate',
            'turnover_day',
            'turnover_time',
            'shadow',
            'backup',
            'failsafe',
            'alias',
            'backup_alias',
            'failsafe_alias',
            'email',
            'auth_group'
        ];
        var victim_display_keys = [
            'id',
            'active',
            'username',
            'firstname',
            'lastname',
            'phone',
            'email',
            'sms_email',
            'app_role',
            'groups'
        ];
        var groups_list = {};

        $('#config-tab').addClass('selected');
        $('#config-panel-data').append('<table id="config-table" class="admin-table"></table>');
        var config_table = $('table#config-table');
        config_table.append('<tr class="config-item"><th class="config-key">DB Host</th>' +
            '<td id="config-dbhost" class="config-value">' + oca.config_data.DBHOST + '</td></tr>');
        config_table.append('<tr class="config-item"><th class="config-key">DB User</th>' +
            '<td id="config-dbuser" class="config-value">' + oca.config_data.DBUSER + '</td></tr>');
        config_table.append('<tr class="config-item"><th class="config-key">DB Password</th>' +
            '<td id="config-dbpassword" class="config-value">********</td></tr>');
        config_table.append('<tr class="config-item"><th class="config-key">DB Name</th>' +
            '<td id="config-dbname" class="config-value">' + oca.config_data.DBNAME + '</td></tr>');

        $('#config-edit').click(function() {
            var td_host = $('td#config-dbhost'),
                td_user = $('td#config-dbuser'),
                td_password = $('td#config-dbpassword'),
                td_name = $('td#config-dbname');
            if (td_host.has('input').length) {
                return;
            }
            var dbhost = td_host.text();
            td_host.empty().append('<input type="text" id="dbhost-input" name="DBHOST" value="' + dbhost + '">');
            var dbuser = td_user.text();
            td_user.empty().append('<input type="text" id="dbuser-input" name="DBUSER" value="' + dbuser + '">');
            td_password.empty().append('<input type="password" id="dbpassword-input" name="DBPASSWORD" value="">')
                .parent('tr').after('<tr id="confirm-password-row" class="config-item"><td class="config-key">Reenter password</td>' +
                    '<td id="confirm-dbpassword" class="config-value">' +
                    '<input type="password" id="dbpassword-confirm-input" name="dbpassword-config" value=""></input></td></tr>');
            var dbname = td_name.text();
            td_name.empty().append('<input type="text" id="dbname-input" name="DBNAME" value="' + dbname + '">');
            $('#config-table').append('<tr id="config-edit-buttons" class="config-item">' +
                '<td><button id="cancel-config-edit">Cancel</button></td>' +
                '<td><button id="save-config-edit">Save</button></td></tr>');
        });
        $('#config-panel-data').on('click', 'button#cancel-config-edit', function() {
            var dbhost = $('input#dbhost-input').val(),
                dbuser = $('input#dbuser-input').val(),
                dbname = $('input#dbname-input').val();
            $('tr#confirm-password-row').remove();
            $('tr#config-edit-buttons').remove();
            $('td#config-dbhost').empty().text(dbhost);
            $('td#config-dbuser').empty().text(dbuser);
            $('td#config-dbpassword').empty().text('********');
            $('td#config-dbname').empty().text(dbname);
        });
        $('#config-panel-data').on('click', 'button#save-config-edit', function() {
            var new_config_data = {
                DBHOST: $('input#dbhost-input').val(),
                DBUSER: $('input#dbuser-input').val(),
                DBPASSWORD: $('input#dbpassword-input').val(),
                DBNAME: $('input#dbname-input').val()
            };
            $.when(oca.update_configuration(new_config_data)).then(
                function(data) {
                    $('tr#confirm-password-row').remove();
                    $('tr#config-edit-buttons').remove();
                    $('td#config-dbhost').empty().text(data.DBHOST);
                    $('td#config-dbuser').empty().text(data.DBUSER);
                    $('td#config-password').empty().text('********');
                    $('td#config-dbname').empty().text(data.DBNAME);
                },
                function(data) {
                    var dbhost = $('input#dbhost-input').val(),
                        dbuser = $('input#dbuser-input').val(),
                        dbname = $('input#dbname-input').val();
                    $('#config-panel-buttons').append('<div class="alert-box">Could not save config: ' + data[1] + '</div>');
                    $('tr#confirm-password-row').remove();
                    $('tr#config-edit-buttons').remove();
                    $('td#config-dbhost').empty().text(dbhost);
                    $('td#config-dbuser').empty().text(dbuser);
                    $('td#config-dbpassword').empty().text('********');
                    $('td#config-dbname').empty().text(dbname);
                }
            );
        });

        $.when(oncalendar.get_group_info()).then(
            function(data) {
                oca.no_groups = true;
                var groups_panel = $('#groups-panel-data');
                groups_panel.append('<table id="groups-table" class="admin-table"><tr id="groups-table-header"></tr></table>');
                if (typeof data === "string") {
                    $('#groups-table-header').append('<th>' + data + '</th>');
                } else {
                    oca.no_groups = false;
                    $('#groups-table-header').append('<th></th><th></th>');
                    $.each(group_display_keys, function(i, key) {
                        $('#groups-table-header').append('<th class="caps">' + key.replace('_',' ') +'</th>');
                    });
                    $.each(data, function(index, row) {
                        groups_list[row.name] = row.id;
                        $('#groups-table').append('<tr id="group' + row.id + '"></tr>');
                        console.log(row);
                        if (row.turnover_hour < 10) {
                            row.turnover_hour = '0' + row.turnover_hour;
                        }
                        if (row.turnover_min < 10) {
                            row.turnover_min = '0' + row.turnover_min;
                        }
                        var turnover_time = [row.turnover_hour, row.turnover_min].join(':');
                        var table_row = $('#group' + row.id);
                        table_row.append('<td><button id="group-checkbox-' + row.id + '" class="oc-checkbox elegant_icons icon_box-empty" data-target="group-select-' + row.id + '" data-checked="no"></button>' +
                            '<input type="hidden" id="group-select-' + row.id + '" name="group-select-' + row.id + '" value="0" data-type="group-select" data-name="' + row.name + '" data-id="' + row.id + '"></td>' +
                            '<td><button id="edit-group-' + row.id + '" class="group-edit elegant_icons icon_pencil-edit"></button></td>' +
                            '<td class="group-id">' + row.id + '</td>' +
                            '<td class="group-name">' + row.name + '</td>' +
                            '<td class="group-active">' + basic_boolean[row.active] + '</td>' +
                            '<td class="group-autorotate">' + basic_boolean[row.autorotate] + '</td>' +
                            '<td class="group-turnover-day">' + cal_days[row.turnover_day] + '</td>' +
                            '<td class="group-turnover-time">' + turnover_time + '</td>' +
                            '<td class="group-shadow">' + basic_boolean[row.shadow] + '</td>' +
                            '<td class="group-backup">' + basic_boolean[row.backup] + '</td>' +
                            '<td class="group-failsafe">' + basic_boolean[row.failsafe] + '</td>' +
                            '<td class="group-alias">' + row.alias + '</td>' +
                            '<td class="group-backup-alias">' + row.backup_alias + '</td>' +
                            '<td class="group-failsafe-alias">' + row.failsafe_alias + '</td>' +
                            '<td class="group-email">' + row.email + '</td>' +
                            '<td class="group-auth-group">' + row.auth_group + '</td>'
                        );
                    });
                }
            },
            function(data) {
                $('#groups-panel-buttons').append('<div class="alert-box">' + data[1] + '</div>');
            }
        );
        $('#groups-panel-data').on('click', 'button.group-edit', function() {
            var group_row = $(this).parent('td').parent('tr');
            var group_data = {};
            group_data.id = group_row.children('td.group-id').text();
            group_data.name = group_row.children('td.group-name').text();
            group_data.active = group_row.children('td.group-active').text();
            group_data.autorotate = group_row.children('td.group-autorotate').text();
            group_data.turnover_day = group_row.children('td.group-turnover-day').text();
            group_data.turnover_time = group_row.children('td.group-turnover-time').text();
            group_data.shadow = group_row.children('td.group-shadow').text();
            group_data.backup = group_row.children('td.group-backup').text();
            group_data.failsafe = group_row.children('td.group-failsafe').text();
            group_data.alias = group_row.children('td.group-alias').text();
            group_data.backup_alias = group_row.children('td.group-backup-alias').text();
            group_data.failsafe_alias = group_row.children('td.group-failsafe-alias').text();
            group_data.email = group_row.children('td.group-email').text();
            group_data.auth_group = group_row.children('td.group-auth-group').text();

            group_row.before('<tr id="edit-group-form"></tr>');
            $('tr#edit-group-form').append('<td colspan="2"></td>' +
                '<td><input type="hidden" id="edit-group-id" name="edit-group-id" value="' + group_data.id + '">' + group_data.id +'</td>' +
                '<td><input type="text" id="edit-group-name" name="edit-group-name" value="' + group_data.name + '"></td>' +
                '<td><button id="edit-group-active-checkbox" class="oc-checkbox elegant_icons icon_box-empty" data-target="edit-group-active" data-checked="no"></button>' +
                '<input type="hidden" id="edit-group-active" name="edit-group-active" value="0"></td>' +
                '<td><button id="edit-group-autorotate-checkbox" class="oc-checkbox elegant_icons icon_box-empty" data-target="edit-group-autorotate" data-checked="no"></button>' +
                '<input type="hidden" id="edit-group-autorotate" name="edit-group-autorotate" value="0"></td>' +
                '<td><span id="edit-group-turnover-day-menu" class="dropdown"><span data-toggle="dropdown">' +
                '<button id="edit-group-turnover-day-label">' + group_data.turnover_day + '<span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                '<ul id="edit-group-turnover-day-options" class="dropdown-menu" role="menu">' +
                '<li><span data-day="1">Monday</span></li>' +
                '<li><span data-day="2">Tuesday</span></li>' +
                '<li><span data-day="3">Wednesday</span></li>' +
                '<li><span data-day="4">Thursday</span></li>' +
                '<li><span data-day="5">Friday</span></li>' +
                '<li><span data-day="6">Saturday</span></li>' +
                '<li><span data-day="0">Sunday</span></li>' +
                '</ul></span></span><input type="hidden" id="edit-group-turnover-day" name="edit-group-turnover-day" value="' + cal_days.indexOf(group_data.turnover_day) + '"></td>' +
                '<td><span id="edit-group-turnover-hour-menu" class="dropdown"><span data-toggle="dropdown">' +
                '<button id="edit-group-turnover-hour-label">09 <span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                '<ul id="edit-group-turnover-hour-options" class="dropdown-menu" role="menu">' +
                '<li><span data-hour="00">00</span></li>' +
                '<li><span data-hour="01">01</span></li>' +
                '<li><span data-hour="02">02</span></li>' +
                '<li><span data-hour="03">03</span></li>' +
                '<li><span data-hour="04">04</span></li>' +
                '<li><span data-hour="05">05</span></li>' +
                '<li><span data-hour="06">06</span></li>' +
                '<li><span data-hour="07">07</span></li>' +
                '<li><span data-hour="08">08</span></li>' +
                '<li><span data-hour="09">09</span></li>' +
                '<li><span data-hour="10">10</span></li>' +
                '<li><span data-hour="11">11</span></li>' +
                '<li><span data-hour="12">12</span></li>' +
                '<li><span data-hour="13">13</span></li>' +
                '<li><span data-hour="14">14</span></li>' +
                '<li><span data-hour="15">15</span></li>' +
                '<li><span data-hour="16">16</span></li>' +
                '<li><span data-hour="17">17</span></li>' +
                '<li><span data-hour="18">18</span></li>' +
                '<li><span data-hour="19">19</span></li>' +
                '<li><span data-hour="20">20</span></li>' +
                '<li><span data-hour="21">21</span></li>' +
                '<li><span data-hour="22">22</span></li>' +
                '<li><span data-hour="23">23</span></li>' +
                '</ul></span><input type="hidden" id="edit-group-turnover-hour" name="edit-group-turnover-hour" value="09" size="2">' +
                ':<span id="edit-group-turnover-min-menu" class="dropdown"><span data-toggle="dropdown">' +
                '<button id="edit-group-turnover-min-label">30 <span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                '<ul id="edit-group-turnover-min-options" class="dropdown-menu" role="menu">' +
                '<li><span data-min="00">00</span></li>' +
                '<li><span data-min="30">30</span></li>' +
                '</ul></span><input type="hidden" id="edit-group-turnover-min" name="edit-group-turnover-min" value="30" size="2"></td>' +
                '<td><button id="edit-group-shadow-checkbox" class="oc-checkbox elegant_icons icon_box-empty" data-target="edit-group-shadow" data-checked="no"></button>' +
                '<input type="hidden" id="edit-group-shadow" name="add-group-shadow" value="0"></td>' +
                '<td><button id="edit-group-backup-checkbox" class="oc-checkbox elegant_icons icon_box-empty" data-target="edit-group-backup" data-checked="no"></button>' +
                '<input type="hidden" id="edit-group-backup" name="edit-group-backup" value="0"></td>' +
                '<td><button id="edit-group-failsafe-checkbox" class="oc-checkbox elegant_icons icon_box-empty" data-target="edit-group-failsafe" data-checked="no"></button>' +
                '<input type="hidden" id="edit-group-failsafe" name="edit-group-failsafe" value="0"></td>' +
                '<td><input type="text" id="edit-group-alias" name="edit-group-alias" value=""></td>' +
                '<td><input type="text" id="edit-group-backup-alias" name="edit-group-backup-alias" value=""></td>' +
                '<td><input type="text" id="edit-group-failsafe-alias" name="edit-group-failsafe-alias" value=""></td>' +
                '<td><input type="text" id="edit-group-email" name="edit-group-email" value=""></td>' +
                '<td><input type="text" id="edit-group-auth-group" name="edit-group-auth-group" value=""></td>'
            );
            $('tr#edit-group-form').after('<tr id="edit-group-buttons">' +
                '<td colspan="3"></td>' +
                '<td><button id="cancel-edit-group">Cancel</button></td>' +
                '<td colspan="12"><button id="save-edit-group">Save</button></td></tr>');
            $('#edit-group-turnover-day-options').on('click', 'span', function() {
                $('#edit-group-turnover-day-label').text(cal_days[$(this).attr('data-day')]).append(' <span class="elegant_icons arrow_carrot-down">');
                $('input#edit-group-turnover-day').attr('value', $(this).attr('data-day'));
            });
            $('#edit-group-turnover-hour-options').on('click', 'span', function() {
                $('#edit-group-turnover-hour-label').text($(this).attr('data-hour')).append(' <span class="elegant_icons arrow_carrot-down">');
                $('input#edit-group-turnover-hour').attr('value', $(this).attr('data-hour'));
            });
            $('#edit-group-turnover-min-options').on('click', 'span', function() {
                $('#edit-group-turnover-min-label').text($(this).attr('data-min')).append(' <span class="elegant_icons arrow_carrot-down">');
                $('input#edit-group-turnover-min').attr('value', $(this).attr('data-min'));
            });
            if (group_data.active === "Yes") {
                $('button#edit-group-active-checkbox')
                    .removeClass('icon_box-empty')
                    .addClass('icon_box-checked')
                    .attr('data-checked', 'yes');
                $('input#edit-group-active').attr('value', 1);
            }
            if (group_data.autorotate === "Yes") {
                $('button#edit-group-autorotate-checkbox')
                    .removeClass('icon_box-empty')
                    .addClass('icon_box-checked')
                    .attr('data-checked', 'yes');
                $('input#edit-group-autorotate').attr('value', 1);
            }
            var turn_time = group_data.turnover_time.split(':');
            $('button#edit-group-turnover-hour-label').text(turn_time[0]).append(' <span class="elegant_icons arrow_carrot-down">');
            $('input#edit-group-turnover-hour').attr('value', turn_time[0]);
            $('button#edit-group-turnover-min-label').text(turn_time[1]).append(' <span class="elegant_icons arrow_carrot-down">');
            $('input#edit-group-turnover-min').attr('value', turn_time[1]);
            if (group_data.shadow === "Yes") {
                $('button#edit-group-shadow-checkbox')
                    .removeClass('icon_box-empty')
                    .addClass('icon_box-checked')
                    .attr('data-checked', 'yes');
                $('input#edit-group-shadow').attr('value', 1);
            }
            if (group_data.backup === "Yes") {
                $('button#edit-group-backup-checkbox')
                    .removeClass('icon_box-empty')
                    .addClass('icon_box-checked')
                    .attr('data-checked', 'yes');
                $('input#edit-group-backup').attr('value', 1);
            }
            if (group_data.failsafe === "Yes") {
                $('button#edit-group-failsafe-checkbox')
                    .removeClass('icon_box-empty')
                    .addClass('icon_box-checked')
                    .attr('data-checked', 'yes');
                $('input#edit-group-failsafe').attr('value', 1);
            }
            $.each(['alias', 'backup_alias', 'failsafe_alias', 'email', 'auth_group'], function(i, field) {
                $('input#edit-group-' + field.replace('_', '-')).attr('value', group_data[field]);
            });
            group_row.addClass('hide');
        });
        $('#groups-panel-data').on('click', 'button#cancel-edit-group', function() {
            $('tr#edit-group-buttons').remove();
            $('tr#edit-group-form').remove();
            $('#groups-table tr.hide').removeClass('hide');
        });
        $('#groups-panel-data').on('click', 'button#save-edit-group', function() {
            var group_data = {};
            $.each($('tr#edit-group-form').children('td').has('input'), function(index, element) {
                var el_input = $(element).children('input');
                if (el_input.length > 1) {
                    group_data.turnover_hour = $(element).children('input#edit-group-turnover-hour').val();
                    group_data.turnover_min = $(element).children('input#edit-group-turnover-min').val();
                    group_data.turnover_time = [group_data.turnover_hour, group_data.turnover_min].join(':');
                } else {
                    var form_key = el_input.attr('id').replace('edit-group-', '').replace('-', '_');
                    group_data[form_key] = el_input.val();
                }
            });
            $.when(oncalendar.update_group(group_data)).then(
                function(data) {
                    if (data.turnover_hour < 10) {
                        data.turnover_hour = '0' + data.turnover_hour;
                    }
                    if (data.turnover_min < 10) {
                        data.turnover_min = '0' + data.turnover_min;
                    }
                    var group_row = $('#groups-table').children('tbody').children('tr#group' + data.id);
                    data.turnover_time = [data.turnover_hour, data.turnover_min].join(':');
                    var booleans = ['active', 'autorotate', 'shadow', 'backup', 'failsafe'];
                    $.each(data, function(key, value) {
                        if ($.inArray(key, booleans) !== -1) {
                            group_row.children('td.group-' + key).text(basic_boolean[value]);
                        } else if (key === "turnover_day") {
                            group_row.children('td.group-turnover-day').text(cal_days[value]);
                        } else {
                            group_row.children('td.group-' + key.replace('_', '-')).text(value);
                        }
                    });
                    $('tr#edit-group-buttons').remove();
                    $('tr#edit-group-form').remove();
                    group_row.removeClass('hide');
                },
                function(data) {
                    $('div#groups-panel-buttons').append('<div class="alert-box">Update failed: ' + data[1] + '</div>');
                    $('tr#edit-group-buttons').remove();
                    $('tr#edit-group-form').remove();
                    $('#groups-table tr.hide').removeClass('hide');
                }
            )
        });
        $('#groups-add').click(function() {
            if ($('#groups-table').has('tr#add-group').length) {
                return;
            }
            console.log('adding new group');
            if (oca.no_groups) {
                $('#groups-table-header').empty();
                $('#groups-table-header').append('<th></th><th></th>');
                $.each(group_display_keys, function(i, key) {
                    $('#groups-table-header').append('<th class="caps">' + key.replace('_',' ') +'</th>');
                });
            }
            $('#groups-table-header').after('<tr id="add-group"></tr>');
            $('tr#add-group').append('<td></td><td></td><td></td>' +
                '<td><input type="text" id="add-group-name" name="add-group-name" value=""></td>' +
                '<td><button id="add-group-active-checkbox" class="oc-checkbox elegant_icons icon_box-empty" data-target="add-group-active" data-checked="no"></button>' +
                '<input type="hidden" id="add-group-active" name="add-group-active" value="0"></td>' +
                '<td><button id="add-group-autorotate-checkbox" class="oc-checkbox elegant_icons icon_box-empty" data-target="add-group-autorotate" data-checked="no"></button>' +
                '<input type="hidden" id="add-group-autorotate" name="add-group-autorotate" value="0"></td>' +
                '<td><span id="add-group-turnover-day-menu" class="dropdown"><span data-toggle="dropdown">' +
                '<button id="add-group-turnover-day-label">Monday <span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                '<ul id="add-group-turnover-day-options" class="dropdown-menu" role="menu">' +
                '<li><span data-day="1">Monday</span></li>' +
                '<li><span data-day="2">Tuesday</span></li>' +
                '<li><span data-day="3">Wednesday</span></li>' +
                '<li><span data-day="4">Thursday</span></li>' +
                '<li><span data-day="5">Friday</span></li>' +
                '<li><span data-day="6">Saturday</span></li>' +
                '<li><span data-day="0">Sunday</span></li>' +
                '</ul></span></span><input type="hidden" id="add-group-turnover-day" name="add-group-turnover-day" value="1"></td>' +
                '<td><span id="add-group-turnover-hour-menu" class="dropdown"><span data-toggle="dropdown">' +
                '<button id="add-group-turnover-hour-label">09 <span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                '<ul id="add-group-turnover-hour-options" class="dropdown-menu" role="menu">' +
                '<li><span data-hour="00">00</span></li>' +
                '<li><span data-hour="01">01</span></li>' +
                '<li><span data-hour="02">02</span></li>' +
                '<li><span data-hour="03">03</span></li>' +
                '<li><span data-hour="04">04</span></li>' +
                '<li><span data-hour="05">05</span></li>' +
                '<li><span data-hour="06">06</span></li>' +
                '<li><span data-hour="07">07</span></li>' +
                '<li><span data-hour="08">08</span></li>' +
                '<li><span data-hour="09">09</span></li>' +
                '<li><span data-hour="10">10</span></li>' +
                '<li><span data-hour="11">11</span></li>' +
                '<li><span data-hour="12">12</span></li>' +
                '<li><span data-hour="13">13</span></li>' +
                '<li><span data-hour="14">14</span></li>' +
                '<li><span data-hour="15">15</span></li>' +
                '<li><span data-hour="16">16</span></li>' +
                '<li><span data-hour="17">17</span></li>' +
                '<li><span data-hour="18">18</span></li>' +
                '<li><span data-hour="19">19</span></li>' +
                '<li><span data-hour="20">20</span></li>' +
                '<li><span data-hour="21">21</span></li>' +
                '<li><span data-hour="22">22</span></li>' +
                '<li><span data-hour="23">23</span></li>' +
                '</ul></span><input type="hidden" id="add-group-turnover-hour" name="add-group-turnover-hour" value="09" size="2">' +
                ':<span id="add-group-turnover-min-menu" class="dropdown"><span data-toggle="dropdown">' +
                '<button id="add-group-turnover-min-label">30 <span class="elegant_icons arrow_carrot-down"></span></button></span>' +
                '<ul id="add-group-turnover-min-options" class="dropdown-menu" role="menu">' +
                '<li><span data-min="00">00</span></li>' +
                '<li><span data-min="30">30</span></li>' +
                '</ul></span><input type="hidden" id="add-group-turnover-min" name="add-group-turnover-min" value="30" size="2"></td>' +
                '<td><button id="add-group-shadow-checkbox" class="oc-checkbox elegant_icons icon_box-empty" data-target="add-group-shadow" data-checked="no"></button>' +
                '<input type="hidden" id="add-group-shadow" name="add-group-shadow" value="0"></td>' +
                '<td><button id="add-group-backup-checkbox" class="oc-checkbox elegant_icons icon_box-empty" data-target="add-group-backup" data-checked="no"></button>' +
                '<input type="hidden" id="add-group-backup" name="add-group-backup" value="0"></td>' +
                '<td><button id="add-group-failsafe-checkbox" class="oc-checkbox elegant_icons icon_box-empty" data-target="add-group-failsafe" data-checked="no"></button>' +
                '<input type="hidden" id="add-group-failsafe" name="add-group-failsafe" value="0"></td>' +
                '<td><input type="text" id="add-group-alias" name="add-group-alias" value=""></td>' +
                '<td><input type="text" id="add-group-backup-alias" name="add-group-backup-alias" value=""></td>' +
                '<td><input type="text" id="add-group-failsafe-alias" name="add-group-failsafe-alias" value=""></td>' +
                '<td><input type="text" id="add-group-email" name="add-group-email" value=""></td>' +
                '<td><input type="text" id="add-group-auth-group" name="add-group-auth-group" value=""></td>'
            );
            $('tr#add-group').after('<tr id="add-group-buttons">' +
                '<td colspan="3"></td>' +
                '<td><button id="cancel-add-group">Cancel</button></td>' +
                '<td colspan="12"><button id="save-add-group">Save</button></td></tr>');
            $('#add-group-rotate-day-options').on('click', 'span', function() {
                $('#add-group-rotate-day-label').text(cal_days[$(this).attr('data-day')]);
                $('input#add-group-rotate-day').attr('value', $(this).attr('data-day'));
            });
            $('#add-group-rotate-hour-options').on('click', 'span', function() {
                $('#add-group-rotate-hour-label').text($(this).attr('data-hour'));
                $('input#add-group-rotate-hour').attr('value', $(this).attr('data-day'));
            });
            $('#add-group-rotate-min-options').on('click', 'span', function() {
                $('#add-group-rotate-min-label').text($(this).attr('data-min'));
                $('input#add-group-rotate-min').attr('value', $(this).attr('data-day'));
            });
            $('button#cancel-add-group').click(function() {
                $('tr#add-group-buttons').remove();
                $('tr#add-group').remove();
                if (oca.no_groups) {
                    $('tr#groups-table-header').empty().append('<th>No groups configured</th>');
                }
            });
            $('button#save-add-group').click(function() {
                var required_fields = ['name'];
                var missing_fields = 0;
                $.each(required_fields, function(i, field) {
                    console.log('checking for ' + field);
                    if ($('input#add-group-' + field).val().length == 0) {
                        console.log(field + ' has no data');
                        $('input#add-group-' + field).css('border', '1px solid red').focus();
                        missing_fields++;
                    }
                });
                if (missing_fields == 0) {
                    var group_data = {};
                    $.each(group_display_keys, function(i, key) {
                        if (key !== "id" || key !== "turnover_time") {
                            group_data[key] = $('input#add-group-' + key.replace('_', '-')).val();
                        }
                        group_data.turnover_hour = $('input#add-group-turnover-hour').val();
                        group_data.turnover_min = $('input#add-group-turnover-min').val();
                    });

                    $.when(oca.add_group(group_data)).then(
                        function(data) {
                            if (data.turnover_hour < 10) {
                                data.turnover_hour = '0' + data.turnover_hour;
                            }
                            if (data.turnover_min < 10) {
                                data.turnover_min = '0' + data.turnover_min;
                            }
                            var turnover_time = [data.turnover_hour, data.turnover_min].join(':')
                            $('tr#add-group-buttons').remove();
                            $('tr#add-group').empty()
                                .append('<td><button id="group-checkbox-' + data.id + '" class="oc-checkbox elegant_icons icon_box-empty" data-target="group-select-' + data.id + '" data-checked="no"></button>' +
                                    '<input type="hidden" id="group-select-' + data.id + '" name="group-select-' + data.id + '" value="0" data-type="group-select" data-name="' + data.name + '" data-id="' + data.id + '"></td>' +
                                    '<td><button id="edit-group-' + data.id + '" class="group-edit elegant_icons icon_pencil-edit"></button></td>' +
                                    '<td class="group-id">' + data.id + '</td>' +
                                    '<td class="group-name">' + data.name + '</td>' +
                                    '<td class="group-active">' + basic_boolean[data.active] + '</td>' +
                                    '<td class="group-autorotate">' + basic_boolean[data.autorotate] + '</td>' +
                                    '<td class="group-turnover-day">' + cal_days[data.turnover_day] + '</td>' +
                                    '<td class="group-turnover-time">' + turnover_time + '</td>' +
                                    '<td class="group-shadow">' + basic_boolean[data.shadow] + '</td>' +
                                    '<td class="group-backup">' + basic_boolean[data.backup] + '</td>' +
                                    '<td class="group-failsafe">' + basic_boolean[data.failsafe] + '</td>' +
                                    '<td class="group-alias">' + data.alias + '</td>' +
                                    '<td class="group-backup-alias">' + data.backup_alias + '</td>' +
                                    '<td class="group-failsafe-alias">' + data.failsafe_alias + '</td>' +
                                    '<td class="group-email">' + data.email + '</td>' +
                                    '<td class="group-auth-group">' + data.auth_group + '</td>'
                                ).attr('id', 'group' + data.id);
                            oca.no_groups = false;
                        },
                        function(data) {
                            $('tr#add-group-buttons').remove();
                            $('tr#add-group').remove();
                            if (oca.no_groups) {
                                $('tr#groups-table-header').empty().append('<th>No groups configured</th>');
                            }
                            $('#groups-panel-buttons').append('<div class="alert-box">Could not add group: ' + data[1] + '</div>');
                        }
                    )
                }
            });
        });
        $('#groups-delete').click(function() {
            oca.groups_to_delete = {};
            $.each($('input[data-type="group-select"]'), function() {
                if ($(this).val() == 1) {
                    oca.groups_to_delete[$(this).attr('data-name')] = $(this).attr('data-id');
                }
            });
            if (Object.keys(oca.groups_to_delete).length > 0) {
                $('p#delete-groups-list').text(Object.keys(oca.groups_to_delete).join(', '));
            } else {
                $('p#delete-groups-list').text('None');
            }
            $.magnificPopup.open({
                items: {
                    src: '#delete-groups-confirm-popup',
                    type: 'inline'
                },
                preloader: false,
                removalDelay: 300,
                mainClass: 'popup-animate'
            });
        });

        $('button#delete-groups-cancel-button').click(function() {
            $.magnificPopup.close();
            $('p#delete-groups-list').empty();
            delete oca.groups_to_delete;
        });
        $('button#delete-groups-confirm-button').click(function() {
            $.each(oca.groups_to_delete, function(name, id) {
                $.when(oca.delete_group(id)).then(
                    function(data) {
                        $('tr#group' + id).remove();
                        if (data.group_count == 0) {
                            $('tr#groups-table-header').empty().append('<th>No groups configured</th>');
                            oca.no_groups = true;
                        }
                    },
                    function(data) {
                        $('#groups-panel-buttons').append('<div class="alert-box">Could not delete group ' + name + ': ' +
                            data[1] + '</div>');
                    }
                )
            });
            $.magnificPopup.close();
            delete oca.groups_to_delete;
        });

        $.when(oncalendar.get_victims()).then(
            function(data) {
                oca.no_victims = true;
                var victims_panel = $('#users-panel-data');
                victims_panel.append('<table id="victims-table" class="admin-table"><tr id="victims-table-header"><th colspan="2"></th></tr></table>');
                if (typeof data === "string") {
                    $('tr#victims-table-header').append('<th>' + data + '</th>');
                } else {
                    oca.no_victims = false;
                    $.each(victim_display_keys, function(i, key) {
                        $('#victims-table-header').append('<th class="caps">' + key.replace('_', ' ') + '</th>');
                    });

                    $.each(data, function(index, row) {
                        $('#victims-table').append('<tr id="victim' + row.id + '"></tr>');
                        $('#victim' + index).append('<td><button id="victim-checkbox-' + row.id + '" class="oc-checkbox elegant_icons icon_box-empty" data-target="victim-select-' + row.id + '" data-checked="no"></button>' +
                            '<input type="hidden" id="victim-select-' + row.id + '" name="victim-select-' + row.id + '" value="0" data-type="victim-select" data-name="' + row.username + '" data-id="' + row.id + '"></td>' +
                            '<td><button id="edit-victim-' + row.id + '" class="victim-edit elegant_icons icon_pencil-edit"></button></td>'
                        );
                        $('#victim' + index).append('<td class="victim-id">' + row.id + '</td>' +
                            '<td class="victim-active">' + basic_boolean[row.active] + '</td>' +
                            '<td class="victim-username">' + row.username + '</td>' +
                            '<td class="victim-firstname">' + row.firstname + '</td>' +
                            '<td class="victim-lastname">' + row.lastname + '</td>' +
                            '<td class="victim-phone">' + row.phone + '</td>' +
                            '<td class="victim-email">' + row.email + '</td>' +
                            '<td class="victim-sms-email">' + row.sms_email + '</td>' +
                            '<td class="victim-app-role">' + app_roles[row.app_role] + '</td>' +
                            '<td class="victim-groups">' + oca.victim_group_list(row.groups) + '</td>'
                        );
                    });
                }
            },
            function(data) {
                $('#users-panel-buttons').append('<div class="alert-box">' + data[1] + '</div>');
            }
        );

        $('#users-panel-data').on('click', 'button.victim-edit', function() {
            console.log($(this));
            var victim_row = $(this).parent('td').parent('tr');
            var victim_data = {};
            victim_data.id                = victim_row.children('td.victim-id').text();
            victim_data.username          = victim_row.children('td.victim-username').text();
            victim_data.firstname         = victim_row.children('td.victim-firstname').text();
            victim_data.lastname          = victim_row.children('td.victim-lastname').text();
            victim_data.phone             = victim_row.children('td.victim-phone').text();
            victim_data.active            = victim_row.children('td.victim-active').text();
            victim_data.email             = victim_row.children('td.victim-email').text();
            victim_data.sms_email         = victim_row.children('td.victim-sms-email').text();
            victim_data.app_role          = victim_row.children('td.victim-app-role').text();
            victim_data.current_groups    = victim_row.children('td.victim-groups').text();
            victim_data.groups            = [];

            victim_row.before('<tr id="edit-victim-form"></tr>');
            $('tr#edit-victim-form').append('<td colspan="2"></td>' +
                '<td><input type="hidden" id="edit-victim-id" name="edit-victim-id" value="' + victim_data.id + '">' + victim_data.id + '</td>' +
                '<td><button id="edit-victim-active-checkbox" class="oc-checkbox elegant_icons icon_box-checked" data-target="edit-victim-active" data-checked="yes"></button>' +
                '<input type="hidden" id="edit-victim-active" name="edit-victim-active" value="1"></td>' +
                '<td><input type="text" id="edit-victim-username" name="edit-victim-username" value="' + victim_data.username + '"></td>' +
                '<td><input type="text" id="edit-victim-firstname" name="edit-victim-firstname" value="' + victim_data.firstname + '"></td>' +
                '<td><input type="text" id="edit-victim-lastname" name="edit-victim-lastname" value="' + victim_data.lastname + '"></td>' +
                '<td><input type="text" id="edit-victim-phone" name="edit-victim-phone" value="' + victim_data.phone + '"></td>' +
                '<td><input type="text" id="edit-victim-email" name="edit-victim-email" value="' + victim_data.email + '"</td>' +
                '<td><input type="text" id="edit-victim-sms-email" name="edit-victim-sms-email" value="' + victim_data.sms_email + '"></td>' +
                '<td id="app-role-cell"></td>' +
                '<td id="groups-to-add"></td>'
            );
            $('td#app-role-cell').append('<button id="edit-victim-group-admin-radio" class="oc-radio elegant_icons icon_circle-empty" data-target="edit-victim-group-admin" data-checked="no"></button>Group Admin' +
                '<input type="hidden" id="edit-victim-group-admin" name="edit-victim-group-admin" value="0">' +
                '<button id="edit-victim-app-admin-radio" class="oc-radio elegant_icons icon_circle-empty" data-target="edit-victim-app-admin" data-checked="no"></button>App Admin' +
                '<input type="hidden" id="edit-victim-app-admin" name="edit-victim-app-admin" value="0">'
            );
            if (victim_data.app_role === "App Admin") {
                $('button#edit-victim-app-admin-radio')
                    .removeClass('icon_circle-empty')
                    .addClass('icon_circle-selected')
                    .attr('data-checked', 'yes');
                $('input#edit-victim-app-admin').attr('value', '1');
            } else if (victim_data.app_role === "Group Admin") {
                $('button#edit-victim-group-admin-radio')
                    .removeClass('icon_circle-empty')
                    .addClass('icon_circle-selected')
                    .attr('data-checked', 'yes');
                $('input#edit-victim-group-admin').attr('value', '1');
            }
            $('tr#edit-victim-form').after('<tr id="edit-victim-buttons">' +
                '<td colspan="3"></td>' +
                '<td><button id="cancel-edit-victim">Cancel</button></td>' +
                '<td colspan="12"><button id="save-edit-victim">Save</button></td></tr>');
            if (victim_data.active === "No") {
                $('button#edit-victim-active-checkbox')
                    .removeClass('icon_box-checked')
                    .addClass('icon_box-empty')
                    .attr('data-checked', 'no');
                $('input#edit-victim-active').attr('value', 0);
            }
            $.each(groups_list, function(group_name, group_id) {
                $('td#groups-to-add').append('<button id="' + group_name +
                    '-checkbox" class="oc-checkbox elegant_icons icon_box-empty" data-target="' +
                    group_id + '-active" data-checked="no"></button>' + group_name +
                    '<input type="hidden" id="' + group_id + '-active" name="' + group_name + '-active" value="0">'
                );
            });
            var victim_groups = victim_data.current_groups.split(', ');
            $.each(victim_groups, function(i, group) {
                $('button#' + group + '-checkbox')
                    .removeClass('icon_box-empty')
                    .addClass('icon_box-checked')
                    .attr('data-checked', 'yes');
                $('input#' + groups_list[group] + '-active').attr('value', 1);
            });

            victim_row.addClass('hide');
        });
        $('#users-panel-data').on('blur', 'input#edit-victim-username', function() {
            $('input#edit-victim-email').val($(this).val() + '@box.com');
        }).on('click', 'button#cancel-edit-victim', function() {
            $('tr#edit-victim-buttons').remove();
            $('tr#edit-victim-form').remove();
            $('#victims-table tr.hide').removeClass('hide');
        }).on('click', 'button#save-edit-victim', function() {
            var victim_data = {};
            victim_data.groups = [];
            $.each($('tr#edit-victim-form').children('td').has('input'), function(index, element) {
                if ($(element).attr('id') === 'app-role-cell') {
                    console.log('checking app role');
                    console.log($(element).children('input#edit-victim-app-admin').val());
                    console.log($(element).children('input#edit-victim-group-admin').val());
                    if ($(element).children('input#edit-victim-app-admin').val() === "1") {
                        victim_data.app_role = 2;
                    } else if ($(element).children('input#edit-victim-group-admin').val() === "1") {
                        victim_data.app_role = 1;
                    } else {
                        victim_data.app_role = 0;
                    }
                    console.log('set app role to ' + victim_data.app_role);
                }  else {
                    var el_input = $(element).children('input');
                    if (el_input.length > 1) {
                        $.each(el_input, function(i, e) {
                            victim_data.groups.push($(e).attr('id').split('-')[0] + '-' + $(e).val());
                        });
                    } else {
                        var form_key = el_input.attr('id').replace('edit-victim-', '').replace('-', '_');
                        victim_data[form_key] = el_input.val();
                    }
                }
            });
            console.log(victim_data);
            $.when(oca.update_victim(victim_data)).then(
                function(data) {
                    console.log(data);
                    var victim_row = $('#victims-table').children('tbody').children('tr#victim' + data[victim_data.id].id);
                    $.each(data[victim_data.id], function(key, value) {
                        if (key === "active") {
                            victim_row.children('td.victim-active').text(basic_boolean[value]);
                        } else if (key === "groups") {
                            victim_row.children('td.victim-groups').text(oca.victim_group_list(value));
                        } else if (key === "app_role") {
                            victim_row.children('td.victim-app-role').text(app_roles[value]);
                        } else {
                            victim_row.children('td.victim-' + key.replace('_', '-')).text(value);
                        }
                        $('tr#edit-victim-buttons').remove();
                        $('tr#edit-victim-form').remove();
                        victim_row.removeClass('hide');
                    });
                },
                function(data) {
                    $('div#users-panel-buttons').append('<div class="alert-box">Update failed: ' + data[1] + '</div>');
                    $('tr#edit-victim-buttons').remove();
                    $('tr#edit-victim-form').remove();
                    $('#victims-table tr.hide').removeClass('hide');
                }
            );
        });

        $('#users-add').click(function() {
            if ($('#victims-table').has('tr#add-victim').length) {
                return;
            }
            if (oca.no_victims) {
                $('#victims-table-header').empty();
                $('#victims-table-header').append('<th></th><th></th>');
                $.each(victim_display_keys, function(i, key) {
                    $('#victims-table-header').append('<th class="caps">' + key.replace('_',' ') +'</th>');
                });
            }
            $('#victims-table-header').after('<tr id="add-victim"></tr>');
            $('tr#add-victim').append('<td colspan="3"></td>' +
                '<td><button id="add-victim-active-checkbox" class="oc-checkbox elegant_icons icon_box-checked" data-target="add-victim-active" data-checked="yes"></button>' +
                '<input type="hidden" id="add-victim-active" name="add-victim-active" value="1"></td>' +
                '<td><input type="text" id="add-victim-username" name="add-victim-username" value=""></td>' +
                '<td><input type="text" id="add-victim-firstname" name="add-victim-firstname" value=""></td>' +
                '<td><input type="text" id="add-victim-lastname" name="add-victim-lastname" value=""></td>' +
                '<td><input type="text" id="add-victim-phone" name="add-victim-phone" value=""></td>' +
                '<td><input type="text" id="add-victim-email" name="add-victim-email" value=""></td>' +
                '<td><input type="text" id="add-victim-sms-email" name="add-victim-sms-email" value=""></td>' +
                '<td id="app-role-cell"></td>' +
                '<td id="groups-to-add"></td>'
            );
            $('td#app-role-cell').append('<button id="add-victim-group-admin-radio" class="oc-radio elegant_icons icon_circle-empty" data-target="add-victim-group-admin" data-checked="no"></button>Group Admin' +
                '<input type="hidden" id="add-victim-group-admin" name="add-victim-group-admin" value="0">' +
                '<button id="add-victim-app-admin-radio" class="oc-radio elegant_icons icon_circle-empty" data-target="add-victim-app-admin" data-checked="no"></button>App Admin' +
                '<input type="hidden" id="add-victim-app-admin" name="add-victim-app-admin" value="0">'
            );
            $.each(groups_list, function(group_name, group_id) {
                $('td#groups-to-add').append('<button id="' + group_name +
                    '-checkbox" class="oc-checkbox elegant_icons icon_box-empty" data-target="' +
                    group_id + '-active" data-checked="no"></button>' + group_name +
                    '<input type="hidden" id="' + group_id + '-active" name="' + group_name + '-active" value="0">'
                );
            });
            $('tr#add-victim').after('<tr id="add-victim-buttons">' +
                '<td colspan="3"></td>' +
                '<td><button id="cancel-add-victim">Cancel</button></td>' +
                '<td colspan="12"><button id="save-add-victim">Save</button></td></tr>'
            );
            $('button#cancel-add-victim').click(function() {
                $('tr#add-victim-buttons').remove();
                $('tr#add-victim').remove();
                if (oca.no_victims) {
                    $('tr#victims-table-header').empty().append('<th>No users configured</th>');
                }
            });
            $('button#save-add-victim').click(function() {
                var required_fields = ['username', 'firstname', 'lastname'];
                var missing_fields = 0;
                $.each(required_fields, function(i, field) {
                    if ($('input#add-victim-' + field).val().length == 0) {
                        console.log(field + ' has no data');
                        $('input#add-victim-' + field).css('border', '1px solid red');
                        missing_fields++;
                    }
                });
                if ($('input#add-victim-active').val() === "1" && $('input#add-victim-phone').val().length == 0) {
                    $('input#add-victim-phone').css('border', '1px solid red').focus();
                    missing_fields++;
                } else {
                    var victim_phone = $('input#add-victim-phone').val();
                    victim_phone = victim_phone.replace(/\D/g, '');
                    var country_code = victim_phone.substring(0, 1);
                    if (country_code !== 1) {
                        victim_phone = "1" + victim_phone
                    }
                    if (victim_phone.length !== 11) {
                        $('input#add-victim-phone').val(victim_phone).css('border', '1px solid red').focus();
                        missing_fields++;
                    }
                }
                if (missing_fields == 0) {
                    var victim_data = {};
                    victim_data.groups = [];
                    $.each(victim_display_keys, function(i, key) {
                        if (key !== "id") {
                            if (key === "app_role") {
                                var element = $('td#app-role-cell');
                                if ($(element).children('input#add-victim-app-admin').val() === "1") {
                                    victim_data.app_role = 2;
                                } else if ($(element).children('input#add-victim-group-admin').val() === "1") {
                                    victim_data.app_role = 1;
                                } else {
                                    victim_data.app_role = 0;
                                }
                            }
                            else if (key === "groups") {
                                $.each($('td#groups-to-add').children('input'), function(i, element) {
                                    if ($(element).val() !== '0') {
                                        victim_data.groups.push($(element).attr('id').split('-')[0]);
                                    }
                                });
                            } else {
                                victim_data[key] = $('input#add-victim-' + key.replace('-', '_')).val();
                            }
                        }
                    });
                    $.when(oca.add_victim(victim_data)).then(
                        function(data) {
                            $('tr#add-victim-buttons').remove();
                            $('tr#add-victim').empty()
                                .append('<td><button id="victim-checkbox-' + data.id + '" class="oc-checkbox elegant_icons icon_box-empty" data-target="victim-select-' + data.id + '" data-checked="no"></button>' +
                                    '<input type="hidden" id="victim-select-' + data.id + '" name="victim-select-' + data.id + '" value="0" data-type="victim-select" data-name="' + data.username + '" data-id="' + data.id + '"></td>' +
                                    '<td><button id="edit-victim-' + data.id + '" class="victim-edit elegant_icons icon_pencil-edit"></button></td>' +
                                    '<td class="victim-id">' + data.id + '</td>' +
                                    '<td class="victim-active">' + basic_boolean[data.active] +'</td>' +
                                    '<td class="victim-username">' + data.username + '</td>' +
                                    '<td class="victim-firstname">' + data.firstname + '</td>' +
                                    '<td class="victim-lastname">' + data.lastname + '</td>' +
                                    '<td class="victim-phone">' + data.phone + '</td>' +
                                    '<td class="victim-email">' + data.email + '</td>' +
                                    '<td class="victim-sms-email">' + data.sms_email + '</td>' +
                                    '<td class="victim-app-role">' + app_roles[data.app_role] + '</td>' +
                                    '<td class="victim-groups">' + oca.victim_group_list(data.groups) + '</td>'
                                ).attr('id', 'victim' + data.id);
                            oca.no_victims = false;
                        },
                        function(data) {
                            $('tr#add-victim-buttons').remove();
                            $('tr#add-victim').remove();
                            if (oca.no_victims) {
                                $('tr#victim-table-header').empty().append('<th>No victims configured</th>');
                            }
                            $('#users-panel-buttons').append('<div class="alert-box">Could not add victim: ' + data[1] + '</div>');
                        }
                    )
                }
            });
        });
        $('#users-delete').click(function() {
            oca.victims_to_delete = {};
            $.each($('input[data-type="victim-select"]'), function() {
                if ($(this).val() == 1) {
                    oca.victims_to_delete[$(this).attr('data-name')] = $(this).attr('data-id');
                }
            });
            if (Object.keys(oca.victims_to_delete).length > 0) {
                $('p#delete-victims-list').text(Object.keys(oca.victims_to_delete).join(', '));
            } else {
                $('p#delete-victims-list').text('None');
            }
            $.magnificPopup.open({
                items: {
                    src: '#delete-victims-confirm-popup',
                    type: 'inline'
                },
                preloader: false,
                removalDelay: 300,
                mainClass: 'popup-animate'
            });
        });
        $('button#delete-victims-cancel-button').click(function() {
            $.magnificPopup.close();
            $('p#delete-victims-list').empty();
            delete oca.victims_to_delete;
        });
        $('button#delete-victims-confirm-button').click(function() {
            console.log(oca.victims_to_delete);
            $.each(oca.victims_to_delete, function(name, id) {
                $.when(oca.delete_victim(id)).then(
                    function(data) {
                        $('tr#victim' + id).remove();
                        if (data.victim_count == 0) {
                            $('tr#victims-table-header').empty().append('<th>No users configured</th>');
                            oca.no_victims = true;
                        }
                    },
                    function(data) {
                        $('#users-panel-buttons').append('<div class="alert-box">Could not delete user ' + name + ': ' +
                            data[1] + '</div>');
                    }
                )
            });
            $.magnificPopup.close();
            delete oca.victims_to_delete;
        });

        $.when(oca.get_calendar_end()
            .done(function(data) {
                var cal_panel = $('#calendar-panel-data');
                console.log(data);
                if (data[1] < 10) {
                    data[1] = '0' + data[1];
                }
                var end_date = data[2] + ' ' + cal_months[data[1]] + ' ' + data[0];
                cal_panel.append('<table id="calendar-table" class="admin-table"><tr>' +
                    '<th>Calendar currently extends through: </th><td id="cal-end-date">' + end_date + '</td></tr></table>');
                cal_panel.append('<div id="extend-calendar" class="admin-panel-actions"><form id="extend-calendar-form" onsubmit="return false"></form></div>');
                $('#extend-calendar-form').append('<span>Extend calendar by </span>' +
                    '<input type="text" class="input" id="extend-cal-days" name="extend-cal-days" value="" size="4">' +
                    '<div class="dropdown"><span class="input-menu elegant_icons arrow_carrot-down" data-toggle="dropdown"> </span>' +
                    '<ul class="dropdown-menu" id="cal-extend-options" role="menu">' +
                    '<li><span data-extend="365">1 Year</span></li>' +
                    '<li><span data-extend="270">9 Months</span></li>' +
                    '<li><span data-extend="180">6 Months</span></li>' +
                    '<li><span data-extend="90">3 Months</span></li>' +
                    '<li><span data-extend="30">1 Month</span></li></ul></div>' +
                    '<span>days</span> <button id="do-extend-calendar" class="elegant_icons arrow_right"></button>');
                $('#cal-extend-options').on('click', 'li', function() {
                    console.log($(this).children('span'));
                    $('input#extend-cal-days').attr('value', $(this).children('span').attr('data-extend'));
                });
                $('#extend-calendar-form').on('click', 'button#do-extend-calendar', function() {
                    if ($('input#extend-cal-days').val().length) {
                        var extend_days = $('input#extend-cal-days').val();
                        $.when(oca.extend_calendar(extend_days)).then(
                            function(data) {
                                $('input#extend-cal-days').attr('value', '');
                                $('td#cal-end-date').empty();
                                if (data[1] < 10) {
                                    data[1] = '0' + data[1];
                                }
                                $('td#cal-end-date').text(data[2] + ' ' + cal_months[data[1]] + ' ' + data[0]);
                            },
                            function(data) {
                                $('#calendar-panel-buttons').append('<div class="alert-box">Could not extend calendar: ' + data[1] + '</div>');
                            }
                        )
                    }
                });
            })
        );
        $('#admin-function-container').on('click', 'button.oc-checkbox', function() {
            if ($(this).attr('data-checked') === "no") {
                $(this).removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
                $('input#' + $(this).attr('data-target')).attr('value', 1);
            } else {
                $(this).removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
                $('input#' + $(this).attr('data-target')).attr('value', 0);
            }
        });
        $('#admin-function-container').on('click', 'button.oc-radio', function() {
            if ($(this).attr('data-checked') === 'no') {
                $(this).removeClass('icon_circle-empty').addClass('icon_circle-selected').attr('data-checked', 'yes');
                $('input#' + $(this).attr('data-target')).attr('value', 1);
                $.each($(this).siblings('button.oc-radio'), function(i, radio) {
                    $(radio).removeClass('icon_circle-selected').addClass('icon_circle-empty').attr('data-checked', 'no');
                    $('input#' + $(radio).attr('data-target')).attr('value', 0);
                })
            } else {
                $(this).removeClass('icon_circle-selected').addClass('icon_circle-empty').attr('data-checked', 'no');
                $('input#' + $(this).attr('data-target')).attr('value', 0);
            }
        });
        $('#admin-function-container').on('click', 'div.alert-box', function() {
            $(this).remove();
        });

    },
    confirm_db: function() {
        var oca = this;
        var db_status = oca.get_db_status();
        console.log(db_status);
        if (typeof db_status.error !== "undefined") {
            return db_status.error;
        } else {
            return 'ok';
        }
    },
    get_db_status: function() {
        var db_status = {};
        var db_status_request = $.ajax({
            url: window.location.origin + '/api/admin/db/verify',
            async: false,
            data: {},
            dataType: 'json'
        });

        db_status_request
            .done(function(data) {
                console.log(data);
                if (data.missing_tables) {
                    db_status.error = 'noinit'
                }
            })
            .fail(function(data) {
                console.log(data);
                var error = $.parseJSON(data.responseText);
                if (error[0] === 1049) {
                    db_status.error = 'nodb';
                } else {
                    db_status.error = 'noaccess';
                }
            }
        );

        return db_status;
    },
    create_db: function(username, password) {
        var create_db_object = new $.Deferred();
        var create_db_url = window.location.origin + '/api/admin/db/create_db';
        var create_db_request = $.ajax({
            url: create_db_url,
            type: 'POST',
            data: {
                mysql_user: username,
                mysql_password: password
            },
            async: false,
            dataType: 'json'
        }),
        chain = create_db_request.then(function(data) {
            return data;
        });

        chain
            .done(function(data) {
                create_db_object.resolve(data);
            })
            .fail(function(data) {
                var error = $.parseJSON(data.responseText);
                create_db_object.reject(error);
            });

        return create_db_object.promise();
    },
    initialize_db: function(force) {
        var init_db_object = new $.Deferred();
        var init_db_url = window.location.origin + '/api/admin/db/init_db';
        if (force === "yes") {
            init_db_url += '/force';
        }
        var init_db_request = $.ajax({
            url: init_db_url,
            type: 'GET',
            async: false,
            dataType: 'json'
        }),
        chain = init_db_request.then(function(data) {
            return data;
        });

        chain
            .done(function(data) {
                init_db_object.resolve(data);
            })
            .fail(function(data) {
                var error = $.parseJSON(data.responseText);
                init_db_object.reject(error);
            });

        return init_db_object.promise();
    },
    get_config_data: function() {
        var config_data = {};
        var config_request = $.ajax({
            url: window.location.origin + '/api/admin/get_config',
            type: 'GET',
            async: false,
            dataType: 'json'
        });

        config_request.then(function(data) {
            config_data = data;
        });

        return config_data;

    },
    update_configuration: function(new_config_data) {
        var update_config_url = window.location.origin + '/api/admin/update_config';
        var update_config_object = new $.Deferred();
        var update_config_request = $.ajax({
            url: update_config_url,
            type: 'POST',
            data: new_config_data,
            dataType: 'json'
        }),
        chain = update_config_request.then(function(data) {
            return data;
        });

        chain
            .done(function(data) {
                update_config_object.resolve(data);
            })
            .fail(function(data) {
                var error = $.parseJSON(data.responseText);
                update_config_object.reject(error);
            });

        return update_config_object.promise();
    },
    add_group: function(group_data) {
        var add_group_object = new $.Deferred();
        var add_group_url = window.location.origin + '/api/admin/group/add';
        var add_group_request = $.ajax({
            url: add_group_url,
            type: 'POST',
            data: group_data,
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
                console.log(data)
                if (data.status === 404) {
                    var error = [data.status, 'The requested URL was not found on the server']
                } else {
                    var error = $.parseJSON(data.responseText);
                }
                add_group_object.reject(error);
            });

        return add_group_object.promise();
    },
    delete_group: function(id) {
        var delete_group_object = new $.Deferred();
        var delete_group_url = window.location.origin + '/api/admin/group/delete/' + id;
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
                console.log(data);
                if (data.status === 404) {
                    var error = [404, 'Not Found']
                } else {
                    var error = $.parseJSON(data.responseText);
                }
                delete_group_object.reject(error);
            });

        return delete_group_object.promise();
    },
    add_victim: function(victim_data) {
        var oca = this;
        console.log(victim_data);
        var add_victim_object = new $.Deferred();
        var add_victim_url = window.location.origin + '/api/admin/victim/add';
        var add_victim_request = $.ajax({
                url: add_victim_url,
                type: 'POST',
                data: victim_data,
                dataType: 'json'
            }),
            chain = add_victim_request.then(function(data) {
                return data;
            });

        chain
            .done(function(data) {
                add_victim_object.resolve(data);
            })
            .fail(function(data) {
                console.log(data)
                if (data.status === 404) {
                    var error = [data.status, 'The requested URL was not found on the server']
                } else {
                    var error = $.parseJSON(data.responseText);
                }
                add_victim_object.reject(error);
            });

        return add_victim_object.promise();
    },
    delete_victim: function(id) {
        var oca = this;
        var delete_victim_object = new $.Deferred();
        var delete_victim_url = window.location.origin + '/api/admin/victim/delete/' + id;
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
                delete_victim_object.resolve(data);
            })
            .fail(function(data) {
                console.log(data);
                if (data.status === 404) {
                    var error = [404, 'Not Found']
                } else {
                    var error = $.parseJSON(data.responseText);
                }
                delete_victim_object.reject(error);
            });

        return delete_victim_object.promise();
    },
    update_victim: function(victim_data) {
        var update_victim_object = new $.Deferred();
        var update_victim_url = window.location.origin + '/api/admin/victim/update';
        var update_victim_request = $.ajax({
            url: update_victim_url,
            type: 'POST',
            data: victim_data,
            dataType: 'json'
        }),
        chain = update_victim_request.then(function(data) {
            return data;
        });

        chain
            .done(function(data) {
                update_victim_object.resolve(data);
            })
            .fail(function(data) {
                console.log(data);
                var error = $.parseJSON(data.responseText);
                update_victim_object.reject(error);
            });

        return update_victim_object.promise();
    },
    victim_group_list: function(groups) {
        var victim_groups = [];
        $.each(groups, function(i, group_name) {
            victim_groups.push(group_name);
        });
        return victim_groups.join(', ');
    },
    get_calendar_end: function() {
        var calendar_end_object = new $.Deferred();
        var calendar_end_url = window.location.origin + '/api/calendar/calendar_end';
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
        }
};