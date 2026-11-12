'use strict';
/**
 * Plataformas de España. Solo enlaces a los servicios oficiales:
 * MiFlix no incluye ni enlaza sitios piratas.
 * Edita esta lista para añadir o quitar lo que uses.
 *
 * group: 'gratis' (gratuitas, con o sin anuncios/registro), 'autonomica' (televisiones públicas
 * autonómicas) o 'pago'.
 */
module.exports = [
  // Gratuitas
  { id: 'rtve', group: 'gratis', name: 'RTVE Play', url: 'https://www.rtve.es/play/', about: 'Cine español, series y archivo histórico de TVE. Gratis, con registro.' },
  { id: 'pluto', group: 'gratis', name: 'Pluto TV', url: 'https://pluto.tv/es', about: 'Canales en directo y catálogo a la carta, con anuncios.' },
  { id: 'platfo', group: 'gratis', name: 'Platfo', url: 'https://platfo.es/home', about: 'Plataforma del Ministerio de Cultura: Filmoteca Española y cine español.' },
  { id: 'atresplayer', group: 'gratis', name: 'Atresplayer', url: 'https://www.atresplayer.com', about: 'Series y programas de Atresmedia; una parte es gratis con anuncios.' },
  { id: 'mediaset', group: 'gratis', name: 'Mediaset Infinity', url: 'https://www.mediasetinfinity.es', about: 'Telecinco, Cuatro y más; parte del catálogo es gratis con registro.' },
  { id: 'rakuten', group: 'gratis', name: 'Rakuten TV', url: 'https://rakuten.tv', about: 'Películas y series gratis con anuncios; estrenos en alquiler.' },
  { id: 'plex', group: 'gratis', name: 'Plex', url: 'https://watch.plex.tv', about: 'Películas, series y canales gratis con anuncios.' },
  { id: 'youtube', group: 'gratis', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=pel%C3%ADcula+completa+en+espa%C3%B1ol', about: 'Películas completas en español subidas por sus distribuidores.' },

  // Televisiones públicas autonómicas (listado del Ministerio para la Transformación Digital)
  { id: 'apunt', group: 'autonomica', name: 'À Punt', url: 'https://www.apuntmedia.es', about: 'Comunitat Valenciana.' },
  { id: '3cat', group: 'autonomica', name: '3Cat', url: 'https://www.3cat.cat/3cat/', about: 'Cataluña: series, cine y documentales.' },
  { id: 'etbon', group: 'autonomica', name: 'ETB On', url: 'https://etbon.eus', about: 'País Vasco.' },
  { id: 'primeran', group: 'autonomica', name: 'Primeran', url: 'https://primeran.eus', about: 'País Vasco: plataforma gratuita de cine y series en euskera.' },
  { id: 'agalega', group: 'autonomica', name: 'AGalega', url: 'https://www.agalega.gal', about: 'Galicia.' },
  { id: 'canalsur', group: 'autonomica', name: 'CanalSur Más', url: 'https://www.canalsurmas.es', about: 'Andalucía.' },
  { id: 'telemadrid', group: 'autonomica', name: 'Telemadrid', url: 'https://www.telemadrid.es', about: 'Comunidad de Madrid.' },
  { id: 'aragon', group: 'autonomica', name: 'Aragón TV', url: 'https://www.aragontelevision.es', about: 'Aragón.' },
  { id: 'ib3', group: 'autonomica', name: 'tot IB3', url: 'https://totib3.org', about: 'Illes Balears.' },
  { id: 'canarias', group: 'autonomica', name: 'Canarias Play', url: 'https://www.canariasplay.es', about: 'Canarias.' },
  { id: 'cmm', group: 'autonomica', name: 'CMMPlay', url: 'https://www.cmmedia.es/play', about: 'Castilla-La Mancha.' },
  { id: 'extremadura', group: 'autonomica', name: 'Canal Extremadura', url: 'https://www.canalextremadura.app', about: 'Extremadura.' },
  { id: 'rtpa', group: 'autonomica', name: 'RTPA', url: 'https://www.rtpa.es', about: 'Principado de Asturias.' },
  { id: 'la7', group: 'autonomica', name: 'La 7', url: 'https://www.la7tv.es', about: 'Región de Murcia.' },

  // De pago
  { id: 'netflix', group: 'pago', name: 'Netflix', url: 'https://www.netflix.com/es/', about: 'Suscripción.' },
  { id: 'prime', group: 'pago', name: 'Prime Video', url: 'https://www.primevideo.com', about: 'Suscripción, con alquiler y compra de estrenos.' },
  { id: 'disney', group: 'pago', name: 'Disney+', url: 'https://www.disneyplus.com', about: 'Suscripción.' },
  { id: 'movistar', group: 'pago', name: 'Movistar Plus+', url: 'https://www.movistarplus.es', about: 'Suscripción; series originales y deporte.' },
  { id: 'skyshowtime', group: 'pago', name: 'SkyShowtime', url: 'https://www.skyshowtime.com', about: 'Suscripción.' },
  { id: 'apple', group: 'pago', name: 'Apple TV', url: 'https://tv.apple.com', about: 'Suscripción y tienda de películas.' },
  { id: 'filmin', group: 'pago', name: 'Filmin', url: 'https://www.filmin.es', about: 'Cine de autor, español y documental; suscripción o alquiler.' },
  { id: 'flixole', group: 'pago', name: 'FlixOlé', url: 'https://www.flixole.com', about: 'Cine clásico español; suscripción.' },
];
