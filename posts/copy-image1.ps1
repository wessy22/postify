Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

# טען תמונה כלשהי
$image = [System.Drawing.Image]::FromFile("C:\\postify\\images\\post1\1.jpg")
[System.Windows.Forms.Clipboard]::SetImage($image)

Write-Host "✅ Image copied to clipboard."
