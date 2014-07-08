$('input').keypress(function(e) {
    if (e.which === 13) {
        $('#oncalendar-login-form').submit();
    }
});

$(document).ready(function() {
    $('input#username').focus();
});