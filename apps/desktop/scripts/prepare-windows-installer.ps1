<# Compile the x86 DWM helper and raster assets embedded in the NSIS installer. #>
[CmdletBinding()]
param([string]$OutputDirectory, [switch]$TestProgress, [switch]$CompileProgressOnly)
$ErrorActionPreference = 'Stop'
$installerRoot = Join-Path $PSScriptRoot '../installer'
if (-not $OutputDirectory) { $OutputDirectory = Join-Path $PSScriptRoot '../.desktop-build/targets/win-x64/installer-ui' }
$output = [IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Force $output | Out-Null
$source = Join-Path $installerRoot 'window-frame.cpp'
$library = Join-Path $output 'window-frame.dll'
$vswhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
if (-not (Test-Path -LiteralPath $vswhere)) { throw 'Windows installer preparation requires Visual Studio C++ Build Tools and a Windows SDK.' }
$visualStudio = & $vswhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
if (-not $visualStudio) { throw 'Visual Studio C++ Build Tools are missing.' }
$vcvars = Join-Path $visualStudio 'VC/Auxiliary/Build/vcvars32.bat'
$compileScript = Join-Path $output 'compile-frame.cmd'
$compileLines = @('@echo off', ('call "{0}" >nul' -f $vcvars), 'if errorlevel 1 exit /b %errorlevel%', ('cl /nologo /LD /MT /O1 /W4 /WX /EHsc "{0}" /Fo"{1}" /link /OUT:"{2}" /IMPLIB:"{3}" user32.lib gdi32.lib comctl32.lib dwmapi.lib gdiplus.lib ole32.lib shell32.lib uuid.lib advapi32.lib' -f $source, (Join-Path $output 'window-frame.obj'), $library, (Join-Path $output 'window-frame.lib')))
[IO.File]::WriteAllLines($compileScript, $compileLines, [Text.Encoding]::Default)
& $env:ComSpec /d /c $compileScript
if ($LASTEXITCODE -ne 0) { throw 'Native installer helper compilation failed.' }
if ($TestProgress -or $CompileProgressOnly) {
    $cleanupSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../tests/windows-uninstall-data.cpp'))
    # UAC installer detection demands elevation from unmanifested executables named after installation.
    $cleanupExecutable = Join-Path $output 'data-cleanup-test.exe'
    $cleanupScript = Join-Path $output 'compile-data-cleanup-test.cmd'
    [IO.File]::WriteAllLines($cleanupScript, @('@echo off', ('call "{0}" >nul' -f $vcvars), 'if errorlevel 1 exit /b %errorlevel%', ('cl /nologo /MT /W4 /WX /EHsc "{0}" /Fo"{1}" /Fe"{2}" /link shell32.lib ole32.lib uuid.lib advapi32.lib' -f $cleanupSource, (Join-Path $output 'data-cleanup-test.obj'), $cleanupExecutable)), [Text.Encoding]::Default)
    & $env:ComSpec /d /c $cleanupScript
    if ($LASTEXITCODE -ne 0) { throw 'Uninstall data test compilation failed.' }
    if ($TestProgress) {
        & $cleanupExecutable (Join-Path $output ('cleanup-' + [Guid]::NewGuid().ToString('N')))
        if ($LASTEXITCODE -ne 0) { throw 'Uninstall data regression failed.' }
    }
    $testSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../tests/windows-installer-progress.cpp'))
    $testExecutable = Join-Path $output 'progress-test.exe'
    $testScript = Join-Path $output 'compile-progress-test.cmd'
    [IO.File]::WriteAllLines($testScript, @('@echo off', ('call "{0}" >nul' -f $vcvars), 'if errorlevel 1 exit /b %errorlevel%', ('cl /nologo /MT /W4 /WX /EHsc "{0}" /Fo"{1}" /Fe"{2}"' -f $testSource, (Join-Path $output 'progress-test.obj'), $testExecutable)), [Text.Encoding]::Default)
    & $env:ComSpec /d /c $testScript
    if ($LASTEXITCODE -ne 0) { throw 'Progress test compilation failed.' }
    if ($TestProgress) {
        & $testExecutable
        if ($LASTEXITCODE -ne 0) { throw 'Progress timeline regression failed.' }
    }
    $presentationSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../tests/windows-installer-presentation.cpp'))
    $presentationExecutable = Join-Path $output 'presentation-test.exe'
    $presentationScript = Join-Path $output 'compile-presentation-test.cmd'
    [IO.File]::WriteAllLines($presentationScript, @('@echo off', ('call "{0}" >nul' -f $vcvars), 'if errorlevel 1 exit /b %errorlevel%', ('cl /nologo /MT /W4 /WX /EHsc "{0}" /Fo"{1}" /Fe"{2}" /link "{3}" user32.lib' -f $presentationSource, (Join-Path $output 'presentation-test.obj'), $presentationExecutable, (Join-Path $output 'window-frame.lib'))), [Text.Encoding]::Default)
    & $env:ComSpec /d /c $presentationScript
    if ($LASTEXITCODE -ne 0) { throw 'Installer presentation test compilation failed.' }
    if ($TestProgress) {
        & $presentationExecutable
        if ($LASTEXITCODE -ne 0) { throw 'Installer presentation regression failed.' }
    }
    $renderSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../tests/windows-installer-render.cpp'))
    $renderExecutable = Join-Path $output 'render-test.exe'
    $renderScript = Join-Path $output 'compile-render-test.cmd'
    [IO.File]::WriteAllLines($renderScript, @('@echo off', ('call "{0}" >nul' -f $vcvars), 'if errorlevel 1 exit /b %errorlevel%', ('cl /nologo /MT /W4 /WX /EHsc "{0}" /Fo"{1}" /Fe"{2}" /link "{3}" user32.lib gdi32.lib' -f $renderSource, (Join-Path $output 'render-test.obj'), $renderExecutable, (Join-Path $output 'window-frame.lib'))), [Text.Encoding]::Default)
    & $env:ComSpec /d /c $renderScript
    if ($LASTEXITCODE -ne 0) { throw 'Installer render test compilation failed.' }
    $reportSource = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../tests/windows-installer-extract-report.cpp'))
    $reportExecutable = Join-Path $output 'extract-report-test.exe'
    $reportScript = Join-Path $output 'compile-extract-report-test.cmd'
    [IO.File]::WriteAllLines($reportScript, @('@echo off', ('call "{0}" >nul' -f $vcvars), 'if errorlevel 1 exit /b %errorlevel%', ('cl /nologo /MT /W4 /WX /EHsc "{0}" /Fo"{1}" /Fe"{2}" /link "{3}" user32.lib shell32.lib' -f $reportSource, (Join-Path $output 'extract-report-test.obj'), $reportExecutable, (Join-Path $output 'window-frame.lib'))), [Text.Encoding]::Default)
    & $env:ComSpec /d /c $reportScript
    if ($LASTEXITCODE -ne 0) { throw 'Extraction report test compilation failed.' }
    if ($TestProgress) {
        & $reportExecutable
        if ($LASTEXITCODE -ne 0) { throw 'Extraction report regression failed.' }
    }
}
Add-Type -AssemblyName System.Drawing
$flavor = $env:DSH_DESKTOP_FLAVOR
$assetsDirectory = if ($null -eq $flavor -or $flavor -eq 'official') {
    Join-Path $installerRoot 'assets'
} elseif ($flavor -eq 'suiyi') {
    Join-Path $installerRoot 'assets/suiyi'
} else {
    throw "Unknown desktop flavor '$flavor': Windows installer assets require official or suiyi."
}
$assetNames = @('brand', 'brand-2x', 'brand-dark', 'brand-dark-2x', 'uninstaller-sidebar')
if ($flavor -eq 'suiyi') {
    # The progress page uses the prototype ribbon mark, not the horizontal brand lockup.
    $assetNames += @('mark', 'mark-2x', 'mark-dark', 'mark-dark-2x')
}
foreach ($asset in $assetNames) {
    # Suiyi progress uses the square prototype mark; map the legacy brand names onto it as well so
    # any existing brand-path caller cannot resurrect the old black/gray horizontal lockup.
    # The install/login prototype always uses the cyan logo-motion artwork, not the light mark.
    # Reuse the existing dark RGB/alpha asset for mark/mark-2x; only official flavor keeps its own.
    $sourceAsset = if ($flavor -eq 'suiyi' -and $asset -in @('mark', 'mark-2x')) {
        $asset -replace '^mark', 'mark-dark'
    } elseif ($flavor -eq 'suiyi' -and $asset -like 'brand*') {
        $asset -replace '^brand', 'mark'
    } else {
        $asset
    }
    $sourceImage = Join-Path $assetsDirectory "$sourceAsset.png"
    if (-not (Test-Path -LiteralPath $sourceImage)) { throw "Missing Windows installer asset: $sourceImage" }
    # Suiyi progress consumes the real alpha PNG directly through GDI+ Image; do not flatten
    # it onto a white 24bpp BMP (that produced the 94x94 white square behind the ribbon).
    if ($flavor -eq 'suiyi' -and $asset -like 'mark*') {
        Copy-Item -LiteralPath $sourceImage -Destination (Join-Path $output "$asset.png") -Force
        $staleBmp = Join-Path $output "$asset.bmp"
        if (Test-Path -LiteralPath $staleBmp) { Remove-Item -LiteralPath $staleBmp -Force }
        continue
    }
    $image = [Drawing.Image]::FromFile($sourceImage)
    try {
        $bitmap = [Drawing.Bitmap]::new($image.Width, $image.Height, [Drawing.Imaging.PixelFormat]::Format24bppRgb)
        try {
            $graphics = [Drawing.Graphics]::FromImage($bitmap)
            try {
                # Brand bitmaps sit on the installer card; uninstaller artwork keeps the NSIS default page colour.
                $background = if ($asset -like 'brand*' -or $asset -like 'mark*') {
                    if ($asset -like '*dark*') { [Drawing.Color]::FromArgb(22, 38, 58) } else { [Drawing.Color]::White }
                } elseif ($asset -like '*dark*') { [Drawing.Color]::FromArgb(21, 21, 23) } else { [Drawing.Color]::White }
                $graphics.Clear($background)
                $graphics.DrawImage($image, 0, 0, $image.Width, $image.Height)
            } finally { $graphics.Dispose() }
            $bitmap.Save((Join-Path $output "$asset.bmp"), [Drawing.Imaging.ImageFormat]::Bmp)
        } finally { $bitmap.Dispose() }
    } finally { $image.Dispose() }
}
Write-Output "Prepared native installer resources: $output"
