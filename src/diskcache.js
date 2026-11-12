'use strict';
/**
 * Caché en disco muy simple (un JSON por clave) para no volver a descargar listas grandes
 * en cada arranque y poder usar la última copia si no hay conexión.
 */
const fs = require('fs');
const path = require('path');

class DiskCache {
  constructor(dir) {
    this.dir = dir;
  }

  file(name) {
    return path.join(this.dir, `${String(name).replace(/[^a-z0-9._-]/gi, '_')}.json`);
  }

  /** Devuelve { t, v } o null. */
  read(name) {
    if (!this.dir) return null;
    try {
      const o = JSON.parse(fs.readFileSync(this.file(name), 'utf8'));
      return o && typeof o.t === 'number' ? o : null;
    } catch {
      return null;
    }
  }

  write(name, v) {
    if (!this.dir) return;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const f = this.file(name);
      fs.writeFileSync(`${f}.tmp`, JSON.stringify({ t: Date.now(), v }));
      fs.renameSync(`${f}.tmp`, f);
    } catch {}
  }
}

module.exports = { DiskCache };
