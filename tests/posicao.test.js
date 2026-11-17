const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../js/ar/nucleo.js');
const P = require('../js/ar/posicao.js');

function sugerir(estado = {}, extra = {}) {
  const r = N.calcular(estado);
  const carga = Object.fromEntries(N.PAREDES.map((k) => [k, r.porSuperficie[k].watts[r.pico.hora]]));
  return P.sugerir(r.entrada, { capacidade: r.dimensionamento.capacidade, alcance: r.dimensionamento.alcance, exposicao: r.exposicao, cargaParede: carga, itens: r.entrada.moveis, ...extra });
}

test('notas entre 0 e 100, em ordem, e uma opção por parede', () => {
  const s = sugerir();
  assert.ok(s.candidatos.length > 5);
  for (let i = 0; i < s.candidatos.length; i++) {
    assert.ok(s.candidatos[i].nota >= 0 && s.candidatos[i].nota <= 100);
    if (i) assert.ok(s.candidatos[i - 1].nota >= s.candidatos[i].nota);
  }
  const ks = s.porParede.map((c) => c.parede);
  assert.equal(new Set(ks).size, ks.length);
  assert.equal(s.melhor, s.candidatos[0]);
});

test('parede que dá para fora ganha em instalação; condensadora prefere o lado sem sol', () => {
  const s = sugerir({ paredes: { A: { tipo: 'externa', sol: 'tarde', janela: { largura: 0 } }, C: { tipo: 'externa', sol: 'nao', porta: { ativa: false } }, B: { tipo: 'climatizada' } } });
  const inst = (k) => s.candidatos.find((c) => c.parede === k).partes.instalacao;
  assert.ok(inst('C') > inst('A'), 'sem sol > sol da tarde');
  assert.ok(inst('A') > inst('D'), 'externa > interna');
  assert.ok(inst('D') > inst('B'), 'interna > vizinho climatizado');
  assert.ok(s.candidatos.find((c) => c.parede === 'A').alertas.some((a) => /sol da tarde/.test(a)));
});

test('não coloca a unidade em cima da janela', () => {
  const s = sugerir({ ambiente: { largura: 4 }, paredes: { A: { janela: { largura: 2, pos: 0.5 } } } });
  for (const c of s.candidatos.filter((x) => x.parede === 'A')) assert.ok(Math.abs(c.s - 2) >= 1 + P.larguraUnidade(12000) / 2);
});

test('evita soprar na cama e ficar sobre a cabeceira', () => {
  const longe = sugerir({ moveis: [] }).candidatos.find((c) => c.parede === 'B' && c.t === 0.5);
  const cama = sugerir({ moveis: [{ tipo: 'cama', x: 1.5, z: 2, rot: 90 }] }).candidatos.find((c) => c.parede === 'B' && c.t === 0.5);
  assert.ok(cama.partes.conforto < longe.partes.conforto);
  assert.ok(cama.alertas.some((a) => /cama/.test(a)));
});

test('porta próxima penaliza o layout', () => {
  const s = sugerir({ paredes: { C: { porta: { ativa: true, pos: 0.5 } } } });
  const perto = s.candidatos.filter((c) => c.parede === 'C');
  assert.ok(perto.every((c) => c.alertas.some((a) => /porta/.test(a))));
});

test('cobertura cai quando o alcance é menor que o ambiente', () => {
  assert.ok(P.cobertura({ x: 2, z: 0 }, { x: 0, z: 1 }, 10, 4, 8) > P.cobertura({ x: 2, z: 0 }, { x: 0, z: 1 }, 4, 4, 8));
});

test('móveis ficam dentro do ambiente e há móveis padrão por tipo', () => {
  const it = P.manterDentro({ tipo: 'cama', x: -5, z: 50, rot: 0 }, 3, 4);
  assert.ok(it.x >= 0.8 && it.z <= 3);
  assert.equal(P.moveisPadrao('quarto', 3, 4)[0].tipo, 'cama');
  assert.equal(P.moveisPadrao('cozinha', 3, 4).length, 0);
});

test('parede curta demais não recebe unidade', () => {
  const s = sugerir({ ambiente: { largura: 1.2, comprimento: 4 } });
  assert.equal(s.candidatos.filter((c) => c.parede === 'A' || c.parede === 'C').length, 0);
});
