'use strict';
/**
 * Respuestas simuladas con la forma real de las APIs de TMDB e Internet Archive.
 * Sirven para probar la app sin red ni claves (MIFLIX_MOCK=1). Los títulos son inventados.
 */
const MOVIES = [
  'La noche del faro', 'Cuaderno de Alzira', 'Las hermanas Mestalla', 'El último tranvía', 'Marea baja',
  'Sombra de naranjo', 'Un verano en la Ribera', 'El inventario de los días', 'Papel de arroz', 'Fuego y pólvora',
  'El cartero de Cullera', 'Ciudad de sal', 'Los herederos del río', 'Horizonte de vidrio', 'La casa de los espejos',
  'Tormenta en la costa', 'Cien kilómetros de silencio', 'El aprendiz de relojero', 'Luz de agosto', 'Nadie vuelve a Denia',
];
const SERIES = ['Barrio Alto', 'Los mares del sur', 'La escuela del norte', 'Turno de noche', 'Crónicas de la Albufera', 'Pueblo de cartón', 'El despacho', 'Costa Azahar'];
const IA = [
  ['faro_1931', 'El faro de los ausentes', 1931], ['noche_muda', 'Noche muda', 1922], ['tren_sin_horario', 'Tren sin horario', 1948],
  ['la_huerta_1955', 'La huerta en llamas', 1955], ['cartas_a_nadie', 'Cartas a nadie', 1939], ['mar_de_trigo', 'Mar de trigo', 1927],
  ['el_ultimo_baile', 'El último baile', 1944], ['sombras_de_plata', 'Sombras de plata', 1936],
];
const PROVIDERS = [[8, 'Netflix'], [119, 'Amazon Prime Video'], [337, 'Disney Plus'], [149, 'Movistar Plus+'], [63, 'Filmin'], [35, 'Rakuten TV'], [531, 'RTVE Play'], [300, 'Pluto TV'], [1773, 'SkyShowtime']];

const OVERVIEW = 'Una historia de familias, secretos y decisiones que lo cambian todo. Ambientada en un pueblo donde nadie se va del todo y todos vuelven cuando menos lo esperan.';

const hash = (s) => [...String(s)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

const suffix = (i, n) => (i >= n ? ` ${Math.floor(i / n) + 1}` : '');
function movieAt(i) {
  const id = 1000 + i;
  const name = MOVIES[i % MOVIES.length] + suffix(i, MOVIES.length);
  return { id, title: name, original_title: name, overview: OVERVIEW, poster_path: `/p${id}.jpg`, backdrop_path: `/b${id}.jpg`, release_date: `${2008 + (i % 17)}-0${1 + (i % 9)}-15`, vote_average: 6 + (i % 30) / 10, genre_ids: [18] };
}
function tvAt(i) {
  const id = 5000 + i;
  const name = SERIES[i % SERIES.length] + suffix(i, SERIES.length);
  return { id, name, original_name: name, overview: OVERVIEW, poster_path: `/p${id}.jpg`, backdrop_path: `/b${id}.jpg`, first_air_date: `${2010 + (i % 14)}-0${1 + (i % 9)}-10`, vote_average: 6.5 + (i % 25) / 10, genre_ids: [18] };
}
function list(type, seed, withType) {
  const n = type === 'tv' ? SERIES.length : 18;
  return Array.from({ length: n }, (_, k) => {
    const r = (type === 'tv' ? tvAt : movieAt)((k + seed) % (type === 'tv' ? SERIES.length : MOVIES.length));
    return withType ? { ...r, media_type: type } : r;
  });
}

const text = (body, status = 200) => new Response(body, { status, headers: { 'content-type': 'text/plain' } });
const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });

function tmdb(u) {
  const p = u.pathname.replace('/3', '');
  const seed = hash(u.search) % 7;
  let m;
  if (p === '/configuration') return json({ images: {} });
  if ((m = /^\/trending\/(all|movie|tv)\/week$/.exec(p))) {
    const t = m[1];
    return json({ results: t === 'all' ? [...list('movie', 0, true).slice(0, 8), ...list('tv', 0, true)] : list(t, 0, true) });
  }
  if ((m = /^\/(movie|tv)\/(popular|top_rated|now_playing)$/.exec(p))) return json({ results: list(m[1], seed) });
  if ((m = /^\/discover\/(movie|tv)$/.exec(p))) {
    const page = Number(u.searchParams.get('page') || 1);
    const per = m[1] === 'tv' ? 8 : 18;
    const results = Array.from({ length: per }, (_, k) => (m[1] === 'tv' ? tvAt : movieAt)((page - 1) * per + k));
    return json({ page, total_pages: 3, total_results: 3 * per, results });
  }
  if ((m = /^\/genre\/(movie|tv)\/list$/.exec(p))) return json({ genres: [{ id: 18, name: 'Drama' }, { id: 35, name: 'Comedia' }, { id: 27, name: 'Terror' }] });
  if ((m = /^\/search\/(multi|movie|tv)$/.exec(p))) {
    const q = (u.searchParams.get('query') || '').toLowerCase();
    const all = [...list('movie', 0, true), ...list('tv', 0, true)].filter((r) => (r.title || r.name).toLowerCase().includes(q));
    return json({ results: m[1] === 'multi' ? all : all.filter((r) => r.media_type === m[1]) });
  }
  if ((m = /^\/(movie|tv)\/(\d+)\/season\/(\d+)$/.exec(p))) {
    return json({ episodes: Array.from({ length: 8 }, (_, i) => ({ episode_number: i + 1, season_number: Number(m[3]), name: `Capítulo ${i + 1}`, overview: OVERVIEW, runtime: 48 + i, still_path: `/s${m[2]}${i}.jpg`, air_date: '2021-03-0' + ((i % 9) + 1) })) });
  }
  if ((m = /^\/(movie|tv)\/(\d+)$/.exec(p))) {
    const tv = m[1] === 'tv';
    const idx = Number(m[2]) - (tv ? 5000 : 1000);
    const base = (tv ? tvAt : movieAt)(idx);
    return json({
      ...base,
      tagline: 'Algunas puertas solo se abren desde dentro.',
      genres: [{ id: 18, name: 'Drama' }, { id: 53, name: 'Suspense' }],
      runtime: tv ? undefined : 112,
      episode_run_time: tv ? [48] : undefined,
      status: 'Released',
      seasons: tv ? [{ season_number: 0, name: 'Especiales' }, ...[1, 2, 3].map((n) => ({ season_number: n, name: `Temporada ${n}`, episode_count: 8, air_date: `${2018 + n}-02-01` }))] : undefined,
      created_by: tv ? [{ name: 'Marta Ferrer' }] : undefined,
      credits: { cast: ['Laura Vidal', 'Andrés Cobo', 'Irene Salas', 'Pablo Ginés'].map((n, i) => ({ name: n, character: `Personaje ${i + 1}`, profile_path: `/c${i}.jpg` })), crew: [{ job: 'Director', name: 'Elena Marín' }] },
      videos: { results: [{ site: 'YouTube', type: 'Trailer', key: 'abc123', iso_639_1: 'es' }] },
      external_ids: { imdb_id: 'tt0000000' },
      recommendations: { results: list(m[1], 3, false).slice(0, 10) },
      'watch/providers': { results: { ES: idx % 4 === 3 ? undefined : { link: 'https://www.justwatch.com/es/pelicula/ejemplo', flatrate: [{ provider_id: 8, provider_name: 'Netflix', logo_path: '/l8.jpg' }, { provider_id: 149, provider_name: 'Movistar Plus+', logo_path: '/l149.jpg' }], free: idx % 2 ? [{ provider_id: 531, provider_name: 'RTVE Play', logo_path: '/l531.jpg' }] : undefined, ads: idx % 2 ? [{ provider_id: 300, provider_name: 'Pluto TV', logo_path: '/l300.jpg' }] : undefined, rent: [{ provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/l119.jpg' }], buy: [{ provider_id: 119, provider_name: 'Amazon Prime Video', logo_path: '/l119.jpg' }] } } },
    });
  }
  if ((m = /^\/find\/(tt\d+)$/.exec(p))) {
    const n = Number(m[1].slice(2)) % 18;
    return json({ movie_results: [{ ...movieAt(n), overview: 'Sinopsis en español desde TMDB para una película libre.' }], tv_results: [] });
  }
  if ((m = /^\/watch\/providers\/(movie|tv)$/.exec(p))) {
    return json({ results: PROVIDERS.map(([id, name], i) => ({ provider_id: id, provider_name: name, logo_path: `/l${id}.jpg`, display_priorities: { ES: i } })) });
  }
  return json({ status_message: 'mock: ruta no cubierta ' + p }, 404);
}

function archive(u) {
  if (u.pathname === '/advancedsearch.php') {
    const q = u.searchParams.get('q') || '';
    const rows = Number(u.searchParams.get('rows') || 24);
    if (rows >= 36) {
      const page = Number(u.searchParams.get('page') || 1);
      const all = Array.from({ length: 50 }, (_, i) => ({ identifier: `mock_${i}`, title: `Película muda ${i + 1}`, year: 1920 + (i % 40), description: 'Copia restaurada.', downloads: 1000 - i }));
      const docs = all.slice((page - 1) * rows, page * rows);
      return json({ response: { numFound: all.length, docs } });
    }
    const docs = IA.filter(([, t]) => !/title:\(([^)]+)\)/.test(q) || t.toLowerCase().includes(/title:\(([^)]+)\)/.exec(q)[1].toLowerCase()))
      .map(([identifier, title, year]) => ({ identifier, title, year, description: ['<p>Película de ' + year + ' restaurada.</p>'], downloads: 1000, creator: 'Archivo Mock' }));
    return json({ response: { numFound: docs.length, docs } });
  }
  const m = /^\/metadata\/(.+)$/.exec(u.pathname);
  if (m) {
    const id = decodeURIComponent(m[1]);
    const hit = IA.find(([i]) => i === id) || (/^mock_\d+$/.test(id) ? [id, `Película muda ${Number(id.slice(5)) + 1}`, 1920] : null);
    if (!hit) return json({}, 200);
    return json({
      metadata: { identifier: id, title: hit[1], year: hit[2], description: '<p>Una joven película antigua.</p>', creator: 'Archivo Mock', licenseurl: 'http://creativecommons.org/publicdomain/mark/1.0/' },
      files: [
        { name: `${id}.ogv`, format: 'Ogg Video', size: '900' },
        { name: `${id}.mp4`, format: 'h.264', size: '5000' },
        { name: `${id}_512kb.mp4`, format: '512Kb MPEG4', size: '4000' },
        { name: `${id}.es.srt`, format: 'SubRip', size: '10' },
      ],
    });
  }
  return json({}, 404);
}

/** Lista M3U simulada. MIFLIX_LIVE_URL apunta a un servidor HLS local que monta la prueba de humo. */
function iptv() {
  const live = process.env.MIFLIX_LIVE_URL || 'http://127.0.0.1:9';
  return text([
    '#EXTM3U',
    `#EXTINF:-1 tvg-id="CanalPrueba.es@SD" tvg-logo="https://example.test/logo.png" group-title="General;Entertainment",Canal Prueba (720p)`,
    `${live}/caido/index.m3u8`,
    `#EXTINF:-1 tvg-id="CanalPrueba.es@SD" tvg-logo="https://example.test/logo.png" group-title="General;Entertainment",Canal Prueba (576p) [Geo-blocked]`,
    '#EXTVLCOPT:http-referrer=https://player.ejemplo.test/',
    '#EXTVLCOPT:http-user-agent=MiFlixPrueba/1.0',
    `${live}/directo/index.m3u8`,
    '#EXTINF:-1 tvg-id="Noticias24.es@SD" group-title="News",Noticias 24h (1080p)',
    'https://senal.ejemplo.test/noticias/index.m3u8',
    '#EXTINF:-1 tvg-id="Infantil.es@SD" group-title="Kids",Canal Peques',
    'https://senal.ejemplo.test/peques/index.m3u8',
    '#EXTINF:-1 tvg-id="Cine.es@SD" group-title="Movies",Cine Clásico TV (480p)',
    'https://senal.ejemplo.test/cine/index.m3u8',
    '#EXTINF:-1 tvg-id="Deportes.es@SD" group-title="Sports",Deportes Directo',
    'https://senal.ejemplo.test/deportes/index.m3u8',
    '',
  ].join('\n'));
}

/** Datasets simulados de public-domain-free-imdb: ids mock_N para que Internet Archive (simulado) tenga ficha. */
function freeMovies(u) {
  const file = u.pathname.split('/').pop();
  if (file === 'free-movies-archive-org-wikidata.json') {
    const out = {};
    for (let i = 0; i < 60; i += 1) {
      out[`http://www.imdb.com/title/tt${String(1000000 + i)}/`] = {
        freenessurl: `https://archive.org/details/mock_${i}`,
        status: 'free',
        title: `Cinta libre ${i + 1}`,
        year: String(1902 + i * 1.1 | 0),
        wdurl: `http://www.wikidata.org/entity/Q${i}`,
      };
    }
    return json(out);
  }
  if (file === 'free-movies-manual.json') {
    return json({
      'http://www.imdb.com/title/tt0343112/': { status: 'free', freenessurl: 'https://archive.org/details/faro_1931', title: 'El faro de los ausentes', year: 1931 },
      'http://www.imdb.com/title/tt0000999/': { status: 'non-free 2021-01-01', freenessurl: 'https://archive.org/details/mock_900', title: 'Ya no es libre', year: 1950 },
      'http://www.imdb.com/title/tt0000998/': { status: 'free', freenessurl: 'https://vodo.net/film/algo', title: 'Fuera de Internet Archive', year: 1960 },
      'http://www.imdb.com/title/tt1000001/': { status: 'free', freenessurl: 'https://archive.org/details/mock_1', title: 'Duplicada de Cinta libre 2', year: 1903 },
    });
  }
  return json({}, 404);
}

async function mockFetch(input) {
  const u = new URL(String(input));
  if (u.hostname === 'api.themoviedb.org') return tmdb(u);
  if (u.hostname === 'archive.org') return archive(u);
  if (u.hostname === 'iptv-org.github.io') return iptv();
  if (u.hostname === 'raw.githubusercontent.com') return freeMovies(u);
  return json({}, 404);
}

/** Imágenes simuladas: degradados SVG con color derivado de la ruta. */
function mockImage(p, size) {
  if (!p) return null;
  const hue = hash(p) % 360;
  const wide = size === 'w1280' || size === 'w300';
  const w = wide ? 1280 : 342;
  const hgt = wide ? 720 : 513;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${hgt}" viewBox="0 0 ${w} ${hgt}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="hsl(${hue} 45% 32%)"/><stop offset="1" stop-color="hsl(${(hue + 50) % 360} 40% 12%)"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.7}" cy="${hgt * 0.35}" r="${hgt * 0.22}" fill="hsl(${hue} 60% 60% / .22)"/></svg>`;
  return 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
}

module.exports = { mockFetch, mockImage };
