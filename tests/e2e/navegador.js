#!/usr/bin/env node
/*
 * Teste de ponta a ponta: abre as páginas num Chromium de verdade (Playwright) e reprova se houver
 * erro no console, resultado incoerente, controle quebrado, rolagem lateral no celular ou falha offline.
 *
 *   npm run test:e2e            (precisa do pacote "playwright" com o Chromium instalado)
 *
 * Sobe um servidor estático próprio (sem dependências) na raiz do repositório.
 */
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const RAIZ = path.resolve(__dirname, '..', '..');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.md': 'text/markdown; charset=utf-8' };
const ARGS_GL = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

function servidor() {
  return new Promise((ok) => {
    const s = http.createServer((req, res) => {
      const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let arq = path.join(RAIZ, url === '/' ? 'index.html' : url);
      if (!arq.startsWith(RAIZ) || !fs.existsSync(arq) || fs.statSync(arq).isDirectory()) {
        res.writeHead(404);
        return res.end('404');
      }
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(arq)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      fs.createReadStream(arq).pipe(res);
    });
    s.listen(0, '127.0.0.1', () => ok(s));
  });
}

let falhas = 0;
let total = 0;
async function caso(nome, fn) {
  total++;
  try {
    await fn();
    console.log(`ok - ${nome}`);
  } catch (e) {
    falhas++;
    console.log(`FALHOU - ${nome}\n    ${String(e && e.stack ? e.stack : e).split('\n').slice(0, 4).join('\n    ')}`);
  }
}
function garantir(cond, msg) {
  if (!cond) throw new Error(msg);
}

/** Página com coleta de erros de console e de exceções. */
async function abrir(ctx, url) {
  const p = await ctx.newPage();
  p.erros = [];
  p.on('pageerror', (e) => p.erros.push('pageerror: ' + e.message));
  p.on('console', (m) => m.type() === 'error' && p.erros.push('console: ' + m.text()));
  p.on('response', (r) => r.status() >= 400 && p.erros.push(`HTTP ${r.status()}: ${r.url()}`));
  await p.goto(url, { waitUntil: 'load' });
  return p;
}
const estado = (p) => p.evaluate(() => window.__ar && { estado: window.__ar.estado, dim: window.__ar.res.dimensionamento, mercado: window.__ar.res.mercado });

(async () => {
  const srv = await servidor();
  const base = `http://127.0.0.1:${srv.address().port}`;
  const navegador = await chromium.launch({ args: ARGS_GL });
  const ctx = await navegador.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });
  const AR = `${base}/ar-condicionado.html`;

  await caso('salário líquido: calcula sem erros', async () => {
    const p = await abrir(ctx, `${base}/index.html`);
    await p.waitForFunction(() => /R\$/.test(document.getElementById('liquido').textContent));
    await p.fill('#salarioBruto', '3000');
    await p.waitForFunction(() => document.getElementById('liquido').textContent.includes('2.751,40'));
    garantir(!p.erros.length, p.erros.join(' | '));
    await p.close();
  });

  await caso('calculadora de BTUs: carrega, mostra resultado, gráfico e 3D sem erros', async () => {
    const p = await abrir(ctx, AR);
    await p.waitForFunction(() => window.__ar && /BTUs/.test(document.getElementById('btus').textContent));
    garantir((await p.locator('#grafico .barra-h').count()) === 24, 'gráfico deveria ter 24 barras');
    const tem3d = (await p.locator('#viz3d canvas').count()) + (await p.locator('#viz3d .sem-webgl').count());
    garantir(tem3d === 1, '3D (ou aviso sem WebGL) ausente');
    garantir(!p.erros.length, p.erros.join(' | '));
    await p.close();
  });

  await caso('a recomendação nunca fica abaixo do método de mercado', async () => {
    const p = await abrir(ctx, AR);
    await p.waitForFunction(() => window.__ar);
    for (const tipo of ['quarto', 'sala', 'escritorio', 'cozinha', 'loja', 'academia']) {
      await p.evaluate((t) => document.querySelector(`input[name=tipo][value=${t}]`).click(), tipo);
      await p.waitForFunction((t) => window.__ar.estado.tipo === t, tipo);
      const s = await estado(p);
      garantir(s.dim.capacidadeTotal >= s.mercado.capacidade, `${tipo}: ${s.dim.capacidadeTotal} < mercado ${s.mercado.capacidade}`);
      garantir(s.dim.necessarioBTU >= s.mercado.btu - 1, `${tipo}: necessário abaixo do mercado`);
    }
    garantir(!p.erros.length, p.erros.join(' | '));
    await p.close();
  });

  await caso('busca de cidade: acha Salto de Pirapora sem acento e aplica', async () => {
    const p = await abrir(ctx, AR);
    await p.waitForFunction(() => window.__ar);
    await p.click('#cidadeBusca');
    await p.keyboard.type('salto de pira');
    await p.waitForSelector('#cidadeLista li[data-i]');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => window.__ar.estado.cidade === 'ibge:3545308');
    garantir((await p.inputValue('#cidadeBusca')) === 'Salto de Pirapora (SP)', 'nome da cidade no campo');
    // a tela redesenha no próximo quadro: espera o texto da origem do clima
    await p.waitForFunction(() => /Sorocaba/.test(document.getElementById('cidadeInfo').textContent), null, { timeout: 5000 });
    garantir(!p.erros.length, p.erros.join(' | '));
    await p.close();
  });

  await caso('link do cenário abre o mesmo resultado em outra aba', async () => {
    const p = await abrir(ctx, AR);
    await p.waitForFunction(() => window.__ar);
    await p.evaluate(() => document.querySelector('input[name=tipo][value=sala]').click());
    await p.waitForFunction(() => window.__ar.estado.tipo === 'sala');
    const link = await p.evaluate(() => `${location.origin}${location.pathname}#c=${window.Nucleo.codificar(window.__ar.estado)}`);
    const antes = await p.textContent('#btus');
    const p2 = await abrir(ctx, link);
    await p2.waitForFunction(() => window.__ar);
    garantir((await p2.textContent('#btus')) === antes, 'resultado diferente ao abrir o link');
    garantir(!(await p2.evaluate(() => location.hash)), 'o endereço deveria ficar limpo');
    garantir(!p.erros.length && !p2.erros.length, [...p.erros, ...p2.erros].join(' | '));
    await p.close();
    await p2.close();
  });

  for (const largura of [360, 390, 430]) {
    await caso(`celular ${largura}px: sem rolagem lateral e com a barra de resultado`, async () => {
      const m = await navegador.newContext({ viewport: { width: largura, height: 800 }, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });
      const p = await abrir(m, AR);
      await p.waitForFunction(() => window.__ar);
      const larg = await p.evaluate(() => document.documentElement.scrollWidth);
      garantir(larg <= largura, `rolagem lateral: documento com ${larg}px`);
      garantir(await p.isVisible('.barra-fixa'), 'barra fixa de resultado ausente');
      garantir(!p.erros.length, p.erros.join(' | '));
      await m.close();
    });
  }

  await caso('funciona offline depois da primeira visita (PWA)', async () => {
    const c = await navegador.newContext({ viewport: { width: 1000, height: 800 } });
    const p = await abrir(c, AR);
    await p.waitForFunction(() => window.__ar);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.waitForTimeout(1500);
    await c.setOffline(true);
    await p.reload();
    await p.waitForFunction(() => window.__ar && /BTUs/.test(document.getElementById('btus').textContent));
    await p.goto(`${base}/index.html`);
    await p.waitForFunction(() => /R\$/.test(document.getElementById('liquido').textContent));
    await c.close();
  });

  await navegador.close();
  srv.close();
  console.log(`\n${total - falhas}/${total} casos passaram`);
  process.exit(falhas ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
