@echo off
setlocal

rem Run from this script directory regardless of where the .bat is launched.
pushd "%~dp0"

powershell -NoProfile -ExecutionPolicy Bypass -File ".\package-all.ps1"
set "EXITCODE=%ERRORLEVEL%"

if not "%EXITCODE%"=="0" (
  echo.
  echo Build failed with exit code %EXITCODE%.
)

popd
exit /b %EXITCODE%