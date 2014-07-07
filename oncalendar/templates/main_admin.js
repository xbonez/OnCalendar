{% extends "main.js" %}

{% block page_script %}

var email_gateway_config = {{ email_gateway_config }};
var oc_victims_event = new Event('victims_loaded');
var master_victims_list = {};

// Get all configured victims for the admin interface User tab
$.when(oncalendar.get_victims()).then(function(data) {
    master_victims_list = data;
    document.dispatchEvent(oc_victims_event);
});

$(document).ready(function() {

//    verify_oncalendar();

    // Handler for the interface tabs
    $('#admin-functions').on('click', 'li', function() {
        $('li.tab.selected').removeClass('selected');
        $(this).addClass('selected');
        $('div.tab-panel.active-panel').removeClass('active-panel');
        $('div#' + $(this).attr('data-target')).addClass('active-panel');
    });

});

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
    setTimeout(function() {
        info_box.remove();
    }, 250);
}).on('click', 'button#groups-delete', function() {
    var groups_to_delete = {};
    $.each($('input[data-type="group-delete"]'), function() {
        if ($(this).val() == 1) {
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
    $('input#edit-group-id').attr('value', edit_group_info.id);
    $('input#edit-group-name').attr('value', edit_group);
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
    $('input#edit-group-email').attr('value', edit_group_info.email);
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
        $('input#edit-group-alias').attr('value', edit_group_info.alias);
        $('input#edit-group-backup-alias').attr('value', edit_group_info.backup_alias);
        $('input#edit-group-failsafe-alias').attr('value', edit_group_info.failsafe_alias);
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
            'data-checked="no">' +
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
                    $('input#new-group-name').removeProp('value').val('');
                    $('button#new-group-active-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
                    $('input#new-group-active').val('1');
                    $('button#new-group-autorotate-checkbox').removeClass('icon_box-empty').addClass('icon_box-checked').attr('data-checked', 'yes');
                    $('input#new-group-autorotate').val('1');
                    $('button#new-group-turnover-day-label').text('Monday ').append('<span class="elegant_icons arrow_carrot-down">');
                    $('input#new-group-turnover-day').val('1');
                    $('button#new-group-turnover-hour-label').text('09 ').append('<span class="elegant_icons arrow_carrot-down">');
                    $('input#new-group-turnover-hour').val('09');
                    $('button#new-group-turnover-min-label').text('30 ').append('<span class="elegant_icons arrow_carrot-down">');
                    $('input#new-group-turnover-hour').val('30');
                    $('input#new-group-email').removeProp('value').val('');
                    $('button#new-group-shadow-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
                    $('input#new-group-shadow').val('0');
                    $('button#new-group-backup-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
                    if (email_gateway_config) {
                        $('button#new-group-failsafe-checkbox').removeClass('icon_box-checked').addClass('icon_box-empty').attr('data-checked', 'no');
                        $('input#new-group-failsafe').val('0');
                        $('input#new-group-alias').removeProp('value').val('');
                        $('input#new-group-backup-alias').removeProp('value').val('');
                        $('input#new-group-failsafe-alias').removeProp('value').val('');
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
$('ul#new-group-turnover-hour-options').on('click', 'li', function() {
    $('#new-group-turnover-hour-label').text($(this).attr('data-hour')).append('<span class="elegant_icons arrow_carrot-down">');
    $('input#new-group-turnover-day').attr('value', $(this).attr('data-hour'));
});
$('ul#new-group-turnover-min-options').on('click', 'li', function() {
    $('#new-group-turnover-min-label').text($(this).attr('data-min')).append('<span class="elegant_icons arrow_carrot-down">');
    $('input#new-group-turnover-min').attr('value', $(this).attr('data-min'));
});

// Handlers for the dialog box buttons.
// Add group dialog.
$('#add-group-popup').on('click', 'button#cancel-add-group-button', function() {
    $.magnificPopup.close();
}).on('click', 'button#save-add-group-button', function() {
    if ($('input#new-group-name').val().length == 0) {
        $('input#new-group-name').addClass('missing-input').focus();
    } else {
        var new_group_name = $('input#new-group-name').val();
        var new_group_data = {
            name: new_group_name,
            active: $('input#new-group-active').val(),
            autorotate: $('input#new-group-autorotate').val(),
            turnover_day: $('input#new-group-turnover_day').val(),
            turnover_hour: $('input#new-group-turnover-hour').val(),
            turnover_min: $('input#new-group-turnover-min').val(),
            email: $('input#new-group-email').val(),
            shadow: $('input#new-group-shadow').val(),
            backup: $('input#new-group-shadow').val()
        };
        if (email_gateway_config) {
            new_group_data.failsafe = $('input#new-group-failsafe').val();
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
// Delete group(s) dialog
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
    if ($('input#edit-group-name').val().length == 0) {
        $('input#edit-group-name').addClass('missing-input').focus();
    } else {
        var edit_group_name = $('input#edit-group-name').val();
        var edit_group_data = {
            name: edit_group_name,
            id: $('input#edit-group-id').val(),
            active: $('input#edit-group-active').val(),
            autorotate: $('input#edit-group-autorotate').val(),
            turnover_day: $('input#edit-group-turnover-day').val(),
            turnover_hour: $('input#edit-group-turnover-hour').val(),
            turnover_min: $('input#edit-group-turnover-min').val(),
            email: $('input#edit-group-email').val(),
            shadow: $('input#edit-group-shadow').val(),
            backup: $('input#edit-group-backup').val()
        };
        if (email_gateway_config) {
            edit_group_data.failsafe = $('input#edit-group-failsafe').val();
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
                $('div#edit-group-popup').prepend('<div class="alert-box">Editing group ' + data.name + ' failed: ' + data + '</div>');
            }
        )
    }
});

function verify_oncalendar() {
    if (!oncalendar_admin.confirm_config()) {
        fix_configuration();
    }
    var db_status = oncalendar_admin.confirm_db();
    console.log(db_status);
    if (db_status !== 'ok') {
        if (db_status === 'noaccess') {
            fix_configuration();
        } else if (db_status === 'nodb') {
            $.magnificPopup.open({
                items: {
                    src: '#create-db-popup',
                    type: 'inline'
                },
                preloader: false,
                removalDelay: 300,
                mainClass: 'popup-animate',
                callbacks: {
                    close: function() {
                        setTimeout(function() {
                            verify_oncalendar();
                        }, 1000);
                    }
                }
            });
            $('#create-db-button').click(function() {
                $.when(oncalendar_admin.create_db(
                    $('input#create-db-user-input').val(),
                    $('input#create-db-password-input').val()
                )).then(
                    function() {
                        $.magnificPopup.close();
                    },
                    function(data) {
                        $('div#create-db-mysql-credentials')
                            .prepend('<p>Unable to create database:</p>' +
                            '<p class="error-text">' + data[1] + '</p>');
                    }
                )
            });
        } else if (db_status === 'noinit'){
            $.magnificPopup.open({
                items: {
                    src: '#init-db-prompt-popup',
                    type: 'inline'
                },
                preloader: false,
                removalDelay: 300,
                mainClass: 'popup-animate',
                callbacks: {
                    close: function() {
                        setTimeout(function() {
                            verify_oncalendar();
                        }, 1000);
                    }
                }
            });
            $('span#init-db-button').click(function() {
                var force_init = $('input#init-db-force').val();
                $.when(oncalendar_admin.initialize_db(force_init)).then(
                    function() {
                        $.magnificPopup.close();
                    },
                    function(data) {
                        $('div#db-init-prompt')
                            .before('<p>Could not initialize database:</p>' +
                            '<p class="error-text">' + data[1] + '</p>');
                        if (data[0] == 1) {
                            $('div#db-init-prompt p').empty().text('Force Initialization?');
                            $('input#init-db-force').attr('value', 'yes');
                        }
                    }
                )
            })
        }
    } else {
        $.when(oncalendar_admin.populate_admin_console()).then(
            function() {
                $('#admin-console').removeClass('hidden');
            }
        );
    }
}

function fix_configuration() {
    if (typeof oncalendar_admin.config_data !== "undefined") {
        $('input#config-popup-dbhost-input').attr('value', oncalendar_admin.config_data.DBHOST);
        $('input#config-popup-dbuser-input').attr('value', oncalendar_admin.config_data.DBUSER);
        $('input#config-popup-dbname-input').attr('value', oncalendar_admin.config_data.DBNAME);
    }

    $.magnificPopup.open({
        items: {
            src: '#create-config-popup',
            type: 'inline'
        },
        preloader: false,
        removalDelay: 300,
        mainClass: 'popup-animate',
        callbacks: {
            close: function() {
                setTimeout(function() {
                    verify_oncalendar();
                }, 1000);
            }
        }
    });

    $('#save-config-popup-edit').click(function() {
        var update_config_url = window.location.origin + '/api/admin/update_config';
        var new_config_data = {
            DBHOST: $('input#config-popup-dbhost-input').val(),
            DBUSER: $('input#config-popup-dbuser-input').val(),
            DBPASSWORD: $('input#config-popup-dbpassword-input').val(),
            DBNAME: $('input#config-popup-dbname-input').val()
        };
        var update_config = $.ajax({
                url: update_config_url,
                type: 'POST',
                data: new_config_data,
                dataType: 'json'
        });

        update_config.done(function() {
            $.magnificPopup.close();
        });

    });

}

{% endblock %}