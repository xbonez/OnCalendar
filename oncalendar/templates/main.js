//-------------------------------------
// General Setup
//-------------------------------------

var current_user = {};
var oc_user_event = new Event('user_info_loaded');
var oc_group_event = new Event ('group_info_loaded');

var swap_bg = {
    oncall: 'rgba(255, 150, 150, 0.4)',
    shadow: 'rgba(250, 250, 150, 0.4)',
    backup: 'rgba(150, 255, 150, 0.4)'
};

// Config setting for email gateway paging, if true things change a bit
// in some of the info and menus
var email_gateway_config = {{ email_gateway_config }};

// If the user is logged in, get their info,
// otherwise use generic anonymous info
{% if g.user.is_anonymous() %}
current_user = {{ user_json }};
{% else %}
$.when(oncalendar.get_victim_info('id', {{ g.user.id }})).then(function(data) {
    current_user = data[{{ g.user.id }}];
    document.dispatchEvent(oc_user_event);
});
{% endif %}

// Set up group turnover info and color key
oncalendar.group_color_map = {};
$.when(oncalendar.get_group_info()).then(function(data) {
    oncalendar.oncall_groups = data;
    if (typeof oncalendar.oncall_groups === "undefined") {
        alert('no group info found, please try again');
    }
    group_count = 0;
    $.each(Object.keys(oncalendar.oncall_groups).sort(), function (i, name) {
        if (oncalendar.oncall_groups[name].turnover_hour < 10) {
            oncalendar.oncall_groups[name].turnover_hour = '0' + oncalendar.oncall_groups[name].turnover_hour;
        }
        if (oncalendar.oncall_groups[name].turnover_min < 10) {
            oncalendar.oncall_groups[name].turnover_min = '0' + oncalendar.oncall_groups[name].turnover_min;
        }
        oncalendar.oncall_groups[name].turnover_string = oncalendar.oncall_groups[name].turnover_hour + '-' + oncalendar.oncall_groups[name].turnover_min;
        oncalendar.group_color_map[name] = color_wheel.Wheel[5][group_count];
        group_count++;
    });
    document.dispatchEvent(oc_group_event);
});

$(document).on('keydown', 'input.numeric-input', function(e) {
    // Text fields that need numeric values are forced to only
    // accept numeric input
    var a = [8,9,13,16,17,18,20,27,35,36,37,38,40,45,46,91,92,192];
    var k = e.which;
    for (i = 48; i < 58; i++) {
        a.push(i);
    }
    for (i = 96; i < 106; i++) {
        a.push(i);
    }
    if (!(a.indexOf(k) >= 0)) {
        e.preventDefault();
    }
})


//-------------------------------------
// Page specific functions, for the main calendar display
//-------------------------------------
{% block page_script %}

var sms_gateways = {{ sms_gateway_options }};
oncalendar.gateway_map = {};

$(document).ready(function() {
    // Autocomplete suggestions for adding victims to a group
    $('input#add-victim-username').autocomplete({
        minChars: 2,
        serviceUrl: '/api/victims/suggest',
        containerClass: 'autocomplete-suggestions dropdown-menu',
        appendTo: '#victim-username-textbox',
        zIndex: 9999,
        maxHeight: 300,
        maxWidth: 300,
        onSelect: function(suggestion) {
            $('input#victim-id').attr('value', suggestion.data.id);
            $('input#add-victim-firstname').val(suggestion.data.firstname);
            $('input#add-victim-lastname').val(suggestion.data.lastname);
            $('input#add-victim-phone').val(suggestion.data.phone);
            $('input#add-victim-email').val(suggestion.data.email);
            var sms_email_suggestion = '';
            if (oncalendar.gateway_map[suggestion.data.sms_email] !== undefined) {
                $('button#add-victim-sms-email-label').text(oncalendar.gateway_map[suggestion.data.sms_email]).append('<span class="elegant_icons arrow_carrot-down">');
                $('input#add-victim-sms-email').attr('value', suggestion.data.sms_email);
            }
            $.each(suggestion.data.groups, function(group, status) {
                if (group !== "null") {
                    $('tr#victim-table-divider').children('td').append('<input type="hidden" class="victim-group" id="victim-group-' + group + '" data-group="' + group + '" value="' + status + '">');
                }
            });
        }
    });

    $.each(sms_gateways, function(i, gateway) {
        var domain = Object.keys(gateway)[0];
        oncalendar.gateway_map[domain] = gateway[domain]
        $('ul#edit-account-sms-email-options').append('<li data-gateway="' + domain + '"><span>' + gateway[domain] + '</span></li>');
        $('ul#add-victim-sms-email-options').append('<li data-gateway="' + domain + '"><span>' + gateway[domain] + '</span></li>');
    });
    // Handler for user menu items
    $('div#user-menu')
        .on('click', 'li#user-login', function() {
            window.location.href = '/login';
        })
        .on('click', 'li#user-logout', function() {
            window.location.href = '/logout';
        })
        .on('click', 'li#oncalendar-admin', function() {
            window.location.href = '/admin';
        })
        .on('click', 'li#edit-account-menu-option', function() {
        $.magnificPopup.open({
            items: {
                src: '#edit-account-info-popup',
                type: 'inline'
            },
            preloader: false,
            removalDelay: 300,
            mainClass: 'popup-animate',
            callbacks: {
                open: function() {
                    if (oncalendar.gateway_map[current_user.sms_email] !== undefined) {
                        $('button#edit-account-sms-email-label').text(oncalendar.gateway_map[current_user.sms_email]).append('<span class="elegant_icons arrow_carrot-down">');
                        $('input#edit-account-sms-email').attr('value', current_user.sms_email);
                    }
                }
            }
        });
    });
});

// Listen for the user_info_loaded event and populate
// the account info form when we have it
document.addEventListener('user_info_loaded', function() {
    $('input#edit-account-firstname').val(current_user.firstname);
    $('input#edit-account-lastname').val(current_user.lastname);
    $('input#edit-account-phone').val(current_user.phone);
    $('input#edit-account-email').val(current_user.email);
    if (oncalendar.gateway_map[current_user.sms_email] !== undefined) {
        $('button#edit-account-sms-email-label').text(oncalendar.gateway_map[current_user.sms_email]).append('<span class="elegant_icons arrow_carrot-down">');
        $('input#edit-account-sms-email').attr('value', current_user.sms_email);
    }
    $('input#edit-account-throttle').val(current_user.throttle);
    if (current_user.truncate > 0) {
        $('button#edit-account-truncate-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
        $('input#edit-account-truncate').attr('value', 'yes');
    }
    $.each(current_user.groups, function(group, active) {
        $('table#account-info-table').children('tbody').append('<tr><td>' + group + '</td>' +
            '<td><button id="edit-account-' + group + '-active-checkbox" class="oc-checkbox elegant_icons icon_box-checked" data-target="edit-account-' + group + '-active" data-group="' + group + '" data-checked="yes"></button>' +
            '<input type="hidden" id="edit-account-' + group + '-active" name="edit-account-' + group + '-active" class="group-active-input" data-group="' + group + '" value="yes"></td><td colspan="5"></td></tr>');
        if (active == 0) {
            $('button#edit-account-' + group + '-active-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
            $('input#edit-account-' + group + '-active').attr('value', 'no');
        }
    });
}, false);

// Listen for the group_info_loaded event and populate the group header info
document.addEventListener('group_info_loaded', function() {
    $.each(Object.keys(oncalendar.oncall_groups).sort(), function (i, name) {
        if (oncalendar.oncall_groups[name].active == 1 && oncalendar.oncall_groups[name].autorotate == 1) {
            if (typeof sessionStorage['display_group'] !== "undefined" && sessionStorage['display_group'] === name) {
                $('div#group-legend').append('<div class="expander open" data-state="open" data-group="' +
                    name + '" data-groupid="' + oncalendar.oncall_groups[name].id + '">' +
                    '<span class="group-legend-entry" style="color: ' + oncalendar.group_color_map[name] + ';">' + name + '</span></div>');
                populate_group_info(name);
                $('div#group-options-bar').removeClass('hide');
            } else {
                $('div#group-legend').append('<div class="expander" data-state="closed" data-group="' +
                    name + '" data-groupid="' + oncalendar.oncall_groups[name].id + '">' +
                    '<span class="group-legend-entry" style="color: ' + oncalendar.group_color_map[name] + ';">' + name + '</span></div>');
            }
        }
    });

    // Build and display the calendar
    var incoming_month = {{ month }};
    var incoming_year = {{ year }};
    $.when(oncalendar.build_calendar(incoming_year, incoming_month)).then(
        function() {
            oncalendar.display_calendar();
            $('div#working').remove();
        }
    );

}, false);

//-------------------------------------
// Utility functions
//-------------------------------------

// Edit the schedule for a specific day
var edit_calday = function(target_group, calday, cal_date) {
    var edit_time = new Date();
    var date_bits = cal_date.split('-');

    if ((date_bits[1] === edit_time.toString('M')) && (date_bits[2] === edit_time.toString('d'))) {
        var start_slot = parseInt(edit_time.toString('H')),
            start_min = parseInt(edit_time.toString('m'));
    } else {
        var start_slot = 0,
            start_min = 0;
    }

    var day_slots_table = $('table#edit-day-slots-table');
    day_slots_table.append('<tr><th width="25%"><th width="25%"><th width="25%"><th width="25%"></th></tr>');

    if (start_min >= 30) {
        var h = start_slot;
        if (h < 10) {
            h = '0' + h;
        }
        day_slots_table
            .append('<tr id="slot-' + h + '-30-oncall" class="oncall-row" data-type="oncall"><td>' + h + ':30</td><td>Oncall:</td>' +
                '<td class="menu-column"><span class="edit-slot-menu dropdown">' +
                '<span data-toggle="dropdown">' +
                '<button id="slot-' + h + '-30-oncall-button" class="edit-day-oncall-button" data-slot="' + h + '-30">--</button></span>' +
                '<ul id="slot-' + h + '-30-victim-options" class="slot-menu slot-options dropdown-menu" role="menu"></ul></span></td><td class="start-end"></td></tr>')
            .append('<tr id="slot-' + h + '-30-shadow" class="shadow-row hide" data-type="shadow"><td></td><td>Shadow:</td>' +
                '<td class="menu-column"><span class="edit-slot-menu dropdown">' +
                '<span data-toggle="dropdown">' +
                '<button id="slot-' + h + '-30-shadow-button" class="edit-day-shadow-button" data-slot="' + h + '-30">--</button></span>' +
                '<ul id="slot-' + h + '-30-shadow-options" class="slot-menu slot-options dropdown-menu" role="menu"></ul></span></td><td class="start-end"></td></tr>')
            .append('<tr id="slot-' + h + '-30-backup" class="backup-row hide" data-type="backup"><td></td><td>Backup:</td>' +
                '<td class="menu-column"><span class="edit-slot-menu dropdown">' +
                '<span data-toggle="dropdown">' +
                '<button id="slot-' + h + '-30-backup-button" class="edit-day-backup-button" data-slot="' + h + '-30">--</button></span>' +
                '<ul id="slot-' + h + '-30-backup-options" class="slot-menu slot-options dropdown-menu" role="menu"></ul></span></td><td class="start-end"></td></tr>');
        start_slot += 1;
    }

    for (i = start_slot; i <= 23; i++) {
        if (i < 10) {
            i = '0' + i;
        }
        day_slots_table
            .append('<tr id="slot-' + i + '-00-oncall" class="oncall-row" data-type="oncall"><td>' + i + ':00</td><td>Oncall:</td>' +
                '<td class="menu-column"><span class="edit-slot-menu dropdown">' +
                '<span data-toggle="dropdown">' +
                '<button id="slot-' + i + '-00-oncall-button" class="edit-day-oncall-button" data-slot="' + i + '-00">--</button></span>' +
                '<ul id="slot-' + i + '-00-victim-options" class="slot-menu dropdown-menu" role="menu"></ul></span></td><td class="start-end"></td></tr>')
            .append('<tr id="slot-' + i + '-00-shadow" class="shadow-row hide" data-type="shadow"><td></td><td>Shadow:</td>' +
                '<td class="menu-column"><span class="edit-slot-menu dropdown">' +
                '<span data-toggle="dropdown">' +
                '<button id="slot-' + i + '-00-shadow-button" class="edit-day-shadow-button" data-slot="' + i + '-00">--</button></span>' +
                '<ul id="slot-' + i + '-00-shadow-options" class="slot-menu dropdown-menu" role="menu"></ul></span></td><td class="start-end"></td></tr>')
            .append('<tr id="slot-' + i + '-00-backup" class="backup-row hide" data-type="backup"><td></td><td>Backup:</td>' +
                '<td class="menu-column"><span class="edit-slot-menu dropdown">' +
                '<span data-toggle="dropdown">' +
                '<button id="slot-' + i + '-00-backup-button" class="edit-day-backup-button" data-slot="' + i + '-00">--</button></span>' +
                '<ul id="slot-' + i + '-00-backup-options" class="slot-menu dropdown-menu" role="menu"></ul></span></td><td class="start-end"></td></tr>')
            .append('<tr id="slot-' + i + '-30-oncall" class="oncall-row" data-type="oncall"><td>' + i + ':30</td><td>Oncall:</td>' +
                '<td class="menu-column"><span class="edit-slot-menu dropdown">' +
                '<span data-toggle="dropdown">' +
                '<button id="slot-' + i + '-30-oncall-button" class="edit-day-oncall-button" data-slot="' + i + '-30">--</button></span>' +
                '<ul id="slot-' + i + '-30-victim-options" class="slot-menu slot-options dropdown-menu" role="menu"></ul></span></td><td class="start-end"></td></tr>')
            .append('<tr id="slot-' + i + '-30-shadow" class="shadow-row hide" data-type="shadow"><td></td><td>Shadow:</td>' +
                '<td class="menu-column"><span class="edit-slot-menu dropdown">' +
                '<span data-toggle="dropdown">' +
                '<button id="slot-' + i + '-30-shadow-button" class="edit-day-shadow-button" data-slot="' + i + '-30">--</button></span>' +
                '<ul id="slot-' + i + '-30-shadow-options" class="slot-menu slot-options dropdown-menu" role="menu"></ul></span></td><td class="start-end"></td></tr>')
            .append('<tr id="slot-' + i + '-30-backup" class="backup-row hide" data-type="backup"><td></td><td>Backup:</td>' +
                '<td class="menu-column"><span class="edit-slot-menu dropdown">' +
                '<span data-toggle="dropdown">' +
                '<button id="slot-' + i + '-30-backup-button" class="edit-day-backup-button" data-slot="' + i + '-30">--</button></span>' +
                '<ul id="slot-' + i + '-30-backup-options" class="slot-menu slot-options dropdown-menu" role="menu"></ul></span></td><td class="start-end"></td></tr>')
    }

    $('#edit-day-group').text(' - ' + target_group);

    // Show the shadow and/or backup options if configured
    if (oncalendar.oncall_groups[target_group].shadow == 1) {
        $('tr.shadow-row').removeClass('hide');
    }
    if (oncalendar.oncall_groups[target_group].backup == 1) {
        $('tr.backup-row').removeClass('hide');
    }

    $('button#edit-day-save-button').attr('data-calday', calday).attr('data-group', target_group).attr('data-date', cal_date);

    // Build the dropdown menu of victim choices
    $('ul.slot-menu').append('<li class="slot-item" data-target="--"><span>--</span></li>');
    $.each(oncalendar.oncall_groups[target_group].victims, function(i, victim) {
        if (victim.group_active == 1) {
            $('ul.slot-menu').append('<li class="slot-item" data-target="' + victim.username + '"><span>' + victim.username + '</span></li>');
        }
    });

    // Populate the slot menus for the day
    $.each(Object.keys(oncalendar.victims[calday].slots).sort(), function(i, slot) {
        $('button#slot-' + slot + '-oncall-button').text(
                typeof oncalendar.victims[calday].slots[slot][target_group] !== "undefined" &&
                    oncalendar.victims[calday].slots[slot][target_group].oncall !== null ?
                    oncalendar.victims[calday].slots[slot][target_group].oncall : '--'
        )
        .append('<span class="elegant_icons arrow_carrot-down">');
        $('button#slot-' + slot + '-shadow-button').text(
                typeof oncalendar.victims[calday].slots[slot][target_group] !== "undefined" &&
                    oncalendar.victims[calday].slots[slot][target_group].shadow !== null ?
                    oncalendar.victims[calday].slots[slot][target_group].shadow : '--'
        )
        .append('<span class="elegant_icons arrow_carrot-down">');
        $('button#slot-' + slot + '-backup-button').text(
                typeof oncalendar.victims[calday].slots[slot][target_group] !== "undefined" &&
                    oncalendar.victims[calday].slots[slot][target_group].backup !== null ?
                    oncalendar.victims[calday].slots[slot][target_group].backup : '--'
        )
        .append('<span class="elegant_icons arrow_carrot-down">');
    });

    oncalendar.swap_start = {
        oncall: 0,
        shadow: 0,
        backup: 0
    };

    // Open the dialog box
    $.magnificPopup.open({
        items: {
            src: '#edit-day-popup',
            type: 'inline'
        },
        preloader: false,
        removalDelay: 300,
        mainClass: 'popup-animate',
        callbacks: {
            close: function() {
                $('#edit-day-group').empty();
                $('table#edit-day-slots-table').empty();
                $('textarea#edit-day-note').val('').removeClass('missing-input');
                $('button.edit-day-oncall-button').text('').removeAttr('data-target', '');
                $('button.edit-day-shadow-button').text('').removeAttr('data-target', '');
                $('button#edit-day-save-button').removeAttr('data-calday', '').removeAttr('data-group', '');
            }
        }
    });
};

var reset_swap_button = function(row_button) {
    row_button.text(row_button.attr('data-original'))
        .attr('data-target', row_button.attr('data-original'))
        .append('<span class="elegant_icons arrow_carrot-down">');
};

var reset_swap_endpoint = function(row) {
    row.removeClass('swap-period-' + oncalendar.swap_type).css('background-color', '');
    row.children('td.start-end').empty();
};

var reset_swap_row = function(row) {
    row.css('background-color', '');
};

var set_swap_start_row = function(row) {
    row.addClass('swap-period-' + oncalendar.swap_type).css('background-color', swap_bg[oncalendar.swap_type]);
    row.children('td.start-end').text(oncalendar.swap_type + ' Swap Start');
    oncalendar.swap_start_row = row;
};

var set_swap_end_row = function(row) {
    row.addClass('swap-period-' + oncalendar.swap_type).css('background-color', swap_bg[oncalendar.swap_type]);
    row.children('td.start-end').text(oncalendar.swap_type + ' Swap End');
    oncalendar.swap_end_row = row;
};

var set_swap_row = function(row, victim) {
    row.css('background-color', swap_bg[oncalendar.swap_type]);
};

var set_swap_button = function(row_button, victim) {
    if (row_button.attr('data-original') === undefined) {
        row_button.attr('data-original', row_button.text());
    }
    row_button.text(victim).attr('data-target', victim)
        .append('<span class="elegant_icons arrow_carrot-down">');
};

// Populate the info in the group info panels
var populate_group_info = function(target_group) {

    $('div#group-info-box-head').children('h2').text(target_group);

    $('button#edit-group-info').attr('data-target', target_group).addClass('hide');
    $('button#edit-members').attr('data-target', target_group).attr('data-groupid', oncalendar.oncall_groups[target_group].id).addClass('hide');
    $('th#group-edit-log-head').addClass('hide');
    $.when(oncalendar.get_last_group_edit(oncalendar.oncall_groups[target_group].id)).then(function(data) {
        if (data.ts) {
            var log_string = data.ts + ' - ' + data.updater + ' - ' + data.note;
        } else {
            var log_string = data.note;
        }
        $('td#group-edit-log').text(log_string).addClass('hide');
    });

    $('td#group-turnover-day').text(oc.day_strings[oncalendar.oncall_groups[target_group].turnover_day]);
    $('td#group-default-turnover-time').text(oncalendar.oncall_groups[target_group].turnover_hour + ':' + oncalendar.oncall_groups[target_group].turnover_min);
    $('td#group-email-address').text(oncalendar.oncall_groups[target_group].email);
    $('td#group-autorotate').text(oncalendar.oncall_groups[target_group].autorotate ? 'Active' : 'Inactive');
    $('td#group-shadow').text(oncalendar.oncall_groups[target_group].shadow ? 'Enabled' : 'Not Enabled');
    $('td#group-backup').text(oncalendar.oncall_groups[target_group].backup ? 'Enabled' : 'Not Enabled');
    if (oncalendar.oncall_groups[target_group].victimid !== null) {
        var current_oncall = oncalendar.oncall_groups[target_group].victimid;
        $('span#group-oncall-container').text(
            oncalendar.oncall_groups[target_group].victims[current_oncall].firstname + ' ' +
            oncalendar.oncall_groups[target_group].victims[current_oncall].lastname + ' '
        ).prepend('<strong>' + target_group + ' Oncall:</strong> ');
        $('td#group-current-oncall').text(
            oncalendar.oncall_groups[target_group].victims[current_oncall].firstname + ' ' +
            oncalendar.oncall_groups[target_group].victims[current_oncall].lastname + ' '
        );
        if (current_user.username !== "anonymous") {
            $('span#group-oncall-container').append(
                    '<span>&bull;<button class="page-primary-button" data-target="' + target_group + '">Send Page</button>' +
                    '</span><span>&bull;<button class="panic-page-button" data-target="' + target_group + '">Panic Page to Group</button></span>'
            );
            $('td#group-current-oncall').append(
                '<span>&bull;<button class="page-primary-button" data-target="' + target_group + '">Send Page</button>' +
                '</span><span>&bull;<button class="panic-page-button" data-target="' + target_group + '">Panic Page to Group</button></span>'
            );
        }
    }

    // Group members list
    oncalendar.oncall_groups[target_group].active_victims = [];
    $.each(oncalendar.oncall_groups[target_group].victims, function(id, victim) {
        if (victim.group_active == 1) {
            oncalendar.oncall_groups[target_group].active_victims.push(victim.username);
        }
    });
    $('td#group-members').text(oncalendar.oncall_groups[target_group].active_victims.join(', '));

    $('button#show-group-info-button').attr('data-target', target_group);
    $('button#edit-month-button').attr('data-target', target_group);
    $('button#edit-by-week-button').attr('data-target', target_group);

};

// Simple validation for email addresses
var valid_email = function(email_address) {
    valid = email_address.match(/^[^\s]+@[^\s]+\.[^\s]{2,3}$/);
    if (valid !== null) {
        return true;
    } else {
        return false;
    }
};

//-------------------------------------
// Event handlers
//-------------------------------------

// Handlers for the previous/next month buttons
$('#prev-month-button').click(function() {
    oncalendar.go_to_prev_month();
});
$('#next-month-button').click(function() {
    oncalendar.go_to_next_month();
});

$('#calendar-header')
    .on('mouseover', '.prev-arrow-button', function() {
        $(this).removeClass('arrow_carrot-left_alt2').addClass('arrow_carrot-left_alt');
    })
    .on('mouseout', '.prev-arrow-button', function() {
        $(this).removeClass('arrow_carrot-left_alt').addClass('arrow_carrot-left_alt2');
    })
    .on('mouseover', '.next-arrow-button', function() {
        $(this).removeClass('arrow_carrot-right_alt2').addClass('arrow_carrot-right_alt');
    })
    .on('mouseout', '.next-arrow-button', function() {
        $(this).removeClass('arrow_carrot-right_alt').addClass('arrow_carrot-right_alt2');
    });

// Handler to expand the group info box and display the correct group's info
$('#group-legend').on('click', 'div.expander', function() {
    if ($(this).attr('data-state') === "closed") {
        var target_group = $(this).attr('data-group');
        $(this).addClass('open');
        populate_group_info(target_group);
        $.each($('p.victim-group'), function(i, element) {
            if ($(element).attr('data-group') === target_group) {
                $(element).removeClass('hide');
            } else {
                $(element).addClass('hide');
            }
        });
        $(this).attr('data-state', 'open');
        $('div#group-options-bar').removeClass('hide');
        $.each($(this).siblings('div.expander'), function(i, element) {
            if ($(element).attr('data-state') === "open") {
                $(element).attr('data-state', 'closed');
                $(element).removeClass('open');
            }
        });
        sessionStorage['display_group'] = target_group;
    } else {
        $(this).removeClass('open');
        $(this).attr('data-state', 'closed');
        $('div#group-options-bar').addClass('hide');
        $('p.victim-group').removeClass('hide');
        sessionStorage['display_group'] = null;
    }
}).on('mouseover', 'span.group-legend-entry', function() {
    var hover_group = $(this).text();
    if ($(this).parents('div.expander').attr('data-state') === "closed") {
        $('p.victim-group[data-group="' + hover_group + '"]').addClass('horshack');
    }
}).on('mouseout', 'span.group-legend-entry', function() {
    var hover_group = $(this).text();
    $('p.victim-group[data-group="' + hover_group + '"]').removeClass('horshack');
});

// Handlers to clear alert and info boxes
$('body').on('click', 'div.alert-box', function() {
    var alert_box = $(this);
    alert_box.addClass('transparent');
    setTimeout(function() {
        alert_box.remove();
    }, 250);
}).on('click', 'div.info-box', function() {
    var info_box = $(this);
    info_box.addClass('transparent');
    setTimeout(function() {
        info_box.remove();
    }, 250);
});

// Handlers for buttons in the group options bar
$('#group-options-bar')
    // Page the oncall button
    .on('click', 'button.page-primary-button', function() {
        target_group = $(this).attr('data-target');
        $('input#oncall-page-originator').attr('value', current_user.username);
        $('input#oncall-page-group').attr('value', target_group);
        $('span#page-primary-groupname').text(target_group);

        $.magnificPopup.open({
            items: {
                src: '#send-oncall-page-popup',
                type: 'inline'
            },
            preloader: false,
            removalDelay: 300,
            mainClass: 'popup-animate',
            callbacks: {
                open: function() {
                    setTimeout(function() {
                        $('textarea#page-primary-body').focus();
                    }, 100);
                },
                close: function() {
                    $('input#oncall-page-originator').attr('value', '');
                    $('input#oncall-page-group').attr('value', '');
                    $('span#page-primary-groupname').empty();
                    $('textarea#page-primary-body').val('').removeClass('missing-input');
                }
            }
        });
    })
    // Panic page the group button
    .on('click', 'button.panic-page-button', function() {
        target_group = $(this).attr('data-target');
        $('input#panic-page-originator').attr('value', current_user.username);
        $('input#panic-page-group').attr('value', target_group);
        $('span#panic-page-groupname').text(target_group);

        $.magnificPopup.open({
            items: {
                src: '#send-panic-page-popup',
                type: 'inline'
            },
            preloader: false,
            removalDelay: 300,
            mainClass: 'popup-animate',
            callbacks: {
                open: function() {
                    setTimeout(function() {
                        $('textarea#panic-page-body').focus();
                    }, 100);
                },
                close: function() {
                    $('input#panic-page-originator').attr('value', '');
                    $('input#panic-page-group').attr('value', '');
                    $('span#panic-page-groupname').empty();
                    $('textarea#panic-page-body').val('').removeClass('missing-input');
                }
            }
        });
    })
    // Show group info button
    .on('click', 'button#show-group-info-button', function() {
        if ((current_user.app_role === 2) || (current_user.app_role === 1 && $.inArray($(this).attr('data-group'), Object.keys(current_user.groups)) != -1 )) {
            $('th#group-members-head').children('button#edit-members')
                .removeClass('hide');
            $('div#group-info-box-head').children('button')
                .removeClass('hide');
            $('th#group-edit-log-head').removeClass('hide');
            $('td#group-edit-log').removeClass('hide');
        }
        $.magnificPopup.open({
            items: {
                src: '#group-info-box-popup',
                type: 'inline'
            },
            preloader: false,
            removalDelay: 300,
            mainClass: 'popup-animate',
            callbacks: {
                open: function() {
                    $('div.mfp-content').addClass('extra-wide');
                }
            }
        });
    })
    // Edit month by day button
    .on('click', 'button#edit-month-button', function() {
        var edit_group = $(this).attr('data-target');
        if (oncalendar.oncall_groups[edit_group].active_victims.length === 0) {
            $('#group-info-box').prepend('<div class="alert-box">Please add users to the group before attempting to create a schedule.</div>');
        } else {
            window.location.href='/edit/month/' + edit_group + '/' + oncalendar.current_year + '/' + oncalendar.real_month;
        }
    }) // Edit month by week button
    .on('click', 'button#edit-by-week-button', function() {
        var edit_group = $(this).attr('data-target');
        if (oncalendar.oncall_groups[edit_group].active_victims.length === 0) {
            $('#group-info-box').prepend('<div class="alert-box">Please add users to the group before attempting to create a schedule.</div>');
        } else {
            window.location.href='/edit/weekly/' + edit_group + '/' + oncalendar.current_year + '/' + oncalendar.real_month;
        }
    });

// Handler for the edit group info button
$('#group-info-box-head').on('click', 'button#edit-group-info', function() {
    $.magnificPopup.close();
    target_group = $(this).attr('data-target');
    $('span#edit-group-info-title-name').text(target_group);
    $('input#edit-group-id').attr('value', oncalendar.oncall_groups[target_group].id);
    $('input#edit-group-name').val(oncalendar.oncall_groups[target_group].name);
    $('button#edit-group-turnover-day-label').empty()
        .append(oc.day_strings[oncalendar.oncall_groups[target_group].turnover_day] +
            '<span class="elegant_icons arrow_carrot-down"></span>');
    $('input#edit-group-turnover-day').attr('value', oncalendar.oncall_groups[target_group].turnover_day);
    $('button#edit-group-turnover-hour-label').text(oncalendar.oncall_groups[target_group].turnover_hour + ' ').append('<span class="elegant_icons arrow_carrot-down"></span>');
    $('input#edit-group-turnover-hour').attr('value', oncalendar.oncall_groups[target_group].turnover_hour);
    $('button#edit-group-turnover-min-label').text(oncalendar.oncall_groups[target_group].turnover_min + ' ').append('<span class="elegant_icons arrow_carrot-down"></span>');
    $('input#edit-group-turnover-min').attr('value', oncalendar.oncall_groups[target_group].turnover_min);
    if (oncalendar.oncall_groups[target_group].shadow) {
        $('button#edit-group-shadow-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
        $('input#edit-group-shadow').attr('value', 1);
    } else {
        $('button#edit-group-shadow-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
        $('input#edit-group-shadow').attr('value', 0);
    }
    $('input#edit-group-email').val(oncalendar.oncall_groups[target_group].email);
    if (oncalendar.oncall_groups[target_group].backup) {
        $('button#edit-group-backup-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
        $('input#edit-group-backup').attr('value', 1);
    } else {
        $('button#edit-group-backup-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
        $('input#edit-group-backup').attr('value', 0);
    }
    if (oncalendar.oncall_groups[target_group].failsafe) {
        $('button#edit-group-failsafe-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
        $('input#edit-group-failsafe').attr('value', 1);
    } else {
        $('button#edit-group-failsafe-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
        $('input#edit-group-failsafe').attr('value', 0);
    }
    setTimeout(function() {
        $.magnificPopup.open({
            items: {
                src: '#edit-group-popup',
                type: 'inline'
            },
            preloader: false,
            removalDelay: 300,
            mainClass: 'popup-animate',
            callbacks: {
                open: function() {
                    $('div.mfp-content').removeClass('extra-wide');
                },
                close: function() {
                    $('input#edit-group-name').removeClass('missing-input');
                    $('input#edit-group-email').removeClass('missing-input');
                    $('span#edit-group-info-title-name').text('');
                }
            }
        });
    }, 325);
});

// Handlers for buttons in the group info box
$('#group-info-box-info')
    // Page the oncall button
    .on('click', 'button.page-primary-button', function() {
        $.magnificPopup.close();
        target_group = $(this).attr('data-target');
        $('input#oncall-page-originator').attr('value', current_user.username);
        $('input#oncall-page-group').attr('value', target_group);
        $('span#page-primary-groupname').text(target_group);

        setTimeout(function() {
            $.magnificPopup.open({
                items: {
                    src: '#send-oncall-page-popup',
                    type: 'inline'
                },
                preloader: false,
                removalDelay: 300,
                mainClass: 'popup-animate',
                callbacks: {
                    open: function() {
                        $('div.mfp-content').removeClass('extra-wide');
                        setTimeout(function() {
                            $('textarea#page-primary-body').focus();
                        }, 100);
                    },
                    close: function() {
                        $('input#oncall-page-originator').attr('value', '');
                        $('input#oncall-page-group').attr('value', '');
                        $('span#page-primary-groupname').empty();
                        $('textarea#page-primary-body').val('').removeClass('missing-input');
                    }
                }
            });
        }, 325);
    })
    // Panic page the group button
    .on('click', 'button.panic-page-button', function() {
        $.magnificPopup.close();
        target_group = $(this).attr('data-target');
        $('input#panic-page-originator').attr('value', current_user.username);
        $('input#panic-page-group').attr('value', target_group);
        $('span#panic-page-groupname').text(target_group);

        setTimeout(function() {
            $.magnificPopup.open({
                items: {
                    src: '#send-panic-page-popup',
                    type: 'inline'
                },
                preloader: false,
                removalDelay: 300,
                mainClass: 'popup-animate',
                callbacks: {
                    open: function() {
                        $('div.mfp-content').removeClass('extra-wide');
                        setTimeout(function() {
                            $('textarea#panic-page-body').focus();
                        }, 100);
                    },
                    close: function() {
                        $('input#panic-page-originator').attr('value', '');
                        $('input#panic-page-group').attr('value', '');
                        $('span#panic-page-groupname').empty();
                        $('textarea#panic-page-body').val('').removeClass('missing-input');
                    }
                }
            });
        }, 325);
    })
    // Edit group members button
    .on('click', 'button#edit-members', function() {
        $.magnificPopup.close();
        target_group = $(this).attr('data-target');
        $('span#edit-group-victims-title-name').text(target_group);
        victims = oncalendar.oncall_groups[target_group].victims;
        victims_table = $('table#group-victims-list-table');

        setTimeout(function() {
            $.magnificPopup.open({
                items: {
                    src: '#edit-group-victims-popup',
                    type: 'inline'
                },
                preloader: false,
                removalDelay: 300,
                mainClass: 'popup-animate',
                callbacks: {
                    open: function() {
                        $('div.mfp-content').removeClass('extra-wide');
                    },
                    close: function() {
                        $('span#edit-group-victims-title-name').text('');
                        $('tr.victim-row').remove();
                        $('tr#edit-victims-form-buttons').remove();
                        $('tr#victim-table-divider').remove();
                        $('input#add-victim-username').val('').removeClass('missing-input');
                        $('input#add-victim-firstname').val('').removeClass('missing-input');
                        $('input#add-victim-lastname').val('').removeClass('missing-input');
                        $('input#add-victim-phone').val('').removeClass('missing-input');
                        $('input#add-victim-email').val('');
                        $('button#add-victim-sms-email-label').text('--').append('<span class="elegant_icons arrow_carrot-down">');
                        $('input#add-victim-sms-email').attr('value', '');
                    }
                }
            });
        }, 325);

        victims_table.append('<tr id="victim-table-divider">' +
            '<td colspan="8" style="padding: 0; border-bottom: 1px solid #000;">' +
            '<input type="hidden" id="target-groupid" name="target-groupid" value="' + oncalendar.oncall_groups[target_group].id + '">' +
            '<input type="hidden" id="target-group" name="target-group" value="' + target_group + '"></td></tr>');
        $.each(oncalendar.oncall_groups[target_group].victims, function(id, victim) {
            victims_table.append('<tr id="victim' + id + '" class="victim-row" data-victim-id="' + id + '"></tr>');
            victim_row = $('tr#victim' + id);
            victim_row.append('<td><button class="delete-group-victim-button button elegant_icons icon_minus_alt2" ' +
                'data-target="victim' + id + '-active"></button>' +
                '<input type="hidden" id="target-victim' + id + '" name="target-victim' + id + '" value="no"></td>' +
                '<td><button id="victim' + id + '-active-checkbox" class="group-victim-active-status oc-checkbox elegant_icons icon_box-empty"' +
                ' data-target="victim' +  id + '-active" data-checked="no"></button>' +
                '<input type="hidden" id="victim' + id + '-active" name="victim' + id + '-active" value="no"></td>');
            if (victim.group_active) {
                $('#victim' + id + '-active-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
                $('input#victim' + id + '-active').attr('value', 'yes');
            }
            var victim_sms_email = '';
            if (oncalendar.gateway_map[victim.sms_email] !== undefined) {
                victim_sms_email = oncalendar.gateway_map[victim.sms_email];
            }
            victim_row.append('<td>' + victim.username + '</td>' +
                    '<td>' + victim.firstname + '</td>' +
                    '<td>' + victim.lastname + '</td>' +
                    '<td>' + victim.phone + '</td>' +
                    '<td>' + victim.email + '</td>' +
                    '<td>' + victim_sms_email + '</td><td></td>'
            );
        });

        victims_table.append('<tr id="edit-victims-form-buttons">' +
            '<td><button id="edit-group-victims-cancel">Cancel</button></td>' +
            '<td><button id="edit-group-victims-save">Save Changes</button></td></tr>' +
            '<td colspan="5"></td>');
    });

// Handlers for the send oncall page dialog box
$('#send-oncall-page-popup').on('click', 'button#cancel-oncall-page-button', function() {
    $.magnificPopup.close();
}).on('click', 'button#send-oncall-page-button', function() {
    var group = $('input#oncall-page-group').attr('value');
    var sender = $('input#oncall-page-originator').attr('value');
    var message_text = $('textarea#page-primary-body').val();
    $.when(oncalendar.send_oncall_sms(group, sender, message_text)).then(
        function(data) {
            $.magnificPopup.close();
            $('#group-info-box').prepend('<div class="info-box">Your page has been sent.</div>');
        },
        function(data) {
            $.magnificPopup.close();
            $('#group-info-box').prepend('<div class="alert-box">Failure to page oncall: ' + data + '</div>');
        }
    );
});

// Handlers for the panic page dialog
$('#send-panic-page-popup').on('click', 'button#cancel-panic-page-button', function() {
    $.magnificPopup.close();
}).on('click', 'button#send-panic-page-button', function() {
    var group = $('input#panic-page-group').attr('value');
    var sender = $('input#panic-page-originator').attr('value');
    var message_text = $('textarea#panic-page-body').val();
    $.when(oncalendar.send_panic_sms(group, sender, message_text)).then(
        function(data) {
            $.magnificPopup.close();
            $('#group-info-box').prepend('<div class="info-box">Your page has been sent.</div>');
        },
        function(data) {
            $.magnificPopup.close();
            $('group-info-box').prepend('<div class="alert-box">Failure to send panic page: ' + data + '</div>');
        }
    );
});

// Handlers for edit group info dropdown menus
$('#edit-group-turnover-day-options').on('click', 'li', function() {
    $('#edit-group-turnover-day-label').text(oc.day_strings[$(this).attr('data-day')]).append(' <span class="elegant_icons arrow_carrot-down">');
    $('input#edit-group-turnover-day').attr('value', $(this).attr('data-day'));
});
$('#edit-group-turnover-hour-options').on('click', 'li', function() {
    $('#edit-group-turnover-hour-label').text($(this).attr('data-hour')).append(' <span class="elegant_icons arrow_carrot-down">');
    $('input#edit-group-turnover-hour').attr('value', $(this).attr('data-hour'));
});
$('#edit-group-turnover-min-options').on('click', 'li', function() {
    $('#edit-group-turnover-min-label').text($(this).attr('data-min')).append(' <span class="elegant_icons arrow_carrot-down">');
    $('input#edit-group-turnover-min').attr('value', $(this).attr('data-min'));
});

// Handlers for checkboxes and radio buttons
$('.oncalendar-edit-popup').on('click', 'button.oc-checkbox', function() {
    if ($(this).attr('data-checked') === "no") {
        $(this).removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
        $('input#' + $(this).attr('data-target')).attr('value', 1);
    } else {
        $(this).removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
        $('input#' + $(this).attr('data-target')).attr('value', 0);
    }
}).on('click', 'span.oc-radio', function() {
    if ($(this).attr('data-checked') === 'no') {
        $(this).removeClass('icon_circle-empty').addClass('icon_circle-selected').attr('data-checked', 'yes');
        $('input#' + $(this).attr('data-target')).attr('value', 1);
        $.each($(this).siblings('span.oc-radio'), function(i, radio) {
            $(radio).removeClass('icon_circle-selected').addClass('icon_circle-empty').attr('data-checked', 'no');
            $('input#' + $(radio).attr('data-target')).attr('value', 0);
        })
    } else {
        $(this).removeClass('icon_circle-selected').addClass('icon_circle-empty').attr('data-checked', 'no');
        $('input#' + $(this).attr('data-target')).attr('value', 0);
    }
});

// Handlers for the edit group info dialog box
$('#edit-group-popup').on('click', 'button#edit-group-cancel-button', function() {
    $.magnificPopup.close();
}).on('click', 'button#edit-group-save-button', function() {
    if ($('input#edit-group-name').val() === undefined || $('input#edit-group-name').val().length == 0) {
        $('input#edit-group-name').addClass('missing-input').focus();
    } else if ($('input#edit-group-email').val() === undefined || ! valid_email($('input#edit-group-email').val())) {
        $('input#edit-group-email').addClass('missing-input');
    } else {
        var group_data = {
            id: $('input#edit-group-id').attr('value'),
            name: $('input#edit-group-name').val(),
            email: $('input#edit-group-email').val(),
            turnover_day: $('input#edit-group-turnover-day').attr('value'),
            turnover_hour: $('input#edit-group-turnover-hour').attr('value'),
            turnover_min: $('input#edit-group-turnover-min').attr('value'),
            shadow: $('input#edit-group-shadow').attr('value'),
            backup: $('input#edit-group-backup').attr('value')
        };
        if (email_gateway_config) {
            group_data.failsafe = $('input#edit-group-failsafe').attr('value');
            group_data.alias = $('input#edit-group-alias').val();
            group_data.backup_alias = $('input#edit-group-backup-alias').val();
            group_data.failsafe_alias = $('input#edit-group-failsafe-alias').val();
        }
        $.when(oncalendar.update_group(group_data)).then(
            function(data) {
                if (data.turnover_hour < 10) {
                    data.turnover_hour = '0' + data.turnover_hour;
                }
                if (data.turnover_min < 10) {
                    data.turnover_min = '0' + data.turnover_min;
                }
                data.turnover_time = [data.turnover_hour, data.turnover_min].join(':');
                data.victims = oncalendar.oncall_groups[data.name].victims;
                oncalendar.oncall_groups[data.name] = data;
                populate_group_info(data.name);
                $.magnificPopup.close();
                $('div#group-info-box').prepend('<div class="info-box">Changes have been saved</div>');
            },
            function(data) {
                $('div#edit-group-popup').prepend('<div class="alert-box">Update failed: ' + data[1] + '</div>');
            }
        );
    }

});

// Handlers for the edit group members dialog box
$('ul#add-victim-sms-email-options').on('click', 'li', function() {
    $('#add-victim-sms-email-label').text(oncalendar.gateway_map[$(this).attr('data-gateway')] + ' ').append('<span class="elegant_icons arrow_carrot-down">');
    $('input#add-victim-sms-email').attr('value', $(this).attr('data-gateway'));
});
$('#edit-group-victims-popup')
    // Remove user from group
    .on('click', 'button.delete-group-victim-button', function() {
        var target_victim = $(this).attr('data-target');
        if ($(this).siblings('input').attr('value') === "no") {
            $(this).siblings('input').attr('value', 'yes');
            $(this).parents('td').parents('tr').addClass('strikethrough');
        } else {
            $(this).siblings('input').attr('value', 'no');
            $(this).parents('td').parents('tr').removeClass('strikethrough');
        }
    })
    // Change user's active status
    .on('click', 'button.group-victim-active-status', function() {
        if ($(this).hasClass('icon_box-empty')) {
            $(this).removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
            $(this).siblings('input').attr('value', 'yes');
        } else {
            $(this).removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
            $(this).siblings('input').attr('value', 'no');
        }
    })
    // Cancel editing victims
    .on('click', 'button#edit-group-victims-cancel', function() {
        $.magnificPopup.close();
    })
    // Auto fill a new user's email address
    .on('blur', 'input#add-victim-username', function() {
        if ($('input#add-victim-email').val().length < 9) {
            $('input#add-victim-email').val($(this).val() + '@box.com');
        }
    })
    // Reset form when username changes
    .on('change', 'input#add-victim-username', function() {
        $('input#victim-id').attr('value', '0');
        $('input#add-victim-firstname').val('').removeClass('missing-input');
        $('input#add-victim-lastname').val('').removeClass('missing-input');
        $('input#add-victim-phone').val('').removeClass('missing-input');
        $('input#add-victim-email').val('');
        $('button#add-victim-sms-email-label').text('--').append('<span class="elegant_icons arrow_carrot-down">');
        $('input#add-victim-sms-email').attr('value', '');
    })
    // Save the new user being added
    .on('click', 'button#add-new-victim-save-button', function() {
        var group_name = $('input#target-group').attr('value');
        var victim_data = {
            id: $('input#victim-id').attr('value'),
            username: $('input#add-victim-username').val(),
            firstname: $('input#add-victim-firstname').val(),
            lastname: $('input#add-victim-lastname').val(),
            phone: String($('input#add-victim-phone').val()),
            email: $('input#add-victim-email').val(),
            sms_email: $('input#add-victim-sms-email').attr('value'),
            active: '1',
            app_role: '0',
            groups: {}
        };
        victim_data.groups[group_name] = '1';

        // Sanity check the phone number
        if (victim_data.phone !== undefined) {
            victim_data.phone = victim_data.phone.replace(/\D/g,'');
            var country_code = victim_data.phone.substring(0,1);
            if (country_code !== "1") {
                victim_data.phone = "1" + victim_data.phone
            }
        }
        if (victim_data.phone.length !== 11) {
            $('input#add-victim-phone').val(victim_data.phone).addClass('missing-input');
        } else {
            if (victim_data.id !== "0") {
                delete victim_data.active;
                delete victim_data.app_role;
                $.each($('tr#victim-table-divider').children('td').children('input.victim-group'), function() {
                    var victim_group = $(this).attr('data-group');
                    var victim_group_status = $(this).attr('value');
                    victim_data.groups[victim_group] = victim_group_status;
                });
                $.when(oncalendar.update_victim_info(victim_data.id, victim_data)).then(
                    function(data) {
                        var id = victim_data.id;
                        $('input#victim-id').attr('value', '0');
                        $('input#add-victim-username').val('').removeClass('missing-input');
                        $('input#add-victim-firstname').val('').removeClass('missing-input');
                        $('input#add-victim-lastname').val('').removeClass('missing-input');
                        $('input#add-victim-phone').val('').removeClass('missing-input');
                        $('input#add-victim-email').val('');
                        $('button#add-victim-sms-email-label').text('--').append('<span class="elegant_icons arrow_carrot-down">');
                        $('input#add-victim-sms-email').attr('value', '');
                        $('table#group-victims-list-table').children('tbody').children('tr#edit-victims-form-buttons')
                            .before('<tr id="victim' + id + '" class="victim-row" data-victim-id="' + id + '"></tr>');
                        var victim_row = $('tr#victim' + id);
                        victim_row.append('<td><button class="delete-group-victim-button button elegant_icons icon_minus_alt2" ' +
                            'data-target="victim' + id + '-active"></button>' +
                            '<input type="hidden" id="target-victim' + id + '" name="target-victim' + id + '" value="no"></td>' +
                            '<td><button id="victim' + id + '-active-checkbox" class="group-victim-active-status oc-checkbox elegant_icons icon_box-checked' +
                            ' data-target="victim' +  id + '-active" data-checked="yes"></button>' +
                            '<input type="hidden" id="victim' + id + '-active" name="victim' + id + '-active" value="yes"></td>');
                        var victim_sms_email = '';
                        if (oncalendar.gateway_map[data.sms_email] !== undefined) {
                            victim_sms_email = oncalendar.gateway_map[data.sms_email];
                        }
                        victim_row.append('<td>' + data.username + '</td>' +
                            '<td>' + data.firstname + '</td>' +
                            '<td>' + data.lastname + '</td>' +
                            '<td>' + data.phone + '</td>' +
                            '<td>' + data.email + '</td>' +
                            '<td>' + victim_sms_email + '</td><td></td>'
                        );
                    },
                    function(data) {
                        $('#edit-group-victims-popup').prepend('<span class="alert-box">' + data + '</span>');
                    }
                );
            } else {
                delete(victim_data.id);
                $.when(oncalendar.add_new_victim(victim_data)).then(
                    function(data) {
                        if (typeof data.api_error !== "undefined") {
                            $('#edit-group-victims-popup').append('<div class="alert-box">User name/data conflict, please try again</div>');
                        } else {
                            var id = data.id;
                            $('input#add-victim-username').val('').removeClass('missing-input');
                            $('input#add-victim-firstname').val('').removeClass('missing-input');
                            $('input#add-victim-lastname').val('').removeClass('missing-input');
                            $('input#add-victim-phone').val('').removeClass('missing-input');
                            $('input#add-victim-email').val('');
                            $('input#add-victim-sms-email').attr('value', '');
                            $('input').removeClass('missing-input');
                            $('table#group-victims-list-table').children('tbody').children('tr#edit-victims-form-buttons')
                                .before('<tr id="victim' + id + '" class="victim-row" data-victim-id="' + id + '"></tr>');
                            var victim_row = $('tr#victim' + id);
                            victim_row.append('<td><button class="delete-group-victim-button button elegant_icons icon_minus_alt2" ' +
                                'data-target="victim' + id + '-active"></button>' +
                                '<input type="hidden" id="target-victim' + id + '" name="target-victim' + id + '" value="no"></td>' +
                                '<td><button id="victim' + id + '-active-checkbox" class="group-victim-active-status oc-checkbox elegant_icons icon_box-checked' +
                                ' data-target="victim' +  id + '-active" data-checked="yes"></button>' +
                                '<input type="hidden" id="victim' + id + '-active" name="victim' + id + '-active" value="yes"></td>');
                            var victim_sms_email = '';
                            if (oncalendar.gateway_map[data.sms_email] !== undefined) {
                                victim_sms_email = oncalendar.gateway_map[data.sms_email];
                            }
                            victim_row.append('<td>' + data.username + '</td>' +
                                    '<td>' + data.firstname + '</td>' +
                                    '<td>' + data.lastname + '</td>' +
                                    '<td>' + data.phone + '</td>' +
                                    '<td>' + data.email + '</td>' +
                                    '<td>' + victim_sms_email + '</td><td></td>'
                            );
                        }
                    },
                    function(data) {
                        $('#edit-group-victims-popup').prepend('<span class="alert-box">' + data + '</span>');
                    }
                );
            }
        }

    })
    // Save the changes to the group user list
    .on('click', 'button#edit-group-victims-save', function() {
        var victim_changes = {};
        victim_changes.victims = [];
        victim_changes.groupid = $('input#target-groupid').attr('value');
        $.each($('tr.victim-row'), function() {
            var victim_id = $(this).attr('data-victim-id');
            if ($('input#target-victim' + victim_id).attr('value') === "no") {
                var victim = {
                    victimid: victim_id,
                    active: $('input#victim' + victim_id + '-active').attr('value') === "yes" ? 1 : 0
                };
                victim_changes.victims.push(victim);
            }
        });

        $.when(oncalendar.update_victim_status(victim_changes)).then(
            function(data) {
                var group_name = $('div#group-info-box-head').children('h2').text();
                oncalendar.oncall_groups[group_name].victims = data;
                populate_group_info(group_name);
                $('#group-info-box').prepend('<div class="info-box">Group member changes saved</div>');
                $.magnificPopup.close();
            },
            function(data) {
                $('#edit-group-victims-popup').prepend('<div class="alert-box">Unable to save changes: ' + data[1] +'</div>');
            }
        );
    });

// Handlers for edit account info dialog box
$('ul#edit-account-sms-email-options').on('click', 'li', function() {
    $('#edit-account-sms-email-label').text(oncalendar.gateway_map[$(this).attr('data-gateway')]).append('<span class="elegant_icons arrow_carrot-down">');
    $('input#edit-account-sms-email').attr('value', $(this).attr('data-gateway'));
});
$('div#edit-account-info-popup').on('click', 'button.oc-checkbox', function() {
    if ($(this).attr('data-checked') === "no") {
        $(this).removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
        $('input#' + $(this).attr('data-target')).attr('value', 'yes');
    } else {
        $(this).removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
        $('input#' + $(this).attr('data-target')).attr('value', 'no');
    }
}).on('click', 'button#edit-account-cancel-button', function() {
    $.magnificPopup.close();
}).on('click', 'button#edit-account-save-button', function() {
    var account_text_fields = [
        'firstname',
        'lastname',
        'phone'
    ];
    var missing_input = 0;
    $.each(account_text_fields, function(i, field) {
        if ($('input#edit-account-' + field).val() === undefined || $('input#edit-account-' + field).val().length == 0) {
            $('input#edit-account-' + field).addClass('missing-input');
            missing_input++;
        }
    });
    if ($('input#edit-account-phone').val() !== undefined) {
        victim_phone = $('input#edit-account-phone').val().replace(/\D/g,'');
        var country_code = victim_phone.substring(0,1);
        if (country_code !== "1") {
            victim_phone = "1" + victim_phone
        }
        $('input#edit-account-phone').val(victim_phone);
    }
    if ($('input#edit-account-phone').val() === undefined || $('input#edit-account-phone').val().length !== 11) {
        $('input#edit-account-phone').addClass('missing-input').focus();
        missing_input++;
    }

    var throttle_value = $('input#edit-account-throttle').val().replace(/\D/g,'');
    if (throttle_value.length == 0 || throttle_value < {{ throttle_min }}) {
        throttle_value = {{ throttle_min }};
        $('input#edit-account-throttle').val({{ throttle_min }});
    }

    if (missing_input == 0) {
        var victim_data = {
            username: current_user.username,
            firstname: $('input#edit-account-firstname').val(),
            lastname: $('input#edit-account-lastname').val(),
            phone: $('input#edit-account-phone').val(),
            sms_email: $('input#edit-account-sms-email').attr('value'),
            throttle: throttle_value,
            truncate: $('input#edit-account-truncate').attr('value') === "yes" ? '1' : '0',
            groups: {}
        };
        $.each($('input.group-active-input'), function() {
            var victim_group = $(this).attr('data-group');
            victim_data.groups[victim_group] = $(this).attr('value') === "yes" ? '1' : '0';
        });

        $.when(oncalendar.update_victim_info(current_user.id, victim_data)).then(
            // done: update current_user and the victim record on oncalendar.oncall_groups
            function(data) {
                current_user = data;
                var current_user_groups = data.groups;
                delete(data.groups);
                $.each(current_user_groups, function(group, status) {
                    oncalendar.oncall_groups[group].victims[current_user.id] = data;
                    oncalendar.oncall_groups[group].victims[current_user.id].group_active = status;
                });
            },
            // fail: show error message
            function(status) {
                $('div#page-head').append('<div class="alert-box">' + status + '</div>');
            }
        );
        $.magnificPopup.close();

    }
});

// Handlers for the edit day dialog box
$('div#edit-day-popup').on('click', 'li.slot-item', function() {
    var new_victim = $(this).attr('data-target');
    var row_button = $(this).parents('ul').siblings('span').children('button');
    var old_victim = row_button.text();
    var active_row = $(this).parents('ul').parents('span').parents('td').parents('tr');
    var change_rows;
    row_button
        .text(new_victim)
        .attr('data-target', new_victim)
        .append('<span class="elegant_icons arrow_carrot-down">');
    if (row_button.attr('data-original') === undefined) {
        row_button.attr('data-original', old_victim);
    }

    if (!oncalendar.swap_start[active_row.attr('data-type')]) {
        oncalendar.swap_type = active_row.attr('data-type');
        set_swap_start_row(active_row);
        oncalendar.swap_start[active_row.attr('data-type')] = new_victim;
        delete oncalendar.swap_end_row;
    } else {
        // A start point is already set.
        if ((new_victim === oncalendar.swap_start[oncalendar.swap_type]) && (oncalendar.swap_type === active_row.attr('data-type'))) {
            // The newly chosen menu item
            // is of the same type (oncall/shadow/backup), so it becomes
            // the swap end point.

            // If there's already a swap end defined,
            // it needs to be modified based on the new choice
            if (typeof oncalendar.swap_end_row !== "undefined") {
                var old_end_row = oncalendar.swap_end_row;
                reset_swap_endpoint(old_end_row);
                set_swap_end_row(active_row);
                // New end point is before the current swap start time,
                // so the period needs to be reversed, current swap start
                // becomes swap end point.
                if (oncalendar.swap_start_row.index() > oncalendar.swap_end_row.index()) {
                    var old_start_row = oncalendar.swap_start_row;
                    change_rows = old_start_row.nextUntil(old_end_row, 'tr.' + oncalendar.swap_type + '-row');
                    $.each(change_rows, function () {
                        reset_swap_row($(this));
                        var change_button = $(this).children('td.menu-column').children('span').children('span').children('button');
                        reset_swap_button(change_button);
                    });
                    reset_swap_endpoint(old_end_row);
                    old_end_row_button = old_end_row.children('td.menu-column').children('span').children('span').children('button');
                    reset_swap_button(old_end_row_button);
                    set_swap_start_row(oncalendar.swap_end_row);
                    set_swap_end_row(old_start_row);
                    change_rows = oncalendar.swap_start_row.nextUntil(oncalendar.swap_end_row, 'tr.' + oncalendar.swap_type + '-row');
                    $.each(change_rows, function () {
                        set_swap_row($(this));
                        var change_button = $(this).children('td.menu-column').children('span').children('span').children('button');
                        set_swap_button(change_button, new_victim);
                    });
                // Current end point is later than the new end point,
                // so the swap period needs to be contracted.
                } else if (old_end_row.index() > oncalendar.swap_end_row.index()) {
                    change_rows = oncalendar.swap_end_row.nextUntil(old_end_row, 'tr.' + oncalendar.swap_type + '-row');
                    $.each(change_rows, function () {
                        reset_swap_row($(this));
                        var change_button = $(this).children('td.menu-column').children('span').children('span').children('button');
                        reset_swap_button(change_button);
                    });
                    reset_swap_endpoint(old_end_row);
                    var old_end_row_button = old_end_row.children('td.menu-column').children('span').children('span').children('button');
                    reset_swap_button(old_end_row_button);
                // New end point is later the current end point,
                // simply expanding the defined swap period.
                } else {
                    set_swap_row(old_end_row);
                    change_rows = old_end_row.nextUntil(oncalendar.swap_end_row, 'tr.' + oncalendar.swap_type + '-row');
                    $.each(change_rows, function () {
                        set_swap_row($(this));
                        var change_button = $(this).children('td.menu-column').children('span').children('span').children('button');
                        set_swap_button(change_button, new_victim);
                    });
                }
            // No swap end is defined
            // If for some reason the active start row was chosen, and
            // set to the same user as before, do nothing.
            } else if (active_row.is(oncalendar.swap_start_row)){
            // Chosen end point is before the start point,
            // so the period needs to be reversed, current swap start
            // becomes the swap end point.
            } else {
                if (oncalendar.swap_start_row.index() > active_row.index()) {
                    var new_end_row = oncalendar.swap_start_row;
                    set_swap_start_row(active_row);
                    set_swap_end_row(new_end_row);
                // Set a new swap end point.
                } else {
                    set_swap_end_row(active_row);
                }
                change_rows = oncalendar.swap_start_row.nextUntil(oncalendar.swap_end_row, 'tr.' + oncalendar.swap_type + '-row');
                $.each(change_rows, function() {
                    set_swap_row($(this));
                    var change_button = $(this).children('td.menu-column').children('span').children('span').children('button');
                    set_swap_button(change_button, new_victim);
                });
            }
        // The chosen victim is *not* the same as the as the
        // current swap start (oncall/shadow/backup)
        } else {
            // There's a start, but no end yet,
            if (typeof oncalendar.swap_end_row === "undefined") {
                // If the change was made on the current swap
                // start row, just update the user. If the new choice
                // is actually the original scheduled victim for the
                // slot, reset.
                if (active_row.is(oncalendar.swap_start_row)) {
                    if (new_victim !== oncalendar.swap_start_row.children('td.menu-column').children('span').children('span').children('button').attr('data-original')) {
                        oncalendar.swap_start[oncalendar.swap_type] = new_victim;
                    } else {
                        reset_swap_endpoint(oncalendar.swap_start_row);
                        oncalendar.swap_start[oncalendar.swap_type] = 0;
                    }
                } else {
                    var old_start_row = oncalendar.swap_start_row;
                    var old_start_row_button = old_start_row.children('td.menu-column').children('span').children('span').children('button');
                    set_swap_start_row(active_row);
                    reset_swap_endpoint(old_start_row);
                    reset_swap_button(old_start_row_button);
                }
            // The currently set period has a start and end,
            // check to see whether the change was made on
            // the current start row, and update the swap
            // period if so. If the newly selected user is
            // the originally scheduled user, reset all.
            } else if (active_row.is(oncalendar.swap_start_row)) {
                if (new_victim === active_row.children('td.menu-column').children('span').children('span').children('button').attr('data-original')) {
                    reset_swap_endpoint(oncalendar.swap_start_row);
                    reset_swap_endpoint(oncalendar.swap_end_row);
                    reset_swap_button(oncalendar.swap_end_row.children('td.menu-column').children('span').children('span').children('button'));
                    change_rows = oncalendar.swap_start_row.nextUntil(oncalendar.swap_end_row, 'tr.' + oncalendar.swap_type + '-row');
                    $.each(change_rows, function () {
                        reset_swap_row($(this));
                        reset_swap_button($(this).children('td-menu-column').children('swap').children('swap').children('button'));
                    });
                    delete oncalendar.swap_end_row;
                    oncalendar.swap_start[oncalendar.swap_type] = 0;
                } else {
                    set_swap_button(oncalendar.swap_start_row.children('td.menu-column').children('span').children('span').children('button'), new_victim);
                    change_rows = oncalendar.swap_start_row.nextUntil(oncalendar.swap_end_row, 'tr.' + oncalendar.swap_type + '-row');
                    $.each(change_rows, function () {
                        set_swap_row($(this));
                        set_swap_button($(this).children('td.menu-column').children('span').children('span').children('button'), new_victim);
                    });
                    set_swap_button(oncalendar.swap_end_row.children('td.menu-column').children('span').children('span').children('button'), new_victim);
                    oncalendar.swap_start[oncalendar.swap_type] = new_victim;
                }
            // Check to see whether the change was made on the
            // current end row. If it is, and the user is set
            // back to the originally scheduled victim, reset
            // the row and contract the swap period.
            } else if (active_row.is(oncalendar.swap_end_row)) {
                if (new_victim === active_row.children('td.menu-column').children('span').children('span').children('button').attr('data-original')) {
                    var prev_rows = active_row.prevAll('.' + oncalendar.swap_type + '-row');
                    set_swap_end_row($(prev_rows[0]));
                    reset_swap_endpoint(active_row);
                } else {
                    reset_swap_endpoint(oncalendar.swap_start_row);
                    var start_row_button = oncalendar.swap_start_row.children('td.menu-column').children('span').chilren('span').children('button');
                    reset_swap_button(start_row_button);
                    change_rows = oncalendar.swap_start_row.nextUntil(oncalendar.swap_end_row, 'tr.' + oncalendar.swap_type + '-row');
                    $.each(change_rows, function() {
                        reset_swap_row($(this));
                        var change_button = $(this).children('td.menu-column').children('span').children('span').children('button');
                        reset_swap_button(change_button);
                    });
                    delete oncalendar.swap_end_row;
                    set_swap_start_row(active_row);
                    oncalendar.swap_start[oncalendar.swap_type] = new_victim;
                }
            // The change was made in the middle of the
            // current swap period. If it is changing back
            // to the original scheduled victim, just set
            // the row, otherwise scrap it and start a new one.
            } else if (active_row.index() > oncalendar.swap_start_row.index() && active_row.index() < oncalendar.swap_end_row.index()) {
                if (new_victim === active_row.children('td.menu-column').children('span').children('span').children('button').attr('data-original')) {
                    reset_swap_row(active_row);
                } else {
                    reset_swap_endpoint(oncalendar.swap_end_row);
                    var end_row_button = oncalendar.swap_end_row.children('td.menu-column').children('span').children('span').children('button');
                    reset_swap_button(end_row_button);
                    reset_swap_endpoint(oncalendar.swap_start_row);
                    var start_row_button = oncalendar.swap_start_row.children('td.menu-column').children('span').children('span').children('button');
                    reset_swap_button(start_row_button);
                    change_rows = oncalendar.swap_start_row.nextUntil(oncalendar.swap_end_row, 'tr.' + oncalendar.swap_type + '-row');
                    $.each(change_rows, function() {
                        reset_swap_row($(this));
                        var change_button = $(this).children('td.menu-column').children('span').children('span').children('button');
                        reset_swap_button(change_button);
                    });
                    delete oncalendar.swap_end_row;
                    set_swap_start_row(active_row);
                    oncalendar.swap_start[oncalendar.swap_type] = new_victim;
                }
            } else {
                reset_swap_endpoint(oncalendar.swap_end_row);
                var end_row_button = oncalendar.swap_end_row.children('td.menu-column').children('span').children('span').children('button');
                reset_swap_button(end_row_button);
                reset_swap_endpoint(oncalendar.swap_start_row);
                var start_row_button = oncalendar.swap_start_row.children('td.menu-column').children('span').children('span').children('button');
                reset_swap_button(start_row_button);
                change_rows = oncalendar.swap_start_row.nextUntil(oncalendar.swap_end_row, 'tr.' + oncalendar.swap_type + '-row');
                $.each(change_rows, function() {
                    reset_swap_row($(this));
                    var change_button = $(this).children('td.menu-column').children('span').children('span').children('button');
                    reset_swap_button(change_button);
                });
                delete oncalendar.swap_end_row;
                set_swap_start_row(active_row);
                oncalendar.swap_start[oncalendar.swap_type] = new_victim;
            }
        }
    }
}).on('click', 'button#edit-day-cancel-button', function() {
    delete oncalendar.swap_start_row;
    delete oncalendar.swap_end_row;
    delete oncalendar.swap_type;
    oncalendar.swap_start.oncall = 0;
    oncalendar.swap_start.shadow = 0;
    oncalendar.swap_start.backup = 0;
    $.magnificPopup.close();
}).on('click', 'button#edit-day-save-button', function() {
    var reason_for_edit = $('textarea#edit-day-note').val();
    if (reason_for_edit.length < 3) {
        $('textarea#edit-day-note').addClass('missing-input').focus();
    } else {
        $('div#edit-day-popup').append('<div id="popup-working"><span id="status-message"><h3>Working...</h3></span></div>');
        var update_day_data = {
            calday: $(this).attr('data-calday'),
            cal_date: $(this).attr('data-date'),
            group: $(this).attr('data-group'),
            note: reason_for_edit,
            slots: {}
        };

        $.each($('button.edit-day-oncall-button'), function() {
            if (typeof $(this).attr('data-target') !== "undefined" && $(this).attr('data-target') !== $(this).attr('data-original')) {
                update_day_data.slots[$(this).attr('data-slot')] = {
                    oncall: $(this).attr('data-target')
                }
            }
        });
        $.each($('button.edit-day-shadow-button'), function() {
            if (typeof $(this).attr('data-target') !== "undefined" && $(this).attr('data-target') !== $(this).attr('data-original')) {
                if (typeof update_day_data.slots[$(this).attr('data-slot')] !== "undefined") {
                    update_day_data.slots[$(this).attr('data-slot')].shadow = $(this).attr('data-target');
                } else {
                    update_day_data.slots[$(this).attr('data-slot')] = {
                        shadow: $(this).attr('data-target')
                    }
                }
            }
        });
        $.each($('button.edit-day-backup-button'), function() {
            if (typeof $(this).attr('data-target') !== "undefined" && $(this).attr('data-target') !== $(this).attr('data-original')) {
                if (typeof update_day_data.slots[$(this).attr('data-slot')] !== "undefined") {
                    update_day_data.slots[$(this).attr('data-slot')].backup = $(this).attr('data-target');
                } else {
                    update_day_data.slots[$(this).attr('data-slot')] = {
                        backup: $(this).attr('data-target')
                    }
                }
            }
        });

        $.when(oncalendar.update_day(update_day_data)).then(
            function(data) {
                $('div#popup-working').children('span').children('h3').text('Update Complete');
                var slots = data;
                var date_bits = update_day_data.cal_date.split('-');
                var date_object = new Date(date_bits[0], date_bits[1], date_bits[2]).addMonths(-1);
                var current_victim = {};
                var p_group_class = {};
                if (typeof sessionStorage['display_group'] !== "undefined" && sessionStorage['display_group'] !== null) {
                    $.each($('p.victim-group'), function(i, element) {
                        var element_group = $(element).attr('data-group');
                        p_group_class[element_group] = "victim-group info-tooltip";
                        if (element_group !== sessionStorage['display_group']) {
                            p_group_class[element_group] = "victim-group info-tooltip hide";
                        }
                    });
                }

                console.log(slots);
                $.each(slots, function(slot, slot_data) {
                    oncalendar.victims[update_day_data.calday].slots[slot][update_day_data.group] = slot_data;
                });
                $('td#' + update_day_data.cal_date).children('div.calendar-day-victims').empty();
                $.each(Object.keys(oncalendar.victims[update_day_data.calday].slots).sort(), function(i, slot) {
                    slot_groups = oncalendar.victims[update_day_data.calday].slots[slot];
                    $.each(slot_groups, function(group, victims) {
                        if (typeof current_victim[group] === "undefined") {
                            current_victim[group] = {
                                oncall: null,
                                shadow: null,
                                backup: null
                            }
                        }
                        if ((date_object.getDay() === oncalendar.oncall_groups[group].turnover_day && slot === oncalendar.oncall_groups[group].turnover_string) || slot === "00-00") {
                            if (victims.oncall !== current_victim[group].oncall) {
                                current_victim[group].oncall = victims.oncall;
                                current_victim[group].oncall_name = victims.oncall_name;
                            }
                            $('td#' + update_day_data.cal_date).children('div.calendar-day-victims')
                                .append('<p class="' + p_group_class[group] + '" data-group="' + group + '" title="' + group +
                                    ' oncall - ' + current_victim[group].oncall_name + '" style="color: ' +
                                    oncalendar.group_color_map[group] + ';">' + slot.replace('-', ':') + ' ' +
                                    current_victim[group].oncall + '</p>');
                            if (victims.shadow != null) {
                                if (victims.shadow !== current_victim[group].shadow) {
                                    current_victim[group].shadow = victims.shadow;
                                    current_victim[group].shadow_name = victims.shadow_name;
                                }
                                $('td#' + update_day_data.cal_date).children('div.calendar-day-victims')
                                    .append('<p class="' + p_group_class[group] + '" data-group="' + group + '" title="' + group +
                                    ' shadow - ' + current_victim[group].shadow_name + '" style="color: ' +
                                    oncalendar.group_color_map[group] + ';">' + slot.replace('-', ':') + ' ' +
                                    current_victim[group].shadow + ' (S)</p>');
                            }
                            if (victims.backup != null) {
                                if (victims.backup !== current_victim[group].backup) {
                                    current_victim[group].backup = victims.backup;
                                    current_victim[group].backup_name = victims.backup_name;
                                }
                                $('td#' + update_day_data.cal_date).children('div.calendar-day-victims')
                                    .append('<p class="' + p_group_class[group] + '" data-group="' + group + '" title="' + group +
                                    ' backup - ' + current_victim[group].backup_name + '" style="color: ' +
                                    oncalendar.group_color_map[group] + ';">' + slot.replace('-', ':') + ' ' +
                                    current_victim[group].backup + ' (B)</p>');
                            }
                        } else {
                            if (victims.oncall !== current_victim[group].oncall) {
                                current_victim[group].oncall = victims.oncall;
                                current_victim[group].oncall_name = victims.oncall_name;
                                $('td#' + update_day_data.cal_date).children('div.calendar-day-victims')
                                    .append('<p class="' + p_group_class[group] +'" data-group="' + group + '" title="' + group +
                                    ' oncall - ' + current_victim[group].oncall_name + '" style="color: ' +
                                    oncalendar.group_color_map[group] + ';">' + slot.replace('-', ':') + ' ' +
                                    (current_victim[group].oncall == null ? '--' : current_victim[group].oncall) + '</p>');
                            }
                            if (victims.shadow !== current_victim[group].shadow) {
                                current_victim[group].shadow = victims.shadow;
                                current_victim[group].shadow_name = victims.shadow_name;
                                $('td#' + update_day_data.cal_date).children('div.calendar-day-victims')
                                    .append('<p class="' + p_group_class[group] + '" data-group="' + group + '" title="' + group +
                                    ' shadow - ' + current_victim[group].shadow_name + '" style="color: ' +
                                    oncalendar.group_color_map[group] + ';">' + slot.replace('-', ':') + ' ' +
                                    (current_victim[group].shadow == null ? '--' : current_victim[group].shadow) + ' (S)</p>');
                            }
                            if (victims.backup !== current_victim[group].backup) {
                                current_victim[group].backup = victims.backup;
                                current_victim[group].backup_name = victims.backup_name;
                                $('td#' + update_day_data.cal_date).children('div.calendar-day-victims')
                                    .append('<p class="' + p_group_class[group] + '" data-group="' + group + '" title="' + group +
                                    ' backup - ' + current_victim[group].backup_name + '" style="color: ' +
                                    oncalendar.group_color_map[group] + ';">' + slot.replace('-', ':') + ' ' +
                                    (current_victim[group].backup == null ? '--' : current_victim[group].backup) + ' (B)</p>');
                            }
                        }
                    });
                });
                $('p.victim-group.info-tooltip').tooltip({placement: 'top', delay: {show: 500, hide: 100}});
                setTimeout(function() {
                    $.magnificPopup.close();
                }, 500);
                setTimeout(function() {
                    $('div#popup-working').remove();
                }, 1000);
            }
        );
    }

});

// Handlers for the calendar table
$('table#calendar-table').on('mouseenter', 'td.calendar-day', function() {
    if ($(this).children('span.edit-day-menu').hasClass('hide')) {
        if (current_user.app_role === 2) {
            $(this).children('span.edit-day-menu').addClass('dropdown').removeClass('hide')
                .append('<span data-toggle="dropdown">' +
                    '<button id="edit-day-menu-button"><span class="elegant_icons icon_pencil-edit"></span></button></span>')
                .append('<ul id="edit-day-group-options" class="dropdown-menu" role="menu"></ul>');
            $.each(Object.keys(oncalendar.oncall_groups), function (i, group) {
                $('ul#edit-day-group-options').append('<li class="edit-day-group-item" data-target="' + group + '"><span>Edit day: ' + group + '</span></li>');
            });
        } else if (Object.keys(current_user.groups).length > 1) {
            $(this).children('span.edit-day-menu').addClass('dropdown').removeClass('hide')
                .append('<span data-toggle="dropdown">' +
                    '<button id="edit-day-menu-button"><span class="elegant_icons icon_pencil-edit"></span></button></span>')
                .append('<ul id="edit-day-group-options" class="dropdown-menu" role="menu"></ul>');
            $.each(current_user.groups, function (group, active) {
                $('ul#edit-day-group-options').append('<li class="edit-day-group-item" data-target="' + group + '"><span>Edit day: ' + group + '</span></li>');
            });
        } else if (Object.keys(current_user.groups).length == 1) {
            $(this).children('span.edit-day-menu').removeClass('hide')
                .append('<button id="edit-day-button" data-target="' + Object.keys(current_user.groups)[0] + '">' +
                    '<span class="elegant_icons icon_pencil-edit"></span></button>');
        }
    }
}).on('mouseleave', 'td.calendar-day', function() {
    $(this).children('span.edit-day-menu').empty().addClass('hide');
}).on('click', 'button#edit-day-button', function() {
    var target_group = $(this).attr('data-target');
    var calday = $(this).parents('span').attr('data-calday');
    var cal_date = $(this).parents('span').parents('td').attr('id');
    edit_calday(target_group, calday, cal_date);
}).on('click', 'li.edit-day-group-item', function() {
    var target_group = $(this).attr('data-target');
    var calday = $(this).parents('ul').parents('span.edit-day-menu').attr('data-calday');
    var cal_date = $(this).parents('ul').parents('span.edit-day-menu').parents('td').attr('id');
    edit_calday(target_group, calday, cal_date);
});

{% endblock %}