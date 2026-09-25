Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap('d:\CERTIFICATEWEB2\public\templates\svec_appreciation_template.jpg')

for ($y = 370; $y -le 385; $y++) {
    $segments = @()
    $inSeg = $false
    $startSeg = 0

    for ($x = 60; $x -le 960; $x++) {
        $c = $bmp.GetPixel($x, $y)
        $isDark = ($c.R -lt 140 -and $c.G -lt 140 -and $c.B -lt 140)
        if ($isDark) {
            if (-not $inSeg) {
                $inSeg = $true
                $startSeg = $x
            }
        } else {
            if ($inSeg) {
                $inSeg = $false
                $len = $x - $startSeg
                if ($len -ge 30) {
                    $segments += "x=$startSeg..$x (w=$len)"
                }
            }
        }
    }
    if ($inSeg -and (($x - $startSeg) -ge 30)) {
        $segments += "x=$startSeg..960"
    }
    if ($segments.Count -gt 0) {
        Write-Host "y=$y : $($segments -join ', ')"
    }
}
$bmp.Dispose()
