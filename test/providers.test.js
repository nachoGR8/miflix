'use strict';
// Pruebas de la lógica sin red: node test/providers.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { parseMediaName, srtToVtt, decodeText, subtitleLang, prettify } = require('../src/util');
const { Tmdb } = require('../src/providers/tmdb');
const { Archive } = require('../src/providers/archive');
const { Iptv, parseM3U, groupChannels, isSafeUrl, cleanName } = require('../src/providers/iptv');
const { FreeMovies, parseDataset } = require('../src/providers/freemovies');
const { DiskCache } = require('../src/diskcache');
const local = require('../src/providers/local');
const { mockFetch, mockImage } = require('./mock-fetch');

let pass = 0;
const t = async (name, fn) => {
  try {
    await fn();
    pass++;
    console.log('OK  ', name);
  } catch (e) {
    console.log('FAIL', name, '\n    ', e.message);
    process.exitCode = 1;
  }
};

(async () => {
  // ───── Nombres de archivo
  await t('parsea película con año y etiquetas de release', () => {
    const r = parseMediaName('/x/Blade.Runner.2049.2017.2160p.UHD.BluRay.x265.mkv');
    assert.deepStrictEqual([r.kind, r.title, r.year], ['movie', 'Blade Runner 2049', 2017]);
  });
  await t('título que empieza por año', () => {
    const r = parseMediaName('/x/2001 A Space Odyssey (1968).mp4');
    assert.deepStrictEqual([r.title, r.year], ['2001 A Space Odyssey', 1968]);
  });
  await t('película sin año', () => assert.strictEqual(parseMediaName('/x/El_Orfanato.avi').title, 'El Orfanato'));
  await t('episodio SxxExx', () => {
    const r = parseMediaName('/x/La.Casa.de.Papel.S02E05.1080p.WEB-DL.mkv');
    assert.deepStrictEqual([r.kind, r.show, r.season, r.episode], ['episode', 'La Casa de Papel', 2, 5]);
  });
  await t('episodio 1x02', () => {
    const r = parseMediaName('/x/Cuentame - 3x12 - Titulo.avi');
    assert.deepStrictEqual([r.show, r.season, r.episode], ['Cuentame', 3, 12]);
  });
  await t('episodio sin nombre usa la carpeta (ignora "Temporada N")', () => {
    const r = parseMediaName('/series/Mi Serie/Temporada 2/S02E03.mkv');
    assert.deepStrictEqual([r.show, r.season, r.episode], ['Mi Serie', 2, 3]);
  });
  await t('"The Spanish Prisoner" no se trunca', () => assert.strictEqual(prettify('The.Spanish.Prisoner'), 'The Spanish Prisoner'));

  // ───── Subtítulos
  await t('srt -> vtt', () => {
    const v = srtToVtt('﻿1\r\n00:00:01,500 --> 00:00:03,000\r\nHola\r\n');
    assert.ok(v.startsWith('WEBVTT\n\n') && v.includes('00:00:01.500 --> 00:00:03.000'));
  });
  await t('decodifica windows-1252 cuando no es UTF-8', () => assert.strictEqual(decodeText(Buffer.from([0x61, 0xf1, 0x6f])), 'año'));
  await t('detecta idioma del subtítulo', () => {
    assert.strictEqual(subtitleLang('.es').code, 'es');
    assert.strictEqual(subtitleLang('.English.forced').code, 'en');
    assert.strictEqual(subtitleLang('').label, 'Subtítulos');
  });

  // ───── TMDB
  const mk = (over = {}) => new Tmdb({ getKey: () => 'a'.repeat(32), getLang: () => 'es-ES', getRegion: () => 'ES', fetchFn: mockFetch, imageUrl: mockImage, ...over });
  await t('TMDB normaliza tendencias y filtra sin póster', async () => {
    const rows = await mk().row('trending', { type: 'all' });
    assert.ok(rows.length > 10);
    assert.ok(rows.every((r) => r.id.startsWith('tmdb:') && r.title && r.poster));
    assert.ok(rows.some((r) => r.type === 'tv') && rows.some((r) => r.type === 'movie'));
  });
  await t('TMDB: filas "gratis" envían región y monetización', async () => {
    let seen;
    await mk({ fetchFn: async (u) => ((seen = new URL(String(u))), mockFetch(u)) }).row('free', { type: 'movie' });
    assert.strictEqual(seen.searchParams.get('watch_region'), 'ES');
    assert.strictEqual(seen.searchParams.get('with_watch_monetization_types'), 'free|ads');
    assert.strictEqual(seen.searchParams.get('language'), 'es-ES');
  });
  await t('TMDB: clave v3 va en query, token v4 en cabecera', async () => {
    let a, b;
    await mk({ fetchFn: async (u, o) => ((a = [String(u), o.headers]), mockFetch(u)) }).search('noche');
    await mk({ getKey: () => 'eyJ' + 'x'.repeat(200), fetchFn: async (u, o) => ((b = [String(u), o.headers]), mockFetch(u)) }).search('noche');
    assert.ok(a[0].includes('api_key=') && !a[1].Authorization);
    assert.ok(!b[0].includes('api_key') && b[1].Authorization.startsWith('Bearer eyJ'));
  });
  await t('TMDB: "mine" sin plataformas devuelve vacío sin llamar a la red', async () => {
    let calls = 0;
    const r = await mk({ fetchFn: async (u) => (calls++, mockFetch(u)) }).row('mine', { type: 'movie', providers: [] });
    assert.deepStrictEqual([r.length, calls], [0, 0]);
  });
  await t('TMDB: sin clave lanza NO_KEY', async () => {
    await assert.rejects(mk({ getKey: () => '' }).row('popular', { type: 'movie' }), (e) => e.code === 'NO_KEY');
  });
  await t('TMDB: 401 -> BAD_KEY, red caída -> OFFLINE', async () => {
    await assert.rejects(mk({ fetchFn: async () => new Response('{}', { status: 401 }) }).search('x'), (e) => e.code === 'BAD_KEY');
    await assert.rejects(mk({ fetchFn: async () => { throw new Error('boom'); } }).search('x'), (e) => e.code === 'OFFLINE');
  });
  await t('TMDB detalles: proveedores agrupados, tráiler, reparto', async () => {
    const d = await mk().details('movie', 1001);
    assert.strictEqual(d.title, 'Cuaderno de Alzira');
    assert.ok(d.providers.flatrate.some((p) => p.name === 'Netflix'));
    assert.ok(d.providers.rent.length === 1 && d.providers.buy.length === 1);
    assert.ok(d.trailer.url.includes('abc123') && d.cast.length === 4 && d.directors[0] === 'Elena Marín' && d.runtime === 112);
  });
  await t('TMDB detalles: sin datos de región -> providers null', async () => {
    const d = await mk().details('movie', 1003);
    assert.strictEqual(d.providers, null);
  });
  await t('TMDB detalles de serie: temporadas sin especiales', async () => {
    const d = await mk().details('tv', 5001);
    assert.deepStrictEqual(d.seasons.map((s) => s.number), [1, 2, 3]);
    assert.strictEqual((await mk().season(5001, 1)).length, 8);
  });
  await t('TMDB: lista de plataformas ordenada por prioridad', async () => {
    const p = await mk().providers();
    assert.strictEqual(p[0].name, 'Netflix');
    assert.ok(p.every((x) => x.logo));
  });
  await t('TMDB: test() usa la clave pasada y restaura la anterior', async () => {
    const tm = mk({ getKey: () => 'original' });
    await tm.test('otra');
    assert.strictEqual(tm.getKey(), 'original');
  });

  await t('TMDB browseFree: parámetros, paginación y saneado', async () => {
    let seen;
    const tm = mk({ fetchFn: async (u) => ((seen = new URL(String(u))), mockFetch(u)) });
    const r = await tm.browseFree({ type: 'tv', page: 2, provider: '531|300;DROP', genre: '18', sort: 'rated' });
    const q = seen.searchParams;
    assert.deepStrictEqual([q.get('with_watch_monetization_types'), q.get('watch_region'), q.get('page'), q.get('sort_by')], ['free|ads', 'ES', '2', 'vote_average.desc']);
    assert.strictEqual(q.get('with_watch_providers'), '531|300');
    assert.strictEqual(q.get('vote_count.gte'), '200');
    assert.deepStrictEqual([r.page, r.totalPages, r.items.length > 0], [2, 3, true]);
    await tm.browseFree({ type: 'movie', page: 99999, sort: 'recent' });
    assert.strictEqual(seen.searchParams.get('page'), '500');
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(seen.searchParams.get('primary_release_date.lte')));
  });
  await t('TMDB browseFree: páginas distintas dan títulos distintos', async () => {
    const a = await mk().browseFree({ page: 1 });
    const b = await mk().browseFree({ page: 2 });
    const ids = new Set(a.items.map((i) => i.id));
    assert.ok(a.items.length === 18 && b.items.every((i) => !ids.has(i.id)));
  });
  await t('TMDB freeProviders: solo plataformas gratuitas conocidas', async () => {
    const names = (await mk().freeProviders()).map((p) => p.name);
    assert.deepStrictEqual(names.sort(), ['Pluto TV', 'RTVE Play', 'Rakuten TV']);
  });
  await t('TMDB genres', async () => assert.deepStrictEqual((await mk().genres('tv')).map((g) => g.name), ['Drama', 'Comedia', 'Terror']));

  // ───── Internet Archive
  const ar = new Archive({ fetchFn: mockFetch });
  await t('IA: búsqueda normaliza campos y limpia HTML', async () => {
    const r = await ar.search({ collection: 'feature_films' });
    assert.ok(r.length === 8 && r[0].id.startsWith('archive:') && !/[<>]/.test(r[0].overview));
    assert.ok(r[0].poster.startsWith('https://archive.org/services/img/'));
  });
  await t('IA: la consulta incluye colección e idioma', async () => {
    let q;
    const a = new Archive({ fetchFn: async (u) => ((q = new URL(String(u)).searchParams.get('q')), mockFetch(u)) });
    await a.search({ collection: 'silent_films', spanish: true, query: 'tren (1948)' });
    assert.ok(q.includes('mediatype:movies') && q.includes('collection:(silent_films)') && q.includes('language:Spanish'));
    assert.ok(!q.includes('(1948)') || q.includes('title:(tren 1948)'));
  });
  await t('IA: elige el mp4 h.264 sobre ogv y mpeg4 recodificado', async () => {
    const d = await ar.details('faro_1931');
    assert.strictEqual(d.sources.length, 1);
    assert.strictEqual(d.sources[0].url, 'https://archive.org/download/faro_1931/faro_1931.mp4');
    assert.ok(d.playable && d.subtitles[0].code === 'es');
  });
  await t('IA: URL de descarga codifica nombres raros', () => {
    const s = Archive.pickSources([{ name: 'Carpeta/Película #1.mp4', format: 'h.264', size: '1' }], 'id x');
    assert.strictEqual(s[0].url, 'https://archive.org/download/id%20x/Carpeta/Pel%C3%ADcula%20%231.mp4');
  });
  await t('IA: partes múltiples ordenadas numéricamente', () => {
    const files = ['p10.mp4', 'p2.mp4', 'p1.mp4'].map((name) => ({ name, format: 'h.264', size: '1' }));
    assert.deepStrictEqual(Archive.pickSources(files, 'x').map((s) => s.name), ['p1.mp4', 'p2.mp4', 'p10.mp4']);
  });
  await t('IA: sin vídeo reproducible -> sources vacío', () => assert.deepStrictEqual(Archive.pickSources([{ name: 'a.pdf' }, { name: 'a_sample.mp4' }], 'x'), []));
  await t('IA: rechaza descargar subtítulos de otros dominios', async () => {
    await assert.rejects(ar.subtitle('https://evil.example.com/a.srt'), /no permitida/);
  });

  await t('IA browse: total, páginas y orden', async () => {
    let q;
    const a = new Archive({ fetchFn: async (u) => ((q = new URL(String(u))), mockFetch(u)) });
    const p1 = await a.browse({ key: 'silent_films', sort: 'date asc', page: 1 });
    const p2 = await a.browse({ key: 'silent_films', sort: 'date asc', page: 2 });
    assert.deepStrictEqual([p1.total, p1.items.length, p2.items.length], [50, 36, 14]);
    assert.strictEqual(q.searchParams.get('rows'), '36');
    assert.strictEqual(q.searchParams.get('sort[]'), 'date asc');
    assert.ok(q.searchParams.get('q').includes('collection:(silent_films)'));
  });
  await t('IA browse: orden no válido vuelve al predeterminado y colección desconocida a la primera', async () => {
    let q;
    const a = new Archive({ fetchFn: async (u) => ((q = new URL(String(u))), mockFetch(u)) });
    await a.browse({ key: 'no-existe', sort: 'drop table' });
    assert.strictEqual(q.searchParams.get('sort[]'), 'downloads desc');
    assert.ok(q.searchParams.get('q').includes('language:Spanish'));
  });

  // ───── Biblioteca local
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'miflix-'));
  const w = (rel, size = 10) => {
    const p = path.join(dir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, Buffer.alloc(size, 1));
    return p;
  };
  w('Pelis/Mar.Adentro.2004.mkv');
  w('Pelis/Mar.Adentro.2004.es.srt');
  w('Pelis/Mar.Adentro.2004.sample.mkv');
  w('.oculta/Secreta.2020.mkv');
  w('Series/Los Serrano/S01E02.avi');
  w('Series/Los Serrano/S01E01.avi');
  w('Series/Los Serrano/S02E01.avi');
  w('notas.txt');
  const items = await local.scanFolders([dir], { minSize: 0 });
  await t('escaneo: ignora ocultos y no-vídeo', () => assert.ok(!items.some((i) => /Secreta|notas/.test(i.file))));
  const entries = local.buildEntries(items, {});
  await t('agrupa serie con episodios ordenados', () => {
    const s = entries.find((e) => e.type === 'tv');
    assert.deepStrictEqual(s.episodes.map((e) => [e.season, e.episode]), [[1, 1], [1, 2], [2, 1]]);
    assert.strictEqual(s.title, 'Los Serrano');
  });
  await t('metadatos de TMDB se aplican a la entrada', () => {
    const m = entries.find((e) => e.type === 'movie' && e.year === 2004);
    const e2 = local.buildEntries(items, { [m.id]: { tmdbId: 7, title: 'Mar adentro', poster: 'p.jpg', year: 2004 } }).find((e) => e.id === m.id);
    assert.deepStrictEqual([e2.tmdbId, e2.title, e2.localTitle, e2.poster], [7, 'Mar adentro', m.title, 'p.jpg']);
  });
  await t('subtítulos junto al vídeo', async () => {
    const mv = items.find((i) => i.file === 'Mar.Adentro.2004.mkv');
    const subs = await local.findSubtitles(mv.path);
    assert.strictEqual(subs.length, 1);
    assert.strictEqual(subs[0].code, 'es');
    assert.ok(subs[0].vtt.startsWith('WEBVTT'));
  });
  await t('enrich: recuerda fallos y no repite consultas', async () => {
    let calls = 0;
    const fake = { match: async () => (calls++, null) };
    const meta = {};
    await local.enrich(entries, fake, meta);
    const first = calls;
    await local.enrich(entries, fake, meta);
    assert.ok(first === entries.length && calls === first);
  });
  await t('enrich: se detiene si falta la clave', async () => {
    let calls = 0;
    const fake = { match: async () => { calls++; const e = new Error('x'); e.code = 'NO_KEY'; throw e; } };
    await local.enrich(entries, fake, {});
    assert.strictEqual(calls, 1);
  });

  // ───── Canales en directo (iptv-org)
  const M3U = [
    '#EXTM3U',
    '#EXTINF:-1 tvg-id="TVE1.es@SD" tvg-logo="https://img.test/tve1.png" group-title="General;News",La 1 (1080p)',
    'https://a.test/la1/hd.m3u8',
    '#EXTINF:-1 tvg-id="TVE1.es@SD" group-title="General",La 1 (576p) [Geo-blocked]',
    '#EXTVLCOPT:http-referrer=https://www.rtve.test/',
    '#EXTVLCOPT:http-user-agent=Mozilla/5.0 Prueba',
    'https://a.test/la1/sd.m3u8',
    '#EXTINF:-1 tvg-id="TVE1.es@SD" group-title="General",La 1 (576p) [Geo-blocked]',
    'https://a.test/la1/sd.m3u8',
    '#EXTINF:-1 tvg-id="7TV.es@Sevilla",7TV',
    'https://b.test/sevilla.m3u8',
    '#EXTINF:-1 tvg-id="7TV.es@Cordoba",7TV',
    'https://b.test/cordoba.m3u8',
    '#EXTINF:-1 tvg-id="Router.es@SD",Mi router',
    'http://192.168.1.1/live.m3u8',
    '#EXTINF:-1 tvg-id="Ftp.es@SD",Por ftp',
    'ftp://c.test/x.m3u8',
    '#EXTINF:-1 tvg-id="Loop.es@SD",Bucle',
    'http://localhost:8080/x.m3u8',
    '',
  ].join('\n');

  await t('M3U: señales, calidad, geolimitado, logo y cabeceras', () => {
    const s = parseM3U(M3U);
    assert.strictEqual(s.length, 5); // La 1 x3 + 7TV x2 (sin ftp, router ni localhost)
    const la1 = s[0];
    assert.deepStrictEqual([la1.name, la1.quality, la1.geo, la1.logo, la1.groups], ['La 1', '1080p', false, 'https://img.test/tve1.png', ['General', 'News']]);
    assert.deepStrictEqual([s[1].geo, s[1].referrer, s[1].userAgent], [true, 'https://www.rtve.test/', 'Mozilla/5.0 Prueba']);
  });
  await t('M3U: descarta ftp, red local y localhost', () => {
    const urls = parseM3U(M3U).map((x) => x.url);
    assert.ok(!urls.some((u) => /192\.168|ftp:|localhost/.test(u)));
    assert.strictEqual(isSafeUrl('http://127.0.0.1:8080/x.m3u8'), false);
    assert.strictEqual(isSafeUrl('http://10.1.2.3/x'), false);
    assert.strictEqual(isSafeUrl('http://172.20.0.1/x'), false);
    assert.strictEqual(isSafeUrl('http://[::1]/x'), false);
    assert.strictEqual(isSafeUrl('https://cdn.test/x.m3u8'), true);
    assert.strictEqual(isSafeUrl('http://127.0.0.1/x', true), true);
  });
  await t('M3U: cleanName separa calidad y marcas', () => {
    assert.deepStrictEqual(cleanName('Canal X (720p) [Geo-blocked] [Not 24/7]'), { name: 'Canal X', quality: '720p', geo: true, partial: true });
  });
  await t('canales: agrupa señales, quita repetidas y ordena por calidad', () => {
    const ch = groupChannels(parseM3U(M3U));
    const la1 = ch.find((c) => c.name === 'La 1');
    assert.strictEqual(la1.streams.length, 2);
    assert.deepStrictEqual(la1.streams.map((x) => x.quality), ['1080p', '576p']);
    assert.deepStrictEqual(la1.categories, ['Generalistas', 'Noticias']);
  });
  await t('canales: distingue homónimos por su emisión y traduce categorías', () => {
    const names = groupChannels(parseM3U(M3U)).map((c) => c.name);
    assert.ok(names.includes('7TV (Sevilla)') && names.includes('7TV (Cordoba)'));
    assert.deepStrictEqual(groupChannels(parseM3U('#EXTINF:-1 group-title="Undefined",Sin tema\nhttps://d.test/x.m3u8\n'))[0].categories, ['Otros']);
  });
  await t('Iptv.channels: vista sin URLs ni cabeceras y señal por id', async () => {
    let calls = 0;
    const iptv = new Iptv({ fetchFn: async () => { calls++; return new Response(M3U); } });
    const d = await iptv.channels();
    await iptv.channels();
    assert.strictEqual(calls, 1); // caché en memoria
    assert.ok(!JSON.stringify(d).includes('a.test') && !JSON.stringify(d).includes('rtve.test'));
    const sid = d.channels.find((c) => c.name === 'La 1').streams[1].id;
    assert.deepStrictEqual([iptv.stream(sid).url, iptv.stream(sid).referrer], ['https://a.test/la1/sd.m3u8', 'https://www.rtve.test/']);
    assert.strictEqual(iptv.stream('nope'), null);
  });
  await t('Iptv.channels: sin red usa la última copia en disco; sin copia da error claro', async () => {
    const dd = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-disk-'));
    const disk = new DiskCache(dd);
    await new Iptv({ fetchFn: async () => new Response(M3U), disk }).channels();
    const off = async () => { throw new Error('red caída'); };
    const stale = await new Iptv({ fetchFn: off, disk }).channels();
    assert.strictEqual(stale.stale, true);
    assert.ok(stale.count >= 2);
    await assert.rejects(new Iptv({ fetchFn: off }).channels(), (e) => e.code === 'OFFLINE' && /conexión/.test(e.message));
    await assert.rejects(new Iptv({ fetchFn: async () => new Response('', { status: 503 }) }).channels(), (e) => e.code === 'HTTP' && /503/.test(e.message));
    await assert.rejects(new Iptv({ fetchFn: async () => new Response('#EXTM3U\n') }).channels(), /vacía/);
    fs.rmSync(dd, { recursive: true, force: true });
  });

  // ───── Cine libre verificado (public-domain-free-imdb)
  await t('freemovies: solo status free con copia en Internet Archive', () => {
    const items = parseDataset({
      'http://www.imdb.com/title/tt0000001/': { status: 'free', freenessurl: 'https://archive.org/details/uno', title: 'Uno', year: '1920' },
      'http://www.imdb.com/title/tt0000002/': { status: 'non-free 2020-01-01', freenessurl: 'https://archive.org/details/dos', title: 'Dos', year: 1930 },
      'http://www.imdb.com/title/tt0000003/': { status: 'free', freenessurl: 'https://vodo.net/film/tres', title: 'Tres', year: 1940 },
      'http://www.imdb.com/title/tt0000004/': { status: 'free?', freenessurl: 'https://archive.org/details/cuatro', title: 'Cuatro' },
      'http://www.imdb.com/title/tt0000005/': { status: 'free', freenessurls: ['https://en.wikipedia.org/x', 'https://archive.org/details/cinco?x=1'], title: 'Cinco', year: 'None' },
      'http://www.imdb.com/title/tt0000006/': { status: 'free', freenessurl: 'https://archive.org/details/seis' },
    });
    assert.deepStrictEqual(items.map((i) => [i.archiveId, i.imdbId, i.year]), [['uno', 'tt0000001', 1920], ['cinco', 'tt0000005', null]]);
    assert.strictEqual(items[0].source, 'archive');
    assert.ok(items[0].poster.endsWith('/services/img/uno'));
  });
  const fm = () => new FreeMovies({ fetchFn: mockFetch });
  await t('freemovies: une listas, quita duplicados y excluye lo no libre', async () => {
    const r = await fm().browse({});
    assert.strictEqual(r.total, 61); // 60 de Wikidata + 1 manual (faro_1931); se descartan non-free, no-IA y duplicada
    assert.deepStrictEqual([r.items.length, r.totalPages, r.page], [36, 2, 1]);
    assert.ok(!(await fm().browse({ query: 'ya no es libre' })).total);
  });
  await t('freemovies: páginas distintas, orden, época y búsqueda', async () => {
    const f = fm();
    const p1 = await f.browse({ page: 1 });
    const p2 = await f.browse({ page: 2 });
    assert.strictEqual(p2.items.length, 25);
    assert.ok(!p2.items.some((i) => p1.items.some((j) => j.id === i.id)));
    assert.ok(p1.items[0].year >= p1.items[35].year); // más recientes primero
    const old = await f.browse({ sort: 'year asc' });
    assert.ok(old.items[0].year <= old.items[1].year);
    const az = await f.browse({ sort: 'title' });
    assert.strictEqual(az.items[0].title, 'Cinta libre 1');
    const mudo = await f.browse({ era: 'mudo', sort: 'year asc' });
    assert.ok(mudo.items.every((i) => i.year <= 1929) && mudo.total > 10 && mudo.total < 61);
    assert.strictEqual((await f.browse({ query: 'CINTA  libre 5' })).total, 11); // 5, 50-59
    assert.strictEqual((await f.browse({ sort: 'rarisimo' })).total, 61);
  });
  await t('freemovies: usa la copia en disco y, si falla la red, la última guardada', async () => {
    const dd = fs.mkdtempSync(path.join(os.tmpdir(), 'mf-disk-'));
    const disk = new DiskCache(dd);
    let calls = 0;
    const counting = async (u) => { calls++; return mockFetch(u); };
    await new FreeMovies({ fetchFn: counting, disk }).browse({});
    const n = calls;
    await new FreeMovies({ fetchFn: counting, disk }).browse({});
    assert.strictEqual(calls, n); // segunda vez, sin red
    const old = disk.read('free-movies');
    disk.write('free-movies', old.v);
    const off = async () => { throw new Error('red caída'); };
    assert.strictEqual((await new FreeMovies({ fetchFn: off, disk, ttl: -1 }).browse({})).total, 61);
    await assert.rejects(new FreeMovies({ fetchFn: off }).browse({}), (e) => e.code === 'OFFLINE');
    fs.rmSync(dd, { recursive: true, force: true });
  });
  await t('tmdb.byImdb: sinopsis y carátula; id inválido o sin cuenta -> null', async () => {
    const tm = new Tmdb({ getKey: () => 'k', getLang: () => 'es-ES', getRegion: () => 'ES', fetchFn: mockFetch, imageUrl: mockImage });
    const r = await tm.byImdb('tt0343112');
    assert.ok(r.tmdbId && /español/.test(r.overview) && r.poster);
    assert.strictEqual(await tm.byImdb('no-es-un-id'), null);
  });

  // ───── Range
  const file = w('rango.mp4', 1000);
  const read = async (r) => Buffer.from(await r.arrayBuffer());
  await t('Range: sin cabecera devuelve 200 completo', async () => {
    const r = local.rangeResponse(file, null);
    assert.deepStrictEqual([r.status, r.headers.get('accept-ranges'), (await read(r)).length], [200, 'bytes', 1000]);
  });
  await t('Range: bytes=100-199 -> 206 con Content-Range', async () => {
    const r = local.rangeResponse(file, 'bytes=100-199');
    assert.deepStrictEqual([r.status, r.headers.get('content-range'), (await read(r)).length], [206, 'bytes 100-199/1000', 100]);
  });
  await t('Range: abierto (bytes=900-) y sufijo (bytes=-50)', async () => {
    const a = local.rangeResponse(file, 'bytes=900-');
    assert.deepStrictEqual([a.headers.get('content-range'), (await read(a)).length], ['bytes 900-999/1000', 100]);
    const b = local.rangeResponse(file, 'bytes=-50');
    assert.deepStrictEqual([b.headers.get('content-range'), (await read(b)).length], ['bytes 950-999/1000', 50]);
  });
  await t('Range: fuera de rango -> 416', () => assert.strictEqual(local.rangeResponse(file, 'bytes=5000-6000').status, 416));

  fs.rmSync(dir, { recursive: true, force: true });
  console.log(`\n${pass} pruebas correctas${process.exitCode ? ' (hay fallos)' : ''}`);
})();
