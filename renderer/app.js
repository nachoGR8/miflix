'use strict';
/* MiFlix — interfaz. Sin frameworks: DOM directo con un helper mínimo. */

const api = (name, ...args) => window.miflix.call(name, ...args);
const $ = (sel, el = document) => el.querySelector(sel);

// ───────────────────────── Utilidades de DOM

function h(tag, attrs, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return el;
}

const NS = 'http://www.w3.org/2000/svg';
const ICONS = {
  home: 'M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-4.5v-5.5h-5V21H5a1 1 0 0 1-1-1z',
  film: 'M4 4h16v16H4z M8 4v16 M16 4v16 M4 9h4 M4 15h4 M16 9h4 M16 15h4',
  tv: 'M3 7h18v12H3z M8 3l4 4 4-4',
  free: 'M4 10h16v10H4z M3 7h18v3H3z M12 7v13 M12 7c-2.5 0-4-1-4-2.5S10 2 12 4c2-2 4-.5 4 .5S14.5 7 12 7',
  folder: 'M3 6a1 1 0 0 1 1-1h5l2 2h8a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z',
  list: 'M6 4h12v17l-6-4-6 4z',
  grid: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z',
  settings: 'M4 7h10 M18 7h2 M4 17h2 M10 17h10 M14 5v4 M6 15v4',
  play: 'M7 4.5v15l13-7.5z',
  plus: 'M12 5v14 M5 12h14',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  x: 'M6 6l12 12 M18 6L6 18',
  ext: 'M14 4h6v6 M20 4l-9 9 M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  fs: 'M4 9V4h5 M20 9V4h-5 M4 15v5h5 M20 15v5h-5',
  live: 'M12 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z M8.6 8.6a5.4 5.4 0 0 0 0 6.8 M15.4 8.6a5.4 5.4 0 0 1 0 6.8 M5.8 5.8a9.4 9.4 0 0 0 0 12.4 M18.2 5.8a9.4 9.4 0 0 1 0 12.4',
};
function icon(name) {
  const s = document.createElementNS(NS, 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('class', 'ico' + (name === 'play' ? ' filled' : ''));
  s.setAttribute('aria-hidden', 'true');
  for (const d of ICONS[name].split(' M').map((p, i) => (i ? 'M' + p : p))) {
    const p = document.createElementNS(NS, 'path');
    p.setAttribute('d', d);
    s.append(p);
  }
  return s;
}

function toast(msg, bad = false) {
  const t = h('div', { class: 'toast' + (bad ? ' bad' : '') }, msg);
  $('#toast-root').append(t);
  setTimeout(() => t.remove(), 3600);
}
const fail = (err) => toast(err && err.message ? err.message : 'Algo ha fallado.', true);

const openExternal = (url) => api('shell.open', url).catch(fail);
const justWatch = (q) => `https://www.justwatch.com/es/buscar?q=${encodeURIComponent(q)}`;
const typeLabel = (t) => (t === 'tv' ? 'Serie' : 'Película');
const runtimeLabel = (min) => {
  if (!min) return '';
  const hh = Math.floor(min / 60);
  const mm = Math.round(min % 60);
  return hh ? `${hh} h${mm ? ' ' + mm + ' min' : ''}` : `${mm} min`;
};

// ───────────────────────── Estado

const state = {
  settings: { hasKey: false, providers: [] },
  view: 'home',
  nav: 0,
  favorites: [],
  progress: {},
  library: { entries: [], folders: [], count: 0, scannedAt: 0 },
  query: '',
};
const isCurrent = (token) => token === state.nav;
const isFav = (item) => state.favorites.some((f) => f.id === item.id);

const snapshot = (it) => {
  const { id, source, type, title, year, poster, backdrop, overview, rating, tmdbId, archiveId, imdbId } = it;
  return { id, source, type, title, year, poster, backdrop, overview, rating, tmdbId, archiveId, imdbId };
};

// ───────────────────────── Tarjetas y filas

function posterEl(item) {
  const box = h('div', { class: 'poster' });
  if (item.poster) {
    const img = h('img', { src: item.poster, alt: '', loading: 'lazy', decoding: 'async' });
    // Si la carátula no carga, solo se sustituye la imagen: insignias y barra de progreso se quedan.
    img.addEventListener('error', () => img.replaceWith(h('div', { class: 'poster-fallback' }, item.title)), { once: true });
    box.append(img);
  } else {
    box.append(h('div', { class: 'poster-fallback' }, item.title));
  }
  return box;
}

function badgeEls(item, opts = {}) {
  const out = [];
  if (opts.badge) out.push(h('span', { class: 'badge ' + (opts.badgeClass || '') }, opts.badge));
  else if (item.source === 'archive') out.push(h('span', { class: 'badge free' }, 'Dominio público'));
  else if (item.source === 'local') out.push(h('span', { class: 'badge mine' }, 'En tu biblioteca'));
  return out;
}

function card(item, opts = {}) {
  const poster = posterEl(item);
  poster.append(...badgeEls(item, opts));
  if (opts.progress != null) poster.append(h('div', { class: 'prog' }, h('i', { style: { width: Math.round(opts.progress * 100) + '%' } })));
  if (opts.onRemove) {
    poster.append(
      h('span', {
        class: 'card-x', role: 'button', 'aria-label': 'Quitar de seguir viendo',
        onClick: (e) => { e.stopPropagation(); opts.onRemove(); },
      }, icon('x')),
    );
  }
  return h('button', { class: 'card', onClick: () => (opts.onClick ? opts.onClick(item) : openDetail(item)) },
    poster,
    h('div', { class: 'card-title' }, opts.title || item.title),
    h('div', { class: 'card-meta' }, item.year ? h('span', {}, item.year) : null, h('span', {}, opts.sub || typeLabel(item.type))),
  );
}

const skeletons = (n = 9) => Array.from({ length: n }, () => h('div', { class: 'skel' }, h('i'), h('b')));

const rowObserver = new IntersectionObserver(
  (entries) => {
    for (const e of entries) {
      if (!e.isIntersecting) continue;
      rowObserver.unobserve(e.target);
      if (e.target.__load) e.target.__load();
    }
  },
  { root: $('#main'), rootMargin: '0px 0px 520px 0px' },
);

/** Fila que se carga sola cuando se acerca a la pantalla. */
function lazyRow(parent, { title, sub, load, cardOpts }) {
  const track = h('div', { class: 'row-track' }, skeletons());
  const scroll = (dir) => track.scrollBy({ left: dir * track.clientWidth * 0.85, behavior: 'smooth' });
  const sec = h('section', { class: 'row' },
    h('div', { class: 'row-head' },
      h('h2', {}, title),
      sub ? h('span', { class: 'sub' }, sub) : null,
      h('div', { class: 'row-nav' },
        h('button', { 'aria-label': 'Anterior', onClick: () => scroll(-1) }, icon('back')),
        h('button', { 'aria-label': 'Siguiente', onClick: () => scroll(1) }, icon('next'))),
    ),
    track,
  );
  const run = async () => {
    track.replaceChildren(...skeletons());
    try {
      const items = await load();
      if (!sec.isConnected) return;
      if (!items || !items.length) return sec.remove();
      track.replaceChildren(...items.map((it) => card(it, typeof cardOpts === 'function' ? cardOpts(it) : cardOpts)));
    } catch (err) {
      if (!sec.isConnected) return;
      if (err.code === 'NO_KEY') return sec.remove();
      track.replaceChildren(h('div', { class: 'row-error' }, err.message, h('button', { class: 'btn small', onClick: run }, 'Reintentar')));
    }
  };
  sec.__load = run;
  parent.append(sec);
  rowObserver.observe(sec);
  return sec;
}

function staticRow(parent, title, items, cardOptsFn, sub) {
  if (!items.length) return null;
  const track = h('div', { class: 'row-track' }, items.map((it) => card(it, cardOptsFn ? cardOptsFn(it) : {})));
  const scroll = (dir) => track.scrollBy({ left: dir * track.clientWidth * 0.85, behavior: 'smooth' });
  const sec = h('section', { class: 'row' },
    h('div', { class: 'row-head' }, h('h2', {}, title), sub ? h('span', { class: 'sub' }, sub) : null,
      h('div', { class: 'row-nav' },
        h('button', { 'aria-label': 'Anterior', onClick: () => scroll(-1) }, icon('back')),
        h('button', { 'aria-label': 'Siguiente', onClick: () => scroll(1) }, icon('next')))),
    track);
  parent.append(sec);
  return sec;
}

const tmdbRow = (kind, params) => () => api('tmdb.row', kind, params);

function keyNotice() {
  return h('div', { class: 'notice' },
    h('div', {}, h('strong', {}, 'Conecta el catálogo de TMDB'),
      h('p', {}, 'Con una clave gratuita verás tendencias, fichas completas y en qué plataforma de España está cada título.')),
    h('button', { class: 'btn primary', onClick: () => navigate('settings') }, 'Añadir clave'));
}

function emptyState(title, text, actions = []) {
  return h('div', { class: 'empty' }, h('h2', {}, title), h('p', {}, text), h('div', { class: 'actions' }, actions));
}

function viewHead(title, text) {
  return h('div', { class: 'view-head' }, h('h1', {}, title), text ? h('p', {}, text) : null);
}

/** Cuadrícula con carga progresiva: al acercarte al final (o con el botón) pide la página siguiente. */
function pagedGrid(parent, fetchPage, { cardOpts = {} } = {}) {
  const grid = h('div', { class: 'grid' }, skeletons(12));
  const info = h('p', { class: 'note', style: { marginTop: '22px' } });
  const more = h('button', { class: 'btn', style: { marginTop: '14px' } }, 'Cargar más');
  const sentinel = h('div', { style: { height: '1px' } });
  parent.append(grid, info, more, sentinel);

  let page = 0;
  let total = 0;
  let loading = false;
  let done = false;
  let stopped = false;
  let first = true;
  const seen = new Set();

  const paint = () => {
    info.textContent = seen.size ? `Mostrando ${seen.size.toLocaleString('es-ES')}${total ? ' de ' + total.toLocaleString('es-ES') : ''} títulos` : '';
    more.hidden = done;
  };

  const loadNext = async (depth = 0) => {
    if (loading || done || stopped) return;
    loading = true;
    more.disabled = true;
    more.textContent = 'Cargando…';
    try {
      const r = await fetchPage(page + 1);
      if (stopped) return;
      if (first) { grid.replaceChildren(); first = false; }
      page = r.page || page + 1;
      total = r.total || total;
      const fresh = r.items.filter((it) => !seen.has(it.id) && seen.add(it.id));
      grid.append(...fresh.map((it) => card(it, cardOpts)));
      done = r.items.length === 0 || (r.totalPages ? page >= r.totalPages : seen.size >= total);
      loading = false;
      if (!fresh.length && !done && depth < 5) return loadNext(depth + 1);
    } catch (err) {
      loading = false;
      if (stopped) return;
      if (first) { grid.replaceChildren(); first = false; }
      info.textContent = err.code === 'NO_KEY' ? 'Añade tu clave de TMDB en Ajustes para ver este catálogo.' : err.message;
      more.disabled = false;
      more.textContent = 'Reintentar';
      return;
    }
    more.disabled = false;
    more.textContent = 'Cargar más';
    paint();
    // Si el final de la lista sigue a la vista (pantallas grandes), pide la siguiente página.
    requestAnimationFrame(() => {
      if (!done && !stopped && sentinel.isConnected && sentinel.getBoundingClientRect().top < window.innerHeight + 700) loadNext();
    });
    if (!seen.size) {
      more.hidden = true;
      grid.replaceChildren(emptyState('Nada con estos filtros', 'Prueba con otra plataforma, otro género o quita algún filtro.'));
    }
  };

  more.addEventListener('click', () => loadNext());
  const io = new IntersectionObserver((es) => { if (!first && es.some((e) => e.isIntersecting)) loadNext(); }, { root: $('#main'), rootMargin: '0px 0px 700px 0px' });
  io.observe(sentinel);
  loadNext();
  return () => { stopped = true; io.disconnect(); };
}

// ───────────────────────── Navegación

const NAV = [
  { view: 'home', label: 'Inicio', icon: 'home' },
  { view: 'movies', label: 'Películas', icon: 'film' },
  { view: 'series', label: 'Series', icon: 'tv' },
  { view: 'free', label: 'Gratis', icon: 'free' },
  { view: 'live', label: 'En directo', icon: 'live' },
  { view: 'library', label: 'Mi biblioteca', icon: 'folder' },
  { view: 'list', label: 'Mi lista', icon: 'list' },
  { view: 'platforms', label: 'Plataformas', icon: 'grid' },
];

function buildNav() {
  const mk = (n) => h('button', { class: 'nav-item', 'data-view': n.view, onClick: () => { $('#q').value = ''; state.query = ''; navigate(n.view); } }, icon(n.icon), h('span', {}, n.label));
  $('#nav').replaceChildren(...NAV.map(mk));
  $('#side-foot').replaceChildren(mk({ view: 'settings', label: 'Ajustes', icon: 'settings' }));
}

async function navigate(view, params = {}) {
  closeModal();
  state.view = view;
  const token = ++state.nav;
  document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('on', b.dataset.view === view));
  const content = $('#content');
  content.replaceChildren();
  $('#main').scrollTop = 0;
  try {
    await views[view](content, token, params);
  } catch (err) {
    if (isCurrent(token)) content.replaceChildren(emptyState('No se pudo cargar esta vista', err.message, [h('button', { class: 'btn', onClick: () => navigate(view, params) }, 'Reintentar')]));
  }
}

// ───────────────────────── Vistas

const GENRES_MOVIE = [[28, 'Acción'], [35, 'Comedia'], [18, 'Drama'], [27, 'Terror'], [878, 'Ciencia ficción'], [53, 'Suspense'], [16, 'Animación'], [99, 'Documentales'], [10749, 'Romance']];
const GENRES_TV = [[18, 'Drama'], [35, 'Comedia'], [80, 'Crimen'], [10765, 'Ciencia ficción y fantasía'], [10759, 'Acción y aventura'], [9648, 'Misterio'], [16, 'Animación'], [99, 'Documentales']];

function continueItems() {
  return Object.values(state.progress)
    .filter((p) => !p.finished && p.position > 10)
    .sort((a, b) => b.updated - a.updated)
    .slice(0, 20);
}

function continueRow(parent) {
  const list = continueItems();
  if (!list.length) return;
  const row = staticRow(parent, 'Seguir viendo', list.map((p) => ({ ...p.item, __p: p })), (it) => ({
    progress: it.__p.duration ? it.__p.position / it.__p.duration : 0,
    title: it.__p.title || it.title,
    sub: it.__p.subtitle && it.__p.subtitle !== String(it.year) ? it.__p.subtitle : typeLabel(it.type),
    onClick: () => resumeEntry(it.__p),
    onRemove: async () => {
      await api('user.progressRemove', it.__p.key).catch(fail);
      state.progress = await api('user.progress');
      if (state.view === 'home') navigate('home');
    },
  }));
  return row;
}

function libraryRow(parent) {
  const e = state.library.entries;
  if (e.length) staticRow(parent, 'Tu biblioteca', e.slice(0, 30), null, `${e.length} títulos`);
}

function hero(item, { primary }) {
  const bg = item.backdrop ? h('img', { class: 'hero-bg', src: item.backdrop, alt: '' }) : null;
  return h('section', { class: 'hero' }, bg,
    h('div', { class: 'hero-body' },
      h('h1', {}, item.title),
      h('div', { class: 'meta' }, ...metaBits(item)),
      item.overview ? h('p', {}, item.overview) : null,
      h('div', { class: 'actions' },
        h('button', { class: 'btn primary', onClick: () => openDetail(item) }, icon('grid'), primary),
        favButton(item))));
}

function metaBits(item, extra = []) {
  return [
    item.year ? h('span', {}, item.year) : null,
    h('span', {}, typeLabel(item.type)),
    item.rating ? h('span', { class: 'rating' }, `★ ${item.rating}`) : null,
    ...extra,
  ];
}

function favButton(item) {
  const b = h('button', { class: 'btn' });
  const paint = () => b.replaceChildren(icon(isFav(item) ? 'check' : 'plus'), isFav(item) ? 'En mi lista' : 'Añadir a mi lista');
  paint();
  b.addEventListener('click', async () => {
    try { state.favorites = await api('user.toggleFavorite', snapshot(item)); paint(); if (state.view === 'list') navigate('list'); } catch (err) { fail(err); }
  });
  return b;
}

const views = {
  async home(root, token) {
    const hasKey = state.settings.hasKey;
    if (hasKey) {
      try {
        const trending = await api('tmdb.row', 'trending', { type: 'all' });
        if (!isCurrent(token)) return;
        const pool = trending.filter((t) => t.backdrop).slice(0, 6);
        if (pool.length) root.append(hero(pool[Math.floor(Math.random() * pool.length)], { primary: 'Dónde verla' }));
      } catch (err) {
        if (isCurrent(token)) root.append(h('div', { class: 'view-head' }), emptyState('No se pudo cargar el catálogo', err.message, [h('button', { class: 'btn', onClick: () => navigate('home') }, 'Reintentar')]));
      }
    }
    if (!root.firstChild) {
      root.append(h('section', { class: 'hero welcome' },
        h('div', { class: 'hero-body' },
          h('h1', {}, 'Tu cine, en un solo sitio'),
          h('p', {}, 'Explora lo que hay en España, mira cine libre sin salir de la app y reproduce tus propios archivos.'),
          h('div', { class: 'actions' },
            h('button', { class: 'btn primary', onClick: () => navigate('free') }, icon('play'), 'Ver cine libre'),
            h('button', { class: 'btn', onClick: () => navigate('library') }, icon('folder'), 'Añadir mi biblioteca')))));
      if (!hasKey) root.append(keyNotice());
    }
    continueRow(root);
    libraryRow(root);
    if (hasKey) {
      if (state.settings.providers.length) {
        lazyRow(root, { title: 'En tus plataformas', sub: 'Películas', load: tmdbRow('mine', { type: 'movie' }) });
        lazyRow(root, { title: 'En tus plataformas', sub: 'Series', load: tmdbRow('mine', { type: 'tv' }) });
      }
      lazyRow(root, { title: 'Tendencias esta semana', load: tmdbRow('trending', { type: 'all' }) });
      lazyRow(root, { title: 'Gratis en España', sub: 'Películas con o sin anuncios', load: tmdbRow('free', { type: 'movie' }), cardOpts: { badge: 'Gratis', badgeClass: 'free' } });
      lazyRow(root, { title: 'Cine español', load: tmdbRow('spanish', { type: 'movie' }) });
      lazyRow(root, { title: 'Series españolas', load: tmdbRow('spanish', { type: 'tv' }) });
      lazyRow(root, { title: 'Series populares', load: tmdbRow('popular', { type: 'tv' }) });
    }
    lazyRow(root, { title: 'Cine clásico para ver ahora', sub: 'Dominio público', load: () => api('archive.row', 'feature_films') });
    if (!state.library.entries.length) {
      root.append(h('div', { class: 'notice' }, h('div', {}, h('strong', {}, 'Reproduce tus propios archivos'), h('p', {}, 'Elige las carpetas donde guardas películas y series; MiFlix las ordena y les pone carátula.')),
        h('button', { class: 'btn', onClick: () => navigate('library') }, icon('folder'), 'Elegir carpetas')));
    }
  },

  async movies(root, token) {
    root.append(viewHead('Películas', 'Lo que se ve y se comenta ahora, con disponibilidad en España.'));
    if (!state.settings.hasKey) return root.append(keyNotice());
    lazyRow(root, { title: 'Tendencias', load: tmdbRow('trending', { type: 'movie' }) });
    lazyRow(root, { title: 'En cines', load: tmdbRow('nowPlaying', {}) });
    lazyRow(root, { title: 'Populares', load: tmdbRow('popular', { type: 'movie' }) });
    lazyRow(root, { title: 'Mejor valoradas', load: tmdbRow('topRated', { type: 'movie' }) });
    lazyRow(root, { title: 'Cine español', load: tmdbRow('spanish', { type: 'movie' }) });
    for (const [id, name] of GENRES_MOVIE) lazyRow(root, { title: name, load: tmdbRow('genre', { type: 'movie', genre: id }) });
  },

  async series(root) {
    root.append(viewHead('Series', 'Estrenos, clásicos y producciones españolas.'));
    if (!state.settings.hasKey) return root.append(keyNotice());
    lazyRow(root, { title: 'Tendencias', load: tmdbRow('trending', { type: 'tv' }) });
    lazyRow(root, { title: 'Populares', load: tmdbRow('popular', { type: 'tv' }) });
    lazyRow(root, { title: 'Mejor valoradas', load: tmdbRow('topRated', { type: 'tv' }) });
    lazyRow(root, { title: 'Series españolas', load: tmdbRow('spanish', { type: 'tv' }) });
    for (const [id, name] of GENRES_TV) lazyRow(root, { title: name, load: tmdbRow('genre', { type: 'tv', genre: id }) });
  },

  async free(root, token) {
    root.append(viewHead('Gratis', 'Cine libre que se reproduce aquí mismo y títulos gratuitos en las plataformas de España.'));
    root.append(h('div', { class: 'actions' },
      h('button', { class: 'btn primary', onClick: () => navigate('explore') }, icon('grid'), 'Explorar todo el catálogo gratis'),
      h('button', { class: 'btn', onClick: () => navigate('live') }, icon('live'), 'Canales en directo')));
    const rows = await api('archive.rows');
    if (!isCurrent(token)) return;
    lazyRow(root, { title: 'Libres verificadas', sub: 'Dominio público o licencia abierta, con ficha de IMDb', load: () => api('freemovies.browse', { sort: 'year desc' }).then((r) => r.items.slice(0, 24)), cardOpts: { badge: 'Verificada', badgeClass: 'free' } });
    for (const r of rows) lazyRow(root, { title: r.title, sub: 'Se reproduce en MiFlix', load: () => api('archive.row', r.key) });
    if (state.settings.hasKey) {
      lazyRow(root, { title: 'Películas gratis en plataformas', sub: 'Con anuncios o registro', load: tmdbRow('free', { type: 'movie' }), cardOpts: { badge: 'Gratis', badgeClass: 'free' } });
      lazyRow(root, { title: 'Series gratis en plataformas', sub: 'Con anuncios o registro', load: tmdbRow('free', { type: 'tv' }), cardOpts: { badge: 'Gratis', badgeClass: 'free' } });
    }
    root.append(h('div', { class: 'notice' }, h('div', {}, h('strong', {}, 'RTVE Play, Pluto TV, Platfo y más'), h('p', {}, 'Las plataformas gratuitas de España están reunidas en una sola página.')),
      h('button', { class: 'btn', onClick: () => navigate('platforms') }, 'Ver plataformas')));
  },

  async explore(root, token, params = {}) {
    root.append(viewHead('Todo lo gratis', 'Cada título gratuito en España y todo el cine libre de MiFlix, página a página.'));
    const hasKey = state.settings.hasKey;
    const f = { src: params.src || (hasKey ? 'tmdb' : 'archive'), type: 'movie', provider: '', genre: '', sort: 'popular', coll: 'es', asort: 'downloads desc', q: '', era: '', vsort: 'year desc', vq: '' };
    const srcTabs = h('div', { class: 'seasons' });
    const filters = h('div', { class: 'filters' });
    const results = h('div');
    root.append(srcTabs, filters, results);

    let stop = () => {};
    let drawGen = 0;
    const cache = { providers: null, collections: null, genres: {} };

    const show = () => {
      stop();
      results.replaceChildren();
      if (f.src === 'tmdb') {
        if (!hasKey) return results.append(keyNotice());
        stop = pagedGrid(results, (page) => api('tmdb.browseFree', { type: f.type, page, provider: f.provider, genre: f.genre, sort: f.sort }), { cardOpts: { badge: 'Gratis', badgeClass: 'free' } });
      } else if (f.src === 'verified') {
        stop = pagedGrid(results, (page) => api('freemovies.browse', { query: f.vq, era: f.era, sort: f.vsort, page }), { cardOpts: { badge: 'Verificada', badgeClass: 'free' } });
      } else {
        stop = pagedGrid(results, (page) => api('archive.browse', { key: f.coll, query: f.q, sort: f.asort, page }), {});
      }
    };

    const chips = (options, get, set) => {
      const box = h('div', { class: 'seasons' });
      const paint = () => box.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(get())));
      options.forEach(([v, label]) => box.append(h('button', { 'data-v': String(v), onClick: () => { set(String(v)); paint(); } }, label)));
      paint();
      return box;
    };
    const select = (options, get, set, label) => {
      const el = h('select', { class: 'field compact', 'aria-label': label }, options.map(([v, l]) => h('option', { value: v, selected: String(v) === String(get()) }, l)));
      el.addEventListener('change', () => set(el.value));
      return el;
    };

    const drawFilters = () => {
      const mine = ++drawGen;
      filters.replaceChildren();
      srcTabs.replaceChildren(...[['tmdb', 'En plataformas de España'], ['archive', 'Cine libre en MiFlix'], ['verified', 'Libres verificadas']].map(([v, l]) =>
        h('button', { class: f.src === v ? 'on' : '', onClick: () => { f.src = v; drawFilters(); show(); } }, l)));

      if (f.src === 'tmdb') {
        if (!hasKey) return;
        const provBox = h('div', { class: 'seasons' });
        const row = h('div', { class: 'filter-row' });
        filters.append(
          chips([['movie', 'Películas'], ['tv', 'Series']], () => f.type, (v) => { f.type = v; f.genre = ''; drawFilters(); show(); }),
          provBox, row);
        row.append(select([['popular', 'Más populares'], ['rated', 'Mejor valoradas'], ['recent', 'Más recientes'], ['title', 'De la A a la Z']], () => f.sort, (v) => { f.sort = v; show(); }, 'Ordenar'));

        (async () => {
          try {
            cache.providers = cache.providers || (await api('tmdb.freeProviders'));
            if (mine !== drawGen || !cache.providers.length) return;
            provBox.append(...chips([['', 'Todas las plataformas'], ...cache.providers.map((p) => [p.id, p.name])], () => f.provider, (v) => { f.provider = v; show(); }).childNodes);
            provBox.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === String(f.provider)));
            provBox.addEventListener('click', (e) => {
              const b = e.target.closest('button');
              if (!b) return;
              provBox.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
            });
          } catch {}
          try {
            cache.genres[f.type] = cache.genres[f.type] || (await api('tmdb.genres', f.type));
            if (mine !== drawGen) return;
            row.append(select([['', 'Todos los géneros'], ...cache.genres[f.type].map((g) => [g.id, g.name])], () => f.genre, (v) => { f.genre = v; show(); }, 'Género'));
          } catch {}
        })();
      } else if (f.src === 'verified') {
        const eraBox = chips([['', 'Todas las épocas'], ['mudo', 'Hasta 1929'], ['1930', '1930 a 1949'], ['1950', '1950 a 1969'], ['1970', 'Desde 1970']], () => f.era, (v) => { f.era = v; show(); });
        const row = h('div', { class: 'filter-row' });
        const q = h('input', { class: 'field', placeholder: 'Buscar por título', 'aria-label': 'Buscar por título', value: f.vq });
        q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { f.vq = q.value.trim(); show(); } });
        row.append(select([['year desc', 'Más recientes'], ['year asc', 'Más antiguas'], ['title', 'De la A a la Z']], () => f.vsort, (v) => { f.vsort = v; show(); }, 'Ordenar'), q);
        filters.append(eraBox, row,
          h('p', { class: 'note' }, 'Títulos que la lista abierta public-domain-free-imdb marca como libres, con su ficha de IMDb y copia en Internet Archive. Que una obra sea de dominio público depende de cada país.'));
      } else {
        const collBox = h('div', { class: 'seasons' });
        const row = h('div', { class: 'filter-row' });
        const q = h('input', { class: 'field', placeholder: 'Buscar dentro de esta colección', 'aria-label': 'Buscar en la colección', value: f.q });
        q.addEventListener('keydown', (e) => { if (e.key === 'Enter') { f.q = q.value.trim(); show(); } });
        row.append(
          select([['downloads desc', 'Más vistas'], ['date desc', 'Más recientes'], ['date asc', 'Más antiguas'], ['titleSorter asc', 'De la A a la Z']], () => f.asort, (v) => { f.asort = v; show(); }, 'Ordenar'),
          q);
        filters.append(collBox, row);
        (async () => {
          try {
            cache.collections = cache.collections || (await api('archive.rows'));
            if (mine !== drawGen) return;
            collBox.append(...chips(cache.collections.map((c) => [c.key, c.title]), () => f.coll, (v) => { f.coll = v; show(); }).childNodes);
            collBox.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === f.coll));
            collBox.addEventListener('click', (e) => {
              const b = e.target.closest('button');
              if (b) collBox.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
            });
          } catch {}
        })();
      }
    };

    drawFilters();
    show();
    // Al salir de la vista se detiene la carga progresiva.
    const watcher = new MutationObserver(() => { if (!results.isConnected) { stop(); watcher.disconnect(); } });
    watcher.observe($('#content'), { childList: true });
  },

  async live(root, token) {
    root.append(viewHead('En directo', 'Canales de televisión de España que emiten abiertamente por Internet.'));
    const loading = h('p', { class: 'note' }, 'Cargando canales…');
    root.append(loading);
    const data = await api('live.channels');
    if (!isCurrent(token)) return;
    loading.remove();

    const norm = (t) => String(t).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const f = { cat: '', q: '' };
    const cats = h('div', { class: 'seasons' });
    const q = h('input', { class: 'field', type: 'search', placeholder: 'Buscar un canal', 'aria-label': 'Buscar un canal' });
    const grid = h('div', { class: 'chan-grid' });
    const info = h('p', { class: 'note', style: { marginTop: '18px' } });

    const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    const tile = (ch) => {
      const logo = h('div', { class: 'chan-logo' });
      if (ch.logo) {
        const img = h('img', { src: ch.logo, alt: '', loading: 'lazy', decoding: 'async' });
        img.addEventListener('error', () => logo.replaceChildren(initials(ch.name)), { once: true });
        logo.append(img);
      } else logo.append(initials(ch.name));
      const best = ch.streams[0];
      return h('button', { class: 'chan', 'aria-label': `Ver ${ch.name}`, onClick: () => playChannel(ch) },
        logo,
        h('div', { class: 'chan-name' }, ch.name),
        h('div', { class: 'card-meta' },
          h('span', {}, ch.categories[0]),
          best.quality ? h('span', {}, best.quality) : null,
          ch.streams.every((s) => s.geo) ? h('span', { class: 'geo' }, 'Geolimitado') : null));
    };

    const paint = () => {
      const key = norm(f.q.trim());
      const list = data.channels.filter((c) => (!f.cat || c.categories.includes(f.cat)) && (!key || norm(c.name).includes(key)));
      grid.replaceChildren(...list.map(tile));
      info.textContent = list.length ? `${list.length} ${list.length === 1 ? 'canal' : 'canales'}` : '';
      if (!list.length) grid.replaceChildren(emptyState('Ningún canal coincide', 'Prueba con otra categoría o borra la búsqueda.'));
      cats.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === f.cat));
    };
    cats.append(h('button', { 'data-v': '', onClick: () => { f.cat = ''; paint(); } }, `Todos ${data.count}`),
      ...data.categories.map((c) => h('button', { 'data-v': c.key, onClick: () => { f.cat = c.key; paint(); } }, `${c.key} ${c.count}`)));
    q.addEventListener('input', () => { f.q = q.value; paint(); });

    root.append(h('div', { class: 'filters' }, cats, h('div', { class: 'filter-row' }, q)));
    if (data.stale) root.append(h('p', { class: 'note' }, 'Sin conexión: se muestra la última lista guardada.'));
    root.append(grid, info,
      h('p', { class: 'credit' }, 'Lista comunitaria de iptv-org. Cada canal publica su propia señal; algunas fallan o cambian sin aviso, y MiFlix no aloja nada. Si una señal no responde, prueba con otra del mismo canal.'));
    paint();
  },

  async library(root, token) {
    state.library = await api('library.get');
    if (!isCurrent(token)) return;
    const lib = state.library;
    root.append(viewHead('Mi biblioteca', lib.folders.length ? `${lib.count} archivos de vídeo en ${lib.folders.length} ${lib.folders.length === 1 ? 'carpeta' : 'carpetas'}.` : 'Tus películas y series, con carátula y subtítulos.'));
    const bar = h('div', { class: 'actions' },
      h('button', { class: 'btn primary', onClick: addFolder }, icon('plus'), 'Añadir carpeta'),
      lib.folders.length ? h('button', { class: 'btn', onClick: rescan }, 'Buscar cambios') : null);
    root.append(bar);
    if (!lib.entries.length) {
      root.append(emptyState(lib.folders.length ? 'No he encontrado vídeos' : 'Aún no hay carpetas', lib.folders.length ? 'Las carpetas elegidas no contienen archivos de vídeo de más de 5 MB. Prueba con otra carpeta.' : 'Añade una carpeta con tus películas y series. MiFlix las agrupa por serie y temporada, carga los subtítulos .srt que haya junto al vídeo y busca la carátula en TMDB si has añadido tu clave.'));
      return;
    }
    const movies = lib.entries.filter((e) => e.type === 'movie');
    const shows = lib.entries.filter((e) => e.type === 'tv');
    if (movies.length) root.append(h('h2', { class: 'sec-title' }, `Películas (${movies.length})`), h('div', { class: 'grid' }, movies.map((m) => card(m))));
    if (shows.length) root.append(h('h2', { class: 'sec-title' }, `Series (${shows.length})`), h('div', { class: 'grid' }, shows.map((s) => card(s, { sub: `${s.episodes.length} episodios` }))));
    if (!state.settings.hasKey) root.append(h('p', { class: 'note', style: { marginTop: '28px' } }, 'Añade tu clave de TMDB en Ajustes para que aparezcan carátulas y sinopsis.'));
  },

  async list(root) {
    state.favorites = await api('user.favorites');
    root.append(viewHead('Mi lista', 'Lo que has guardado para ver más tarde.'));
    if (!state.favorites.length) return root.append(emptyState('Tu lista está vacía', 'Abre la ficha de cualquier título y pulsa «Añadir a mi lista».'));
    root.append(h('div', { class: 'grid' }, state.favorites.map((f) => card(f))));
  },

  async platforms(root) {
    const list = await api('app.platforms');
    root.append(viewHead('Plataformas', 'Servicios oficiales de España. La ficha de cada título te dice en cuál está.'));
    const input = h('input', { class: 'field', placeholder: 'Título que quieres encontrar', 'aria-label': 'Título' });
    const go = () => input.value.trim() && openExternal(justWatch(input.value.trim()));
    input.addEventListener('keydown', (e) => e.key === 'Enter' && go());
    root.append(h('div', { class: 'findbar' }, input, h('button', { class: 'btn primary', onClick: go }, 'Buscar en JustWatch')));
    const group = (title, text, items) => [
      h('h2', { class: 'sec-title' }, title), h('p', {}, text),
      h('div', { class: 'plat-grid' }, items.map((p) => h('button', { class: 'plat', onClick: () => openExternal(p.url) }, h('h3', {}, p.name, icon('ext')), h('p', {}, p.about)))),
    ];
    root.append(...group('Gratuitas', 'Sin cuota mensual. Algunas piden registro o muestran anuncios.', list.filter((p) => p.group === 'gratis')));
    root.append(...group('Televisiones públicas autonómicas', 'Contenido a la carta de cada comunidad. Las condiciones de acceso varían de una a otra.', list.filter((p) => p.group === 'autonomica')));
    root.append(...group('De pago', 'Suscripción o alquiler.', list.filter((p) => p.group === 'pago')));
    root.append(h('p', { class: 'note', style: { marginTop: '28px' } }, 'Estos servicios se abren en tu navegador. MiFlix no incluye ni enlaza sitios piratas.'));
  },

  async search(root, token, { q }) {
    root.append(viewHead(`Resultados para «${q}»`));
    const grid = h('div', { class: 'grid' }, skeletons(12));
    root.append(grid);
    const r = await api('search.all', q);
    if (!isCurrent(token)) return;
    grid.remove();
    const section = (title, items, sub) => items.length && root.append(h('h2', { class: 'sec-title' }, title), h('div', { class: 'grid' }, items.map((it) => card(it, sub ? { sub } : {}))));
    section('Tu biblioteca', r.local);
    section('Películas y series', r.tmdb);
    section('Cine libre', r.archive, 'Dominio público');
    if (!state.settings.hasKey) root.append(keyNotice());
    else if (r.errors.tmdb) root.append(h('p', { class: 'note', style: { marginTop: '20px' } }, 'No se pudo consultar TMDB ahora mismo.'));
    if (!r.local.length && !r.tmdb.length && !r.archive.length) root.append(emptyState('Sin resultados', 'Prueba con otro título o con menos palabras.'));
    root.append(h('div', { class: 'notice' }, h('div', {}, h('strong', {}, '¿No aparece?'), h('p', {}, 'Búscalo en todas las plataformas de España a la vez.')),
      h('button', { class: 'btn', onClick: () => openExternal(justWatch(q)) }, icon('ext'), 'Buscar en JustWatch')));
  },

  async settings(root, token) {
    state.settings = await api('settings.get');
    state.library = await api('library.get');
    if (!isCurrent(token)) return;
    root.append(viewHead('Ajustes'));

    // Clave de TMDB
    const key = h('input', { class: 'field', type: 'password', placeholder: state.settings.hasKey ? 'Clave guardada (escribe otra para cambiarla)' : 'Pega aquí tu clave de TMDB', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Clave de TMDB' });
    const status = h('div', { class: 'status' });
    const save = h('button', { class: 'btn primary' }, 'Guardar y probar');
    save.addEventListener('click', async () => {
      save.disabled = true;
      status.className = 'status'; status.textContent = 'Comprobando…';
      try {
        state.settings = await api('settings.saveKey', key.value);
        status.className = 'status ok';
        status.textContent = state.settings.hasKey ? 'Clave válida. El catálogo ya está activo.' : 'Clave eliminada.';
        key.value = '';
        navigate('settings');
      } catch (err) { status.className = 'status bad'; status.textContent = err.message; }
      save.disabled = false;
    });
    root.append(h('section', { class: 'panel' },
      h('h2', {}, 'Catálogo de películas y series'),
      h('p', {}, 'MiFlix usa TMDB para fichas, carátulas y disponibilidad en España. Crea una cuenta gratuita, pide una clave de API y pégala aquí (vale la clave v3 o el token de lectura v4).'),
      h('div', { class: 'findbar' }, key, save),
      status,
      h('div', { class: 'actions', style: { marginTop: '12px' } },
        h('button', { class: 'btn small', onClick: () => openExternal('https://www.themoviedb.org/settings/api') }, icon('ext'), 'Conseguir una clave'),
        state.settings.hasKey ? h('button', { class: 'btn small danger', onClick: async () => { state.settings = await api('settings.saveKey', ''); navigate('settings'); } }, 'Quitar clave') : null)));

    // Plataformas del usuario
    const provPanel = h('section', { class: 'panel' }, h('h2', {}, 'Tus plataformas'), h('p', {}, 'Marca las que tienes contratadas y verás una fila con lo que ofrecen en la portada.'));
    root.append(provPanel);
    if (state.settings.hasKey) {
      const holder = h('div', { class: 'provgrid' }, h('p', { class: 'note' }, 'Cargando plataformas…'));
      provPanel.append(holder);
      api('tmdb.providers').then((list) => {
        if (!isCurrent(token)) return;
        const mine = new Set(state.settings.providers);
        holder.replaceChildren(...list.map((p) => {
          const b = h('button', { class: 'prov' + (mine.has(p.id) ? ' on' : ''), 'aria-pressed': String(mine.has(p.id)) },
            p.logo ? h('img', { src: p.logo, alt: '' }) : null, h('span', {}, p.name), h('span', { class: 'tick' }, icon('check')));
          b.addEventListener('click', async () => {
            mine.has(p.id) ? mine.delete(p.id) : mine.add(p.id);
            b.classList.toggle('on', mine.has(p.id)); b.setAttribute('aria-pressed', String(mine.has(p.id)));
            state.settings = await api('settings.setProviders', [...mine]).catch((e) => { fail(e); return state.settings; });
          });
          return b;
        }));
      }).catch((err) => holder.replaceChildren(h('p', { class: 'status bad' }, err.message)));
    } else provPanel.append(h('p', { class: 'note', style: { marginTop: '10px' } }, 'Disponible cuando añadas la clave de TMDB.'));

    // Biblioteca
    const folders = state.library.folders;
    root.append(h('section', { class: 'panel' },
      h('h2', {}, 'Carpetas de tu biblioteca'),
      h('p', {}, 'MiFlix lee estas carpetas y subcarpetas. No mueve ni modifica tus archivos.'),
      folders.length ? h('div', { class: 'folders' }, folders.map((f) => h('div', { class: 'folder' }, icon('folder'), h('span', { title: f }, f),
        h('button', { class: 'btn small', onClick: async () => { await api('library.removeFolder', f).catch(fail); navigate('settings'); } }, 'Quitar')))) : null,
      h('div', { class: 'actions', style: { marginTop: '14px' } }, h('button', { class: 'btn small', onClick: async () => { await addFolder(true); navigate('settings'); } }, icon('plus'), 'Añadir carpeta'))));

    // Datos y créditos
    root.append(h('section', { class: 'panel' },
      h('h2', {}, 'Datos y créditos'),
      h('p', {}, 'Tu lista, tu historial y tu clave se guardan solo en este equipo.'),
      h('div', { class: 'actions', style: { marginTop: '12px' } }, h('button', { class: 'btn small danger', onClick: async () => { await api('user.clearHistory').catch(fail); state.progress = {}; toast('Historial borrado'); } }, 'Borrar historial de reproducción')),
      h('p', { class: 'credit' }, 'Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB. Datos de disponibilidad: JustWatch. Cine libre: Internet Archive.'),
      h('p', { class: 'credit' }, `MiFlix ${state.settings.version || ''}`)));
  },
};

// ───────────────────────── Biblioteca: acciones

async function addFolder(silent) {
  try {
    const before = state.library.folders.length;
    state.library = await api('library.addFolder');
    if (!silent) navigate('library');
    if (state.library.folders.length > before) toast('Carpeta añadida');
  } catch (err) { fail(err); }
}
async function rescan() {
  toast('Buscando cambios…');
  try { state.library = await api('library.scan'); navigate('library'); } catch (err) { fail(err); }
}

// ───────────────────────── Ficha de título

const modalRoot = $('#modal-root');
let modal = null;

function closeModal() {
  if (!modal) return;
  modal.overlay.remove();
  modal = null;
}

function openModal() {
  if (modal) return modal;
  const body = h('div', { class: 'modal' });
  const overlay = h('div', { class: 'overlay', role: 'dialog', 'aria-modal': 'true', onClick: (e) => e.target === overlay && closeModal() }, body);
  modalRoot.append(overlay);
  modal = { overlay, body };
  return modal;
}

function closeBtn() {
  return h('button', { class: 'icon-btn modal-close', 'aria-label': 'Cerrar', onClick: closeModal }, icon('x'));
}

function head(item, extraMeta = [], sub) {
  return h('div', { class: 'm-head' },
    item.backdrop ? h('img', { class: 'bg', src: item.backdrop, alt: '' }) : null,
    h('div', { class: 'in' },
      h('h2', {}, item.title),
      sub ? h('div', { class: 'orig' }, sub) : null,
      h('div', { class: 'meta' }, ...metaBits(item, extraMeta))));
}

function findLocal(item) {
  if (item.source === 'local') return item;
  return state.library.entries.find((e) => e.tmdbId && e.tmdbId === item.tmdbId && e.type === item.type) || null;
}

async function openDetail(item) {
  const m = openModal();
  m.body.replaceChildren(closeBtn(), head(item), h('div', { class: 'm-body' }, h('div', { class: 'row-track', style: { margin: '24px 0 0', padding: 0 } }, skeletons(4))));
  m.overlay.scrollTop = 0;
  const mine = m;
  try {
    if (item.source === 'tmdb') await detailTmdb(item, mine);
    else if (item.source === 'archive') await detailArchive(item, mine);
    else await detailLocal(item, mine);
  } catch (err) {
    if (modal !== mine) return;
    mine.body.replaceChildren(closeBtn(), head(item), h('div', { class: 'm-body' }, h('p', { class: 'lead', style: { marginTop: '20px' } }, err.message)));
  }
}

function providerGroup(cls, title, list, link) {
  if (!list || !list.length) return null;
  return h('div', { class: 'prov-group ' + cls }, h('h4', {}, title),
    h('div', { class: 'chips' }, list.map((p) => h('button', { class: 'chip', title: `Abrir en JustWatch`, onClick: () => openExternal(link || justWatch(p.name)) },
      p.logo ? h('img', { src: p.logo, alt: '' }) : null, p.name))));
}

async function detailTmdb(base, mine) {
  const d = await api('tmdb.details', base.type, base.tmdbId);
  if (modal !== mine) return;
  const localEntry = findLocal(d);

  const actions = h('div', { class: 'actions' });
  if (localEntry && d.type === 'movie') actions.append(h('button', { class: 'btn primary', onClick: () => playLocal(localEntry, localEntry.fileId) }, icon('play'), 'Reproducir desde tu biblioteca'));
  if (d.trailer) actions.append(h('button', { class: 'btn', onClick: () => openExternal(d.trailer.url) }, icon('ext'), 'Ver tráiler'));
  actions.append(favButton(d));

  const p = d.providers;
  const total = p ? p.free.length + p.flatrate.length + p.rent.length + p.buy.length : 0;
  const where = h('section', { class: 'm-section' }, h('h3', {}, 'Dónde verla en España'));
  if (total) {
    where.append(...[
      providerGroup('free', 'Gratis', p.free, p.link),
      providerGroup('', 'Incluida en suscripción', p.flatrate, p.link),
      providerGroup('', 'Alquiler', p.rent, p.link),
      providerGroup('', 'Compra', p.buy, p.link),
      h('p', { class: 'credit' }, 'Disponibilidad facilitada por JustWatch. Al pulsar se abre su página con los enlaces directos.'),
    ].filter(Boolean));
  } else {
    where.append(h('p', { class: 'lead' }, 'Todavía no hay datos de disponibilidad en España para este título.'),
      h('div', { class: 'actions', style: { marginTop: '12px' } }, h('button', { class: 'btn small', onClick: () => openExternal(justWatch(d.title)) }, icon('ext'), 'Buscar en JustWatch')));
  }

  const body = h('div', { class: 'm-body' },
    actions,
    d.tagline ? h('p', { class: 'tagline' }, d.tagline) : null,
    d.overview ? h('p', { class: 'lead' }, d.overview) : h('p', { class: 'lead' }, 'Sin sinopsis en español.'),
    d.genres.length ? h('div', { class: 'chips', style: { marginTop: '16px' } }, d.genres.map((g) => h('span', { class: 'chip text' }, g))) : null,
    where);

  if (d.type === 'tv' && d.seasons.length) body.append(seasonsSection(d, localEntry));
  if (d.directors.length) body.append(h('section', { class: 'm-section' }, h('h3', {}, d.type === 'tv' ? 'Creada por' : 'Dirección'), h('div', { class: 'chips' }, d.directors.map((n) => h('span', { class: 'chip text' }, n)))));
  if (d.cast.length) body.append(h('section', { class: 'm-section' }, h('h3', {}, 'Reparto'), h('div', { class: 'cast' }, d.cast.map((c) => h('div', {}, c.name, c.character ? h('span', {}, c.character) : null)))));
  if (d.similar.length) {
    const track = h('div', { class: 'row-track', style: { margin: '0 -36px', padding: '4px 36px 10px' } }, d.similar.map((s) => card(s)));
    body.append(h('section', { class: 'm-section' }, h('h3', {}, 'Si te ha gustado'), track));
  }

  const extra = [d.runtime ? h('span', {}, runtimeLabel(d.runtime)) : null, d.type === 'tv' && d.seasons.length ? h('span', {}, `${d.seasons.length} ${d.seasons.length === 1 ? 'temporada' : 'temporadas'}`) : null];
  mine.body.replaceChildren(closeBtn(), head(d, extra, d.original && d.original !== d.title ? d.original : ''), body);
}

function seasonsSection(d, localEntry) {
  const list = h('div', { class: 'eps' });
  const tabs = h('div', { class: 'seasons' });
  const sec = h('section', { class: 'm-section' }, h('h3', {}, 'Episodios'), tabs, list);
  const load = async (n) => {
    tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === n));
    list.replaceChildren(h('p', { class: 'note' }, 'Cargando episodios…'));
    try {
      const eps = await api('tmdb.season', d.tmdbId, n);
      if (!list.isConnected) return;
      list.replaceChildren(...eps.map((e) => {
        const file = localEntry && localEntry.episodes && localEntry.episodes.find((x) => x.season === n && x.episode === e.number);
        return h('div', { class: 'ep' + (e.still ? '' : ' noimg') },
          h('div', { class: 'n' }, e.number),
          e.still ? h('img', { src: e.still, alt: '', loading: 'lazy' }) : null,
          h('div', {}, h('h4', {}, e.name, e.runtime ? h('small', {}, `${e.runtime} min`) : null), e.overview ? h('p', {}, e.overview) : null),
          file ? h('button', { class: 'btn small primary', onClick: () => playLocal(localEntry, file.fileId) }, icon('play'), 'Ver') : h('span'));
      }));
    } catch (err) { list.replaceChildren(h('p', { class: 'note' }, err.message)); }
  };
  for (const s of d.seasons) tabs.append(h('button', { 'data-n': s.number, onClick: () => load(s.number) }, s.name && !/^Temporada \d+$/i.test(s.name) ? s.name : `Temporada ${s.number}`));
  const hasLocal = localEntry && localEntry.episodes && localEntry.episodes[0];
  load(hasLocal ? localEntry.episodes[0].season : d.seasons[0].number);
  return sec;
}

async function detailArchive(base, mine) {
  const [ia, extra] = await Promise.all([
    api('archive.details', base.archiveId),
    base.imdbId && state.settings.hasKey ? api('tmdb.byImdb', base.imdbId).catch(() => null) : null,
  ]);
  const d = extra ? { ...ia, imdbId: base.imdbId, title: extra.title || ia.title, overview: extra.overview || ia.overview, poster: extra.poster || ia.poster, backdrop: extra.backdrop || ia.backdrop, rating: extra.rating ?? ia.rating } : ia;
  if (modal !== mine) return;
  const actions = h('div', { class: 'actions' });
  if (d.sources.length) {
    actions.append(h('button', { class: 'btn primary', onClick: () => playArchive(d, d.sources[0]) }, icon('play'), d.sources.length > 1 ? 'Reproducir parte 1' : 'Reproducir'));
    d.sources.slice(1).forEach((s, i) => actions.append(h('button', { class: 'btn', onClick: () => playArchive(d, s) }, icon('play'), `Parte ${i + 2}`)));
  } else {
    actions.append(h('span', { class: 'status bad' }, 'Este título no tiene un archivo que se pueda reproducir aquí.'));
  }
  actions.append(favButton(d), h('button', { class: 'btn', onClick: () => openExternal(`https://archive.org/details/${encodeURIComponent(d.archiveId)}`) }, icon('ext'), 'Ver en Internet Archive'));
  mine.body.replaceChildren(closeBtn(), head(d, [h('span', { class: 'tag' }, 'Dominio público o licencia abierta')]),
    h('div', { class: 'm-body' }, actions,
      d.overview ? h('p', { class: 'lead' }, d.overview) : null,
      d.creator ? h('section', { class: 'm-section' }, h('h3', {}, 'Autoría'), h('div', { class: 'chips' }, h('span', { class: 'chip text' }, d.creator))) : null,
      h('p', { class: 'credit' }, 'Fuente: Internet Archive. Comprueba la licencia del título en su página si vas a reutilizarlo.')));
}

async function detailLocal(entry, mine) {
  const actions = h('div', { class: 'actions' });
  if (entry.type === 'movie') {
    actions.append(h('button', { class: 'btn primary', onClick: () => playLocal(entry, entry.fileId) }, icon('play'), 'Reproducir'),
      h('button', { class: 'btn', onClick: () => api('library.reveal', entry.fileId).catch(fail) }, icon('folder'), 'Mostrar en la carpeta'));
  }
  if (entry.tmdbId) actions.append(h('button', { class: 'btn', onClick: () => openDetail({ id: `tmdb:${entry.type}:${entry.tmdbId}`, source: 'tmdb', type: entry.type, tmdbId: entry.tmdbId, title: entry.title, year: entry.year, backdrop: entry.backdrop, poster: entry.poster, overview: entry.overview, rating: entry.rating }) }, 'Ficha completa y dónde verla'));
  const body = h('div', { class: 'm-body' }, actions, entry.overview ? h('p', { class: 'lead' }, entry.overview) : h('p', { class: 'lead' }, entry.type === 'movie' ? entry.file : 'Serie de tu biblioteca.'));
  if (entry.type === 'tv') {
    const seasons = [...new Set(entry.episodes.map((e) => e.season))];
    const list = h('div', { class: 'eps' });
    const tabs = h('div', { class: 'seasons' });
    const show = (n) => {
      tabs.querySelectorAll('button').forEach((b) => b.classList.toggle('on', Number(b.dataset.n) === n));
      list.replaceChildren(...entry.episodes.filter((e) => e.season === n).map((e) => h('div', { class: 'ep noimg' }, h('div', { class: 'n' }, e.episode), h('div', {}, h('h4', {}, `Episodio ${e.episode}`, h('small', {}, e.file))), h('button', { class: 'btn small primary', onClick: () => playLocal(entry, e.fileId) }, icon('play'), 'Ver'))));
    };
    seasons.forEach((n) => tabs.append(h('button', { 'data-n': n, onClick: () => show(n) }, `Temporada ${n}`)));
    body.append(h('section', { class: 'm-section' }, h('h3', {}, 'Episodios'), tabs, list));
    show(seasons[0]);
  }
  mine.body.replaceChildren(closeBtn(), head(entry, entry.type === 'tv' ? [h('span', {}, `${entry.episodes.length} episodios`)] : []), body);
}

// ───────────────────────── Reproductor

let player = null;

function closePlayer() {
  if (!player) return;
  player.save(true);
  player.cleanup();
  player = null;
}

async function playLocal(entry, fileId, startOverride) {
  const ep = entry.type === 'tv' ? entry.episodes.find((e) => e.fileId === fileId) : null;
  const key = `local:${fileId}`;
  const prev = state.progress[key];
  const subs = await api('library.subtitles', fileId).catch(() => []);
  const idx = ep ? entry.episodes.indexOf(ep) : -1;
  const nextEp = idx >= 0 ? entry.episodes[idx + 1] : null;
  openPlayer({
    item: entry, key,
    media: { kind: 'local', fileId },
    title: entry.title,
    subtitle: ep ? `Temporada ${ep.season}, episodio ${ep.episode}` : entry.year ? String(entry.year) : '',
    src: `media://file/${fileId}`,
    startAt: startOverride ?? (prev && !prev.finished ? prev.position : 0),
    subs,
    next: nextEp ? () => playLocal(entry, nextEp.fileId, 0) : null,
    nextLabel: nextEp ? `Episodio ${nextEp.episode}` : '',
    fallback: { label: 'Abrir con el reproductor del sistema', run: () => api('library.openExternal', fileId).catch(fail) },
  });
}

async function playArchive(d, source) {
  const key = `archive:${d.archiveId}:${source.name}`;
  const prev = state.progress[key];
  let subs = [];
  try {
    subs = (await Promise.all((d.subtitles || []).slice(0, 4).map(async (s) => ({ code: s.code, label: s.label, vtt: await api('archive.subtitle', s.url) })))).filter((s) => s.vtt);
  } catch {}
  openPlayer({
    item: d, key,
    media: { kind: 'archive', archiveId: d.archiveId, url: source.url, name: source.name },
    title: d.title, subtitle: d.year ? String(d.year) : '',
    src: source.url,
    startAt: prev && !prev.finished ? prev.position : 0,
    subs,
    fallback: { label: 'Abrir en Internet Archive', run: () => openExternal(`https://archive.org/details/${encodeURIComponent(d.archiveId)}`) },
  });
}

async function playChannel(ch, idx = 0, tries = 0) {
  const st = ch.streams[idx];
  let src;
  try {
    src = await api('live.prepare', st.id);
  } catch (err) {
    return fail(err);
  }
  const total = ch.streams.length;
  openPlayer({
    item: { id: ch.id, title: ch.name }, key: `live:${st.id}`, media: { kind: 'live' },
    title: ch.name, subtitle: ['En directo', st.quality].filter(Boolean).join(', '),
    src: src.url, hls: src.hls, startAt: 0, subs: [],
    live: {
      token: src.token, total, tries,
      next: () => playChannel(ch, (idx + 1) % total, tries + 1),
      again: () => playChannel(ch, total > 1 ? (idx + 1) % total : idx, 0),
      againLabel: total > 1 ? 'Probar otra señal' : 'Reintentar',
    },
  });
}

async function resumeEntry(p) {
  const item = p.item;
  if (p.media.kind === 'local') {
    const ok = await api('library.exists', p.media.fileId).catch(() => false);
    if (!ok) return toast('No se encuentra el archivo. ¿Está conectada la unidad?', true);
    const entry = state.library.entries.find((e) => e.id === item.id) || item;
    if (entry.type === 'tv' && !entry.episodes) return toast('Vuelve a escanear tu biblioteca para reanudar esta serie.', true);
    return playLocal(entry, p.media.fileId, p.position);
  }
  const d = { ...item, archiveId: p.media.archiveId, subtitles: [] };
  openPlayer({
    item: d, key: p.key, media: p.media, title: p.title || item.title, subtitle: p.subtitle || '',
    src: p.media.url, startAt: p.position, subs: [],
    fallback: { label: 'Abrir en Internet Archive', run: () => openExternal(`https://archive.org/details/${encodeURIComponent(p.media.archiveId)}`) },
  });
}

function openPlayer(o) {
  closePlayer();
  const blobs = [];
  const video = h('video', { controls: true, autoplay: true, preload: 'auto', 'aria-label': o.title });
  const defIdx = Math.max(0, o.subs.findIndex((s) => s.code === 'es'));
  o.subs.forEach((s, i) => {
    const url = URL.createObjectURL(new Blob([s.vtt], { type: 'text/vtt' }));
    blobs.push(url);
    video.append(h('track', { kind: 'subtitles', src: url, srclang: s.code === 'und' ? 'es' : s.code, label: s.label, default: i === defIdx && s.code === 'es' }));
  });

  const root = h('div', { class: 'player', tabindex: '-1' });
  const bar = h('div', { class: 'player-bar' },
    h('button', { class: 'icon-btn', 'aria-label': 'Salir del reproductor', onClick: closePlayer }, icon('back')),
    h('div', { class: 'player-title' }, h('strong', {}, o.title), o.subtitle ? h('span', {}, o.subtitle) : null),
    h('button', { class: 'icon-btn', style: { marginLeft: 'auto' }, 'aria-label': 'Pantalla completa', onClick: toggleFs }, icon('fs')));
  root.append(video, bar);
  $('#player-root').append(root);

  function toggleFs() { document.fullscreenElement ? document.exitFullscreen() : root.requestFullscreen().catch(() => {}); }

  let lastSave = 0;
  const save = (force) => {
    if (o.live) return;
    const dur = video.duration;
    if (!isFinite(dur) || dur <= 0) return;
    const pos = video.currentTime;
    if (!force && Date.now() - lastSave < 5000) return;
    if (pos < 5 && !force) return;
    lastSave = Date.now();
    const entry = { key: o.key, item: snapshot(o.item), media: o.media, title: o.title, subtitle: o.subtitle, position: pos, duration: dur };
    if (o.item.episodes || o.item.fileId) entry.item = { ...snapshot(o.item), episodes: o.item.episodes, fileId: o.item.fileId, file: o.item.file, localTitle: o.item.localTitle };
    api('user.progressSet', entry).then(() => { state.progress[o.key] = { ...entry, finished: pos / dur > 0.95, updated: Date.now() }; }).catch(() => {});
  };

  video.addEventListener('loadedmetadata', () => { if (o.startAt > 15 && o.startAt < video.duration * 0.95) video.currentTime = o.startAt; });
  video.addEventListener('timeupdate', () => save(false));
  video.addEventListener('pause', () => save(true));

  video.addEventListener('ended', () => {
    save(true);
    if (!o.next) return closePlayer();
    let n = 6;
    const box = h('div', { class: 'next-up' }, h('div', {}, h('strong', {}, 'A continuación'), h('div', { class: 'note' }, o.nextLabel)));
    const label = h('button', { class: 'btn primary small' });
    const stop = h('button', { class: 'btn small', onClick: () => { clearInterval(t); closePlayer(); } }, 'Salir');
    const go = () => { clearInterval(t); o.next(); };
    label.addEventListener('click', go);
    const paint = () => label.replaceChildren(icon('play'), `Reproducir ahora (${n})`);
    paint();
    box.append(h('div', { class: 'actions' }, label, stop));
    root.append(box);
    const t = setInterval(() => { n -= 1; if (n <= 0) go(); else paint(); }, 1000);
    root.__t = t;
  });

  function showError(msg) {
    const prev = root.querySelector('.player-msg');
    if (prev) prev.remove();
    root.append(h('div', { class: 'player-msg' }, h('div', {}, h('h2', {}, 'No se puede reproducir'), h('p', {}, msg),
      h('div', { class: 'actions' },
        o.live ? h('button', { class: 'btn primary', onClick: o.live.again }, o.live.againLabel) : null,
        !o.live && o.fallback ? h('button', { class: 'btn primary', onClick: () => { o.fallback.run(); } }, icon('ext'), o.fallback.label) : null,
        h('button', { class: 'btn', onClick: closePlayer }, 'Volver')))));
  }

  // En directo: si una señal no responde se prueba la siguiente del mismo canal.
  let liveDead = false;
  let watchdog = null;
  let hls = null;
  function liveFail() {
    if (liveDead) return;
    liveDead = true;
    clearTimeout(watchdog);
    if (o.live.tries + 1 < o.live.total) {
      toast('Esa señal no responde. Probando otra…', true);
      return o.live.next();
    }
    showError('Ninguna señal de este canal responde ahora mismo. Puede estar fuera de emisión o limitada por zona.');
  }

  video.addEventListener('error', () => {
    if (o.live) return liveFail();
    const msg = video.error && video.error.code === 4
      ? 'Este formato o códec no se puede reproducir dentro de la app.'
      : 'No se pudo cargar el vídeo. Comprueba la conexión o que el archivo siga en su sitio.';
    showError(msg);
  });

  // Barra superior: se oculta tras unos segundos sin mover el ratón.
  let idle;
  const wake = () => { root.classList.remove('idle'); clearTimeout(idle); idle = setTimeout(() => !video.paused && root.classList.add('idle'), 2800); };
  root.addEventListener('mousemove', wake);
  wake();

  const onKey = (e) => {
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    const k = e.key;
    if (k === ' ' || k === 'k') { e.preventDefault(); video.paused ? video.play() : video.pause(); }
    else if (k === 'ArrowRight') { e.preventDefault(); video.currentTime += 10; }
    else if (k === 'ArrowLeft') { e.preventDefault(); video.currentTime -= 10; }
    else if (k === 'ArrowUp') { e.preventDefault(); video.volume = Math.min(1, video.volume + 0.1); }
    else if (k === 'ArrowDown') { e.preventDefault(); video.volume = Math.max(0, video.volume - 0.1); }
    else if (k === 'm') video.muted = !video.muted;
    else if (k === 'f') toggleFs();
    else if (k === 'Escape' && !document.fullscreenElement) closePlayer();
    wake();
  };
  document.addEventListener('keydown', onKey);

  if (o.live) {
    if (o.hls && window.Hls && window.Hls.isSupported()) {
      let recovered = false;
      hls = new window.Hls({ lowLatencyMode: false, maxBufferLength: 30, manifestLoadingMaxRetry: 1, levelLoadingMaxRetry: 2, fragLoadingMaxRetry: 3 });
      hls.on(window.Hls.Events.ERROR, (_e, data) => {
        if (!data.fatal) return;
        if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && !recovered) { recovered = true; hls.recoverMediaError(); return; }
        liveFail();
      });
      hls.on(window.Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      hls.loadSource(o.src);
      hls.attachMedia(video);
    } else {
      video.src = o.src;
    }
    watchdog = setTimeout(() => { if (video.readyState < 2) liveFail(); }, 25000);
    video.addEventListener('playing', () => clearTimeout(watchdog), { once: true });
  } else {
    video.src = o.src;
  }
  root.focus();
  player = {
    video, save,
    cleanup() {
      document.removeEventListener('keydown', onKey);
      clearTimeout(idle); clearInterval(root.__t); clearTimeout(watchdog);
      if (hls) { hls.destroy(); hls = null; }
      if (o.live) api('live.release', o.live.token).catch(() => {});
      video.pause(); video.removeAttribute('src'); video.load();
      blobs.forEach((u) => URL.revokeObjectURL(u));
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      root.remove();
      // refresca "Seguir viendo" si estamos en la portada
      if (state.view === 'home') navigate('home');
    },
  };
}

// ───────────────────────── Búsqueda y arranque

let searchTimer;
$('#q').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const q = e.target.value.trim();
  searchTimer = setTimeout(() => {
    state.query = q;
    if (q.length >= 2) navigate('search', { q });
    else if (!q && state.view === 'search') navigate('home');
  }, 350);
});
document.addEventListener('keydown', (e) => {
  if ((e.key === '/' && !/^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
    e.preventDefault();
    $('#q').focus();
  } else if (e.key === 'Escape' && modal && !player) closeModal();
});

window.miflix.on('library:updated', async () => {
  try {
    state.library = await api('library.get');
    if (state.view === 'library' && !modal && !player) navigate('library');
  } catch {}
});

(async function init() {
  buildNav();
  try {
    const [info, favs, prog, lib] = await Promise.all([api('app.info'), api('user.favorites'), api('user.progress'), api('library.get')]);
    state.settings = info; state.favorites = favs; state.progress = prog; state.library = lib;
    $('#region').textContent = info.region === 'ES' ? 'Disponibilidad en España' : `Región ${info.region}`;
  } catch (err) { fail(err); }
  navigate('home');
})();

window.__miflix = { state, navigate, openDetail, playLocal, closePlayer, get player() { return player; } }; // utilidades para pruebas
