'use strict';
/**
 * Internet Archive: cine de dominio público y contenido con licencia abierta.
 * API sin clave. Los archivos mp4 se reproducen directamente en la app.
 */
const { stripHtml, srtToVtt, decodeText, subtitleLang } = require('../util');

const SEARCH = 'https://archive.org/advancedsearch.php';
const META = 'https://archive.org/metadata/';
const DL = 'https://archive.org/download/';
const FIELDS = ['identifier', 'title', 'year', 'date', 'description', 'downloads', 'creator', 'language', 'licenseurl'];

const first = (v) => (Array.isArray(v) ? v[0] : v);
const lucene = (q) => String(q).replace(/["+\-&|!(){}[\]^~*?:\\/]/g, ' ').replace(/\s+/g, ' ').trim();
const SPANISH = '(language:Spanish OR language:spa OR language:es OR language:"es-ES")';

/** Filas predefinidas de la vista "Gratis". */
const ROWS = [
  { key: 'es', title: 'Cine en español', opts: { spanish: true } },
  { key: 'feature_films', title: 'Cine clásico', opts: { collection: 'feature_films' } },
  { key: 'silent_films', title: 'Cine mudo', opts: { collection: 'silent_films' } },
  { key: 'Film_Noir', title: 'Cine negro', opts: { collection: 'Film_Noir' } },
  { key: 'SciFi_Horror', title: 'Ciencia ficción y terror', opts: { collection: 'SciFi_Horror' } },
  { key: 'animationandcartoons', title: 'Animación clásica', opts: { collection: 'animationandcartoons' } },
  { key: 'classic_tv', title: 'Televisión clásica', opts: { collection: 'classic_tv' } },
];

const SORTS = new Set(['downloads desc', 'date desc', 'date asc', 'titleSorter asc']);

const encodePath = (name) => name.split('/').map(encodeURIComponent).join('/');

class Archive {
  constructor({ fetchFn = globalThis.fetch } = {}) {
    this.fetchFn = fetchFn;
    this.cache = new Map();
  }

  async json(url) {
    const hit = this.cache.get(url);
    if (hit && Date.now() - hit.t < 10 * 60 * 1000) return hit.v;
    let res;
    try {
      res = await this.fetchFn(url, { headers: { accept: 'application/json' } });
    } catch {
      const e = new Error('No se pudo conectar con Internet Archive.');
      e.code = 'OFFLINE';
      throw e;
    }
    if (!res.ok) throw new Error(`Internet Archive respondió con el error ${res.status}.`);
    const v = await res.json();
    this.cache.set(url, { t: Date.now(), v });
    return v;
  }

  normalize(d) {
    const id = d.identifier;
    const yearRaw = first(d.year) || first(d.date) || '';
    const year = Number(String(yearRaw).slice(0, 4)) || null;
    return {
      id: `archive:${id}`,
      source: 'archive',
      type: 'movie',
      archiveId: id,
      title: stripHtml(first(d.title)) || id,
      original: '',
      year,
      overview: stripHtml(d.description).slice(0, 700),
      poster: `https://archive.org/services/img/${encodeURIComponent(id)}`,
      backdrop: `https://archive.org/services/img/${encodeURIComponent(id)}`,
      rating: null,
      creator: stripHtml(first(d.creator) || ''),
      license: first(d.licenseurl) || null,
    };
  }

  async search(opts) {
    return (await this.searchPage(opts)).items;
  }

  /** Búsqueda paginada: devuelve { items, total, page }. sort: downloads desc | date desc | date asc | titleSorter asc */
  async searchPage({ query = '', collection, spanish = false, rows = 24, page = 1, sort = 'downloads desc' } = {}) {
    const parts = ['mediatype:movies'];
    if (collection) parts.push(`collection:(${collection})`);
    if (spanish) parts.push(SPANISH);
    const q = lucene(query);
    if (q) parts.push(`(title:(${q}) OR subject:(${q}))`);

    const url = new URL(SEARCH);
    url.searchParams.set('q', parts.join(' AND '));
    for (const f of FIELDS) url.searchParams.append('fl[]', f);
    url.searchParams.append('sort[]', SORTS.has(sort) ? sort : 'downloads desc');
    url.searchParams.set('rows', String(Math.min(Math.max(Number(rows) || 24, 1), 100)));
    url.searchParams.set('page', String(Math.max(Number(page) || 1, 1)));
    url.searchParams.set('output', 'json');

    const data = await this.json(url.toString());
    const resp = data.response || {};
    const docs = resp.docs || [];
    return {
      items: docs.filter((d) => d.identifier).map((d) => this.normalize(d)),
      total: Number(resp.numFound) || 0,
      page: Number(page) || 1,
      rows: Number(rows) || 24,
    };
  }

  async row(key) {
    const def = ROWS.find((r) => r.key === key);
    if (!def) throw new Error(`Fila desconocida: ${key}`);
    return this.search({ ...def.opts, rows: 24 });
  }

  /** Explorador paginado de una colección predefinida. */
  async browse({ key, query = '', sort, page = 1 } = {}) {
    const def = ROWS.find((r) => r.key === key) || ROWS[0];
    return this.searchPage({ ...def.opts, query, sort, page, rows: 36 });
  }

  /** Elige el archivo de vídeo más adecuado para reproducir en Chromium. */
  static pickSources(files, identifier) {
    const rank = (f) => {
      const name = f.name.toLowerCase();
      const fmt = String(f.format || '').toLowerCase();
      if (/_(trailer|sample)\./.test(name)) return 99;
      if (name.endsWith('.mp4') || name.endsWith('.m4v')) {
        if (fmt.includes('h.264')) return 1;
        if (fmt.includes('mpeg4')) return 2;
        return 3;
      }
      if (name.endsWith('.webm')) return 4;
      if (name.endsWith('.ogv')) return 5;
      return 99;
    };
    const cands = (files || []).filter((f) => f && f.name && rank(f) < 99);
    if (!cands.length) return [];
    const best = Math.min(...cands.map(rank));
    return cands
      .filter((f) => rank(f) === best)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
      .slice(0, 20)
      .map((f) => ({
        name: f.name,
        size: Number(f.size) || 0,
        url: `${DL}${encodeURIComponent(identifier)}/${encodePath(f.name)}`,
      }));
  }

  async details(identifier) {
    const m = await this.json(META + encodeURIComponent(identifier));
    if (!m || !m.metadata) throw new Error('Ese título ya no está disponible en Internet Archive.');
    const item = this.normalize({ ...m.metadata, identifier });
    const files = m.files || [];
    const sources = Archive.pickSources(files, identifier);

    const subtitles = files
      .filter((f) => /\.(srt|vtt)$/i.test(f.name || ''))
      .slice(0, 8)
      .map((f) => {
        const base = f.name.replace(/\.[^.]+$/, '');
        const lang = subtitleLang(base.split(/[._-]/).slice(-1)[0]);
        return { ...lang, url: `${DL}${encodeURIComponent(identifier)}/${encodePath(f.name)}` };
      });

    return { ...item, sources, subtitles, playable: sources.length > 0 };
  }

  async subtitle(url) {
    if (!/^https:\/\/([a-z0-9-]+\.)*archive\.org\//i.test(url)) throw new Error('URL de subtítulos no permitida.');
    const res = await this.fetchFn(url);
    if (!res.ok) throw new Error('No se pudieron descargar los subtítulos.');
    const buf = Buffer.from(await res.arrayBuffer());
    return srtToVtt(decodeText(buf));
  }
}

module.exports = { Archive, ROWS };
