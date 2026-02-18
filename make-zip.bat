@echo off
setlocal EnableExtensions

set "ROOT=%~dp0"
pushd "%ROOT%"

set "ZIP_NAME=element-snap.zip"
set "STAGING_DIR=%TEMP%\element-snap-package"
set "DIST_DIR=%ROOT%dist"
set "SCRIPT_NAME=%~nx0"

if not exist "%DIST_DIR%" mkdir "%DIST_DIR%" >nul 2>&1
if exist "%DIST_DIR%\%ZIP_NAME%" del /f /q "%DIST_DIR%\%ZIP_NAME%"
if exist "%STAGING_DIR%" rmdir /s /q "%STAGING_DIR%"
mkdir "%STAGING_DIR%" >nul 2>&1

rem stage files excluding .git, dist, and entire assets dir; exclude non-runtime docs and this script
robocopy . "%STAGING_DIR%" /E /XD ".git" "dist" "assets" ".vscode" /XF "%ZIP_NAME%" "%SCRIPT_NAME%" ".gitignore" "CHANGELOG.md" "CNAME" "index.html" "README.md" "site.css" "STORE.md" "STORE-de-DE.md" /NFL /NDL /NJH /NJS >nul

rem add required assets into staging
set "STAGING_ASSETS=%STAGING_DIR%\assets"
set "LOGO_SRC=assets\logo.png"
mkdir "%STAGING_ASSETS%" >nul 2>&1
if exist "%LOGO_SRC%" (
  where magick >nul 2>&1
  if "%ERRORLEVEL%"=="0" (
    for %%S in (16 24 32 48 128) do (
      echo Generating icon %%S x %%S ...
      magick "%LOGO_SRC%" -resize %%Sx%%S -background none -gravity center -extent %%Sx%%S "%STAGING_ASSETS%\icon-%%S.png" >nul 2>&1
    )
  ) else (
    echo ImageMagick not found. Using logo.png as source to create icon-*.png copies.
    for %%S in (16 24 32 48 128) do (
      copy /y "%LOGO_SRC%" "%STAGING_ASSETS%\icon-%%S.png" >nul 2>&1
    )
  )
)

rem verify staging contains files
powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=(Get-ChildItem -Path '%STAGING_DIR%' -Recurse -File).Count; if ($c -gt 0) { Write-Output ('STAGING_FILE_COUNT='+$c); exit 0 } else { Write-Output 'STAGING_FILE_COUNT=0'; exit 8 }"
if not "%ERRORLEVEL%"=="0" (
  echo Nothing to package. Staging is empty.
  rmdir /s /q "%STAGING_DIR%" >nul 2>&1
  popd
  exit /b 8
)

set "DEST_PATH=%DIST_DIR%\%ZIP_NAME%"

rem Primary: .NET Zip API via PowerShell
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ErrorActionPreference='Stop'; try { Add-Type -AssemblyName 'System.IO.Compression.FileSystem'; [System.IO.Compression.ZipFile]::CreateFromDirectory('%STAGING_DIR%','%DEST_PATH%',[System.IO.Compression.CompressionLevel]::Optimal,$false) } catch { Write-Error $_.Exception.Message; exit 1 }"
set "ERR=%ERRORLEVEL%"

if not "%ERR%"=="0" (
  rem Fallback to tar if available
  where tar >nul 2>&1
  if "%ERRORLEVEL%"=="0" (
    tar -a -c -f "%DEST_PATH%" -C "%STAGING_DIR%" .
    set "ERR=%ERRORLEVEL%"
  )
)

if "%ERR%"=="0" if not exist "%DEST_PATH%" set "ERR=1"

rmdir /s /q "%STAGING_DIR%" >nul 2>&1
popd

if not "%ERR%"=="0" (
  echo Failed to create archive. Exit code: %ERR%
  exit /b %ERR%
)

echo Created %ZIP_NAME% in %DIST_DIR%
start "" explorer.exe "%DIST_DIR%"
exit /b 0
