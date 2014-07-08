#!/usr/bin/env bash

cd oncalendar/static/js

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

# DataTables
/usr/bin/wget http://datatables.net/releases/DataTables-1.10.0.zip
/usr/bin/unzip DataTables-1.10.0.zip DataTables-1.10.0/media/js/jquery.dataTables.min.js
mv DataTables-1.10.0/media/js/jquery.dataTables.min.js .
rm -rf DataTables-1.10.0
rm DataTables-1.10.0.zip

# Get Elegant Icons font
cd ../
mkdir fonts
cd fonts
/usr/bin/wget http://www.elegantthemes.com/icons/elegant_font.zip
unzip elegant_font.zip elegant_font/HTML\ CSS/fonts/ElegantIcons.*
mv elegant_font/HTML\ CSS/fonts/ElegantIcons.* .
rm -rf elegant_font
rm elegant_font.zip
