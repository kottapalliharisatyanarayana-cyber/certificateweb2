Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap('d:\CERTIFICATEWEB2\public\templates\svec_appreciation_template.jpg')
Write-Host "Image Size: $($bmp.Width) x $($bmp.Height)"

# Inspect rows between y=340 and y=430
for ($y = 345; $y -le 425; $y++) {
    $segments = @()
    $inSeg = $false
    $startSeg = 0

    for ($x = 60; $x -le 960; $x++) {
        $c = $bmp.GetPixel($x, $y)
        # Check if pixel is dark (text / underline)
        $isDark = ($c.R -lt 120 -and $c.G -lt 120 -and $c.B -lt 120)
        if ($isDark) {
            if (-not $inSeg) {
                $inSeg = $true
                $startSeg = $x
            }
        } else {
            if ($inSeg) {
                $inSeg = $false
                $len = $x - $startSeg
                if ($len -ge 40) {
                    $segments += "x=$startSeg..$x (w=$len)"
                }
            }
        }
    }
    if ($inSeg -and (($x - $startSeg) -ge 40)) {
        $segments += "x=$startSeg..960"
    }
    if ($segments.Count -gt 0) {
        Write-Host "y=$y : $($segments -join ', ')"
    }
}
$bmp.Dispose()
