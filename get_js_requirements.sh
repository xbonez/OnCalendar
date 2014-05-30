#!/usr/bin/env bash

cd oncalendar/app/static/js

# Get JQuery
/usr/bin/wget http://code.jquery.com/jquery-1.11.1.min.js
ln -s jquery-1.11.1.min.js jquery.js

# Get Bootstrap
/usr/bin/wget http://getbootstrap.com/2.3.2/assets/bootstrap.zip
/usr/bin/unzip bootstrap.zip bootstrap/js/bootstrap.min.js
mv bootstrap/js/bootstrap.min.js .
rm -rf bootstrap
rm bootstrap.zip
ln -s bootstrap.min.js bootstrap.js

# DateJS
/usr/bin/wget https://datejs.googlecode.com/files/date.js

# Get Elegant Icons font
cd ../
mkdir fonts
cd fonts
/usr/bin/wget http://www.elegantthemes.com/icons/elegant_font.zip
unzip elegant_font.zip elegant_font/HTML\ CSS/fonts/ElegantIcons.*
mv elegant_font/HTML\ CSS/fonts/ElegantIcons.* .
rm -rf elegant_font
rm elegant_font.zip
