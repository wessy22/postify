param([string]$imagePath)
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile($imagePath)
[System.Windows.Forms.Clipboard]::SetImage($img)
