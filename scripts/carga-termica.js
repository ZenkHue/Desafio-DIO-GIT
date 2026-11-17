#!/usr/bin/env node
/*
 * CLI da calculadora térmica: usa exatamente o mesmo motor do app (js/thermal.js e js/placement.js).
 *
 * Uso:
 *   node scripts/carga-termica.js caso.json            resumo em texto
 *   node scripts/carga-termica.js caso.json --json     resultado completo em JSON
 *   node scripts/carga-termica.js --exemplo            imprime um JSON de entrada de exemplo
 *   cat caso.json | node scripts/carga-termica.js -    lê da entrada padrão
 *
 * O JSON de entrada é parcial: o que faltar assume o padrão (veja Termica.PADRAO em js/thermal.js).
 * Campo extra "moveis": [{ "tipo": "cama|mesa|sofa", "x": 1.5, "z": 2, "rot": 0 }] (x = Leste, z = Sul, em metros).
 */
'use strict';
const fs = require('fs');
const path = require('path');
const T = require('../js/thermal.js');
const P = require('../js/placement.js');

const n0 = (n) => Math.round(n).toLocaleString('pt-BR');
const n1 = (n) => (Math.round(n * 10) / 10).toLocaleString('pt-BR');

function ler(arg) {
  const txt = arg === '-' ? fs.readFileSync(0, 'utf8') : fs.readFileSync(path.resolve(arg), 'utf8');
  try {
    return JSON.parse(txt);
  } catch (e) {
    console.error(`JSON inválido: ${e.message}`);
    process.exit(1);
  }
}

function analisar(entrada) {
  const { moveis, ...resto } = entrada;
  const res = T.calcular(resto);
  const e = res.entrada;
  const itens = Array.isArray(moveis) ? moveis : P.itensPadrao(e.ambiente.largura, e.ambiente.comprimento);
  const sug = P.sugerir(e, { capacidade: res.equipamento.capacidade, alcance: res.equipamento.alcance, itens, cargas: res.porSuperficie });
  return { res, sug, equipamento: T.sugerirEquipamento(res), oportunidades: T.oportunidades(resto) };
}

function texto({ res, sug, equipamento, oportunidades }) {
  const t = res.total;
  const L = [];
  L.push(`AMBIENTE  ${res.entrada.ambiente.largura} × ${res.entrada.ambiente.comprimento} m, pé-direito ${res.entrada.ambiente.peDireito} m (${n1(res.geometria.area)} m²)`);
  L.push(`CLIMA     ${res.clima.cidade}: ${res.clima.tbsExt} °C / ${res.clima.urExt}% externo; ${res.clima.tbsInt} °C / ${res.clima.urInt}% interno`);
  L.push('');
  L.push('COMPONENTES                                         W      BTU/h');
  for (const i of [...res.itens].sort((a, b) => b.sensivel + b.latente - (a.sensivel + a.latente))) {
    const w = i.sensivel + i.latente;
    L.push(`  ${i.rotulo.padEnd(46)} ${n0(w).padStart(6)} ${n0(w * T.W_PARA_BTU).padStart(8)}`);
  }
  L.push(`  ${'Subtotal'.padEnd(46)} ${n0(t.subtotal).padStart(6)} ${n0(t.subtotal * T.W_PARA_BTU).padStart(8)}`);
  L.push(`  ${('Margem de segurança (' + Math.round(res.entrada.seguranca * 100) + '%)').padEnd(46)} ${n0(t.seguranca).padStart(6)} ${n0(t.seguranca * T.W_PARA_BTU).padStart(8)}`);
  L.push('');
  L.push(`CARGA     ${n0(t.btu)} BTU/h = ${t.kW} kW = ${t.tr} TR  (${n0(t.btuPorM2)} BTU/h·m², calor sensível ${Math.round(t.shr * 100)}%)`);
  L.push(`REGRA     600 BTU/h·m² (+pessoas/equipamentos) daria ${n0(res.regraPratica.btu)} BTU/h`);
  const q = res.equipamento;
  L.push(`EQUIP.    ${q.quantidade > 1 ? q.quantidade + ' × ' : ''}${n0(q.capacidade)} BTU/h · ${equipamento.tipo} (folga ${q.folga}%, alcance ~${q.alcance} m)`);
  for (const o of equipamento.observacoes) L.push(`          ! ${o}`);
  L.push(`ENERGIA   ~${n0(res.energia.kWhMes)} kWh/mês · R$ ${res.energia.custoMes.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}/mês`);
  L.push('');
  L.push('ONDE INSTALAR (melhor posição por parede)');
  sug.porParede.forEach((c, i) => {
    L.push(`  ${i + 1}. ${c.rotulo} — nota ${c.nota}/100, cobertura ${Math.round(c.cobertura * 100)}%${c.tubulacao ? ', tubulação ~' + c.tubulacao + ' m' : ''}`);
    for (const m of c.motivos) L.push(`       + ${m}`);
    for (const a of c.alertas) L.push(`       ! ${a}`);
  });
  if (oportunidades.length) {
    L.push('');
    L.push('COMO REDUZIR A CARGA');
    for (const o of oportunidades) L.push(`  - ${o.titulo}: −${n0(o.reducaoBTU)} BTU/h (${o.reducaoPct}%)`);
  }
  return L.join('\n');
}

const args = process.argv.slice(2);
if (!args.length || args.includes('--ajuda') || args.includes('-h')) {
  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].replace(/^\/\*\n?/m, '').replace(/^#!.*\n/, ''));
  process.exit(args.length ? 0 : 1);
}
if (args.includes('--exemplo')) {
  console.log(JSON.stringify({
    ambiente: { largura: 4, comprimento: 5, peDireito: 2.7 },
    clima: { cidade: 'sao-paulo' },
    paredes: { O: { tipo: 'externa', janela: { largura: 1.5, altura: 1.2, vidro: 'comum', protecao: 'nenhuma' } } },
    cobertura: { tipo: 'atico' },
    pessoas: { quantidade: 2, atividade: 'escritorio' },
    equipamentos: [{ nome: 'Notebook', qtd: 1, watts: 65 }],
    moveis: [{ tipo: 'mesa', x: 2.8, z: 0.5, rot: 0 }, { tipo: 'sofa', x: 1.6, z: 4.5, rot: 0 }],
  }, null, 2));
  process.exit(0);
}
const arquivo = args.find((a) => !a.startsWith('--')) || '-';
const r = analisar(ler(arquivo));
console.log(args.includes('--json') ? JSON.stringify(r, null, 2) : texto(r));
