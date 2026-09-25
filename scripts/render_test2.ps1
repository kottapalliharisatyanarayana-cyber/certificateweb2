Add-Type -AssemblyName System.Drawing

$src = 'd:\CERTIFICATEWEB2\public\templates\svec_appreciation_template.jpg'
$dst = 'd:\CERTIFICATEWEB2\public\test_sample_appreciation_v2.jpg'

$bmp = New-Object System.Drawing.Bitmap($src)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$fontName = New-Object System.Drawing.Font('Georgia', 18, [System.Drawing.FontStyle]::Bold)
$fontSem = New-Object System.Drawing.Font('Arial', 14, [System.Drawing.FontStyle]::Bold)
$fontBranch = New-Object System.Drawing.Font('Arial', 13, [System.Drawing.FontStyle]::Bold)
$fontRoll = New-Object System.Drawing.Font('Arial', 14, [System.Drawing.FontStyle]::Bold)
$fontPos = New-Object System.Drawing.Font('Arial', 15, [System.Drawing.FontStyle]::Bold)
$fontEvent = New-Object System.Drawing.Font('Arial', 14, [System.Drawing.FontStyle]::Bold)

$brushDark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(26, 26, 46))
$brushRed = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(123, 17, 19))

$sfCenter = New-Object System.Drawing.StringFormat
$sfCenter.Alignment = [System.Drawing.StringAlignment]::Center

# 1. Name: x = 350, y = 322 (underline at 348)
$g.DrawString('K. HARI SATYANARAYANA', $fontName, $brushDark, 350, 320)

# 2. Semester: center x = 140, y = 352 (underline at 376)
$g.DrawString('IV', $fontSem, $brushDark, 140, 352, $sfCenter)

# 3. Branch: center x = 430, y = 354
$g.DrawString('CSE (AIML)', $fontBranch, $brushDark, 430, 353, $sfCenter)

# 4. Roll No: x = 730, y = 352
$g.DrawString('21A81A4201', $fontRoll, $brushDark, 730, 352)

# 5. Position: center x = 240, y = 383 (underline at 407)
$g.DrawString('1st Prize', $fontPos, $brushRed, 240, 383, $sfCenter)

# 6. Event Name: x = 500, y = 383
$g.DrawString('CODING CONTEST (NEXUS 2K26)', $fontEvent, $brushDark, 500, 383)

$g.Dispose()
$bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
Write-Host "Sample v2 rendered to $dst"
