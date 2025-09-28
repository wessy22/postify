@echo off
echo Creating desktop shortcuts...

REM Get the desktop path
set DESKTOP=%USERPROFILE%\Desktop

REM Create shortcut for data-from-groups.bat
echo Creating shortcut for data-from-groups.bat...
powershell "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%DESKTOP%\Data From Groups.lnk'); $Shortcut.TargetPath = 'C:\postify\posts\data-from-groups.bat'; $Shortcut.WorkingDirectory = 'C:\postify\posts'; $Shortcut.IconLocation = '%SystemRoot%\System32\SHELL32.dll,16'; $Shortcut.Save()"

REM Create shortcut for start-server.bat
echo Creating shortcut for start-server.bat...
powershell "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%DESKTOP%\Start Facebook Server.lnk'); $Shortcut.TargetPath = 'C:\postify\posts\facebook connector\start-server.bat'; $Shortcut.WorkingDirectory = 'C:\postify\posts\facebook connector'; $Shortcut.IconLocation = '%SystemRoot%\System32\SHELL32.dll,13'; $Shortcut.Save()"

REM Create shortcut for launch-postify-chrome.bat
echo Creating shortcut for launch-postify-chrome.bat...
powershell "$WshShell = New-Object -comObject WScript.Shell; $Shortcut = $WshShell.CreateShortcut('%DESKTOP%\Launch Postify Chrome.lnk'); $Shortcut.TargetPath = 'C:\postify\posts\launch-postify-chrome.bat'; $Shortcut.WorkingDirectory = 'C:\postify\posts'; $Shortcut.IconLocation = '%SystemRoot%\System32\SHELL32.dll,14'; $Shortcut.Save()"

echo.
echo Desktop shortcuts created successfully!
echo Check your desktop for the following shortcuts:
echo - Data From Groups.lnk
echo - Start Facebook Server.lnk  
echo - Launch Postify Chrome.lnk
echo.
timeout /t 10 
