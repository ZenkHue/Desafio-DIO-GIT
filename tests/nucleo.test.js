const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../js/ar/nucleo.js');

const near = (a, b, tol, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} esperado ${b} ± ${tol}, obtido ${a}`);
const SP = N.CIDADES['sao-paulo'];

/* ------------------------------------------------------------------ sol */
test('sol: ao meio-dia de janeiro em São Paulo o sol está quase a pino', () => {
  const s = N.posicaoSol(12, SP.lat);
  near(s.altitude, 86.5, 1, 'altitude');
  assert.ok(s.idn > 800 && s.idn < 1100, `radiação direta ${s.idn}`);
});

test('sol: nasce a leste-sudeste no verão e é simétrico de manhã e de tarde', () => {
  const manha = N.posicaoSol(7, SP.lat);
  const tarde = N.posicaoSol(17, SP.lat);
  assert.ok(manha.azimute > 95 && manha.azimute < 120, `azimute de manhã ${manha.azimute}`);
  near(manha.altitude, tarde.altitude, 0.01);
  near(manha.azimute + tarde.azimute, 360, 0.01);
  assert.equal(N.posicaoSol(2, SP.lat).idn, 0, 'à noite não há sol');
});

test('sol: parede oeste só recebe sol direto à tarde e a leste só de manhã', () => {
  const s9 = N.posicaoSol(9, SP.lat);
  const s16 = N.posicaoSol(16, SP.lat);
  assert.equal(N.radiacaoVertical(s9, 270).direta, 0);
  assert.equal(N.radiacaoVertical(s16, 90).direta, 0);
  assert.ok(N.radiacaoVertical(s16, 270).direta > 400);
  assert.ok(N.radiacaoVertical(s9, 90).direta > 400);
});

test('vidro: sol rasante entra menos (fator angular)', () => {
  assert.equal(N.fatorAngular(1), 1);
  assert.ok(N.fatorAngular(Math.cos((70 * Math.PI) / 180)) < 0.7);
  assert.equal(N.fatorAngular(0), 0);
});

/* ------------------------------------------------------------------ clima e horários */
test('temperatura externa: máxima às 15h e mínima às 5h', () => {
  const r = N.calcular({});
  near(r.horas[15].te, SP.tmax, 0.01);
  near(r.horas[5].te, SP.tmax - SP.amp, 0.01);
  for (const h of r.horas) assert.ok(h.te <= SP.tmax && h.te >= SP.tmax - SP.amp);
});

test('horário de uso: atravessa a meia-noite e "início = fim" vale 24 h', () => {
  assert.deepEqual(N.horasDeUso(21, 7), [21, 22, 23, 0, 1, 2, 3, 4, 5, 6]);
  assert.deepEqual(N.horasDeUso(8, 18).length, 10);
  assert.equal(N.horasDeUso(0, 0).length, 24);
  assert.equal(N.horasDeUso(24, 24).length, 24);
});

/* ------------------------------------------------------------------ física */
test('condução: sem variação de temperatura é U·A·ΔT; com variação, o pico atrasa', () => {
  const plano = new Array(24).fill(30);
  const q = N.conducaoComAtraso(plano, 2, 10, 24, 4);
  for (const v of q) near(v, 2 * 10 * 6, 1e-9);
  const onda = Array.from({ length: 24 }, (_, h) => (h === 15 ? 60 : 30));
  const leve = N.conducaoComAtraso(onda, 2, 10, 24, 0.5);
  const pesada = N.conducaoComAtraso(onda, 2, 10, 24, 6);
  const horaPico = (a) => a.indexOf(Math.max(...a));
  assert.ok(horaPico(pesada) > horaPico(leve), 'parede pesada atrasa o pico');
  assert.ok(Math.max(...pesada) < Math.max(...leve), 'e amortece');
});

test('RTS: cada série soma 1 e a convolução preserva o total do dia', () => {
  for (const serie of Object.values(N.RTS)) near(serie.reduce((a, b) => a + b, 0), 1, 1e-9);
  const ganho = Array.from({ length: 24 }, (_, h) => (h >= 12 && h <= 16 ? 500 : 0));
  const carga = N.aplicarRTS(ganho, N.RTS.media);
  near(carga.reduce((a, b) => a + b, 0), ganho.reduce((a, b) => a + b, 0), 1e-6);
  assert.ok(Math.max(...carga) < 500, 'o pico é amortecido');
});

test('psicrometria: 23 °C/50% ≈ 8,8 g/kg', () => {
  near(N.umidadeAbsoluta(23, 50), 8.8, 0.1);
});

/* ------------------------------------------------------------------ sol nas paredes */
test('exposição: modo "sol" usa o que a pessoa vê; modo bússola deduz pela orientação', () => {
  const e = N.normalizar({ paredes: { A: { tipo: 'externa', sol: 'naosei' }, B: { tipo: 'externa', sol: 'manha' } } });
  assert.equal(N.exposicaoParede(e, 'A'), 'tarde', '"não sei" é tratado como sol da tarde (conservador)');
  assert.equal(N.exposicaoParede(e, 'B'), 'manha');
  assert.equal(N.exposicaoParede(e, 'C'), 'nao', 'parede interna não pega sol');
  const b = N.normalizar({ orientacao: { modo: 'bussola', paredeA: 'N' }, paredes: { A: { tipo: 'externa' }, B: { tipo: 'externa' }, C: { tipo: 'externa' }, D: { tipo: 'externa', sombra: true } } });
  assert.equal(N.azimuteParede(b, 'B'), 90);
  assert.equal(N.exposicaoParede(b, 'B'), 'manha', 'A virada ao norte → B a leste');
  assert.equal(N.exposicaoParede(b, 'D'), 'nao', 'parede sombreada');
});

test('sol da tarde pesa mais que nenhum sol, e o pico do sol na janela muda de horário', () => {
  const comSol = (sol) => N.calcular({ paredes: { A: { sol } }, uso: { inicio: 0, fim: 0 } });
  const nao = comSol('nao');
  const tarde = comSol('tarde');
  const manha = comSol('manha');
  assert.ok(tarde.dimensionamento.necessarioBTU > nao.dimensionamento.necessarioBTU);
  const picoJanela = (r) => {
    const sol = r.horas.map((h) => h.grupos.sol);
    return sol.indexOf(Math.max(...sol));
  };
  assert.ok(picoJanela(manha) < 13, `sol da manhã pico às ${picoJanela(manha)}h`);
  assert.ok(picoJanela(tarde) > 13, `sol da tarde pico às ${picoJanela(tarde)}h`);
});

test('proteção externa na janela corta mais que cortina, que corta mais que nada', () => {
  const sol = (protecao) => N.calcular({ paredes: { A: { janela: { protecao } } }, uso: { inicio: 0, fim: 0 } }).pico.total;
  assert.ok(sol('externa') < sol('cortina'));
  assert.ok(sol('cortina') < sol('nenhuma'));
});

test('teto: telha à vista esquenta mais de dia que laje com telhado; andar com ar em cima não gera carga', () => {
  const tarde = (tipo) => N.calcular({ cobertura: { tipo }, uso: { inicio: 13, fim: 17 } }).horas[15].grupos.construcao;
  assert.ok(tarde('telha') > tarde('laje_telhado'));
  assert.ok(tarde('laje_exposta') > tarde('laje_telhado'));
  const r = N.calcular({ cobertura: { tipo: 'apartamento_ar' } });
  assert.equal(r.pico.componentes.find((c) => c.id === 'teto'), undefined);
});

/* ------------------------------------------------------------------ fontes de calor */
test('aparelhos: geladeira funciona 24 h; fogão só nos horários de refeição', () => {
  const r = N.calcular({ aparelhos: { geladeira: 1 }, pessoas: { quantidade: 0 }, uso: { inicio: 9, fim: 10 } });
  const r2 = N.calcular({ aparelhos: { fogao: 1 }, pessoas: { quantidade: 0 }, uso: { inicio: 0, fim: 0 } });
  // fogão: diferença entre 12h (cozinhando) e 15h (não) é grande
  assert.ok(r2.horas[12].total - r2.horas[15].total > 1000);
  assert.ok(r.horas[3].grupos.interno > 0, 'geladeira aquece de madrugada mesmo fora do uso');
});

test('pessoas: mais gente e mais atividade = mais carga (inclui umidade)', () => {
  const p = (quantidade, atividade) => N.calcular({ pessoas: { quantidade, atividade }, uso: { inicio: 0, fim: 0 } }).pico;
  assert.ok(p(4, 'sentado').total > p(2, 'sentado').total);
  assert.ok(p(2, 'exercicio').lat > p(2, 'dormindo').lat);
});

/* ------------------------------------------------------------------ partida e dimensionamento */
test('partida: só existe quando o ar não fica ligado 24 h, e o usuário controla quanto pesa', () => {
  assert.equal(N.calcular({ uso: { inicio: 0, fim: 0 } }).partida, null);
  const rapida = N.calcular({ avancado: { partida: 'rapida' } });
  const normal = N.calcular({ avancado: { partida: 'normal' } });
  const nenhuma = N.calcular({ avancado: { partida: 'nenhuma' } });
  assert.ok(rapida.partida.watts > normal.partida.watts);
  assert.equal(nenhuma.partida, null);
  assert.ok(rapida.partida.tempLivre > 23, 'o ambiente desligado fica mais quente que o desejado');
});

test('rendimento do aparelho: 27 °C = etiqueta; 23 °C rende ~10% menos; acima de 35 °C fora também cai', () => {
  const d = (temperatura, cidade = 'sao-paulo') => N.calcular({ uso: { temperatura }, cidade }).dimensionamento.fatores;
  near(d(27).rendimentoTemperatura, 1, 1e-9);
  near(d(23).rendimentoTemperatura, 0.9, 1e-9);
  assert.equal(d(23).rendimentoCalor, 1, 'São Paulo não passa de 35 °C');
  const cuiaba = N.calcular({ cidade: 'cuiaba', uso: { inicio: 14, fim: 16 } }).dimensionamento.fatores;
  assert.ok(cuiaba.rendimentoCalor < 1);
});

test('capacidade comercial: menor aparelho que atende com 5% de tolerância; vários aparelhos acima de 60 mil', () => {
  for (const tipo of Object.keys(N.TIPOS)) {
    const d = N.calcular(N.aplicarTipo({}, tipo)).dimensionamento;
    assert.ok(N.CAPACIDADES.includes(d.capacidade));
    assert.ok(d.capacidadeTotal >= d.necessarioBTU * 0.95 - 1, `${tipo}: ${d.capacidadeTotal} < ${d.necessarioBTU}`);
    const menor = N.CAPACIDADES[N.CAPACIDADES.indexOf(d.capacidade) - 1];
    if (menor && d.quantidade === 1) assert.ok(menor < d.necessarioBTU * 0.95, `${tipo}: caberia ${menor}`);
  }
  const grande = N.calcular({ ambiente: { largura: 15, comprimento: 15, peDireito: 3.5 }, pessoas: { quantidade: 60, atividade: 'exercicio' }, cobertura: { tipo: 'telha' } }).dimensionamento;
  assert.ok(grande.quantidade >= 2);
});

test('regra das lojas: 600 BTU/m² (800 com sol da tarde) + 600 por pessoa extra e por eletrônico', () => {
  const r = N.calcular({ ambiente: { largura: 3, comprimento: 4 }, pessoas: { quantidade: 3 }, aparelhos: { tv: 1, notebook: 1, geladeira: 1 } });
  assert.equal(r.regraLojas.base, 800);
  assert.equal(r.regraLojas.btu, 12 * 800 + 600 * 2 + 600 * 2, 'geladeira não conta como eletrônico');
  const semSol = N.calcular({ paredes: { A: { sol: 'manha' } } });
  assert.equal(semSol.regraLojas.base, 600);
});

/* ------------------------------------------------------------------ cenários de referência (regressão) */
test('cenários típicos ficam no tamanho esperado', () => {
  const cap = (e) => N.calcular(e).dimensionamento.capacidadeTotal;
  assert.equal(cap({}), 12000, 'quarto 3×4 com sol da tarde, ar à noite');
  assert.equal(cap({ paredes: { A: { sol: 'nao' } } }), 9000, 'quarto 3×4 sem sol');
  const sala = N.aplicarTipo({ ambiente: { largura: 4, comprimento: 5, peDireito: 2.7 }, paredes: { A: { janela: { largura: 2 } } } }, 'sala');
  assert.equal(cap(sala), 18000, 'sala 4×5 com sol da tarde');
  assert.ok(cap({ ...sala, cobertura: { tipo: 'laje_exposta' } }) > cap(sala), 'último andar pede mais');
});

/* ------------------------------------------------------------------ "e se?" */
test('consultor: melhorias ordenadas e coerentes com o recálculo', () => {
  // ar ligado 24 h: o pico é o sol da tarde (sem a carga de partida), onde o toldo faz mais diferença
  const e = { cobertura: { tipo: 'telha' }, piso: 'terreo', uso: { inicio: 0, fim: 0 }, paredes: { A: { janela: { largura: 1.5 } } } };
  const ops = N.oportunidades(e);
  assert.ok(ops.length >= 3);
  for (let i = 1; i < ops.length; i++) assert.ok(ops[i - 1].reducaoBTU >= ops[i].reducaoBTU);
  assert.ok(ops.some((o) => o.id === 'forro'));
  assert.ok(ops.some((o) => o.id === 'toldo-A'));
  const toldo = ops.find((o) => o.id === 'toldo-A');
  const antes = N.calcular(e).dimensionamento.necessarioBTU;
  const depois = N.calcular(N.mesclar(e, { paredes: { A: { janela: { protecao: 'externa' } } } })).dimensionamento.necessarioBTU;
  near(toldo.reducaoBTU, antes - depois, 1);
});

/* ------------------------------------------------------------------ robustez */
test('entradas inválidas não geram NaN', () => {
  const r = N.calcular({
    ambiente: { largura: 'abc', comprimento: -1, peDireito: 99 },
    cidade: 'atlantida',
    pessoas: { quantidade: '-3', atividade: 'voar' },
    aparelhos: { tv: 'dois', inexistente: 3 },
    extras: [{ nome: 'x', watts: 'mil' }, null],
    uso: { inicio: 'x', fim: 99, temperatura: 'frio' },
    paredes: { A: { tipo: 'externa', sol: 'lua', janela: { largura: 99, altura: 99, peitoril: 99, pos: 'meio' } } },
    clima: { tmax: 'quente', amp: '', ur: 500 },
  });
  for (const v of [r.pico.total, r.dimensionamento.necessarioBTU, r.energia.kWhMes, ...r.horas.map((h) => h.total)]) assert.ok(Number.isFinite(v), String(v));
  const j = r.entrada.paredes.A.janela;
  assert.ok(j.peitoril + j.altura <= r.entrada.ambiente.peDireito);
});

test('janela e porta na mesma parede não se sobrepõem', () => {
  const e = N.normalizar({ paredes: { A: { janela: { largura: 1.5, pos: 0.5 }, porta: { ativa: true, largura: 0.8, pos: 0.5 } } } });
  const len = e.ambiente.largura;
  const j = e.paredes.A.janela;
  const d = e.paredes.A.porta;
  const disjunto = d.pos * len + d.largura / 2 <= j.pos * len - j.largura / 2 + 1e-9 || d.pos * len - d.largura / 2 >= j.pos * len + j.largura / 2 - 1e-9;
  assert.ok(disjunto);
});

test('link do cenário: codifica e decodifica (com acentos) e rejeita lixo', () => {
  const estado = N.aplicarTipo({ extras: [{ nome: 'Máquina de café', watts: 900 }] }, 'cozinha');
  const volta = N.decodificar(N.codificar(estado));
  assert.deepEqual(volta, JSON.parse(JSON.stringify(estado)));
  assert.equal(N.decodificar('%%%nada'), null);
});

test('tipos de ambiente aplicam pessoas, horário e aparelhos típicos', () => {
  const q = N.aplicarTipo({}, 'escritorio');
  assert.equal(q.tipo, 'escritorio');
  assert.equal(q.uso.inicio, 8);
  assert.equal(q.uso.fim, 18);
  assert.equal(q.aparelhos.pc, 1);
});

/* ------------------------------------------------------------------ cidades */
const M = require('../js/ar/municipios.js');

test('municípios: base completa e busca sem acento, com ou sem UF', () => {
  assert.ok(M.LISTA.length >= 5570);
  for (const m of M.LISTA) assert.ok(Number.isFinite(m.lat) && Number.isFinite(m.lon) && m.uf.length === 2, m.nome);
  assert.equal(M.buscar('salto de pirapora')[0].codigo, 3545308);
  assert.equal(M.buscar('SAO PAULO')[0].nome, 'São Paulo');
  assert.equal(M.buscar('Salto/SP')[0].nome, 'Salto');
  assert.ok(M.buscar('Pirapora').some((m) => m.uf === 'MG'));
  assert.deepEqual(M.buscar('cidade que nao existe'), []);
});

test('cidade: aceita referência, código IBGE e nome; inválida volta para São Paulo', () => {
  assert.equal(N.resolverCidade('sao-paulo'), 'sao-paulo');
  assert.equal(N.resolverCidade('ibge:3545308'), 'ibge:3545308');
  assert.equal(N.resolverCidade('Salto de Pirapora/SP'), 'ibge:3545308');
  assert.equal(N.resolverCidade('ibge:0000000'), null);
  assert.equal(N.normalizar({ cidade: 'xyzxyz' }).cidade, 'sao-paulo');
});

test('cidade fora da lista: latitude exata e clima estimado entre as referências mais próximas', () => {
  const c = N.climaDaCidade('ibge:3545308'); // Salto de Pirapora
  assert.equal(c.nome, 'Salto de Pirapora (SP)');
  near(c.lat, -23.6474, 1e-4);
  assert.ok(c.estimado);
  assert.equal(c.fontes[0].nome, 'Sorocaba (SP)');
  const ts = c.fontes.map((f) => Object.values(N.CIDADES).find((x) => x.nome === f.nome).tmax);
  assert.ok(c.tmax >= Math.min(...ts) && c.tmax <= Math.max(...ts), 'média ponderada fica entre as referências');
  const perto = N.climaDaCidade(N.resolverCidade('Votorantim/SP'));
  assert.equal(perto.fontes.length, 1, 'a menos de 15 km usa a referência direto');
  const r = N.calcular({ cidade: 'ibge:3545308' });
  assert.equal(r.clima.cidade, 'Salto de Pirapora (SP)');
  near(r.clima.lat, -23.6474, 1e-4);
});

test('cidades de referência: coordenadas batem com a base de municípios', () => {
  for (const [k, c] of Object.entries(N.CIDADES)) {
    const m = M.porCodigo(c.ibge);
    assert.ok(m, k);
    near(N.distanciaKm(c.lat, c.lon, m.lat, m.lon), 0, 0.5, k);
  }
});
