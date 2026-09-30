@echo off
rem Collage Maker launcher for Windows.
rem Opens the app in its own window using Microsoft Edge, Google Chrome or Brave,
rem or in the default browser when none of those is installed.
rem https://github.com/khoks/collage-maker
setlocal
set "VERSION=1.0.0"

rem Installed or portable bundle: the HTML sits next to this file. Source checkout: ..\app\index.html.
set "HTML=%~dp0collage-maker.html"
if not exist "%HTML%" set "HTML=%~dp0..\app\index.html"
if not exist "%HTML%" goto :missing
for %%I in ("%HTML%") do set "HTML=%%~fI"

set "MODE=app"
if not "%~2"=="" goto :usage_error
if "%~1"=="" goto :start
if /i "%~1"=="--browser" (set "MODE=browser" & goto :start)
if /i "%~1"=="--dry-run" (set "MODE=dry" & goto :start)
if /i "%~1"=="--path" goto :path
if /i "%~1"=="--version" goto :version
if /i "%~1"=="-v" goto :version
if /i "%~1"=="--help" goto :help
if /i "%~1"=="-h" goto :help
if /i "%~1"=="/?" goto :help
goto :usage_error

:start
if "%MODE%"=="browser" goto :default_browser

rem Build a properly escaped file:/// URL (handles spaces, #, %%, and non-ASCII folder names).
set "URL="
for /f "usebackq delims=" %%U in (`powershell -NoProfile -NonInteractive -Command "([System.Uri]$env:HTML).AbsoluteUri" 2^>nul`) do set "URL=%%U"
if not defined URL set "URL=file:///%HTML:\=/%"

rem Find a Chromium-based browser. %URL% is deliberately not used inside this loop: cmd expands it
rem before substituting the loop variable, which would corrupt escapes such as %%B0 if the loop
rem variable were a hex letter.
set "BROWSER="
if defined COLLAGE_MAKER_BROWSER if exist "%COLLAGE_MAKER_BROWSER%" set "BROWSER=%COLLAGE_MAKER_BROWSER%"
for %%X in (
  "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe"
  "%LocalAppData%\Microsoft\Edge\Application\msedge.exe"
  "%ProgramFiles%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
  "%LocalAppData%\Google\Chrome\Application\chrome.exe"
  "%ProgramFiles%\BraveSoftware\Brave-Browser\Application\brave.exe"
  "%ProgramFiles(x86)%\BraveSoftware\Brave-Browser\Application\brave.exe"
  "%LocalAppData%\BraveSoftware\Brave-Browser\Application\brave.exe"
) do if not defined BROWSER if exist %%X set "BROWSER=%%~X"

if not defined BROWSER goto :default_browser
if "%MODE%"=="dry" goto :print_command
start "" "%BROWSER%" --app="%URL%"
exit /b 0

:print_command
echo "%BROWSER%" --app="%URL%"
exit /b 0

:default_browser
if "%MODE%"=="dry" goto :print_default
start "" "%HTML%"
exit /b 0

:print_default
echo start "" "%HTML%"
exit /b 0

:path
echo %HTML%
exit /b 0

:version
echo collage-maker %VERSION%
exit /b 0

:help
echo Collage Maker %VERSION%: drop photos, get a clean 8K collage with white borders.
echo.
echo Usage: collage-maker [option]
echo.
echo   (no option)   open Collage Maker in its own window
echo   --browser     open it in a normal tab of your default browser instead
echo   --path        print where the app file is
echo   --dry-run     print the command that would open the app, without running it
echo   --version     print the version
echo   --help        show this help
echo.
echo Set COLLAGE_MAKER_BROWSER to a browser .exe to choose the browser yourself.
echo More help: https://github.com/khoks/collage-maker
exit /b 0

:usage_error
echo collage-maker: unknown option "%*". Try: collage-maker --help 1>&2
exit /b 2

:missing
echo collage-maker.html was not found next to this launcher:
echo   "%~dp0collage-maker.html"
echo Keep collage-maker.cmd and collage-maker.html in the same folder.
pause
exit /b 1
