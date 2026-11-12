'use strict';
/**
 * Canales de televisión en directo de España.
 * Fuente: lista pública y comunitaria iptv-org/iptv (colección de canales que emiten de forma abierta por Internet).
 * Se usa la lista ya generada por el proyecto, que descarta los canales retirados por reclamación.
 * MiFlix no aloja ni retransmite nada: solo lee la lista y reproduce las señales que cada canal publica.
 */
const crypto = require('crypto');

const SOURCE = 'https://iptv-org.github.io/iptv/countries/es.m3u';
const TTL = 30 * 60 * 1000;

const CATEGORY_ES = {
  animation: 'Animación',
  auto: 'Motor',
  business: 'Negocios',
  classic: 'Clásicos',
  comedy: 'Comedia',
  cooking: 'Cocina',
  culture: 'Cultura',
  documentary: 'Documentales',
  education: 'Educación',
  entertainment: 'Entretenimiento',
  family: 'Familia',
  general: 'Generalistas',
  interactive: 'Interactivos',
  kids: 'Infantil',
  legislative: 'Parlamentos',
  lifestyle: 'Estilo de vida',
  movies: 'Cine',
  music: 'Música',
  news: 'Noticias',
  outdoor: 'Aire libre',
  public: 'Públicos',
  relax: 'Relax',
  religious: 'Religión',
  science: 'Ciencia',
  series: 'Series',
  shop: 'Compras',
  sports: 'Deportes',
  travel: 'Viajes',
  weather: 'El tiempo',
  undefined: 'Otros',
};

const sha = (s) => crypto.createHash('sha1').update(String(s)).digest('hex').slice(0, 12);

function parseAttrs(str) {
  const o = {};
  for (const m of String(str).matchAll(/([\w-]+)="([^"]*)"/g)) o[m[1].toLowerCase()] = m[2];
  return o;
}

/** Solo http(s) y nunca hacia la red local: una lista externa no debe poder apuntar a tu router. */
function isSafeUrl(u, allowLocal = false) {
  let x;
  try {
    x = new URL(u);
  } catch {
    return false;
  }
  if (!/^https?:$/.test(x.protocol)) return false;
  if (allowLocal) return true;
  const host = x.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.local') || host.endsWith('.internal') || host.includes(':')) return false;
  const m = host.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (a === 0 || a === 10 || a === 127 || a >= 224 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
  }
  return true;
}

function cleanName(raw) {
  let quality = '';
  let geo = false;
  let partial = false;
  let name = String(raw || '')
    .replace(/\s*\((\d{3,4}[pi])\)/gi, (_, q) => {
      quality = q.toLowerCase();
      return '';
    })
    .replace(/\s*\[([^\]]+)\]/g, (_, t) => {
      if (/geo/i.test(t)) geo = true;
      if (/24\/7/i.test(t)) partial = true;
      return '';
    });
  name = name.replace(/\s+/g, ' ').trim();
  return { name, quality, geo, partial };
}

const qualityRank = (q) => Number(String(q).replace(/\D/g, '')) || 0;

/** Lee un M3U y devuelve una lista plana de señales. */
function parseM3U(text, { allowLocal = false } = {}) {
  const out = [];
  let cur = null;
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF')) {
      const afterAttrs = line.lastIndexOf('"') + 1;
      const comma = line.indexOf(',', afterAttrs);
      cur = { attrs: parseAttrs(line), rawName: comma >= 0 ? line.slice(comma + 1) : '', referrer: '', userAgent: '' };
    } else if (line.startsWith('#EXTVLCOPT:') && cur) {
      const m = line.match(/^#EXTVLCOPT:http-(referrer|referer|user-agent)=(.*)$/i);
      if (m) {
        if (m[1].toLowerCase() === 'user-agent') cur.userAgent = m[2].trim();
        else cur.referrer = m[2].trim();
      }
    } else if (line.startsWith('#')) {
      continue;
    } else if (cur) {
      if (isSafeUrl(line, allowLocal)) {
        const { name, quality, geo, partial } = cleanName(cur.rawName);
        if (name) {
          const feed = (cur.attrs['tvg-id'] || '').split('@')[1] || '';
          out.push({
            tvgId: cur.attrs['tvg-id'] || '',
            name,
            feed: /^(sd|hd|uhd|4k)$/i.test(feed) ? '' : feed,
            logo: /^https:\/\//i.test(cur.attrs['tvg-logo'] || '') ? cur.attrs['tvg-logo'] : '',
            groups: (cur.attrs['group-title'] || '').split(';').map((g) => g.trim()).filter(Boolean),
            quality,
            geo,
            partial,
            url: line,
            referrer: /^https?:\/\//i.test(cur.referrer) ? cur.referrer : '',
            userAgent: cur.userAgent.slice(0, 300),
          });
        }
      }
      cur = null;
    }
  }
  return out;
}

/** Agrupa señales por canal y las ordena por calidad. */
function groupChannels(streams) {
  const map = new Map();
  for (const s of streams) {
    const key = s.tvgId || s.name.toLowerCase();
    let ch = map.get(key);
    if (!ch) {
      ch = { key, name: s.name, feed: s.feed, logo: s.logo, groups: s.groups, streams: [] };
      map.set(key, ch);
    }
    if (!ch.logo && s.logo) ch.logo = s.logo;
    if (ch.streams.some((x) => x.url === s.url)) continue;
    ch.streams.push({ id: sha(s.url), url: s.url, quality: s.quality, geo: s.geo, partial: s.partial, referrer: s.referrer, userAgent: s.userAgent });
  }
  const channels = [...map.values()];
  const dupes = new Map();
  channels.forEach((c) => dupes.set(c.name.toLowerCase(), (dupes.get(c.name.toLowerCase()) || 0) + 1));
  for (const c of channels) {
    c.streams.sort((a, b) => qualityRank(b.quality) - qualityRank(a.quality));
    if (dupes.get(c.name.toLowerCase()) > 1 && c.feed) c.name = `${c.name} (${c.feed})`;
    const cats = c.groups.map((g) => CATEGORY_ES[g.toLowerCase()] || g);
    c.categories = cats.length ? [...new Set(cats)] : [CATEGORY_ES.undefined];
    c.id = `live:${sha(c.key)}`;
  }
  return channels.sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
}

class Iptv {
  constructor({ fetchFn = globalThis.fetch, url = SOURCE, allowLocal = false, disk = null, ttl = TTL } = {}) {
    this.fetchFn = fetchFn;
    this.url = url;
    this.allowLocal = allowLocal;
    this.disk = disk;
    this.ttl = ttl;
    this.loaded = null; // { t, data }
    this.streamById = new Map();
  }

  build(text) {
    const channels = groupChannels(parseM3U(text, { allowLocal: this.allowLocal }));
    if (!channels.length) throw new Error('La lista de canales llegó vacía. Inténtalo de nuevo más tarde.');
    const counts = new Map();
    channels.forEach((c) => c.categories.forEach((k) => counts.set(k, (counts.get(k) || 0) + 1)));
    const categories = [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'es'));
    this.streamById = new Map();
    channels.forEach((c) => c.streams.forEach((s) => this.streamById.set(s.id, s)));
    return { channels, categories, count: channels.length };
  }

  async channels() {
    if (this.loaded && Date.now() - this.loaded.t < this.ttl) return this.view(this.loaded.data, false);
    let text;
    let stale = false;
    try {
      const res = await this.fetchFn(this.url, { headers: { accept: 'text/plain' } });
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { http: true });
      text = await res.text();
      if (this.disk) this.disk.write('iptv-es', text);
    } catch (err) {
      const old = this.disk && this.disk.read('iptv-es');
      if (old && typeof old.v === 'string') {
        text = old.v;
        stale = true;
      } else {
        const e = new Error(err.http ? `La lista de canales respondió con el error ${err.message.replace('HTTP ', '')}.` : 'No se pudo descargar la lista de canales. Comprueba tu conexión.');
        e.code = err.http ? 'HTTP' : 'OFFLINE';
        throw e;
      }
    }
    const data = this.build(text);
    this.loaded = { t: stale ? Date.now() - this.ttl + 60 * 1000 : Date.now(), data };
    return this.view(data, stale);
  }

  /** Lo que ve la interfaz: sin cabeceras internas ni URLs de las señales. */
  view(data, stale) {
    return {
      count: data.count,
      stale,
      categories: data.categories,
      channels: data.channels.map((c) => ({
        id: c.id,
        name: c.name,
        logo: c.logo,
        categories: c.categories,
        streams: c.streams.map((s) => ({ id: s.id, quality: s.quality, geo: s.geo, partial: s.partial })),
      })),
    };
  }

  /** Datos internos de una señal (URL y cabeceras) por su id. */
  stream(id) {
    return this.streamById.get(String(id)) || null;
  }
}

module.exports = { Iptv, parseM3U, groupChannels, isSafeUrl, cleanName, CATEGORY_ES, SOURCE };
