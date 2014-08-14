$('input').keypress(function(e) {
    if (e.which === 13) {
        $('#oncalendar-login-form').submit();
    }
});

$('#login-form-buttons').on('click', 'button#cancel-login', function() {
    console.log($(this));
    window.location.href = "/";
}).on('click', 'button#login-button', function() {
    console.log($(this));
    $('#oncalendar-login-form').submit();
});

$(document).ready(function() {
    $('input#username').focus();
});