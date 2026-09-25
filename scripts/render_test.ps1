Add-Type -AssemblyName System.Drawing

$src = 'd:\CERTIFICATEWEB2\public\templates\svec_appreciation_template.jpg'
$dst = 'd:\CERTIFICATEWEB2\public\test_sample_appreciation.jpg'

$bmp = New-Object System.Drawing.Bitmap($src)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$fontName = New-Object System.Drawing.Font('Georgia', 18, [System.Drawing.FontStyle]::Bold)
$fontBody = New-Object System.Drawing.Font('Arial', 14, [System.Drawing.FontStyle]::Bold)
$fontPos = New-Object System.Drawing.Font('Arial', 14, [System.Drawing.FontStyle]::Bold)

$brushDark = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(26, 26, 46))
$brushRed = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(123, 17, 19))

# 1. Name: x = 350, y = 328 (sits right above underline at 348)
$g.DrawString('K. HARI SATYANARAYANA', $fontName, $brushDark, 350, 324)

# 2. Semester: x = 110, y = 356 (underline at 376)
$g.DrawString('IV', $fontBody, $brushDark, 120, 355)

# 3. Branch: x = 360, y = 356
$g.DrawString('ARTIFICIAL INTELLIGENCE & ML', $fontBody, $brushDark, 356, 355)

# 4. Roll No: x = 720, y = 356
$g.DrawString('21A81A4201', $fontBody, $brushDark, 725, 355)

# 5. Position: x = 195, y = 386 (underline at 407)
$g.DrawString('1st / First', $fontPos, $brushRed, 195, 386)

# 6. Event Name: x = 500, y = 386
$g.DrawString('CODING CONTEST (NEXUS 2K26)', $fontBody, $brushDark, 500, 386)

$g.Dispose()
$bmp.Save($dst, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()
Write-Host "Sample rendered to $dst"
