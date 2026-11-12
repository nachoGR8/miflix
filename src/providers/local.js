'use strict';
/**
 * Biblioteca local: escanea carpetas, agrupa series, busca subtítulos
 * y (opcionalmente) enriquece con carátulas de TMDB.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { parseMediaName, normalizeKey, srtToVtt, decodeText, subtitleLang } = require('../util');

const VIDEO_EXT = new Set(['.mp4', '.m4v', '.mkv', '.webm', '.mov', '.avi', '.ogv', '.wmv', '.mpg', '.mpeg', '.ts']);
const SKIP_DIRS = new Set(['node_modules', '$recycle.bin', 'system volume information', '@eadir', 'lost+found']);
const MIME = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.ogv': 'video/ogg',
  '.avi': 'video/x-msvideo',
  '.mpg': 'video/mpeg',
  '.mpeg': 'video/mpeg',
  '.ts': 'video/mp2t',
  '.wmv': 'video/x-ms-wmv',
};

const fileId = (p) => crypto.createHash('sha1').update(p).digest('hex').slice(0, 16);
const mimeFor = (p) => MIME[path.extname(p).toLowerCase()] || 'application/octet-stream';

async function walk(dir, depth, out, minSize) {
  if (depth > 8) return;
  let entries;
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return; // sin permisos o carpeta desaparecida
  }
  for (const e of entries) {
    if (e.name.startsWith('.')) continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name.toLowerCase())) await walk(full, depth + 1, out, minSize);
    } else if (e.isFile() && VIDEO_EXT.has(path.extname(e.name).toLowerCase())) {
      try {
        const st = await fs.promises.stat(full);
        if (st.size < minSize) continue;
        if (/\bsample\b/i.test(e.name) && st.size < 150 * 1024 * 1024) continue;
        out.push({ full, size: st.size, mtime: st.mtimeMs });
      } catch {}
    }
  }
}

/** Devuelve la lista plana de archivos de vídeo con su interpretación. */
async function scanFolders(folders, { minSize = 5 * 1024 * 1024 } = {}) {
  const found = [];
  for (const f of folders) await walk(f, 0, found, minSize);
  const seen = new Set();
  const items = [];
  for (const f of found) {
    const id = fileId(f.full);
    if (seen.has(id)) continue;
    seen.add(id);
    items.push({ id, path: f.full, file: path.basename(f.full), size: f.size, mtime: f.mtime, ...parseMediaName(f.full) });
  }
  return items;
}

/** Agrupa archivos en entradas del catálogo: una por película y una por serie. */
function buildEntries(items, meta = {}) {
  const entries = [];
  const shows = new Map();

  for (const it of items) {
    if (it.kind === 'movie') {
      const id = `local:movie:${it.id}`;
      entries.push({ id, source: 'local', type: 'movie', title: it.title, year: it.year || null, fileId: it.id, file: it.file });
    } else {
      const key = normalizeKey(it.show);
      let s = shows.get(key);
      if (!s) {
        s = { id: `local:tv:${key.replace(/ /g, '-')}`, source: 'local', type: 'tv', title: it.show, year: null, episodes: [] };
        shows.set(key, s);
      }
      s.episodes.push({ fileId: it.id, season: it.season, episode: it.episode, file: it.file });
    }
  }
  for (const s of shows.values()) {
    s.episodes.sort((a, b) => a.season - b.season || a.episode - b.episode);
    entries.push(s);
  }

  for (const e of entries) {
    const m = meta[e.id];
    e.localTitle = e.title;
    if (m && !m.miss) {
      e.tmdbId = m.tmdbId;
      e.title = m.title || e.title;
      e.year = m.year || e.year;
      e.overview = m.overview || '';
      e.poster = m.poster || null;
      e.backdrop = m.backdrop || null;
      e.rating = m.rating || null;
    }
  }
  return entries.sort((a, b) => a.title.localeCompare(b.title, 'es'));
}

/** Busca subtítulos junto al vídeo: mismo nombre base + .srt/.vtt */
async function findSubtitles(filePath) {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath).replace(/\.[^.]+$/, '');
  let names = [];
  try {
    names = await fs.promises.readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    const ext = path.extname(n).toLowerCase();
    if (ext !== '.srt' && ext !== '.vtt') continue;
    if (!n.toLowerCase().startsWith(base.toLowerCase())) continue;
    const suffix = n.slice(base.length, n.length - ext.length);
    try {
      const buf = await fs.promises.readFile(path.join(dir, n));
      if (buf.length > 3 * 1024 * 1024) continue;
      out.push({ ...subtitleLang(suffix), vtt: srtToVtt(decodeText(buf)) });
    } catch {}
  }
  return out;
}

/**
 * Pide a TMDB una carátula por cada entrada sin metadatos.
 * Los fallos se recuerdan una semana para no repetir consultas.
 */
async function enrich(entries, tmdb, meta, { max = 80, onProgress } = {}) {
  const WEEK = 7 * 24 * 3600 * 1000;
  let done = 0;
  for (const e of entries) {
    if (done >= max) break;
    const m = meta[e.id];
    if (m && (!m.miss || Date.now() - m.at < WEEK)) continue;
    try {
      const hit = await tmdb.match(e.type, e.localTitle || e.title, e.type === 'movie' ? e.year : null);
      meta[e.id] = hit
        ? { tmdbId: hit.tmdbId, title: hit.title, year: hit.year, overview: hit.overview, poster: hit.poster, backdrop: hit.backdrop, rating: hit.rating }
        : { miss: true, at: Date.now() };
    } catch (err) {
      if (err.code === 'NO_KEY' || err.code === 'BAD_KEY' || err.code === 'OFFLINE') break;
      meta[e.id] = { miss: true, at: Date.now() };
    }
    done++;
    if (onProgress && done % 5 === 0) onProgress(done);
  }
  return done;
}

/** Respuesta con soporte de Range para <video> sobre el protocolo media:// */
function rangeResponse(filePath, rangeHeader) {
  const { Readable } = require('stream');
  const size = fs.statSync(filePath).size;
  const headers = { 'Content-Type': mimeFor(filePath), 'Accept-Ranges': 'bytes' };

  let start = 0;
  let end = size - 1;
  let status = 200;
  const m = rangeHeader && /^bytes=(\d*)-(\d*)$/.exec(rangeHeader.trim());
  if (m && (m[1] || m[2])) {
    if (m[1]) {
      start = Number(m[1]);
      if (m[2]) end = Math.min(Number(m[2]), size - 1);
    } else {
      start = Math.max(size - Number(m[2]), 0); // sufijo: últimos N bytes
    }
    if (start > end || start >= size) {
      return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${size}` } });
    }
    status = 206;
    headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
  }
  headers['Content-Length'] = String(end - start + 1);
  const stream = size === 0 ? Readable.from([]) : fs.createReadStream(filePath, { start, end });
  return new Response(Readable.toWeb(stream), { status, headers });
}

module.exports = { scanFolders, buildEntries, findSubtitles, enrich, rangeResponse, fileId, mimeFor, VIDEO_EXT };
