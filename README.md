# MiFlix

Tu propio Netflix de escritorio (Electron). Reúne en una sola app:

- **Catálogo y disponibilidad en España** (TMDB + datos de JustWatch): tendencias, cine y series españolas, títulos gratis, fichas con reparto, tráiler, episodios y **en qué plataforma está cada título**.
- **Cine libre que se reproduce dentro de la app** (Internet Archive): cine clásico, mudo, negro, animación y cine en español de dominio público.
- **Tu biblioteca local**: elige carpetas con tus películas y series; MiFlix las agrupa por serie y temporada, carga los subtítulos `.srt` y pone carátula.
- **Todo lo gratis** (*Gratis → Explorar todo el catálogo*): recorre página a página cada película y serie que JustWatch/TMDB marca como gratis o con anuncios en España (filtra por plataforma, género y orden) y toda la colección de cine libre de Internet Archive (cine en español, clásico, mudo, negro, ciencia ficción y terror, animación, televisión clásica).
- **Plataformas de España** en una página, en tres grupos: gratuitas (RTVE Play, Pluto TV, Platfo, Atresplayer, Mediaset Infinity, Rakuten TV, Plex, YouTube), televisiones públicas autonómicas (À Punt, 3Cat, ETB On, Primeran, AGalega, CanalSur Más, Telemadrid, Aragón TV, tot IB3, Canarias Play, CMMPlay, Canal Extremadura, RTPA, La 7) y de pago (Netflix, Prime Video, Disney+, Movistar Plus+, SkyShowtime, Apple TV, Filmin, FlixOlé). Se editan en `src/platforms.js`.
- **En directo**: canales de televisión de España que emiten abiertamente por Internet (lista comunitaria iptv-org), con filtro por categoría, búsqueda y cambio automático a otra señal del mismo canal si una no responde.
- **Libres verificadas**: en *Todo lo gratis*, películas que la lista abierta public-domain-free-imdb marca como de dominio público o con licencia abierta y que tienen copia en Internet Archive; se reproducen aquí y, con clave de TMDB, llevan sinopsis y carátula en español.
- Seguir viendo, reanudar donde lo dejaste, siguiente episodio automático, Mi lista y buscador único.

MiFlix no incluye ni enlaza sitios piratas. Lo que no es dominio público ni tuyo se abre en la plataforma oficial.

## Arrancar

Necesitas [Node.js](https://nodejs.org) (versión 20 o superior).

```
npm install
npm start
```

También vale `iniciar.bat` (Windows) o `./iniciar.sh` (macOS/Linux): instalan la primera vez y arrancan.

## Activar el catálogo (1 minuto, gratis)

1. Crea una cuenta en [themoviedb.org](https://www.themoviedb.org) y pide una clave en *Ajustes → API*.
2. En MiFlix: **Ajustes → Guardar y probar**, y pega la clave (sirve la clave v3 o el token v4).

Sin clave la app funciona igual con cine libre y biblioteca local. La clave se guarda cifrada con el sistema (Keychain, DPAPI o similar) cuando está disponible.

En Ajustes → *Tus plataformas* marca las que tienes contratadas y la portada mostrará una fila con lo que ofrecen.

## Biblioteca local

Ajustes o *Mi biblioteca* → **Añadir carpeta**. Reconoce `Pelicula.2019.1080p.mkv`, `Serie.S01E02.mp4` y `Serie/Temporada 1/S01E02.mp4`. Subtítulos: `mismo-nombre.es.srt` junto al vídeo.

Formatos: se reproducen dentro de la app los que lee Chromium (mp4/H.264, webm, la mayoría de mkv con H.264/AAC). Si un archivo no se puede (p. ej. HEVC o AVI antiguos), el aviso ofrece abrirlo con el reproductor del sistema.

Atajos del reproductor: `Espacio` pausa, `←/→` ±10 s, `↑/↓` volumen, `F` pantalla completa, `M` silencio, `Esc` salir. En cualquier sitio: `/` o `Ctrl+K` para buscar.

## Qué se guarda y dónde

Todo en la carpeta de datos de la app (`miflix.json`): tu lista, historial, carpetas y clave; en la subcarpeta `cache`, la última lista de canales y la de cine libre para arrancar rápido y funcionar sin conexión. Nada sale de tu equipo salvo las consultas a TMDB, Internet Archive, la lista de iptv-org y la de public-domain-free-imdb (alojada en GitHub), y el vídeo de los canales que abras.

## Límites

- Netflix, Prime Video, Disney+, RTVE Play, etc. llevan protección (DRM) o condiciones que impiden reproducirlas dentro de otra app: MiFlix te dice dónde está cada título y abre la plataforma.
- La disponibilidad viene de JustWatch a través de TMDB y puede ir con retraso. «Todo lo gratis» abarca lo que ese catálogo lista como gratuito en España (TMDB limita la paginación a 500 páginas) más las colecciones de Internet Archive; no es un rastreo de toda la web.
- **En directo**: la lista es comunitaria. Cada canal publica su propia señal, que a veces falla, cambia sin aviso o solo funciona en España (marcada «Geolimitado»). MiFlix no aloja nada; usa la lista que iptv-org ya genera sin los canales retirados por reclamación. Mientras ves un canal, la app añade a sus peticiones de vídeo el Referer y el User-Agent que ese canal pide.
- **Libres verificadas**: «dominio público» depende de cada país y la lista no distingue la ley española. Solo se usan sus listas de mejor correspondencia (Wikidata y revisión manual); la de búsqueda automática de Internet Archive (~25.000 entradas) se deja fuera por fiable a medias.
- Las plataformas gratuitas (RTVE Play, Pluto TV, Atresplayer…) se abren en su web oficial: MiFlix te dice dónde está cada título, pero no reproduce su vídeo.
- Internet Archive: comprueba la licencia de cada título si vas a reutilizarlo.

## Pruebas

```
npm test        # lógica: nombres de archivo, TMDB, Internet Archive, biblioteca, Range, canales en directo y cine libre verificado
```

La interfaz se probó en un Electron real con datos simulados (`test/mock-fetch.js`): recorrido de todas las vistas, reproducción de vídeo local con seek, subtítulos, reanudar y siguiente episodio, y canales en directo contra un servidor HLS local que exige Referer y no envía CORS (hace falta `ffmpeg` para generarlo). Lanzarla: `MIFLIX_MOCK=1 npm start` muestra la app con datos de ejemplo sin red ni clave.

## Crear instalador

`npm run dist` (usa electron-builder; genera .exe/.dmg/.AppImage según tu sistema).

## Créditos

Este producto usa la API de TMDB pero no está avalado ni certificado por TMDB. Disponibilidad: JustWatch. Cine libre: Internet Archive y la lista public-domain-free-imdb (Petter Reinholdtsen, dominio público/CC0). Canales: iptv-org/iptv. Reproducción HLS: [hls.js](https://github.com/video-dev/hls.js) 1.7.4 (Apache-2.0, en `renderer/vendor/`). Tipografías: Bricolage Grotesque e Instrument Sans (SIL OFL).
