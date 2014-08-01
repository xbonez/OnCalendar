{% extends "main.js" %}

{% block page_script %}

var oc_victims_event = new Event('victims_loaded');
var master_victims_list = {};
var sms_gateways = {{ sms_gateway_options }};
oncalendar.gateway_map = {};

// Get all configured victims for the admin interface User tab
$.when(oncalendar.get_victims()).then(function(data) {
    master_victims_list = data;
    document.dispatchEvent(oc_victims_event);
});

$(document).ready(function() {

    // Handler for the interface tabs
    $('#admin-functions').on('click', 'li', function() {
        $('li.tab.selected').removeClass('selected');
        $(this).addClass('selected');
        $('div.tab-panel.active-panel').removeClass('active-panel');
        $('div#' + $(this).attr('data-target')).addClass('active-panel');
    });

    // Handler for user menu items
    $('div#user-menu')
        .on('click', 'li#user-logout', function() {
            window.location.href = '/logout';
        })
        .on('click', 'li#calendar-link', function() {
            window.location.href = '/';
        });

    $.each(sms_gateways, function(i, gateway) {
        var domain = Object.keys(gateway)[0];
        oncalendar.gateway_map[domain] = gateway[domain]
        $('ul#edit-user-sms-email-options').append('<li data-gateway="' + domain + '"><span>' + gateway[domain] + '</span></li>');
        $('ul#add-user-sms-email-options').append('<li data-gateway="' + domain + '"><span>' + gateway[domain] + '</span></li>');
    });
});

// Simple validation for email addresses
var valid_email = function(email_address) {
    valid = email_address.match(/^[^\s]+@[^\s]+\.[^\s]{2,3}$/);
    if (valid !== null) {
        return true;
    } else {
        return false;
    }
};

// Handlers for the checkboxes, alerts and buttons
$(document).on('click', 'button.oc-checkbox', function() {
    if ($(this).attr('data-checked') === "no") {
        $(this).removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', "yes");
        $('input#' + $(this).attr('data-target')).attr('value', 1);
    } else {
        $(this).removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', "no");
        $('input#' + $(this).attr('data-target')).attr('value', 0);
    }
}).on('click', 'div.alert-box', function() {
    var alert_box = $(this);
    alert_box.addClass('transparent');
    setTimeout(function() {
        alert_box.remove();
    }, 250);
}).on('click', 'div.info-box', function() {
    var info_box = $(this);
    info_box.addClass('transparent');
    setTimeout(function () {
        info_box.remove();
    }, 250);
}).on('click', 'button#users-delete', function() {
    var users_to_delete = {};
    $.each($('input[data-type="user-delete"]'), function () {
        if ($(this).attr('value') == 1) {
            users_to_delete[$(this).attr('data-username')] = $(this).attr('data-id');
        }
    });
    if (Object.keys(users_to_delete).length > 0) {
        $('p#delete-victims-list').text(Object.keys(users_to_delete).join(', '));
        $.magnificPopup.open({
            items: {
                src: '#delete-victims-confirm-popup',
                type: 'inline',
                users_to_delete: users_to_delete
            },
            preloader: false,
            removalDelay: 300,
            mainClass: 'popup-animate'
        });
    } else {
        $('div#users-panel-data').prepend('<div class="alert-box">No users selected, nothing to delete</div>');
    }
}).on('click', 'button.edit-user', function() {
    $.each(oncalendar.oncall_groups, function(group, group_data) {
        $('table#edit-user-table').append('<tr class="edit-user-group-row">' +
                '<td>' + group + '</td><td>' +
                '<button id="edit-user-group-active-' + group + '-checkbox" class="edit-user-group-active oc-checkbox elegant_icons icon_box-empty" data-target="edit-user-group-active-' + group + '" data-group="' + group + '" data-checked="no"></button>' +
                '<input type="hidden" id="edit-user-group-active-' + group + '" name="edit-user-group-active-' + group + '" class="edit-user-group-active" data-group="' + group + '" value="0"></td>' +
                '<td><button id="edit-user-group-inactive-' + group + '-checkbox" class="edit-user-group-inactive oc-checkbox elegant_icons icon_box-empty" data-target="edit-user-group-inactive-' + group + '" data-group="' + group + '" data-checked="no"></button>' +
                '<input type="hidden" id="edit-user-group-inactive-' + group + '" name="edit-user-group-inactive-' + group + '" class="edit-user-group-inactive" data-group="' + group + '" value="0"></td>'
        );
    });
    var edit_user_id = $(this).attr('data-user');
    var edit_user_info = master_victims_list[edit_user_id];
    $('#edit-user-popup').children('h3').text('Edit User ' + edit_user_info.username);
    $('input#edit-user-id').attr('value', edit_user_id);
    $('input#edit-user-username').val(edit_user_info.username);
    $('input#edit-user-firstname').val(edit_user_info.firstname);
    $('input#edit-user-lastname').val(edit_user_info.lastname);
    $('input#edit-user-phone').val(edit_user_info.phone);
    $('input#edit-user-email').val(edit_user_info.email);
    if (oncalendar.gateway_map[edit_user_info.sms_email] !== undefined) {
        $('button#edit-user-sms-email-label').text(oncalendar.gateway_map[edit_user_info.sms_email]).append('<span class="elegant_icons arrow_carrot-down">');
        $('input#edit-user-sms-email').attr('value', edit_user_info.sms_email);
    } else {
        $('button#edit-user-sms-email-label').text('--').append('<span class="elegant_icons arrow_carrot-down">');
        $('input#edit-user-sms-email').attr('value','');
    }
    $('input#edit-user-throttle').val(edit_user_info.throttle);
    if (edit_user_info.truncate == 1) {
        $('button#edit-user-truncate-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
        $('input#edit-user-truncate').attr('value', 1);
    } else {
        $('button#edit-user-truncate-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
        $('input#edit-user-truncate').attr('value', 0);
    }
    $('button#edit-user-app-role-label').text(oc.roles[edit_user_info.app_role] + ' ').append('<span class="elegant_icons arrow_carrot-down">');
    $('input#edit-user-app-role').attr('value', edit_user_info.app_role);
    $.each(edit_user_info.groups, function(group, active) {
        if (active == 1) {
            $('button#edit-user-group-active-' + group + '-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
            $('input#edit-user-group-active-' + group).attr('value', 1);
        } else {
            $('button#edit-user-group-inactive-' + group + '-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
            $('input#edit-user-group-inactive-' + group).attr('value', 1);
        }
    });
    $.magnificPopup.open({
        items: {
            src: '#edit-user-popup',
            type: 'inline'
        },
        preloader: false,
        removalDelay: 300,
        mainClass: 'popup-animate',
        callbacks: {
            close: function() {
                $('table#edit-user-table').children('tbody').children('tr.edit-user-group-row').remove();
            }
        }
    });
}).on('click', 'button#groups-delete', function() {
    var groups_to_delete = {};
    $.each($('input[data-type="group-delete"]'), function() {
        if ($(this).attr('value') == 1) {
            groups_to_delete[$(this).attr('data-name')] = $(this).attr('data-id');
        }
    });
    if (Object.keys(groups_to_delete).length > 0) {
        $('p#delete-groups-list').text(Object.keys(groups_to_delete).join(', '));
        $.magnificPopup.open({
            items: {
                src: '#delete-groups-confirm-popup',
                type: 'inline',
                groups_to_delete: groups_to_delete
            },
            preloader: false,
            removalDelay: 300,
            mainClass: 'popup-animate'
        });
    } else {
        $('div#groups-panel-data').prepend('<div class="alert-box">No groups selected, nothing to delete</div>');
    }
}).on('click', 'button.edit-group', function() {
    var edit_group = $(this).attr('data-group');
    var edit_group_info = oncalendar.oncall_groups[edit_group];
    $('#edit-group-popup').children('h3').text('Edit Group ' + edit_group);
    $('input#edit-group-id').attr('value', edit_group_info.id);
    $('input#edit-group-name').val(edit_group);
    if (edit_group_info.active == 1) {
        $('button#edit-group-active-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
        $('input#edit-group-active').attr('value', 1);
    } else {
        $('button#edit-group-active-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
        $('input#edit-group-active').attr('value', 0);
    }
    if (edit_group_info.autorotate == 1) {
        $('button#edit-group-autorotate-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
        $('input#edit-group-autorotate').attr('value', 1);
    } else {
        $('button#edit-group-autorotate-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
        $('input#edit-group-autorotate').attr('value', 0);
    }
    $('button#edit-group-turnover-day-label').text(oc.day_strings[edit_group_info.turnover_day] + ' ').append('<span class="elegant_icons arrow_carrot-down');
    $('input#edit-group-turnover-day').attr('value', edit_group_info.turnover_day);
    $('button#edit-group-turnover-hour-label').text(edit_group_info.turnover_hour + ' ').append('<span class="elegant_icons arrow_carrot-down">');
    $('input#edit-group-turnover-hour').attr('value', edit_group_info.turnover_hour);
    $('button#edit-group-turnover-min-label').text(edit_group_info.turnover_min);
    $('input#edit-group-turnover-min').attr('value', edit_group_info.turnover_min);
    $('input#edit-group-email').val(edit_group_info.email);
    if (edit_group_info.shadow == 1) {
        $('button#edit-group-shadow-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
        $('input#edit-group-shadow').attr('value', 1);
    } else {
        $('button#edit-group-shadow-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
        $('input#edit-group-shadow').attr('value', 0);
    }
    if (edit_group_info.backup == 1) {
        $('button#edit-group-backup-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
        $('input#edit-group-backup').attr('value', 1);
    } else {
        $('button#edit-group-backup-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
        $('input#edit-group-backup').attr('value', 0);
    }
    if (email_gateway_config) {
        if (edit_group_info.failsafe == 1) {
            $('button#edit-group-failsafe-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
            $('input#edit-group-failsafe').attr('value', 1);
        } else {
            $('button#edit-group-failsafe-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
            $('input#edit-group-failsafe').attr('value', 0);
        }
        $('input#edit-group-alias').val(edit_group_info.alias);
        $('input#edit-group-backup-alias').val(edit_group_info.backup_alias);
        $('input#edit-group-failsafe-alias').val(edit_group_info.failsafe_alias);
    }
    $.magnificPopup.open({
        items: {
            src: '#edit-group-popup',
            type: 'inline'
        },
        preloader: false,
        removalDelay: 300,
        mainClass: 'popup-animate'
    });
});

// Event listener to populate the users tab when all victim info is loaded.
document.addEventListener('victims_loaded', function() {
    var users_panel = $('#users-panel-data');
    var users_table_data = [];
    users_panel.append('<table id="users-table" class="admin-table">');
    $.each(master_victims_list, function(id, victim_data) {
        victim_groups = [];
        $.each(victim_data.groups, function(group, active) {
            victim_groups.push(group);
        });
        var victim_sms_email = '';
        if (oncalendar.gateway_map[victim_data.sms_email] !== undefined) {
            victim_sms_email = oncalendar.gateway_map[victim_data.sms_email];
        }
        var delete_user_checkbox = '<button id="user-checkbox-' + id + '" ' +
            'class="oc-checkbox elegant_icons icon_box-empty" ' +
            'data-target="user-delete-' + id + '" ' +
            'data-checked="no"></button>' +
            '<input type="hidden" id="user-delete-' + id + '" ' +
            'name="user-delete-' + id + '" ' +
            'value="0" data-type="user-delete" ' +
            'data-username="' + victim_data.username + '" ' +
            'data-id="' + id + '">';
        var edit_user_button = '<button id="edit-user-' + id + '" ' +
            'class="elegant_icons icon_pencil-edit edit-user" data-user="' + id + '"></button>';
        users_table_data.push([
            delete_user_checkbox,
            edit_user_button,
            id,
            victim_data.username,
            victim_data.firstname,
            victim_data.lastname,
            victim_data.phone,
            victim_data.email,
            victim_sms_email,
            victim_data.throttle,
            oc.basic_boolean[victim_data.truncate],
            oc.roles[victim_data.app_role],
            victim_groups.join(', ')
        ]);
    });
    users_table_head = [
        {'sTitle': ''},
        {'sTitle': ''},
        {'sTitle': 'ID'},
        {'sTitle': 'Username'},
        {'sTitle': 'First Name'},
        {'sTitle': 'Last Name'},
        {'sTitle': 'Phone'},
        {'sTitle': 'Email'},
        {'sTitle': 'SMS Email'},
        {'sTitle': 'Throttle Level'},
        {'sTitle': 'Truncate'},
        {'sTitle': 'App Role'},
        {'sTitle': 'Groups'}
    ];

    $('table#users-table').dataTable({
        'aaData': users_table_data,
        'aoColumns': users_table_head,
        'info': false,
        'lengthChange': false,
        'paging': false
    });
    // Add the add and delete users buttons to the table wrapper
    $('div#users-table_wrapper').prepend('<div id="users-panel-buttons" class="tab-panel-buttons">' +
        '<button id="user-add" class="elegant_icons icon_plus_alt2"></button>' +
        '<button id="users-delete" class="elegant_icons icon_minus_alt2"></button>' +
        '</div>');

    // Remove the 'Search:' label from the search field and replace it
    // with placeholder text.
    $('div#users-table_filter').children('label').contents().filter(function() {
        return (this.nodeType == 3);
    }).remove();
    $('div#users-table_filter').children('label').children('input').attr('placeholder', 'Filter');

    users_panel.on('click', 'button#user-add', function() {
        $.each(oncalendar.oncall_groups, function(group, group_data) {
            $('table#add-user-table').append('<tr class="add-user-group-row">' +
                '<td>' + group + '</td><td>' +
                '<button id="add-user-group-active-' + group + '-checkbox" class="add-user-group-active oc-checkbox elegant_icons icon_box-empty" data-target="add-user-group-active-' + group + '" data-group="' + group + '" data-checked="no"></button>' +
                '<input type="hidden" id="add-user-group-active-' + group + '" name="add-user-group-active-' + group + '" class="add-user-group-active" data-group="' + group + '" value="0"></td>' +
                '<td><button id="add-user-group-inactive-' + group + '-checkbox" class="add-user-group-inactive oc-checkbox elegant_icons icon_box-empty" data-target="add-user-group-inactive-' + group + '" data-group="' + group + '" data-checked="no"></button>' +
                '<input type="hidden" id="add-user-group-inactive-' + group + '" name="add-user-group-inactive-' + group + '" class="add-user-group-inactive" data-group="' + group + '" value="0"></td>'
            );
        });
        $.magnificPopup.open({
            items: {
                src: '#add-user-popup',
                type: 'inline'
            },
            preloader: false,
            removalDelay: 300,
            mainClass: 'popup-animate',
            callbacks: {
                close: function() {
                    $('input#add-user-username').val('');
                    $('input#add-user-firstname').val('');
                    $('input#add-user-lastname').val('');
                    $('input#add-user-phone').val('');
                    $('input#add-user-email').val('');
                    $('button#add-user-sms-email-label').text('-- ').append('<span class="elegant_icons arrow_carrot-down">');
                    $('input#add-user-sms-email').attr('value', '');
                    $('input#add-user-throttle').val('');
                    $('button#add-user-truncate-button').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
                    $('input#add-user-truncate').attr('value', '0');
                    $('button#add-user-app-role-label').text('User ').append('<span class="elegant_icons arrow_carrot-down">');
                    $('input#add-user-app-role').attr('value', '0');
                    $('table#add-user-table').children('tbody').children('tr.add-user-group-row').remove();
                }
            }
        });
    });
});

// Handler for the app role dropdown menu
$('ul#add-user-app-role-options').on('click', 'li', function() {
    $('#add-user-app-role-label').text(oc.roles[$(this).attr('data-role')]).append('<span class="elegant_icons arrow_carrot-down">');
    $('input#add-user-app-role').attr('value', $(this).attr('data-role'));
});
$('ul#edit-user-app-role-options').on('click', 'li', function() {
    $('#edit-user-app-role-label').text(oc.roles[$(this).attr('data-role')]).append('<span class="elegant_icons arrow_carrot-down">');
    $('input#edit-user-app-role').attr('value', $(this).attr('data-role'));
});
// Handler for the sms email dropdown menu
$('ul#add-user-sms-email-options').on('click', 'li', function() {
    $('#add-user-sms-email-label').text(oncalendar.gateway_map[$(this).attr('data-gateway')]).append('<span class="elegant_icons arrow_carrot-down">');
    $('input#add-user-sms-email').attr('value', $(this).attr('data-gateway'));
});
$('ul#edit-user-sms-email-options').on('click', 'li', function() {
    $('#edit-user-sms-email-label').text(oncalendar.gateway_map[$(this).attr('data-gateway')]).append('<span class="elegant_icons arrow_carrot-down">');
    $('input#edit-user-sms-email').attr('value', $(this).attr('data-gateway'));
});

// Event listener to populate the groups tab once the group info is loaded.
document.addEventListener('group_info_loaded', function() {
    var groups_panel = $('#groups-panel-data');
    var groups_table_data = [];
    // Add the base table for the group info
    groups_panel.append('<table id="groups-table" class="admin-table">');
    // Process the incoming group info for inclusion in the table.
    $.each(oncalendar.oncall_groups, function(group, group_data) {
        var delete_group_checkbox = '<button id="group-checkbox-' + group_data.id + '" ' +
            'class="oc-checkbox elegant_icons icon_box-empty" ' +
            'data-target="group-delete-' + group_data.id + '" ' +
            'data-checked="no"></button>' +
            '<input type="hidden" id="group-delete-' + group_data.id + '" ' +
            'name="group-delete-' + group_data.id + '" ' +
            'value="0" data-type="group-delete" ' +
            'data-name="' + group_data.name + '" ' +
            'data-id="' + group_data.id + '">';
        var edit_group_button = '<button id="edit-group-' + group_data.id + '" ' +
            'class="elegant_icons icon_pencil-edit edit-group" data-group="' + group + '"></button>';
        // Data included is slightly different if OnCalendar is set up to use
        // email gateway config vs. pure API for notifications.
        if (email_gateway_config) {
            groups_table_data.push([
                delete_group_checkbox,
                edit_group_button,
                group_data.id,
                group_data.name,
                oc.basic_boolean[group_data.active],
                oc.basic_boolean[group_data.autorotate],
                oc.day_strings[group_data.turnover_day],
                group_data.turnover_hour + ':' + group_data.turnover_min,
                group_data.email,
                oc.basic_boolean[group_data.shadow],
                oc.basic_boolean[group_data.backup],
                group_data.alias,
                group_data.backup_alias,
                oc.basic_boolean[group_data.failsafe],
                group_data.failsafe_alias
            ]);
        } else {
            groups_table_data.push([
                delete_group_checkbox,
                edit_group_button,
                group_data.id,
                group_data.name,
                oc.basic_boolean[group_data.active],
                oc.basic_boolean[group_data.autorotate],
                oc.day_strings[group_data.turnover_day],
                group_data.turnover_hour + ':' + group_data.turnover_min,
                group_data.email,
                oc.basic_boolean[group_data.shadow],
                oc.basic_boolean[group_data.backup]
            ]);
        }
    });
    // Data included is slightly different if OnCalendar is set up to use
    // email gateway config vs. pure API for notifications.
    if (email_gateway_config) {
        groups_table_head = [
            {'sTitle': ''},
            {'sTitle': ''},
            {'sTitle': 'ID'},
            {'sTitle': 'Name'},
            {'sTitle': 'Active'},
            {'sTitle': 'Autorotate'},
            {'sTitle': 'Turnover Day'},
            {'sTitle': 'Turnover Time'},
            {'sTitle': 'Email'},
            {'sTitle': 'Shadow'},
            {'sTitle': 'Backup'},
            {'sTitle': 'Failsafe'},
            {'sTitle': 'Oncall Alias'},
            {'sTitle': 'Backup Alias'},
            {'sTitle': 'Failsafe Alias'}
        ]
    } else {
        groups_table_head= [
            {'sTitle': ''},
            {'sTitle': ''},
            {'sTitle': 'ID'},
            {'sTitle': 'Name'},
            {'sTitle': 'Active'},
            {'sTitle': 'Autorotate'},
            {'sTitle': 'Turnover Day'},
            {'sTitle': 'Turnover Time'},
            {'sTitle': 'Email'},
            {'sTitle': 'Shadow'},
            {'sTitle': 'Backup'}
        ]
    }
    // Build the dataTable with the groups info
    $('#groups-table').dataTable({
        'aaData': groups_table_data,
        'aoColumns': groups_table_head,
        'info': false,
        'lengthChange': false,
        'paging': false
    });
    // Add the add and delete groups buttons to the table wrapper
    $('div#groups-table_wrapper').prepend('<div id="groups-panel-buttons" class="tab-panel-buttons">' +
        '<button id="groups-add" class="elegant_icons icon_plus_alt2"></button>' +
        '<button id="groups-delete" class="elegant_icons icon_minus_alt2"></button>' +
        '</div>');

    // Remove the 'Search:' label from the search field and replace it
    // with placeholder text.
    $('div#groups-table_filter').children('label').contents().filter(function() {
        return (this.nodeType == 3);
    }).remove();
    $('div#groups-table_filter').children('label').children('input').attr('placeholder', 'Filter');

    // Handler for the add group button
    groups_panel.on('click', 'button#groups-add', function() {
        $.magnificPopup.open({
            items: {
                src: '#add-group-popup',
                type: 'inline'
            },
            preloader: false,
            removalDelay: 300,
            mainClass: 'popup-animate',
            callbacks: {
                close: function() {
                    $('input#new-group-name').val('');
                    $('button#new-group-active-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
                    $('input#new-group-active').attr('value', '1');
                    $('button#new-group-autorotate-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
                    $('input#new-group-autorotate').attr('value', '1');
                    $('button#new-group-turnover-day-label').text('Monday ').append('<span class="elegant_icons arrow_carrot-down">');
                    $('input#new-group-turnover-day').attr('value', '1');
                    $('button#new-group-turnover-hour-label').text('09 ').append('<span class="elegant_icons arrow_carrot-down">');
                    $('input#new-group-turnover-hour').attr('value', '09');
                    $('button#new-group-turnover-min-label').text('30 ').append('<span class="elegant_icons arrow_carrot-down">');
                    $('input#new-group-turnover-hour').attr('value', '30');
                    $('input#new-group-email').val('');
                    $('button#new-group-shadow-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
                    $('input#new-group-shadow').attr('value', '0');
                    $('button#new-group-backup-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
                    if (email_gateway_config) {
                        $('button#new-group-failsafe-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
                        $('input#new-group-failsafe').attr('value', '0');
                        $('input#new-group-alias').val('');
                        $('input#new-group-backup-alias').val('');
                        $('input#new-group-failsafe-alias').val('');
                    }
                    $('div#add-group-popup').children('.alert-box').remove();
                }
            }
        });
    });
    $('div#working').remove();
});

// Handlers for the turnover day, hour and minute dropdown menus
$('ul#new-group-turnover-day-options').on('click', 'li', function() {
    $('#new-group-turnover-day-label').text(oc.day_strings[$(this).attr('data-day')]).append('<span class="elegant_icons arrow_carrot-down">');
    $('input#new-group-turnover-day').attr('value', $(this).attr('data-day'));
});
$('ul#edit-group-turnover-day-options').on('click', 'li', function() {
    $('#edit-group-turnover-day-label').text(oc.day_strings[$(this).attr('data-day')]).append('<span class="elegant_icons arrow_carrot-down">');
    $('input#edit-group-turnover-day').attr('value', $(this).attr('data-day'));
});
$('ul#new-group-turnover-hour-options').on('click', 'li', function() {
    $('#new-group-turnover-hour-label').text($(this).attr('data-hour')).append('<span class="elegant_icons arrow_carrot-down">');
    $('input#new-group-turnover-hour').attr('value', $(this).attr('data-hour'));
});
$('ul#edit-group-turnover-hour-options').on('click', 'li', function() {
    $('#edit-group-turnover-hour-label').text($(this).attr('data-hour')).append('<span class="elegant_icons arrow_carrot-down">');
    $('input#edit-group-turnover-hour').attr('value', $(this).attr('data-hour'));
});
$('ul#new-group-turnover-min-options').on('click', 'li', function() {
    $('#new-group-turnover-min-label').text($(this).attr('data-min')).append('<span class="elegant_icons arrow_carrot-down">');
    $('input#new-group-turnover-min').attr('value', $(this).attr('data-min'));
});
$('ul#edit-group-turnover-min-options').on('click', 'li', function() {
    $('#edit-group-turnover-min-label').text($(this).attr('data-min')).append('<span class="elegant_icons arrow_carrot-down">');
    $('input#edit-group-turnover-min').attr('value', $(this).attr('data-min'));
});

// Handlers for the dialog box buttons.
// Add user dialog
$('#add-user-popup').on('click', 'button.add-user-group-active', function() {
    if ($(this).attr('data-checked') === "no") {
        var group_flip = $(this).attr('data-group');
        $('button#add-user-group-inactive-' + group_flip + '-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
        $('input#add-user-group-inactive-' + group_flip).attr('value', '0');
    }
}).on('click', 'button.add-user-group-inactive', function() {
    if ($(this).attr('data-checked') === "no") {
        var group_flip = $(this).attr('data-group');
        $('button#add-user-group-active-' + group_flip + '-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
        $('input#add-user-group-active-' + group_flip).attr('value', '0');
    }
}).on('click', 'button#cancel-add-user-button', function() {
    $.magnificPopup.close();
}).on('click', 'button#save-add-user-button', function() {
    if ($('input#add-user-phone').val() !== undefined) {
        var victim_phone = $('input#add-user-phone').val().replace(/\D/g,'');
        if (victim_phone.length == 10 ) {
            victim_phone = "1" + victim_phone;
        } else if (victim_phone.length == 11) {
            var country_code = victim_phone.substring(0,1);
            if (country_code !== "1") {
                victim_phone = "1" + victim_phone.substring(1)
            }
        }
        $('input#add-user-phone').val(victim_phone);
    }
    if ($('input#add-user-username').val() === undefined || $('input#add-user-username').val().length == 0) {
        $('input#add-user-username').addClass('missing-input').focus();
    } else if ($('input#add-user-firstname').val() === undefined || $('input#add-user-firstname').val().length == 0) {
        $('input#add-user-firstname').addClass('missing-input').focus();
    } else if ($('input#add-user-lastname').val() === undefined || $('input#add-user-lastname').val().length == 0) {
        $('input#add-user-lastname').addClass('missing-input').focus();
    } else if ($('input#add-user-email').val() === undefined || $('input#add-user-email').val().length == 0 || !valid_email($('input#add-user-email').val())) {
        $('input#add-user-email').addClass('missing-input').focus();
    } else if ($('input#add-user-throttle').val() < 6) {
        $('input#add-user-throttle').addClass('missing-input').val('6').focus();
    } else if ($('input#add-user-phone').val() === undefined || $('input#add-user-phone').val().length !== 11) {
        $('input#add-user-phone').addClass('missing-input').focus();
    } else {
        var new_user_data = {
            username: $('input#add-user-username').val(),
            firstname: $('input#add-user-firstname').val(),
            lastname: $('input#add-user-lastname').val(),
            phone: $('input#add-user-phone').val(),
            email: $('input#add-user-email').val(),
            sms_email: $('input#add-user-sms-email').attr('value'),
            throttle: $('input#add-user-throttle').val(),
            truncate: $('input#add-user-truncate').attr('value'),
            app_role: $('input#add-user-app-role').attr('value'),
            groups: {}
        };
        $.each($('tr.add-user-group-row'), function() {
            var group_active = $(this).children('td').children('input.add-user-group-active');
            var group_inactive = $(this).children('td').children('input.add-user-group-inactive');
            if ($(group_active).attr('value') === "1") {
                new_user_data.groups[$(group_active).attr('data-group')] = 1;
            } else if ($(group_inactive).attr('value') === "1") {
                new_user_data.groups[$(group_inactive).attr('data-group')] = 0;
            }
        });

        $.when(oncalendar.add_new_victim(new_user_data)).then(
            function(data) {
                new_victim_id = data.id;
                master_victims_list[new_victim_id] = data;
                $('table#users-table').DataTable().destroy({remove: true});
                document.dispatchEvent(oc_victims_event);
                $.magnificPopup.close();
                $('div#users-panel-data').prepend('<div class="info-box">New user ' + data.username + ' added.');
            },
            function(data) {
                $('div#add-user-popup').prepend('<div class="alert-box">Add user ' + new_user_data.username + ' failed: ' + data + '</div>');
            }
        )
    }
});
// Delete user(s) confirmation dialog
$('#delete-victims-confirm-popup').on('click', 'button#delete-victims-cancel-button', function() {
    $.magnificPopup.close();
    $('p#delete-victims-list').empty();
}).on('click', 'button#delete-victims-confirm-button', function() {
    $.each($.magnificPopup.instance.items[0].data.users_to_delete, function(username, id) {
        $.when(oncalendar.delete_victim(id)).then(
            function(data) {},
            function(data) {
                $('div#delete-victims-confirm-popup').prepend('<div class="alert-box">Could not remove user ' + username + ': ' + data + '</div>');
            }
        )
    });
    $.when(oncalendar.get_victims()).then(
        function(data) {
            master_victims_list = data;
            $('table#users-table').DataTable().destroy({remove: true});
            document.dispatchEvent(oc_victims_event);
            $.magnificPopup.close();
        },
        function(data) {
            $.magnificPopup.close();
            $('div#users-panel-data').prepend('<div class="alert-box">Error loading updated user list: ' + data + '</div>');
        }
    )
});
// Edit user dialog.
$('#edit-user-popup').on('click', 'button.edit-user-group-active', function() {
    if ($(this).attr('data-checked') === "no") {
        var group_flip = $(this).attr('data-group');
        $('button#edit-user-group-inactive-' + group_flip + '-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
        $('input#edit-user-group-inactive-' + group_flip).attr('value', '0');
    }
}).on('click', 'button.edit-user-group-inactive', function() {
    if ($(this).attr('data-checked') === "no") {
        var group_flip = $(this).attr('data-group');
        $('button#edit-user-group-active-' + group_flip + '-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
        $('input#edit-user-group-active-' + group_flip).attr('value', '0');
    }
}).on('click', 'button#cancel-edit-user-button', function() {
    $.magnificPopup.close();
}).on('click', 'button#save-edit-user-button', function() {
    if ($('input#edit-user-phone').val() !== undefined) {
        var victim_phone = $('input#edit-user-phone').val().replace(/\D/g,'');
        if (victim_phone.length == 10 ) {
            victim_phone = "1" + victim_phone;
        } else if (victim_phone.length == 11) {
            var country_code = victim_phone.substring(0,1);
            if (country_code !== "1") {
                victim_phone = "1" + victim_phone.substring(1)
            }
        }
        $('input#edit-user-phone').val(victim_phone);
    }
    if ($('input#edit-user-username').val() === undefined || $('input#edit-user-username').val().length == 0) {
        $('input#edit-user-username').addClass('missing-input').focus();
    } else if ($('input#edit-user-firstname').val() === undefined || $('input#edit-user-firstname').val().length == 0) {
        $('input#edit-user-lastname').addClass('missing-input').focus();
    } else if ($('input#edit-user-lastname').val() === undefined || $('input#edit-user-lastname').val().length == 0) {
        $('input#edit-user-lastname').addClass('missing-input').focus();
    } else if ($('input#edit-user-email').val() === undefined || $('input#edit-user-email').val().length == 0 || !valid_email($('input#edit-user-email').val())) {
        $('input#edit-user-email').addClass('missing-input').focus();
    } else if ($('input#edit-user-throttle').val() === undefined || $('input#edit-user-throttle').val() < 6) {
        $('input#edit-user-throttle').addClass('missing-input').val('6').focus();
    } else if ($('input#edit-user-phone').val() === undefined || $('input#edit-user-phone').val().length !== 11) {
        $('input#edit-user-phone').addClass('missing-input').focus();
    } else {
        var edit_user_data = {
            id: $('input#edit-user-id').attr('value'),
            username: $('input#edit-user-username').val(),
            firstname: $('input#edit-user-firstname').val(),
            lastname: $('input#edit-user-lastname').val(),
            phone: $('input#edit-user-phone').val(),
            email: $('input#edit-user-email').val(),
            sms_email: $('input#edit-user-sms-email').attr('value'),
            throttle: $('input#edit-user-throttle').val(),
            truncate: $('input#edit-user-truncate').attr('value'),
            app_role: $('input#edit-user-app-role').attr('value'),
            groups: {}
        };
        $.each($('tr.edit-user-group-row'), function() {
            var group_active = $(this).children('td').children('input.edit-user-group-active');
            var group_inactive = $(this).children('td').children('input.edit-user-group-inactive');
            if ($(group_active).attr('value') === "1") {
                edit_user_data.groups[$(group_active).attr('data-group')] = 1;
            } else if ($(group_inactive).attr('value') === "1") {
                edit_user_data.groups[$(group_inactive).attr('data-group')] = 0;
            }
        });

        $.when(oncalendar.update_victim_info(edit_user_data.id, edit_user_data)).then(
            function(data) {
                master_victims_list[data.id] = data;
                $('table#users-table').DataTable().destroy({remove: true});
                document.dispatchEvent(oc_victims_event);
                $.magnificPopup.close();
                $('div#users-panel-data').prepend('<div class="info-box">User info for ' + data.username + ' successfully updated.</div>');
            },
            function(data) {
                $('div#edit-user-popup').prepend('<div class="alert-box">Editing info for user ' + edit_user_data.username + ' failed: ' + data + '</div>');
            }
        )
    }
});
// Add group dialog.
$('#add-group-popup').on('click', 'button#cancel-add-group-button', function() {
    $.magnificPopup.close();
}).on('click', 'button#save-add-group-button', function() {
    if ($('input#new-group-name').val() === undefined || $('input#new-group-name').val().length == 0) {
        $('input#new-group-name').addClass('missing-input').focus();
    } else {
        var new_group_name = $('input#new-group-name').val();
        var new_group_data = {
            name: new_group_name,
            active: $('input#new-group-active').attr('value'),
            autorotate: $('input#new-group-autorotate').attr('value'),
            turnover_day: $('input#new-group-turnover_day').attr('value'),
            turnover_hour: $('input#new-group-turnover-hour').attr('value'),
            turnover_min: $('input#new-group-turnover-min').attr('value'),
            email: $('input#new-group-email').val(),
            shadow: $('input#new-group-shadow').attr('value'),
            backup: $('input#new-group-backup').attr('value')
        };
        if (email_gateway_config) {
            new_group_data.failsafe = $('input#new-group-failsafe').attr('value');
            new_group_data.alias = $('input#new-group-alias').val();
            new_group_data.backup_alias = $('input#new-group-backup-alias').val();
            new_group_data.failsafe_alias = $('input#new-group-failsafe-alias').val();
        }

        $.when(oncalendar.add_new_group(new_group_data)).then(
            function(data) {
                if (data.turnover_hour < 10) {
                    data.turnover_hour = "0" + data.turnover_hour;
                }
                if (data.turnover_min < 10) {
                    data.turnover_min = "0" + data.turnover_min;
                }
                oncalendar.oncall_groups[new_group_name] = data;
                $('table#groups-table').DataTable().destroy({remove: true});
                document.dispatchEvent(oc_group_event);
                $.magnificPopup.close();
                $('div#groups-panel-data').prepend('<div class="info-box">New group ' + new_group_name + ' added.');
            },
            function(data) {
                $('div#add-group-popup').prepend('<div class="alert-box">Add group ' + new_group_name + ' failed: ' + data + '</div>');
            }
        )
    }
});
// Delete group(s) confirmation dialog
$('#delete-groups-confirm-popup').on('click', 'button#delete-groups-cancel-button', function() {
    $.magnificPopup.close();
    $('p#delete-groups-list').empty();
}).on('click', 'button#delete-groups-confirm-button', function() {
    $.each($.magnificPopup.instance.items[0].data.groups_to_delete, function(name, id) {
        $.when(oncalendar.delete_group(id)).then(
            function(data) {},
            function(data) {
                $('div#delete-groups-confirm-popup').prepend('<div class="alert-box">Could not remove group ' + name + ': ' + data + '</div>');
            }
        )
    });
    $.when(oncalendar.get_group_info()).then(
        function(data) {
            oncalendar.oncall_groups = data;
            $('table#groups-table').DataTable().destroy({remove: true});
            document.dispatchEvent(oc_group_event);
            $.magnificPopup.close();
        },
        function(data) {
            $.magnificPopup.close();
            $('div#groups-panel-data').prepend('<div class="alert-box">Error loading updated group list: ' + data + '</div>');
        }
    )
});
// Edit group dialog
$('#edit-group-popup').on('click', 'button#cancel-edit-group-button', function() {
    $.magnificPopup.close();
}).on('click', 'button#save-edit-group-button', function() {
    if ($('input#edit-group-name').val() === undefined || $('input#edit-group-name').val().length == 0) {
        $('input#edit-group-name').addClass('missing-input').focus();
    } else if ($('input#edit-group-email').val() !== undefined && !valid_email($('input#edit-group-email').val())) {
        $('input#edit-group-email').addClass('missing-input').focus();
    } else {
        var edit_group_name = $('input#edit-group-name').val();
        var edit_group_data = {
            name: edit_group_name,
            id: $('input#edit-group-id').attr('value'),
            active: $('input#edit-group-active').attr('value'),
            autorotate: $('input#edit-group-autorotate').attr('value'),
            turnover_day: $('input#edit-group-turnover-day').attr('value'),
            turnover_hour: $('input#edit-group-turnover-hour').attr('value'),
            turnover_min: $('input#edit-group-turnover-min').attr('value'),
            email: $('input#edit-group-email').val(),
            shadow: $('input#edit-group-shadow').attr('value'),
            backup: $('input#edit-group-backup').attr('value')
        };
        if (email_gateway_config) {
            edit_group_data.failsafe = $('input#edit-group-failsafe').attr('value');
            edit_group_data.alias = $('input#edit-group-alias').val();
            edit_group_data.backup_alias = $('input#edit-group-backup-alias').val();
            edit_group_data.failsafe_alias = $('input#edit-group-failsafe-alias').val();
        }

        $.when(oncalendar.update_group(edit_group_data)).then(
            function(data) {
                if (data.turnover_hour < 10) {
                    data.turnover_hour = "0" + data.turnover_hour;
                }
                if (data.turnover_min < 10) {
                    data.turnover_min = "0" + data.turnover_min;
                }
                oncalendar.oncall_groups[data.name] = data;
                $('table#groups-table').DataTable().destroy({remove: true});
                document.dispatchEvent(oc_group_event);
                $.magnificPopup.close();
                $('div#groups-panel-data').prepend('<div class="info-box">Group ' + data.name + ' update successful.</div>');
            },
            function(data) {
                $('div#edit-group-popup').prepend('<div class="alert-box">Editing group ' + edit_group_name + ' failed: ' + data + '</div>');
            }
        )
    }
});

{% endblock %}