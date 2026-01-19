# PowerShell script to generate icon from first aid spray image
# Creates a square 1024x1024 icon with the first aid spray centered

$iconDir = Join-Path $PSScriptRoot "..\src-tauri\icons"
$iconPath = Join-Path $iconDir "icon.png"
$sourceImage = Join-Path $PSScriptRoot "..\first-aid-spray.png"

# Ensure directory exists
if (-not (Test-Path $iconDir)) {
    New-Item -ItemType Directory -Path $iconDir -Force | Out-Null
}

# Check if source image exists
if (-not (Test-Path $sourceImage)) {
    Write-Host "Error: first-aid-spray.png not found at $sourceImage" -ForegroundColor Red
    exit 1
}

# Create a bitmap and save as PNG
Add-Type -AssemblyName System.Drawing

# Load source image
$source = [System.Drawing.Image]::FromFile($sourceImage)

# Create square canvas
$size = 1024
$bitmap = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic

# Fill with dark background
$bgBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(10, 10, 10))
$graphics.FillRectangle($bgBrush, 0, 0, $size, $size)

# Calculate scaling to fit image while maintaining aspect ratio
$sourceWidth = $source.Width
$sourceHeight = $source.Height
$scale = [Math]::Min($size / $sourceWidth, $size / $sourceHeight)
$newWidth = [int]($sourceWidth * $scale * 0.9)  # 90% to add some padding
$newHeight = [int]($sourceHeight * $scale * 0.9)
$x = ($size - $newWidth) / 2
$y = ($size - $newHeight) / 2

# Draw the source image centered
$graphics.DrawImage($source, $x, $y, $newWidth, $newHeight)

# Save as PNG
$bitmap.Save($iconPath, [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$bitmap.Dispose()
$bgBrush.Dispose()
$source.Dispose()

Write-Host "Created icon from first aid spray at $iconPath" -ForegroundColor Green
Write-Host "You can now run: npm run tauri icon src-tauri/icons/icon.png" -ForegroundColor Cyan
