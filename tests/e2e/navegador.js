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
  const detalhado = async (p) => {
    await p.click('label:has(input[name=modoApp][value=detalhado])');
    await p.waitForSelector('#detalhado:not([hidden])');
  };
  const proxima = async (p) => p.click('#rapidoContinuar');
  // cada caso começa sem nada salvo (localStorage limpo)
  const novoCtx = () => navegador.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 1 });

  await caso('salário líquido: calcula sem erros', async () => {
    const p = await abrir(ctx, `${base}/index.html`);
    await p.waitForFunction(() => /R\$/.test(document.getElementById('liquido').textContent));
    await p.fill('#salarioBruto', '3000');
    await p.waitForFunction(() => document.getElementById('liquido').textContent.includes('2.751,40'));
    garantir(!p.erros.length, p.erros.join(' | '));
    await p.close();
  });

  await caso('calculadora de BTUs: carrega, mostra resultado, gráfico e 3D sem erros', async () => {
    const p = await abrir(await novoCtx(), AR);
    await p.waitForFunction(() => window.__ar && /BTUs/.test(document.getElementById('btus').textContent));
    garantir((await p.locator('#grafico .barra-h').count()) === 24, 'gráfico deveria ter 24 barras');
    const tem3d = (await p.locator('#viz3d canvas').count()) + (await p.locator('#viz3d .sem-webgl').count());
    garantir(tem3d === 1, '3D (ou aviso sem WebGL) ausente');
    garantir(!p.erros.length, p.erros.join(' | '));
    await p.close();
  });

  await caso('a recomendação nunca fica abaixo do método de mercado', async () => {
    const p = await abrir(await novoCtx(), AR);
    await p.waitForFunction(() => window.__ar);
    await detalhado(p);
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


  await caso('modo rápido: 22 m² de casa, respondendo tudo, chega a 18.000 ou mais', async () => {
    const p = await abrir(await novoCtx(), AR);
    await p.waitForFunction(() => window.__ar);
    garantir(await p.isVisible('#rapido'), 'o modo rápido deveria ser a entrada');
    garantir(/Pergunta 1 de/.test(await p.textContent('#rapidoProgresso')), 'progresso');
    await p.click('[data-resp=comodo][data-v=sala]');
    await proxima(p);
    await p.fill('#rapidoM2', '22');
    await p.click('[data-usar=m2]');
    await p.waitForFunction(() => Math.round(window.Nucleo.normalizar(window.__ar.estado).ambiente.largura * window.Nucleo.normalizar(window.__ar.estado).ambiente.comprimento) === 22);
    await proxima(p);
    await p.click('[data-resp=local][data-v=casa_terrea]');
    await proxima(p);
    await p.click('[data-resp=teto][data-v=laje_telhado]');
    await proxima(p);
    await p.click('[data-resp=sol][data-v=tarde]');
    await proxima(p);
    await p.click('[data-resp=janela][data-v=comum]');
    await proxima(p);
    await p.click('#rapidoCidade');
    await p.keyboard.type('salto de pira');
    await p.waitForSelector('#rapidoCidadeLista li[data-i]');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => window.__ar.estado.cidade === 'ibge:3545308');
    await proxima(p);
    await p.click('[data-resp=horario][data-v=noite]');
    await proxima(p);
    await p.click('[data-rp="1"]');
    await p.click('[data-resp=aparelho][data-v=tv_grande]');
    await p.waitForFunction(() => !window.Nucleo.normalizar(window.__ar.estado).aparelhos.tv_grande);
    await p.click('#rapidoContinuar');
    await p.waitForTimeout(300);
    const s = await estado(p);
    garantir(s.dim.capacidadeTotal >= 18000, `22 m² deu ${s.dim.capacidadeTotal}`);
    garantir(s.dim.capacidadeTotal >= s.mercado.capacidade, 'abaixo do mercado');
    const n = await p.evaluate(() => window.Nucleo.normalizar(window.__ar.estado));
    garantir(n.tipo === 'sala' && n.piso === 'terreo' && n.cobertura.tipo === 'laje_telhado' && n.paredes.A.sol === 'tarde' && n.uso.inicio === 21 && n.pessoas.quantidade === 4, JSON.stringify({ tipo: n.tipo, piso: n.piso, cob: n.cobertura.tipo, sol: n.paredes.A.sol, uso: n.uso, p: n.pessoas }));
    garantir(!n.aparelhos.tv_grande, 'a TV tirada não pode voltar');
    garantir(await p.isHidden('#suposicoes'), 'com tudo respondido não sobra suposição');
    garantir((await p.locator('#tresNumeros li').count()) === 3, 'mostra mercado, cálculo hora a hora e o critério');
    garantir(!p.erros.length, p.erros.join(' | '));
    await p.close();
  });

  await caso('modo rápido: apartamento pula a pergunta do teto e "sem sol" pula a janela', async () => {
    const p = await abrir(await novoCtx(), AR);
    await p.waitForFunction(() => window.__ar);
    await proxima(p); // cômodo
    await proxima(p); // tamanho
    await p.click('[data-resp=local][data-v=apartamento]');
    await proxima(p);
    garantir((await p.locator('[data-resp=sol]').count()) > 0, 'depois de "apartamento" vem o sol, sem o teto');
    await p.click('[data-resp=sol][data-v=nao]');
    await proxima(p);
    garantir((await p.locator('#rapidoCidade').count()) === 1, 'depois de "não bate sol" vem a cidade, sem a janela');
    garantir(/de 7/.test(await p.textContent('#rapidoProgresso')), 'caminho de 7 perguntas');
    garantir(!p.erros.length, p.erros.join(' | '));
    await p.close();
  });

  await caso('busca de cidade no modo detalhado: acha Salto de Pirapora sem acento e aplica', async () => {
    const p = await abrir(await novoCtx(), AR);
    await p.waitForFunction(() => window.__ar);
    await detalhado(p);
    await p.click('#cidadeBusca');
    await p.keyboard.type('salto de pira');
    await p.waitForSelector('#cidadeLista li[data-i]');
    await p.keyboard.press('Enter');
    await p.waitForFunction(() => window.__ar.estado.cidade === 'ibge:3545308');
    garantir((await p.inputValue('#cidadeBusca')) === 'Salto de Pirapora (SP)', 'nome da cidade no campo');
    // a tela redesenha no próximo quadro: espera o texto da origem do clima
    await p.waitForFunction(() => /Sorocaba/.test(document.getElementById('cidadeInfo').textContent), null, { timeout: 5000 });
    await p.click('#cidadeBusca');
    await p.keyboard.type('rio');
    await p.waitForSelector('#cidadeLista li[data-i]');
    garantir(/Rio de Janeiro/.test(await p.textContent('#cidadeLista li[data-i="0"]')), '"rio" deve trazer Rio de Janeiro primeiro');
    await p.keyboard.press('Escape');
    garantir(!p.erros.length, p.erros.join(' | '));
    await p.close();
  });

  await caso('modo detalhado: vírgula funciona, valor impossível é avisado e trocar o cômodo pode ser desfeito', async () => {
    const p = await abrir(await novoCtx(), AR);
    await p.waitForFunction(() => window.__ar);
    await detalhado(p);
    await p.fill('[data-bind="ambiente.largura"]', '4,4');
    await p.fill('[data-bind="ambiente.comprimento"]', '5');
    await p.waitForFunction(() => Math.abs(window.Nucleo.normalizar(window.__ar.estado).ambiente.largura - 4.4) < 1e-9);
    await p.waitForFunction(() => /22,0 m²/.test(document.getElementById('areaInfo').textContent));
    await p.fill('[data-bind="ambiente.peDireito"]', '26');
    await p.waitForFunction(() => !document.getElementById('ajustes').hidden && /Altura do teto/.test(document.getElementById('ajustes').textContent));
    await p.fill('[data-bind="ambiente.peDireito"]', '2,7');
    await p.waitForFunction(() => document.getElementById('ajustes').hidden);
    const antes = await p.evaluate(() => window.__ar.estado.tipo);
    await p.click('label:has(input[name=tipo][value=cozinha])');
    await p.waitForFunction(() => window.__ar.estado.tipo === 'cozinha');
    await p.click('#avisoLink button');
    await p.waitForFunction((t) => window.__ar.estado.tipo === t, antes);
    garantir(!p.erros.length, p.erros.join(' | '));
    await p.close();
  });

  await caso('link do cenário abre o mesmo resultado em outra aba', async () => {
    const p = await abrir(await novoCtx(), AR);
    await p.waitForFunction(() => window.__ar);
    await p.click('[data-resp=comodo][data-v=sala]');
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
