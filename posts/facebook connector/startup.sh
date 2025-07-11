#!/bin/bash

# הגדרת משתני סביבה
export DISPLAY=:1

# יצירת directories נדרשים
mkdir -p /home/user/.vnc
mkdir -p /home/user/.config/google-chrome
chown -R user:user /home/user

# המתנה קצרה לפני הפעלת supervisor
sleep 2

echo "=== Starting VNC Browser Setup ==="
echo "Display: $DISPLAY"
echo "VNC Port: 5901"
echo "noVNC Web Interface: http://localhost:6080"
echo "Chrome Remote Debug: http://localhost:9222"

# הפעלת supervisor
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
