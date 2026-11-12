'use strict';
// Primer arranque real: sin clave y (en el entorno de pruebas) sin red.
const fs = require('fs');
const path = require('path');
const OUT = process.env.MIFLIX_SHOTS || '/tmp/miflix-shots-nokey';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = [];
const check = (n, ok, x) => { results.push({ n, ok: !!ok }); console.log(`${ok ? 'OK  ' : 'FAIL'} ${n}${x ? ' — ' + x : ''}`); };

module.exports = async ({ app, win }) => {
  fs.mkdirSync(OUT, { recursive: true });
  const js = (c) => win.webContents.executeJavaScript(c, true);
  const shot = async (n) => { await sleep(400); fs.writeFileSync(path.join(OUT, n + '.png'), (await win.webContents.capturePage()).toPNG()); };
  try {
    await sleep(3500);
    await shot('A-home-sin-clave');
    check('portada de bienvenida', await js(`!!document.querySelector('.hero.welcome h1')`));
    check('aviso para añadir la clave', await js(`document.body.innerText.includes('Conecta el catálogo de TMDB')`));
    check('fila de cine libre degrada con error y reintento', await js(`!!document.querySelector('.row-error .btn') || !!document.querySelector('.row .card')`));

    await js(`window.__miflix.navigate('movies')`); await sleep(900);
    check('Películas sin clave muestra el aviso', await js(`!!document.querySelector('.notice')`));

    await js(`window.__miflix.navigate('settings')`); await sleep(900);
    await js(`(() => { const i = document.querySelector('input[type=password]'); i.value = 'clave-falsa-123'; document.querySelector('.panel .btn.primary').click(); })()`);
    await sleep(4000);
    await shot('B-ajustes-clave-falsa');
    const status = await js(`document.querySelector('.status')?.textContent`);
    check('clave falsa muestra un error claro', /conectar|reconoce|clave/i.test(status || ''), status);
    check('la clave falsa no se guarda', (await js(`window.__miflix.state.settings.hasKey`)) === false);

    await js(`window.__miflix.navigate('platforms')`); await sleep(500);
    check('plataformas disponibles sin clave', await js(`document.querySelectorAll('.plat').length >= 10`));
    await js(`window.__miflix.navigate('live')`); await sleep(2500);
    await shot('C-en-directo-sin-red');
    check('En directo sin red: error claro con reintento', await js(`document.body.innerText.includes('No se pudo descargar la lista de canales') && [...document.querySelectorAll('.btn')].some(b => b.textContent === 'Reintentar')`));
    await js(`window.__miflix.navigate('list')`); await sleep(500);
    check('Mi lista vacía con mensaje', await js(`document.body.innerText.includes('Tu lista está vacía')`));
    await js(`window.__miflix.navigate('library')`); await sleep(700);
    check('Biblioteca vacía con mensaje', await js(`document.body.innerText.includes('Aún no hay carpetas')`));
  } catch (e) { check('sin excepciones', false, e.stack); }
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} correctas`);
  app.exit(failed ? 1 : 0);
};
