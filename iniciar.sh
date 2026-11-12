#!/usr/bin/env bash
# Arranca MiFlix. La primera vez instala las dependencias (necesita Node.js: https://nodejs.org).
cd "$(dirname "$0")"
[ -d node_modules ] || { echo "Instalando MiFlix por primera vez..."; npm install; }
npm start
