@echo off
rem Lance ReadItForMe (Windows). Installe uv au besoin ; uv s'occupe de Python et des dependances.
cd /d "%~dp0"
where uv >nul 2>nul
if errorlevel 1 (
  echo Installation de uv...
  powershell -ExecutionPolicy ByPass -NoProfile -Command "irm https://astral.sh/uv/install.ps1 | iex"
  set "PATH=%USERPROFILE%\.local\bin;%PATH%"
)
uv run --project backend readitforme
pause
