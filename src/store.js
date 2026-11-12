'use strict';
const fs = require('fs');
const path = require('path');

const DEFAULTS = () => ({
  settings: { region: 'ES', language: 'es-ES', providers: [] },
  favorites: [],
  progress: {},
  library: { folders: [], items: [], scannedAt: 0 },
  meta: {},
});

/** Almacén JSON mínimo con escritura atómica y guardado diferido. */
class Store {
  constructor(file) {
    this.file = file;
    this.data = DEFAULTS();
    this.timer = null;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const base = DEFAULTS();
      this.data = { ...base, ...raw, settings: { ...base.settings, ...(raw.settings || {}) } };
      this.data.library = { ...base.library, ...(raw.library || {}) };
    } catch (err) {
      if (err.code !== 'ENOENT') {
        // Archivo dañado: lo conservamos aparte para no perder nada.
        try {
          fs.renameSync(this.file, this.file + '.corrupto-' + Date.now());
        } catch {}
      }
      this.data = DEFAULTS();
    }
  }

  get(key) {
    return this.data[key];
  }

  set(key, value) {
    this.data[key] = value;
    this.save();
  }

  save() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 300);
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = this.file + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.data));
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('No se pudo guardar el almacén:', err.message);
    }
  }
}

module.exports = { Store };
