'use strict';
/**
 * TMDB: metadatos, catálogo y disponibilidad por país.
 * La disponibilidad ("dónde ver") la sirve TMDB con datos de JustWatch,
 * por lo que hay que atribuirlo en la interfaz (se hace en la ficha y en Ajustes).
 */
const BASE = 'https://api.themoviedb.org/3';
const IMG = 'https://image.tmdb.org/t/p/';
const TTL = 10 * 60 * 1000;

class NoKeyError extends Error {
  constructor() {
    super('Falta la clave de TMDB. Añádela en Ajustes (es gratuita).');
    this.code = 'NO_KEY';
  }
}

const isBearer = (key) => key.startsWith('eyJ') || key.length > 60;

class Tmdb {
  /**
   * @param {{getKey:()=>string, getLang:()=>string, getRegion:()=>string, fetchFn?:Function, imageUrl?:Function}} opts
   */
  constructor({ getKey, getLang, getRegion, fetchFn = globalThis.fetch, imageUrl }) {
    this.getKey = getKey;
    this.getLang = getLang;
    this.getRegion = getRegion;
    this.fetchFn = fetchFn;
    this.img = imageUrl || ((p, size) => (p ? `${IMG}${size}${p}` : null));
    this.cache = new Map();
  }

  async req(pathname, params = {}) {
    const key = (this.getKey() || '').trim();
    if (!key) throw new NoKeyError();

    const url = new URL(BASE + pathname);
    url.searchParams.set('language', this.getLang());
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, v);
    }
    const headers = { accept: 'application/json' };
    if (isBearer(key)) headers.Authorization = `Bearer ${key}`;
    else url.searchParams.set('api_key', key);

    const cacheKey = url.toString().replace(/api_key=[^&]+/, 'k');
    const hit = this.cache.get(cacheKey);
    if (hit && Date.now() - hit.t < TTL) return hit.v;

    let res;
    try {
      res = await this.fetchFn(url, { headers });
    } catch {
      const e = new Error('No se pudo conectar con TMDB. Comprueba tu conexión.');
      e.code = 'OFFLINE';
      throw e;
    }
    if (res.status === 401) {
      const e = new Error('TMDB no reconoce esa clave. Revísala en Ajustes.');
      e.code = 'BAD_KEY';
      throw e;
    }
    if (!res.ok) throw new Error(`TMDB respondió con el error ${res.status}.`);
    const v = await res.json();
    this.cache.set(cacheKey, { t: Date.now(), v });
    return v;
  }

  normalize(r, forcedType) {
    const type = forcedType || r.media_type;
    const tv = type === 'tv';
    const date = tv ? r.first_air_date : r.release_date;
    return {
      id: `tmdb:${type}:${r.id}`,
      source: 'tmdb',
      type,
      tmdbId: r.id,
      title: (tv ? r.name : r.title) || '',
      original: (tv ? r.original_name : r.original_title) || '',
      year: date ? Number(date.slice(0, 4)) || null : null,
      overview: r.overview || '',
      poster: this.img(r.poster_path, 'w342'),
      backdrop: this.img(r.backdrop_path, 'w1280'),
      rating: r.vote_average ? Math.round(r.vote_average * 10) / 10 : null,
    };
  }

  list(results, forcedType) {
    return (results || [])
      .filter((r) => (forcedType || r.media_type === 'movie' || r.media_type === 'tv') && r.poster_path)
      .map((r) => this.normalize(r, forcedType));
  }

  /** Filas del catálogo. kind: trending | popular | topRated | nowPlaying | spanish | free | mine | genre */
  async row(kind, p = {}) {
    const type = p.type === 'tv' ? 'tv' : 'movie';
    const region = this.getRegion();
    switch (kind) {
      case 'trending': {
        const t = p.type === 'movie' || p.type === 'tv' ? p.type : 'all';
        const d = await this.req(`/trending/${t}/week`);
        return this.list(d.results, t === 'all' ? undefined : t);
      }
      case 'popular': {
        const d = await this.req(`/${type}/popular`, { region });
        return this.list(d.results, type);
      }
      case 'topRated': {
        const d = await this.req(`/${type}/top_rated`, { region });
        return this.list(d.results, type);
      }
      case 'nowPlaying': {
        const d = await this.req('/movie/now_playing', { region });
        return this.list(d.results, 'movie');
      }
      case 'spanish': {
        const d = await this.req(`/discover/${type}`, {
          with_origin_country: 'ES',
          sort_by: type === 'movie' ? 'popularity.desc' : 'popularity.desc',
          'vote_count.gte': 15,
          include_adult: false,
        });
        return this.list(d.results, type);
      }
      case 'free': {
        const d = await this.req(`/discover/${type}`, {
          watch_region: region,
          with_watch_monetization_types: 'free|ads',
          sort_by: 'popularity.desc',
          include_adult: false,
        });
        return this.list(d.results, type);
      }
      case 'mine': {
        const ids = (p.providers || []).join('|');
        if (!ids) return [];
        const d = await this.req(`/discover/${type}`, {
          watch_region: region,
          with_watch_providers: ids,
          with_watch_monetization_types: 'flatrate|free|ads',
          sort_by: 'popularity.desc',
          include_adult: false,
        });
        return this.list(d.results, type);
      }
      case 'genre': {
        const d = await this.req(`/discover/${type}`, {
          with_genres: p.genre,
          sort_by: 'popularity.desc',
          'vote_count.gte': 100,
          include_adult: false,
        });
        return this.list(d.results, type);
      }
      default:
        throw new Error(`Fila desconocida: ${kind}`);
    }
  }

  async search(query) {
    const q = String(query || '').trim();
    if (!q) return [];
    const d = await this.req('/search/multi', { query: q, include_adult: false });
    return this.list(d.results);
  }

  /** Mejor coincidencia para un título suelto (biblioteca local). */
  async match(type, title, year) {
    const t = type === 'tv' ? 'tv' : 'movie';
    const d = await this.req(`/search/${t}`, {
      query: title,
      include_adult: false,
      ...(year ? (t === 'movie' ? { year } : { first_air_date_year: year }) : {}),
    });
    const hit = (d.results || []).find((r) => r.poster_path) || (d.results || [])[0];
    return hit ? this.normalize(hit, t) : null;
  }

  async details(type, id) {
    const t = type === 'tv' ? 'tv' : 'movie';
    const d = await this.req(`/${t}/${id}`, {
      append_to_response: 'credits,videos,watch/providers,external_ids,recommendations',
      include_video_language: 'es,en,null',
    });

    const wp = (d['watch/providers'] && d['watch/providers'].results && d['watch/providers'].results[this.getRegion()]) || null;
    const mapProviders = (arr) => {
      const seen = new Set();
      return (arr || [])
        .filter((p) => !seen.has(p.provider_id) && seen.add(p.provider_id))
        .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: this.img(p.logo_path, 'w92') }));
    };
    const providers = wp
      ? {
          link: wp.link || null,
          free: mapProviders([...(wp.free || []), ...(wp.ads || [])]),
          flatrate: mapProviders(wp.flatrate),
          rent: mapProviders(wp.rent),
          buy: mapProviders(wp.buy),
        }
      : null;

    const vids = (d.videos && d.videos.results) || [];
    const yt = vids.filter((v) => v.site === 'YouTube');
    const trailerPick =
      yt.find((v) => v.type === 'Trailer' && v.iso_639_1 === 'es') ||
      yt.find((v) => v.type === 'Trailer') ||
      yt.find((v) => v.type === 'Teaser');

    const crew = (d.credits && d.credits.crew) || [];
    const directors =
      t === 'movie'
        ? crew.filter((c) => c.job === 'Director').map((c) => c.name)
        : (d.created_by || []).map((c) => c.name);

    return {
      ...this.normalize(d, t),
      tagline: d.tagline || '',
      genres: (d.genres || []).map((g) => g.name),
      runtime: t === 'movie' ? d.runtime || null : (d.episode_run_time && d.episode_run_time[0]) || null,
      status: d.status || '',
      seasons:
        t === 'tv'
          ? (d.seasons || [])
              .filter((s) => s.season_number > 0)
              .map((s) => ({
                number: s.season_number,
                name: s.name,
                episodes: s.episode_count,
                year: s.air_date ? Number(s.air_date.slice(0, 4)) : null,
              }))
          : [],
      cast: ((d.credits && d.credits.cast) || []).slice(0, 12).map((c) => ({
        name: c.name,
        character: c.character || '',
        photo: this.img(c.profile_path, 'w185'),
      })),
      directors,
      trailer: trailerPick
        ? { key: trailerPick.key, url: `https://www.youtube.com/watch?v=${trailerPick.key}` }
        : null,
      providers,
      imdbId: (d.external_ids && d.external_ids.imdb_id) || null,
      similar: this.list(d.recommendations && d.recommendations.results, t).slice(0, 18),
    };
  }

  async season(tvId, number) {
    const d = await this.req(`/tv/${tvId}/season/${number}`);
    return (d.episodes || []).map((e) => ({
      number: e.episode_number,
      season: e.season_number,
      name: e.name,
      overview: e.overview || '',
      runtime: e.runtime || null,
      still: this.img(e.still_path, 'w300'),
      airDate: e.air_date || null,
    }));
  }

  /**
   * Todo lo que es gratis (o con anuncios) en la región, paginado.
   * sort: popular | rated | recent | title. TMDB limita a 500 páginas.
   */
  async browseFree({ type, page = 1, provider, genre, sort = 'popular' } = {}) {
    const t = type === 'tv' ? 'tv' : 'movie';
    const sorts = {
      popular: 'popularity.desc',
      rated: 'vote_average.desc',
      recent: t === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc',
      title: t === 'movie' ? 'title.asc' : 'name.asc',
    };
    const params = {
      watch_region: this.getRegion(),
      with_watch_monetization_types: 'free|ads',
      sort_by: sorts[sort] || sorts.popular,
      page: Math.min(Math.max(Number(page) || 1, 1), 500),
      include_adult: false,
    };
    if (sort === 'rated') params['vote_count.gte'] = 200;
    if (sort === 'recent') params[t === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte'] = new Date().toISOString().slice(0, 10);
    if (provider) params.with_watch_providers = String(provider).replace(/[^0-9|,]/g, '');
    if (genre) params.with_genres = String(genre).replace(/[^0-9|,]/g, '');

    const d = await this.req(`/discover/${t}`, params);
    return {
      items: this.list(d.results, t),
      page: d.page || params.page,
      totalPages: Math.min(d.total_pages || 1, 500),
      total: d.total_results || 0,
    };
  }

  async genres(type) {
    const t = type === 'tv' ? 'tv' : 'movie';
    const d = await this.req(`/genre/${t}/list`);
    return (d.genres || []).map((g) => ({ id: g.id, name: g.name }));
  }

  /** Plataformas de la región que suelen ofrecer contenido gratuito (se identifican por nombre). */
  async freeProviders() {
    const all = await this.providers(500);
    const re = /rtve|pluto|rakuten|atresplayer|mitele|mediaset|\bplex\b|tubi|runtime|youtube|3cat|punt|canal ?sur|telemadrid|etb|primeran|ib3|cmm|galega/i;
    return all.filter((p) => re.test(p.name));
  }

  /** Plataformas de streaming conocidas en la región (películas + series). */
  async providers(limit = 48) {
    const region = this.getRegion();
    const [m, t] = await Promise.all([
      this.req('/watch/providers/movie', { watch_region: region }),
      this.req('/watch/providers/tv', { watch_region: region }),
    ]);
    const byId = new Map();
    for (const p of [...(m.results || []), ...(t.results || [])]) {
      if (!byId.has(p.provider_id)) byId.set(p.provider_id, p);
    }
    return [...byId.values()]
      .sort(
        (a, b) =>
          ((a.display_priorities && a.display_priorities[region]) ?? 999) -
          ((b.display_priorities && b.display_priorities[region]) ?? 999),
      )
      .slice(0, limit)
      .map((p) => ({ id: p.provider_id, name: p.provider_name, logo: this.img(p.logo_path, 'w92') }));
  }

  /** Carátula y sinopsis en tu idioma para un título con ID de IMDb (null si TMDB no lo conoce). */
  async byImdb(imdbId) {
    if (!/^tt\d{6,9}$/.test(String(imdbId))) return null;
    const d = await this.req(`/find/${imdbId}`, { external_source: 'imdb_id' });
    const r = (d.movie_results || [])[0];
    if (!r) return null;
    const n = this.normalize(r, 'movie');
    return { tmdbId: n.tmdbId, title: n.title, overview: n.overview, poster: n.poster, backdrop: n.backdrop, rating: n.rating };
  }

  async test(key) {
    const prev = this.getKey;
    this.getKey = () => key;
    this.cache.clear();
    try {
      await this.req('/configuration');
      return true;
    } finally {
      this.getKey = prev;
      this.cache.clear();
    }
  }
}

module.exports = { Tmdb, NoKeyError };
