Add-Type -AssemblyName System.Drawing

$srcDir = "C:\Users\91975\.gemini\antigravity-ide\brain\230a318b-85e0-4e2c-8d2f-abd04ec26d4d"
$outDir = "d:\Download\Docify\extension\store_assets"

if (!(Test-Path $outDir)) { New-Item -ItemType Directory -Path $outDir -Force | Out-Null }

function Resize-Image {
    param([string]$InputPath, [string]$OutputPath, [int]$Width, [int]$Height)
    
    $srcImage = [System.Drawing.Image]::FromFile($InputPath)
    $destImage = New-Object System.Drawing.Bitmap($Width, $Height)
    $graphics = [System.Drawing.Graphics]::FromImage($destImage)
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $graphics.DrawImage($srcImage, 0, 0, $Width, $Height)
    
    # Save as 24-bit PNG (no alpha) by drawing onto a new bitmap with RGB format
    $finalImage = New-Object System.Drawing.Bitmap($Width, $Height, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
    $finalGraphics = [System.Drawing.Graphics]::FromImage($finalImage)
    $finalGraphics.Clear([System.Drawing.Color]::White)
    $finalGraphics.DrawImage($destImage, 0, 0)
    
    $finalImage.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    
    $finalGraphics.Dispose()
    $finalImage.Dispose()
    $graphics.Dispose()
    $destImage.Dispose()
    $srcImage.Dispose()
    
    $size = [math]::Round((Get-Item $OutputPath).Length / 1KB)
    Write-Host "  Created: $OutputPath ($Width x $Height) - ${size} KB"
}

Write-Host "`n=== Resizing Store Icon (128x128) ==="
Resize-Image "$srcDir\docify_store_icon_128_1791968567026.png" "$outDir\store_icon_128x128.png" 128 128

Write-Host "`n=== Resizing Screenshots (1280x800) ==="
Resize-Image "$srcDir\screenshot_1_popup_1791966595685.png" "$outDir\screenshot_1_1280x800.png" 1280 800
Resize-Image "$srcDir\screenshot_2_editor_1791966607005.png" "$outDir\screenshot_2_1280x800.png" 1280 800
Resize-Image "$srcDir\screenshot_3_multitab_1791966635583.png" "$outDir\screenshot_3_1280x800.png" 1280 800
Resize-Image "$srcDir\screenshot_4_doctypes_1791966647728.png" "$outDir\screenshot_4_1280x800.png" 1280 800
Resize-Image "$srcDir\screenshot_5_copilot_1791966669873.png" "$outDir\screenshot_5_1280x800.png" 1280 800

Write-Host "`n=== Resizing Small Promo Tile (440x280) ==="
Resize-Image "$srcDir\small_promo_tile_1791966565967.png" "$outDir\small_promo_440x280.png" 440 280

Write-Host "`n=== Resizing Marquee Promo Tile (1400x560) ==="
Resize-Image "$srcDir\marquee_promo_tile_1791966550988.png" "$outDir\marquee_promo_1400x560.png" 1400 560

Write-Host "`n✅ All images saved to: $outDir"
Write-Host "All images are 24-bit PNG (no alpha channel) - ready for Chrome Web Store!"
