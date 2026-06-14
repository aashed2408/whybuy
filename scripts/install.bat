@echo off
REM install.bat — Windows wrapper for the WhyBuy installer.
REM Forwards every argument to `node scripts/install.mjs`.
REM
REM Usage:
REM   scripts\install
REM   scripts\install --browser firefox
REM   scripts\install --no-build --path "C:\Users\me\whybuy-chrome"

setlocal
set "SCRIPT_DIR=%~dp0"
pushd "%SCRIPT_DIR%.." >nul
node "%SCRIPT_DIR%install.mjs" %*
set "EC=%ERRORLEVEL%"
popd >nul
endlocal & exit /b %EC%
