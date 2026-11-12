'use strict';
const path = require('path');

// Palabras típicas de nombres de release que marcan el final del título real.
const RELEASE_TOKENS =
  /\b(2160p|1080p|1080i|720p|576p|480p|4k|uhd|hdr10?|bluray|blu-ray|bdrip|brrip|bdremux|webrip|web-dl|webdl|hdtv|dvdrip|x264|x265|h264|h265|hevc|xvid|divx|aac|ac3|dts|remux|castellano|latino|vose)\b/i;

function stripExt(name) {
  return name.replace(/\.[^./\\]+$/, '');
}

/** "The.Movie_Name.[1080p]" -> "The Movie Name" */
function prettify(raw) {
  let s = String(raw || '')
    .replace(/[._]+/g, ' ')
    .replace(/\[[^\]]*\]/g, ' ')
    .replace(/\s+/g, ' ');
  const m = RELEASE_TOKENS.exec(s);
  if (m && m.index > 0) s = s.slice(0, m.index);
  return s
    .replace(/[\s(\[\-]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeKey(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

const SEASON_DIR = /^(season|temporada|serie|s)\s*\d+$/i;

function showFromFolders(filePath) {
  let dir = path.dirname(filePath);
  for (let i = 0; i < 3; i++) {
    const name = path.basename(dir);
    if (!name || name === dir) break;
    if (!SEASON_DIR.test(name.replace(/[._]+/g, ' ').trim())) return prettify(name);
    dir = path.dirname(dir);
  }
  return '';
}

/**
 * Interpreta el nombre de un archivo de vídeo.
 * Devuelve { kind:'movie', title, year } o { kind:'episode', show, season, episode, title }.
 */
function parseMediaName(filePath) {
  const base = stripExt(path.basename(filePath));

  let m = /^(.*?)[ ._\-\[(]*\bS(\d{1,2})[ ._-]*E(\d{1,3})\b/i.exec(base);
  if (!m) m = /^(.*?)[ ._\-\[(]*\b(\d{1,2})x(\d{2,3})\b/i.exec(base);
  if (m) {
    const show = prettify(m[1]) || showFromFolders(filePath) || 'Serie sin título';
    return { kind: 'episode', show, title: show, season: +m[2], episode: +m[3] };
  }

  // Película: el último año plausible que no esté al principio del nombre.
  let year = null;
  let cut = base.length;
  const re = /(?<![0-9])((?:19|20)\d{2})(?![0-9])/g;
  let y;
  while ((y = re.exec(base))) {
    if (y.index > 0) {
      year = +y[1];
      cut = y.index;
    }
  }
  let title = prettify(base.slice(0, cut));
  if (!title) title = prettify(base) || showFromFolders(filePath) || base;
  return { kind: 'movie', title, year };
}

/** SubRip -> WebVTT */
function srtToVtt(srt) {
  const t = String(srt).replace(/^﻿/, '').replace(/\r\n?/g, '\n').trim();
  if (t.startsWith('WEBVTT')) return t + '\n';
  return 'WEBVTT\n\n' + t.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2') + '\n';
}

/** Decodifica texto: UTF-8 si es válido, si no Windows-1252 (típico de .srt antiguos). */
function decodeText(buf) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return new TextDecoder('windows-1252').decode(buf);
  }
}

function stripHtml(v) {
  if (Array.isArray(v)) v = v.join(' ');
  return String(v || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

const SUB_LANGS = [
  { re: /^(es|spa|esp|spanish|espanol|español|castellano)$/i, code: 'es', label: 'Español' },
  { re: /^(en|eng|english|ingles|inglés)$/i, code: 'en', label: 'English' },
  { re: /^(ca|cat|catalan|català)$/i, code: 'ca', label: 'Català' },
  { re: /^(va|valencia|valencià)$/i, code: 'ca', label: 'Valencià' },
  { re: /^(fr|fra|fre|french|francais)$/i, code: 'fr', label: 'Français' },
  { re: /^(de|deu|ger|german)$/i, code: 'de', label: 'Deutsch' },
  { re: /^(it|ita|italian)$/i, code: 'it', label: 'Italiano' },
  { re: /^(pt|por|portuguese)$/i, code: 'pt', label: 'Português' },
];

/** Deduce idioma de un subtítulo a partir del texto entre el nombre del vídeo y la extensión. */
function subtitleLang(suffix) {
  const parts = String(suffix || '')
    .split(/[._\- ]+/)
    .filter(Boolean);
  for (const p of parts) {
    const hit = SUB_LANGS.find((l) => l.re.test(p));
    if (hit) return { code: hit.code, label: hit.label };
  }
  return { code: 'und', label: parts.length ? parts.join(' ') : 'Subtítulos' };
}

function formatRuntime(min) {
  if (!min) return '';
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h ? `${h} h ${m ? m + ' min' : ''}`.trim() : `${m} min`;
}

module.exports = {
  prettify,
  normalizeKey,
  parseMediaName,
  srtToVtt,
  decodeText,
  stripHtml,
  subtitleLang,
  formatRuntime,
};
