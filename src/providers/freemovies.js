'use strict';
/**
 * Cine libre verificado: películas que la lista pública petterreinholdtsen/public-domain-free-imdb
 * marca como distribuibles (dominio público o licencia abierta) y que están en Internet Archive,
 * de modo que se reproducen dentro de la app. Cada título lleva su ID de IMDb.
 *
 * Solo se usan las listas con mejor correspondencia (Wikidata + revisión manual). La de búsqueda
 * automática de Internet Archive (~25.000 entradas) queda fuera a propósito: se equivoca más.
 * Ojo: "dominio público" depende del país; la lista no distingue la ley española.
 */
const { normalizeKey } = require('../util');

const BASE = 'https://raw.githubusercontent.com/petterreinholdtsen/public-domain-free-imdb/master/';
const FILES = ['free-movies-manual.json', 'free-movies-archive-org-wikidata.json'];
const IA_DETAILS = /^https?:\/\/(?:www\.)?archive\.org\/details\/([A-Za-z0-9._-]+)/i;
const TTL = 7 * 24 * 60 * 60 * 1000;
const PAGE = 36;

const ERAS = {
  mudo: [0, 1929],
  1930: [1930, 1949],
  1950: [1950, 1969],
  1970: [1970, 9999],
};
const SORTS = new Set(['year desc', 'year asc', 'title']);

function parseDataset(json) {
  const out = [];
  if (!json || typeof json !== 'object') return out;
  const maxYear = new Date().getFullYear() + 1;
  for (const [key, v] of Object.entries(json)) {
    if (!v || typeof v !== 'object') continue;
    if (String(v.status || '').trim().toLowerCase() !== 'free') continue;
    const urls = [v.freenessurl, ...(Array.isArray(v.freenessurls) ? v.freenessurls : [])].filter((u) => typeof u === 'string');
    const m = urls.map((u) => u.match(IA_DETAILS)).find(Boolean);
    const title = typeof v.title === 'string' ? v.title.trim() : '';
    if (!m || !title) continue;
    const imdb = String(key).match(/tt\d{6,9}/);
    const y = Number(String(v.year || '').slice(0, 4));
    const id = m[1];
    out.push({
      id: `archive:${id}`,
      source: 'archive',
      type: 'movie',
      archiveId: id,
      imdbId: imdb ? imdb[0] : null,
      title,
      original: '',
      year: y >= 1850 && y <= maxYear ? y : null,
      overview: '',
      poster: `https://archive.org/services/img/${encodeURIComponent(id)}`,
      backdrop: `https://archive.org/services/img/${encodeURIComponent(id)}`,
      rating: null,
      creator: '',
      license: null,
      verified: true,
    });
  }
  return out;
}

class FreeMovies {
  constructor({ fetchFn = globalThis.fetch, disk = null, base = BASE, files = FILES, ttl = TTL } = {}) {
    this.fetchFn = fetchFn;
    this.disk = disk;
    this.base = base;
    this.files = files;
    this.ttl = ttl;
    this.items = null;
    this.loading = null;
  }

  async fetchAll() {
    const results = await Promise.allSettled(
      this.files.map(async (f) => {
        const res = await this.fetchFn(this.base + f, { headers: { accept: 'application/json' } });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return parseDataset(await res.json());
      }),
    );
    const ok = results.filter((r) => r.status === 'fulfilled');
    if (!ok.length) throw new Error('fetch');
    const seen = new Set();
    const items = [];
    for (const r of ok) {
      for (const it of r.value) {
        if (seen.has(it.archiveId)) continue;
        seen.add(it.archiveId);
        items.push(it);
      }
    }
    return { items, complete: ok.length === results.length };
  }

  async load() {
    if (this.items) return this.items;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      const cached = this.disk && this.disk.read('free-movies');
      if (cached && Array.isArray(cached.v) && Date.now() - cached.t < this.ttl) return (this.items = cached.v);
      try {
        const { items, complete } = await this.fetchAll();
        if (complete && this.disk) this.disk.write('free-movies', items);
        return (this.items = items);
      } catch {
        if (cached && Array.isArray(cached.v)) return (this.items = cached.v);
        const e = new Error('No se pudo descargar la lista de cine libre verificado. Comprueba tu conexión.');
        e.code = 'OFFLINE';
        throw e;
      }
    })();
    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  }

  /** Explorador paginado. era: '' | mudo | 1930 | 1950 | 1970. sort: year desc | year asc | title. */
  async browse({ query = '', era = '', sort = 'year desc', page = 1 } = {}) {
    let list = await this.load();
    const q = normalizeKey(query);
    if (q) list = list.filter((it) => normalizeKey(it.title).includes(q));
    if (ERAS[era]) {
      const [lo, hi] = ERAS[era];
      list = list.filter((it) => it.year && it.year >= lo && it.year <= hi);
    }
    const s = SORTS.has(sort) ? sort : 'year desc';
    const byTitle = (a, b) => a.title.localeCompare(b.title, 'es', { sensitivity: 'base' });
    list = [...list].sort((a, b) => {
      if (s === 'title') return byTitle(a, b);
      if (!a.year !== !b.year) return a.year ? -1 : 1; // sin año, al final
      return (s === 'year asc' ? a.year - b.year : b.year - a.year) || byTitle(a, b);
    });
    const total = list.length;
    const p = Math.max(Number(page) || 1, 1);
    return {
      items: list.slice((p - 1) * PAGE, p * PAGE),
      total,
      page: p,
      rows: PAGE,
      totalPages: Math.max(Math.ceil(total / PAGE), 1),
    };
  }
}

module.exports = { FreeMovies, parseDataset, ERAS };
