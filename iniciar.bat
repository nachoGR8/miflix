@echo off
rem Arranca MiFlix. La primera vez instala las dependencias (necesita Node.js: https://nodejs.org).
cd /d "%~dp0"
if not exist node_modules (
  echo Instalando MiFlix por primera vez...
  call npm install
)
call npm start
