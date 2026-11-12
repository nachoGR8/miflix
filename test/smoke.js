'use strict';
/**
 * Prueba de humo dentro de Electron (se activa con MIFLIX_SMOKE=<ruta>).
 * Recorre las vistas con datos simulados, hace capturas y comprueba que el vídeo local se reproduce y se puede buscar (seek).
 */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const OUT = process.env.MIFLIX_SHOTS || '/tmp/miflix-shots';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (name, ok, extra) => {
  results.push({ name, ok: Boolean(ok), extra });
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${name}${extra ? ' — ' + extra : ''}`);
};

module.exports = async ({ app, win, store, rescan }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const js = (code) => win.webContents.executeJavaScript(code, true);
  const shot = async (name) => {
    await sleep(500);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(path.join(OUT, name + '.png'), img.toPNG());
  };
  const nav = async (view, wait = 1600) => {
    await js(`window.__miflix.navigate(${JSON.stringify(view)})`);
    await sleep(wait);
  };

  try {
    win.setSize(1360, 860);
    await sleep(1800);
    const errors = [];
    win.webContents.on('console-message', (_e, level, msg) => level >= 3 && errors.push(msg));

    await shot('01-home');
    await js(`document.getElementById('main').scrollTop = 520`);
    await shot('02-home-scrolled');
    check('portada con hero', await js(`!!document.querySelector('.hero h1')`));
    check('portada con filas', await js(`document.querySelectorAll('.row').length >= 3`));

    await nav('movies', 2200);
    await shot('03-movies');
    await nav('series', 1800);
    await nav('free', 2000);
    await shot('04-free');
    await nav('platforms', 800);
    await shot('05-platforms');

    // Explorador de todo lo gratis
    await nav('explore', 2500);
    await shot('05b-explore-tmdb');
    const n1 = await js(`document.querySelectorAll('.grid .card').length`);
    check('explorador: carga páginas de TMDB (múltiplos de 18)', n1 >= 18 && n1 % 18 === 0, String(n1));
    check('explorador: chips de plataformas gratuitas', await js(`[...document.querySelectorAll('.filters .seasons button')].some(b => b.textContent === 'RTVE Play')`));
    await js(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Cargar más').click()`);
    await sleep(1500);
    const n2 = await js(`document.querySelectorAll('.grid .card').length`);
    check('explorador: "Cargar más" añade títulos o ya no hay más', n2 > n1 || (await js(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Cargar más').hidden`)), `${n1} -> ${n2}`);
    await js(`[...document.querySelectorAll('.filters .seasons button')].find(b => b.textContent === 'Series').click()`);
    await sleep(1500);
    check('explorador: cambia a series', (await js(`document.querySelectorAll('.grid .card').length % 8`)) === 0 && (await js(`document.querySelector('.grid .card .card-meta').textContent.includes('Serie')`)));
    await js(`[...document.querySelectorAll('.filters .seasons button')].find(b => b.textContent === 'RTVE Play').click()`);
    await sleep(1200);
    check('explorador: el filtro de plataforma se marca', await js(`document.querySelector('.filters .seasons button.on[data-v="531"]') !== null`));
    await js(`[...document.querySelectorAll('.seasons button')].find(b => b.textContent === 'Cine libre en MiFlix').click()`);
    await sleep(2000);
    await shot('05c-explore-archive');
    check('explorador: cine libre de 36 en 36', [36, 50].includes(await js(`document.querySelectorAll('.grid .card').length`)));
    check('explorador: indica el total', await js(`/Mostrando (36|50) de 50/.test(document.body.innerText)`));
    await js(`document.querySelector('#main').scrollTop = 99999`);
    await sleep(2200);
    check('explorador: el scroll carga la página siguiente sola', (await js(`document.querySelectorAll('.grid .card').length`)) === 50);
    check('explorador: al terminar oculta el botón', await js(`![...document.querySelectorAll('button')].some(b => b.textContent === 'Cargar más' && !b.hidden)`));

    // Canales en directo: servidor HLS local que exige Referer y User-Agent y no envía cabeceras CORS
    const waitFor = async (expr, ms = 15000) => {
      const end = Date.now() + ms;
      while (Date.now() < end) {
        if (await js(expr)) return true;
        await sleep(400);
      }
      return false;
    };
    const clip = process.env.MIFLIX_TEST_MEDIA && path.join(process.env.MIFLIX_TEST_MEDIA, 'Test.Movie.2019.1080p.BluRay.x264.mp4');
    const liveDir = path.join(OUT, 'hls');
    let liveServer = null;
    const hits = [];
    if (clip && fs.existsSync(clip)) {
      fs.rmSync(liveDir, { recursive: true, force: true });
      fs.mkdirSync(liveDir, { recursive: true });
      const ff = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', clip, '-t', '20', '-c:v', 'libx264', '-preset', 'veryfast', '-g', '30', '-c:a', 'aac', '-f', 'hls', '-hls_time', '2', '-hls_list_size', '0', '-hls_segment_filename', path.join(liveDir, 'seg%d.ts'), path.join(liveDir, 'index.m3u8')]);
      check('prueba en directo: se generó el HLS de prueba', ff.status === 0 && fs.existsSync(path.join(liveDir, 'index.m3u8')), ff.stderr && String(ff.stderr).slice(0, 200));
      liveServer = http.createServer((req, res) => {
        const rec = { url: req.url, referer: req.headers.referer || '', ua: req.headers['user-agent'] || '', status: 0 };
        hits.push(rec);
        const end = (code, body, type) => { rec.status = code; res.writeHead(code, type ? { 'content-type': type } : {}); res.end(body); };
        if (req.url.startsWith('/caido/')) return end(404, 'no');
        if (!req.url.startsWith('/directo/')) return end(404, 'no');
        if (rec.referer !== 'https://player.ejemplo.test/' || rec.ua !== 'MiFlixPrueba/1.0') return end(403, 'falta Referer o User-Agent');
        const name = path.basename(req.url.split('?')[0]);
        const f = path.join(liveDir, name);
        if (!fs.existsSync(f)) return end(404, 'no');
        return end(200, fs.readFileSync(f), name.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/mp2t');
      });
      await new Promise((r) => liveServer.listen(0, '127.0.0.1', r));
      process.env.MIFLIX_LIVE_URL = `http://127.0.0.1:${liveServer.address().port}`;
    }

    await nav('live', 2200);
    await shot('15-live');
    const tiles = () => js(`document.querySelectorAll('.chan').length`);
    check('en directo: lista los canales', (await tiles()) === 5, String(await tiles()));
    check('en directo: categorías con contador', await js(`[...document.querySelectorAll('.filters .seasons button')].some(b => b.textContent === 'Noticias 1') && document.querySelector('.filters .seasons button').textContent === 'Todos 5'`));
    await js(`[...document.querySelectorAll('.filters .seasons button')].find(b => b.textContent === 'Noticias 1').click()`);
    await sleep(300);
    check('en directo: filtra por categoría', (await tiles()) === 1 && (await js(`document.querySelector('.chan-name').textContent`)) === 'Noticias 24h');
    await js(`document.querySelector('.filters .seasons button').click()`);
    await js(`(() => { const q = document.querySelector('.filter-row input'); q.value = 'peques'; q.dispatchEvent(new Event('input')); })()`);
    await sleep(300);
    check('en directo: busca por nombre', (await tiles()) === 1 && (await js(`document.querySelector('.chan-name').textContent`)) === 'Canal Peques');
    await js(`(() => { const q = document.querySelector('.filter-row input'); q.value = 'zzzz'; q.dispatchEvent(new Event('input')); })()`);
    await sleep(300);
    check('en directo: sin coincidencias avisa', await js(`document.body.innerText.includes('Ningún canal coincide')`));
    await js(`(() => { const q = document.querySelector('.filter-row input'); q.value = ''; q.dispatchEvent(new Event('input')); })()`);
    await sleep(300);

    if (liveServer) {
      await js(`[...document.querySelectorAll('.chan')].find(c => c.textContent.includes('Canal Prueba')).click()`);
      const playing = await waitFor(`(() => { const v = document.querySelector('.player video'); return !!v && v.currentTime > 1.5 && v.videoWidth > 0; })()`, 30000);
      await shot('16-live-player');
      check('en directo: la señal caída pasa a la siguiente y reproduce por HLS', playing, JSON.stringify(hits.slice(0, 4).map((x) => [x.url, x.status])));
      check('en directo: se intentó primero la señal caída', hits[0] && hits[0].url.startsWith('/caido/'));
      const okHits = hits.filter((x) => x.url.startsWith('/directo/'));
      check('en directo: se enviaron Referer y User-Agent del canal', okHits.length > 2 && okHits.every((x) => x.status === 200), JSON.stringify(okHits.slice(0, 3).map((x) => [x.status, x.referer, x.ua])));
      check('en directo: el título indica emisión y calidad', (await js(`document.querySelector('.player-title span')?.textContent`)) === 'En directo, 576p');
      await js(`window.__miflix.closePlayer()`);
      await sleep(600);
      check('en directo: al salir se cierra el reproductor', await js(`!document.querySelector('.player')`));
    }

    // Un canal sin señal que responda: mensaje claro y reintento
    await js(`[...document.querySelectorAll('.chan')].find(c => c.textContent.includes('Noticias 24h')).click()`);
    const failed = await waitFor(`!!document.querySelector('.player-msg')`, 30000);
    await shot('17-live-error');
    check('en directo: sin señal muestra el aviso con reintento', failed && (await js(`document.querySelector('.player-msg').innerText.includes('Ninguna señal') && [...document.querySelectorAll('.player-msg .btn')].some(b => b.textContent === 'Reintentar')`)));
    await js(`window.__miflix.closePlayer()`);
    await sleep(400);

    // Explorador: libres verificadas
    await nav('explore', 1500);
    await js(`[...document.querySelectorAll('.seasons button')].find(b => b.textContent === 'Libres verificadas').click()`);
    await sleep(2200);
    await shot('05d-explore-verified');
    check('verificadas: primera página de 36', [36, 61].includes(await js(`document.querySelectorAll('.grid .card').length`)));
    check('verificadas: indica el total', await js(`/Mostrando (36|61) de 61/.test(document.body.innerText)`));
    check('verificadas: las tarjetas llevan la insignia «Verificada»', await js(`[...document.querySelectorAll('.grid .card .badge')].every(b => b.textContent === 'Verificada') && document.querySelectorAll('.grid .card .badge').length > 0`));
    check('verificadas: explica el origen de la lista', await js(`document.body.innerText.includes('public-domain-free-imdb')`));
    await js(`document.querySelector('#main').scrollTop = 99999`);
    await sleep(2200);
    check('verificadas: el scroll llega a las 61', (await js(`document.querySelectorAll('.grid .card').length`)) === 61);
    await js(`[...document.querySelectorAll('.filters .seasons button')].find(b => b.textContent === 'Hasta 1929').click()`);
    await sleep(1500);
    check('verificadas: filtra por época', await js(`/Mostrando 26 de 26/.test(document.body.innerText) && document.querySelectorAll('.grid .card').length === 26`));
    await js(`document.querySelector('.grid .card').click()`);
    await sleep(1800);
    await shot('08b-detail-verified');
    check('verificadas: la ficha usa la sinopsis de TMDB y se puede reproducir', await js(`document.querySelector('.m-body .lead')?.textContent.includes('Sinopsis en español') && !!document.querySelector('.m-body .btn.primary')`));
    await js(`document.querySelector('.modal-close').click()`);

    // Ficha de película TMDB
    await nav('movies', 2000);
    await js(`document.querySelector('.card').click()`);
    await sleep(1400);
    await shot('06-detail-movie');
    check('ficha con "dónde verla"', await js(`document.querySelector('.m-section h3')?.textContent.includes('Dónde')`));
    check('ficha con proveedores', await js(`document.querySelectorAll('.prov-group .chip').length >= 3`));
    await js(`document.querySelector('.modal-close').click()`);

    // Ficha de serie con episodios
    await nav('series', 1800);
    await js(`document.querySelector('.card').click()`);
    await sleep(1800);
    await js(`document.querySelector('.modal').scrollIntoView(); document.querySelector('.overlay').scrollTop = 520`);
    await shot('07-detail-series');
    check('serie con temporadas y episodios', await js(`document.querySelectorAll('.seasons button').length === 3 && document.querySelectorAll('.ep').length === 8`));
    await js(`document.querySelector('.modal-close').click()`);

    // Ficha de Internet Archive
    await nav('free', 1800);
    await js(`document.querySelector('.card').click()`);
    await sleep(1200);
    await shot('08-detail-archive');
    check('ficha de cine libre con botón de reproducir', await js(`!!document.querySelector('.m-body .btn.primary')`));
    await js(`document.querySelector('.modal-close').click()`);

    // Búsqueda
    await js(`(() => { const q = document.getElementById('q'); q.value = 'noche'; q.dispatchEvent(new Event('input')); })()`);
    await sleep(2200);
    await shot('09-search');
    check('búsqueda devuelve resultados', await js(`document.querySelectorAll('.grid .card').length >= 1`));
    await js(`document.getElementById('q').value = ''`);

    // Ajustes
    await nav('settings', 1500);
    await shot('10-settings');
    check('ajustes con plataformas', await js(`document.querySelectorAll('.prov').length >= 5`));

    // Biblioteca local
    const media = process.env.MIFLIX_TEST_MEDIA;
    if (media) {
      const lib = store.get('library');
      store.set('library', { ...lib, folders: [media] });
      const state = await rescan();
      check('escaneo encuentra 3 archivos', state.count === 3, `count=${state.count}`);
      const shows = state.entries.filter((e) => e.type === 'tv');
      check('agrupa la serie con 2 episodios', shows.length === 1 && shows[0].episodes.length === 2, JSON.stringify(shows.map((s) => [s.title, s.episodes.length])));
      const movie = state.entries.find((e) => e.type === 'movie');
      check('parsea película con año', movie && /Test Movie/i.test(movie.title) && movie.year === 2019, movie && `${movie.title} (${movie.year})`);

      await js(`window.__miflix.state.library = ${JSON.stringify(state)}`);
      await sleep(1500); // deja que termine el enriquecimiento simulado
      await nav('library', 1500);
      await shot('11-library');

      // Reproducción real con el protocolo media:// y Range
      const fileId = movie.fileId;
      await js(`window.__miflix.playLocal(window.__miflix.state.library.entries.find(e => e.fileId === ${JSON.stringify(fileId)}), ${JSON.stringify(fileId)}, 0)`);
      await sleep(2500);
      const info = await js(`(() => { const v = document.querySelector('.player video'); return v ? { ready: v.readyState, dur: v.duration, err: v.error && v.error.code, tracks: v.querySelectorAll('track').length } : null; })()`);
      check('el vídeo carga (readyState>=2)', info && info.ready >= 2, JSON.stringify(info));
      check('duración detectada', info && info.dur > 4, info && String(info.dur));
      await js(`document.querySelector('.player video').currentTime = 4`);
      await sleep(1200);
      const seek = await js(`(() => { const v = document.querySelector('.player video'); return { t: v.currentTime, ready: v.readyState, seeking: v.seeking }; })()`);
      check('seek funciona (Range)', seek.t >= 3.9 && seek.ready >= 2 && !seek.seeking, JSON.stringify(seek));
      await shot('12-player');

      // Progreso: guardar a los 20 s, aparecer en "Seguir viendo" y reanudar desde ahí
      await js(`document.querySelector('.player video').currentTime = 20`);
      await sleep(1200);
      await js(`document.querySelector('.player video').pause()`);
      await sleep(800);
      await js(`window.__miflix.closePlayer()`);
      await sleep(1800);
      await nav('home', 1800);
      await shot('13-home-continue');
      check('aparece "Seguir viendo"', await js(`[...document.querySelectorAll('.row-head h2')].some(h => h.textContent === 'Seguir viendo')`));
      await js(`[...document.querySelectorAll('.row')].find(r => r.querySelector('h2')?.textContent === 'Seguir viendo').querySelector('.card').click()`);
      await sleep(2500);
      const resumed = await js(`document.querySelector('.player video')?.currentTime`);
      check('reanuda cerca de los 20 s', resumed > 19 && resumed < 24, String(resumed));
      await js(`window.__miflix.closePlayer()`);
      await sleep(600);

      // Reproducción de episodio con subtítulos
      await js(`window.__miflix.closePlayer()`);
      const show = shows[0];
      const ep1 = show.episodes[0];
      await js(`window.__miflix.playLocal(window.__miflix.state.library.entries.find(e => e.id === ${JSON.stringify(show.id)}), ${JSON.stringify(ep1.fileId)}, 0)`);
      await sleep(2500);
      const sub = await js(`(() => { const v = document.querySelector('.player video'); const t = v && v.textTracks[0]; return { n: v ? v.textTracks.length : -1, label: t && t.label, lang: t && t.language, mode: t && t.mode, sub: document.querySelector('.player-title span')?.textContent }; })()`);
      check('subtítulos .srt cargados', sub.n === 1 && sub.lang === 'es', JSON.stringify(sub));

      // Fin del episodio: ofrece el siguiente y lo reproduce
      await js(`document.querySelector('.player video').currentTime = 7.4`);
      await sleep(2600);
      await shot('14-next-up');
      check('al acabar ofrece el siguiente episodio', await js(`!!document.querySelector('.next-up')`));
      await js(`document.querySelector('.next-up .btn.primary').click()`);
      await sleep(2200);
      const nextSub = await js(`document.querySelector('.player-title span')?.textContent`);
      check('reproduce el episodio 2', nextSub === 'Temporada 1, episodio 2', nextSub);
      await js(`window.__miflix.closePlayer()`);
    }

    check('sin errores de consola', errors.length === 0, errors.slice(0, 3).join(' | '));
  } catch (err) {
    check('la prueba terminó sin excepciones', false, err.stack || err.message);
  }

  fs.writeFileSync(path.join(OUT, 'results.json'), JSON.stringify(results, null, 2));
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} comprobaciones correctas`);
  app.exit(failed ? 1 : 0);
};
