'use strict';
const { app, BrowserWindow, ipcMain, dialog, shell, protocol, safeStorage, Menu, session } = require('electron');
const path = require('path');
const fs = require('fs');

if (process.env.MIFLIX_DATA) app.setPath('userData', process.env.MIFLIX_DATA);

const { Store } = require('./src/store');
const { Tmdb } = require('./src/providers/tmdb');
const { Archive, ROWS: ARCHIVE_ROWS } = require('./src/providers/archive');
const { Iptv } = require('./src/providers/iptv');
const { FreeMovies } = require('./src/providers/freemovies');
const { DiskCache } = require('./src/diskcache');
const local = require('./src/providers/local');
const PLATFORMS = require('./src/platforms');
const { normalizeKey } = require('./src/util');

const MOCK = Boolean(process.env.MIFLIX_MOCK);

protocol.registerSchemesAsPrivileged([
  { scheme: 'media', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
]);

let win = null;
let store;
let tmdb;
let archive;
let iptv;
let freeMovies;
let liveSession = null; // cabeceras de la señal en directo que se está viendo
let pathById = new Map();

// ───────────────────────── Clave de TMDB (cifrada si el sistema lo permite)

function getKey() {
  if (MOCK) return 'mock-key';
  const s = store.get('settings');
  if (s.tmdbKeyEnc) {
    try {
      return safeStorage.decryptString(Buffer.from(s.tmdbKeyEnc, 'base64'));
    } catch {}
  }
  return s.tmdbKey || process.env.TMDB_API_KEY || '';
}

function setKey(key) {
  const s = { ...store.get('settings') };
  delete s.tmdbKey;
  delete s.tmdbKeyEnc;
  const k = String(key || '').trim();
  if (k) {
    if (safeStorage.isEncryptionAvailable()) s.tmdbKeyEnc = safeStorage.encryptString(k).toString('base64');
    else s.tmdbKey = k;
  }
  store.set('settings', s);
  tmdb.cache.clear();
}

function publicSettings() {
  const s = store.get('settings');
  return { region: s.region, language: s.language, providers: s.providers || [], hasKey: Boolean(getKey()), mock: MOCK };
}

// ───────────────────────── Biblioteca

function libraryState() {
  const lib = store.get('library');
  pathById = new Map(lib.items.map((i) => [i.id, i.path]));
  return {
    folders: lib.folders,
    scannedAt: lib.scannedAt,
    count: lib.items.length,
    entries: local.buildEntries(lib.items, store.get('meta')),
  };
}

function send(name, payload) {
  if (win && !win.isDestroyed()) win.webContents.send('miflix:event', name, payload);
}

let enriching = false;
async function enrichInBackground() {
  if (enriching || !getKey()) return;
  enriching = true;
  try {
    const meta = store.get('meta');
    const entries = libraryState().entries;
    const n = await local.enrich(entries, tmdb, meta, { onProgress: () => send('library:updated') });
    if (n > 0) {
      store.set('meta', meta);
      send('library:updated');
    }
  } catch (err) {
    console.error('Enriquecimiento de biblioteca:', err.message);
  } finally {
    enriching = false;
  }
}

async function rescan() {
  const lib = store.get('library');
  const items = await local.scanFolders(lib.folders, { minSize: Number(process.env.MIFLIX_MIN_SIZE ?? 5 * 1024 * 1024) });
  store.set('library', { ...lib, items, scannedAt: Date.now() });
  const state = libraryState();
  enrichInBackground();
  return state;
}

// ───────────────────────── API para la interfaz

const handlers = {
  'app.info': () => ({ version: app.getVersion(), platform: process.platform, ...publicSettings() }),
  'app.platforms': () => PLATFORMS,

  'settings.get': () => publicSettings(),
  'settings.setProviders': (ids) => {
    const clean = (Array.isArray(ids) ? ids : []).map(Number).filter(Number.isFinite).slice(0, 60);
    store.set('settings', { ...store.get('settings'), providers: clean });
    return publicSettings();
  },
  'settings.saveKey': async (key) => {
    const k = String(key || '').trim();
    if (!k) {
      setKey('');
      return publicSettings();
    }
    await tmdb.test(k); // lanza si no es válida
    setKey(k);
    enrichInBackground();
    return publicSettings();
  },

  'tmdb.row': (kind, params) =>
    tmdb.row(kind, kind === 'mine' ? { ...params, providers: store.get('settings').providers } : params),
  'tmdb.details': (type, id) => tmdb.details(type, id),
  'tmdb.season': (id, n) => tmdb.season(id, n),
  'tmdb.providers': () => tmdb.providers(),
  'tmdb.browseFree': (opts) => tmdb.browseFree(opts || {}),
  'tmdb.freeProviders': () => tmdb.freeProviders(),
  'tmdb.genres': (type) => tmdb.genres(type),
  'archive.browse': (opts) => archive.browse(opts || {}),
  'freemovies.browse': (opts) => freeMovies.browse(opts || {}),
  'tmdb.byImdb': (imdbId) => tmdb.byImdb(imdbId),

  'live.channels': () => iptv.channels(),
  // Prepara la reproducción de una señal: devuelve su URL y guarda las cabeceras (Referer, User-Agent) que pide.
  'live.prepare': (streamId) => {
    const st = iptv.stream(streamId);
    if (!st) throw new Error('Esa señal ya no está en la lista. Vuelve a abrir «En directo».');
    const token = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    liveSession = { token, referrer: st.referrer, userAgent: st.userAgent };
    return { url: st.url, token, hls: !/\.(mp4|webm|ogv|m4v)(\?|$)/i.test(st.url) };
  },
  'live.release': (token) => {
    if (liveSession && (!token || liveSession.token === token)) liveSession = null;
    return true;
  },

  'archive.rows': () => ARCHIVE_ROWS.map(({ key, title }) => ({ key, title })),
  'archive.row': (key) => archive.row(key),
  'archive.details': (id) => archive.details(id),
  'archive.subtitle': (url) => archive.subtitle(url),

  'search.all': async (query) => {
    const q = String(query || '').trim();
    if (!q) return { tmdb: [], archive: [], local: [], errors: {} };
    const errors = {};
    const settle = async (name, p) => {
      try {
        return await p;
      } catch (err) {
        errors[name] = err.code || 'ERROR';
        return [];
      }
    };
    const key = normalizeKey(q);
    const [t, a] = await Promise.all([settle('tmdb', tmdb.search(q)), settle('archive', archive.search({ query: q, rows: 18 }))]);
    const l = libraryState().entries.filter((e) => normalizeKey(e.title).includes(key) || normalizeKey(e.localTitle).includes(key));
    return { tmdb: t, archive: a, local: l, errors };
  },

  'library.get': () => libraryState(),
  'library.addFolder': async () => {
    const r = await dialog.showOpenDialog(win, {
      title: 'Elige las carpetas con tus películas y series',
      properties: ['openDirectory', 'multiSelections'],
    });
    if (r.canceled || !r.filePaths.length) return libraryState();
    const lib = store.get('library');
    const folders = [...new Set([...lib.folders, ...r.filePaths])];
    store.set('library', { ...lib, folders });
    return rescan();
  },
  'library.removeFolder': async (folder) => {
    const lib = store.get('library');
    store.set('library', { ...lib, folders: lib.folders.filter((f) => f !== folder) });
    return rescan();
  },
  'library.scan': () => rescan(),
  'library.subtitles': async (fileId) => {
    const p = pathById.get(fileId);
    return p ? local.findSubtitles(p) : [];
  },
  'library.openExternal': async (fileId) => {
    const p = pathById.get(fileId);
    if (!p) throw new Error('No se encuentra el archivo.');
    const err = await shell.openPath(p);
    if (err) throw new Error(err);
    return true;
  },
  'library.reveal': (fileId) => {
    const p = pathById.get(fileId);
    if (p) shell.showItemInFolder(p);
    return Boolean(p);
  },
  'library.exists': (fileId) => {
    const p = pathById.get(fileId);
    return Boolean(p && fs.existsSync(p));
  },

  'user.favorites': () => store.get('favorites'),
  'user.toggleFavorite': (item) => {
    const favs = store.get('favorites');
    const i = favs.findIndex((f) => f.id === item.id);
    if (i >= 0) favs.splice(i, 1);
    else {
      const { id, source, type, title, year, poster, backdrop, overview, rating, tmdbId, archiveId, imdbId } = item;
      favs.unshift({ id, source, type, title, year, poster, backdrop, overview, rating, tmdbId, archiveId, imdbId });
    }
    store.set('favorites', favs);
    return favs;
  },
  'user.progress': () => store.get('progress'),
  'user.progressSet': (entry) => {
    const prog = store.get('progress');
    const finished = entry.duration > 0 && entry.position / entry.duration > 0.95;
    prog[entry.key] = { ...entry, finished, updated: Date.now() };
    const keys = Object.keys(prog);
    if (keys.length > 300) {
      keys
        .sort((a, b) => prog[a].updated - prog[b].updated)
        .slice(0, keys.length - 300)
        .forEach((k) => delete prog[k]);
    }
    store.set('progress', prog);
    return true;
  },
  'user.progressRemove': (key) => {
    const prog = store.get('progress');
    delete prog[key];
    store.set('progress', prog);
    return true;
  },
  'user.clearHistory': () => {
    store.set('progress', {});
    return true;
  },

  'shell.open': (url) => {
    if (!/^https?:\/\//i.test(String(url))) throw new Error('Solo se pueden abrir enlaces http(s).');
    return shell.openExternal(url);
  },
};

ipcMain.handle('miflix:call', async (_e, name, args) => {
  const fn = handlers[name];
  if (!fn) return { ok: false, error: { message: `Operación desconocida: ${name}` } };
  try {
    return { ok: true, data: await fn(...(Array.isArray(args) ? args : [])) };
  } catch (err) {
    return { ok: false, error: { message: err.message || String(err), code: err.code } };
  }
});

// ───────────────────────── Señales en directo
// Los canales piden a veces un Referer o un User-Agent concretos y casi ninguno envía cabeceras CORS.
// Mientras se ve un canal, la ventana principal añade esas cabeceras a sus peticiones de vídeo; el resto del tiempo no se toca nada.

function setupLiveHeaders() {
  const filter = { urls: ['http://*/*', 'https://*/*'] };
  const active = (d) =>
    liveSession && win && !win.isDestroyed() && d.webContentsId === win.webContents.id && ['xhr', 'media', 'other'].includes(d.resourceType);

  session.defaultSession.webRequest.onBeforeSendHeaders(filter, (d, cb) => {
    if (!active(d)) return cb({});
    const headers = { ...d.requestHeaders };
    if (liveSession.referrer) {
      headers.Referer = liveSession.referrer;
      try {
        headers.Origin = new URL(liveSession.referrer).origin;
      } catch {}
    }
    if (liveSession.userAgent) headers['User-Agent'] = liveSession.userAgent;
    cb({ requestHeaders: headers });
  });

  session.defaultSession.webRequest.onHeadersReceived(filter, (d, cb) => {
    if (!active(d)) return cb({});
    const headers = {};
    for (const [k, v] of Object.entries(d.responseHeaders || {})) if (!/^access-control-/i.test(k)) headers[k] = v;
    headers['Access-Control-Allow-Origin'] = ['*'];
    headers['Access-Control-Allow-Headers'] = ['*'];
    headers['Access-Control-Allow-Methods'] = ['GET, HEAD, OPTIONS'];
    cb({ responseHeaders: headers });
  });
}

// ───────────────────────── Ventana

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#170c11',
    title: 'MiFlix',
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });
  win.once('ready-to-show', () => win.show());
  win.webContents.on('will-navigate', (e) => e.preventDefault());
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.env.MIFLIX_DEBUG) win.webContents.openDevTools({ mode: 'detach' });
  win.on('closed', () => (win = null));
}

if (!app.requestSingleInstanceLock() && !process.env.MIFLIX_DATA) app.quit();
app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(async () => {
  if (process.platform !== 'darwin') Menu.setApplicationMenu(null);
  session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) => cb(false));

  store = new Store(path.join(app.getPath('userData'), 'miflix.json'));

  let fetchFn = globalThis.fetch;
  let imageUrl;
  if (MOCK) {
    const mock = require('./test/mock-fetch');
    fetchFn = mock.mockFetch;
    imageUrl = mock.mockImage;
  }
  const settings = () => store.get('settings');
  tmdb = new Tmdb({ getKey, getLang: () => settings().language, getRegion: () => settings().region, fetchFn, imageUrl });
  archive = new Archive({ fetchFn });
  const disk = new DiskCache(path.join(app.getPath('userData'), 'cache'));
  iptv = new Iptv({ fetchFn, disk, allowLocal: MOCK });
  freeMovies = new FreeMovies({ fetchFn, disk });
  setupLiveHeaders();

  protocol.handle('media', (request) => {
    const id = new URL(request.url).pathname.replace(/^\//, '');
    const p = pathById.get(id);
    if (!p || !fs.existsSync(p)) return new Response('Archivo no encontrado', { status: 404 });
    return local.rangeResponse(p, request.headers.get('range'));
  });

  libraryState(); // rellena pathById
  createWindow();
  enrichInBackground();

  if (process.env.MIFLIX_SMOKE) {
    win.webContents.once('did-finish-load', () => {
      require(process.env.MIFLIX_SMOKE)({ app, win, handlers, store, rescan });
    });
  }
});

app.on('before-quit', () => store && store.flush());
app.on('window-all-closed', () => app.quit());
