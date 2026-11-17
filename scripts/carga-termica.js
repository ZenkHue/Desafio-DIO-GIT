#!/usr/bin/env node
/*
 * CLI da Calculadora de BTUs: usa exatamente o mesmo motor do app (js/ar/nucleo.js e js/ar/posicao.js).
 *
 * Uso:
 *   node scripts/carga-termica.js caso.json            resumo em texto (hora a hora, aparelho, onde instalar, melhorias)
 *   node scripts/carga-termica.js caso.json --json     resultado completo em JSON
 *   node scripts/carga-termica.js --exemplo            imprime um JSON de entrada de exemplo
 *   node scripts/carga-termica.js --link URL           lê o cenário de um link "Copiar link deste cenário" do app
 *   cat caso.json | node scripts/carga-termica.js -    lê da entrada padrão
 *
 * O JSON é parcial: o que faltar usa o padrão (Nucleo.PADRAO em js/ar/nucleo.js). Para aplicar os valores
 * típicos de um tipo de ambiente (quarto, sala, escritorio, cozinha, loja, academia) use "aplicarTipo": "sala".
 */
'use strict';
const fs = require('fs');
const path = require('path');
const N = require('../js/ar/nucleo.js');
const P = require('../js/ar/posicao.js');

const n0 = (n) => Math.round(n).toLocaleString('pt-BR');
const hh = (h) => `${String(h).padStart(2, '0')}h`;

function ler(arg) {
  const txt = arg === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(arg), 'utf8');
  try {
    return JSON.parse(txt);
  } catch (e) {
    console.error(`JSON inválido: ${e.message}`);
    process.exit(1);
  }
}

function preparar(entrada) {
  let e = entrada;
  if (e.aplicarTipo) {
    const t = e.aplicarTipo;
    delete e.aplicarTipo;
    e = N.aplicarTipo(N.mesclar(N.PADRAO, e), t);
    if (!entrada.moveis) e.moveis = P.moveisPadrao(t, N.normalizar(e).ambiente.largura, N.normalizar(e).ambiente.comprimento);
  }
  return e;
}

function analisar(entrada) {
  const res = N.calcular(entrada);
  const carga = Object.fromEntries(N.PAREDES.map((k) => [k, res.porSuperficie[k].watts[res.pico.hora]]));
  const sug = P.sugerir(res.entrada, { capacidade: res.dimensionamento.capacidade, alcance: res.dimensionamento.alcance, exposicao: res.exposicao, cargaParede: carga, itens: res.entrada.moveis });
  return { res, sug, oportunidades: N.oportunidades(entrada) };
}

function texto({ res, sug, oportunidades }) {
  const e = res.entrada;
  const d = res.dimensionamento;
  const L = [];
  L.push(`AMBIENTE   ${e.tipo} ${e.ambiente.largura} × ${e.ambiente.comprimento} m, pé-direito ${e.ambiente.peDireito} m (${n0(res.geometria.area)} m²)`);
  L.push(`CLIMA      ${res.clima.cidade}: máxima ${res.clima.tmax} °C, variação ${res.clima.amp} °C, ${res.clima.ur}% UR · interno ${e.uso.temperatura} °C`);
  L.push(`SOL        ${N.PAREDES.map((k) => `${k}=${e.paredes[k].tipo === 'externa' ? res.exposicao[k] : e.paredes[k].tipo}`).join('  ')}`);
  L.push(`AR LIGADO  ${hh(e.uso.inicio)} às ${hh(e.uso.fim)} (${res.uso.length} h) · construção ${res.massa}`);
  L.push('');
  L.push('HORA A HORA (BTU/h; * = ar ligado)');
  L.push('  ' + res.horas.map((h) => `${hh(h.h)}${h.emUso ? '*' : ' '} ${n0(h.total * N.W_PARA_BTU).padStart(6)}`).reduce((a, s, i) => a + s + ((i + 1) % 6 === 0 ? '\n  ' : '   '), ''));
  L.push(`COMPONENTES NO PIOR HORÁRIO (${hh(res.pico.hora)})`);
  for (const c of res.pico.componentes) L.push(`  ${c.rotulo.padEnd(46)} ${n0(c.total * N.W_PARA_BTU).padStart(7)} BTU/h`);
  L.push('');
  L.push(`CARGA      ${n0(d.cargaPicoBTU)} BTU/h no pico → ${n0(d.necessarioBTU)} BTU/h com margem ${Math.round(d.fatores.margem * 100)}% e rendimento real (${d.fatores.rendimentoTemperatura} × ${d.fatores.rendimentoCalor})`);
  L.push(`APARELHO   ${d.quantidade > 1 ? d.quantidade + ' × ' : ''}${n0(d.capacidade)} BTUs · ${d.tipo} (${d.folga >= 0 ? `folga de ${d.folga}%` : `cobre ${100 + d.folga}% do necessário, dentro da tolerância de 5%`}, alcance ~${d.alcance} m)`);
  for (const o of d.observacoes) L.push(`           ! ${o}`);
  L.push(`LOJAS      ${res.regraLojas.base} BTU/m² + pessoas/eletrônicos = ${n0(res.regraLojas.btu)} → ${n0(res.regraLojas.capacidade)} BTUs`);
  L.push(`ENERGIA    ~${n0(res.energia.kWhMes)} kWh/mês · R$ ${res.energia.custoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês`);
  L.push('');
  L.push('POR QUÊ');
  for (const x of res.explicacoes) L.push(`  - ${x}`);
  L.push('');
  L.push('ONDE INSTALAR (melhor posição por parede)');
  sug.porParede.forEach((c, i) => {
    L.push(`  ${i + 1}. ${c.rotulo} — nota ${c.nota}/100, o ar alcança ${Math.round(c.cobertura * 100)}%${c.tubulacao ? ', tubulação ~' + c.tubulacao + ' m' : ''}`);
    for (const m of c.motivos) L.push(`       + ${m}`);
    for (const a of c.alertas) L.push(`       ! ${a}`);
  });
  if (oportunidades.length) {
    L.push('');
    L.push('COMO REDUZIR');
    for (const o of oportunidades) L.push(`  - ${o.titulo}: −${n0(o.reducaoBTU)} BTU/h (${o.reducaoPct}%)${o.reduzCapacidade ? ` → aparelho de ${n0(o.novaCapacidade)}` : ''}`);
  }
  return L.join('\n');
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--ajuda') || args.includes('-h')) {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^#!.*\n/, '').replace(/^\/\*\n?/m, ''));
  process.exit(args.length ? 0 : 1);
}
if (args.includes('--exemplo')) {
  console.log(fs.readFileSync(path.join(__dirname, 'exemplos', 'quarto.json'), 'utf8'));
  process.exit(0);
}
let entrada;
const iLink = args.indexOf('--link');
if (iLink >= 0) {
  const url = args[iLink + 1] || '';
  const m = url.match(/#c=([A-Za-z0-9_-]+)/);
  entrada = m && N.decodificar(m[1]);
  if (!entrada) {
    console.error('Link sem cenário válido (esperado ...#c=...).');
    process.exit(1);
  }
} else {
  entrada = preparar(ler(args.find((a) => !a.startsWith('--')) || '-'));
}
const r = analisar(entrada);
console.log(args.includes('--json') ? JSON.stringify(r, null, 2) : texto(r));
