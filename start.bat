@echo off
rem Starts ReadItForMe (Windows). Installs uv if needed; uv takes care of Python and dependencies.
cd /d "%~dp0"
where uv >nul 2>nul
if errorlevel 1 (
  echo Installing uv...
  powershell -ExecutionPolicy ByPass -NoProfile -Command "irm https://astral.sh/uv/install.ps1 | iex"
  set "PATH=%USERPROFILE%\.local\bin;%PATH%"
)
uv run --project backend readitforme
pause
