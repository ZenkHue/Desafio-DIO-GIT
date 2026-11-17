const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/thermal.js');
const P = require('../js/placement.js');

function cenario(extra = {}, itens = [], cap) {
  const r = T.calcular(extra);
  const e = r.entrada;
  const s = P.sugerir(e, { capacidade: cap || r.equipamento.capacidade, alcance: r.equipamento.alcance, itens, cargas: r.porSuperficie });
  return { r, e, s };
}

test('gera candidatos ordenados por nota, entre 0 e 100', () => {
  const { s } = cenario({}, P.itensPadrao(4, 5));
  assert.ok(s.candidatos.length > 10);
  for (let i = 0; i < s.candidatos.length; i++) {
    const c = s.candidatos[i];
    assert.ok(c.nota >= 0 && c.nota <= 100, `nota ${c.nota}`);
    if (i) assert.ok(s.candidatos[i - 1].nota >= c.nota);
  }
  assert.equal(s.melhor, s.candidatos[0]);
});

test('porParede traz no máximo uma opção por parede, a melhor de cada', () => {
  const { s } = cenario({}, P.itensPadrao(4, 5));
  const paredes = s.porParede.map((c) => c.parede);
  assert.equal(new Set(paredes).size, paredes.length);
  for (const c of s.porParede) {
    const melhorDaParede = s.candidatos.find((x) => x.parede === c.parede);
    assert.equal(c.nota, melhorDaParede.nota);
  }
});

test('nenhum candidato fica sobre a janela da mesma parede', () => {
  const { s, e } = cenario({ paredes: { O: { janela: { largura: 2, altura: 1.2, pos: 0.5, peitoril: 1.0 } } } });
  const larg = P.larguraUnidade(12000);
  for (const c of s.candidatos.filter((x) => x.parede === 'O')) {
    const centro = 0.5 * e.ambiente.comprimento;
    assert.ok(Math.abs(c.s - centro) >= 1 + larg / 2 + 0.05, `candidato s=${c.s} sobre a janela`);
  }
});

test('parede externa pontua mais em instalação que parede interna', () => {
  const { s } = cenario({ paredes: { N: { tipo: 'externa' }, S: { tipo: 'interna_nc' }, L: { tipo: 'interna_c' } } });
  const nota = (k) => s.candidatos.find((c) => c.parede === k).partes.instalacao;
  assert.ok(nota('N') > nota('S'));
  assert.ok(nota('S') > nota('L'));
  assert.ok(s.candidatos.find((c) => c.parede === 'N').condensadora, 'externa tem condensadora');
  assert.equal(s.candidatos.find((c) => c.parede === 'S').condensadora, null);
});

test('condensadora na fachada sul é preferida à oeste (sol da tarde)', () => {
  const { s } = cenario({ paredes: { S: { tipo: 'externa' }, O: { tipo: 'externa' } } });
  const i = (k) => s.candidatos.find((c) => c.parede === k).partes.instalacao;
  assert.ok(i('S') > i('O'));
});

test('jato direto sobre a cama reduz a nota de conforto', () => {
  const sem = cenario({}, []).s;
  // cama a ~2,5 m à frente da parede Norte, centrada
  const com = cenario({}, [{ tipo: 'cama', x: 2, z: 3.0, rot: 0 }]).s;
  const norteSem = sem.candidatos.find((c) => c.parede === 'N' && c.t === 0.5);
  const norteCom = com.candidatos.find((c) => c.parede === 'N' && c.t === 0.5);
  assert.ok(norteCom.partes.conforto < norteSem.partes.conforto);
  assert.ok(norteCom.alertas.some((a) => /cama/i.test(a)));
});

test('exposição ao jato: móvel à frente é exposto; ao lado ou atrás da unidade, não', () => {
  const unidade = { x: 3, z: 0 };
  const jatoSul = { x: 0, z: 1 };
  assert.ok(P.exposicao({ tipo: 'mesa', x: 3, z: 3, rot: 0 }, unidade, jatoSul, 7) > 0.5, 'à frente');
  assert.equal(P.exposicao({ tipo: 'mesa', x: 0.7, z: 0.5, rot: 0 }, unidade, jatoSul, 7), 0, 'ao lado da parede');
  assert.equal(P.exposicao({ tipo: 'mesa', x: 3, z: 6, rot: 0 }, unidade, jatoSul, 3), 0, 'além do alcance útil');
});

test('porta próxima penaliza o layout', () => {
  const { s } = cenario({ porta: { parede: 'S', pos: 0.5, largura: 0.8 } });
  const perto = s.candidatos.find((c) => c.parede === 'S' && Math.abs(c.t - 0.7) < 0.01);
  const longe = s.candidatos.find((c) => c.parede === 'N' && Math.abs(c.t - 0.5) < 0.01);
  assert.ok(perto.alertas.some((a) => /porta/i.test(a)));
  assert.ok(perto.partes.layout < longe.partes.layout);
});

test('cobertura cai quando o alcance é menor que a profundidade', () => {
  const a = P.cobertura({ x: 2, z: 0 }, { x: 0, z: 1 }, 9, 4, 8);
  const b = P.cobertura({ x: 2, z: 0 }, { x: 0, z: 1 }, 4, 4, 8);
  assert.ok(a > b);
  assert.ok(a > 0.9);
});

test('dominante é a parede externa de maior carga', () => {
  const { s } = cenario({ paredes: { O: { janela: { largura: 2.5 } }, N: { janela: { largura: 0 } } } });
  assert.equal(s.dominante.parede, 'O');
});

test('manterDentro mantém o móvel dentro do ambiente', () => {
  const it = P.manterDentro({ tipo: 'cama', x: -3, z: 99, rot: 0 }, 4, 5);
  assert.ok(it.x >= 0.8 && it.z <= 5 - 1.0);
});

test('ambiente estreito: paredes curtas demais não geram candidatos', () => {
  const { s } = cenario({ ambiente: { largura: 1.3, comprimento: 5 } });
  assert.equal(s.candidatos.filter((c) => c.parede === 'N' || c.parede === 'S').length, 0);
  assert.ok(s.candidatos.some((c) => c.parede === 'L' || c.parede === 'O'));
});
