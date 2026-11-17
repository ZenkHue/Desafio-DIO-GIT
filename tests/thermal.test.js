const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('../js/thermal.js');

const near = (a, b, tol = 0.6, msg = '') => assert.ok(Math.abs(a - b) <= tol, `${msg} esperado ${b}, obtido ${a}`);

/** Ambiente "vazio": só a infiltração de ar gera carga. */
const vazio = (extra = {}) =>
  T.mesclar(
    {
      paredes: { N: { tipo: 'interna_c' }, S: { tipo: 'interna_c' }, L: { tipo: 'interna_c' }, O: { tipo: 'interna_c' } },
      cobertura: { tipo: 'andar_c' },
      pessoas: { quantidade: 0 },
      equipamentos: [],
      iluminacao: 'nenhuma',
      seguranca: 0,
    },
    extra
  );

test('psicrometria: umidade absoluta de referência', () => {
  near(T.umidadeAbsoluta(24, 50), 9.28, 0.05); // ar interno de projeto
  near(T.umidadeAbsoluta(32, 55), 16.46, 0.1);
  assert.ok(T.umidadeAbsoluta(35, 70) > T.umidadeAbsoluta(35, 50));
});

test('conversões: 1 TR = 12.000 BTU/h e 1 W = 3,412 BTU/h', () => {
  assert.equal(T.BTU_POR_TR, 12000);
  near(T.W_PARA_BTU, 3.412, 0.001);
  const r = T.calcular(vazio({ ambiente: { largura: 4, comprimento: 5, peDireito: 2.7 } }));
  near(r.total.btu, r.total.watts * T.W_PARA_BTU, 1);
  near(r.total.tr, r.total.btu / 12000, 0.01);
});

test('pessoas: calor sensível e latente por atividade', () => {
  const r = T.calcular(vazio({ pessoas: { quantidade: 3, atividade: 'escritorio' }, ar: { infiltracao: 'baixa' } }));
  const p = r.itens.find((i) => i.id === 'pessoas');
  assert.equal(p.sensivel, 225);
  assert.equal(p.latente, 195);
});

test('equipamentos e iluminação entram 100% como calor sensível', () => {
  const r = T.calcular(
    vazio({
      ambiente: { largura: 4, comprimento: 5, peDireito: 2.7 },
      equipamentos: [{ nome: 'PC', qtd: 2, watts: 200 }, { nome: 'TV', qtd: 1, watts: 100 }],
      iluminacao: 'led',
    })
  );
  assert.equal(r.itens.find((i) => i.id === 'equipamentos').sensivel, 500);
  assert.equal(r.itens.find((i) => i.id === 'iluminacao').sensivel, 6 * 20); // 6 W/m² × 20 m²
});

test('parede externa norte: U·A·(ΔT + ΔTsol·cor·amortecimento)', () => {
  const r = T.calcular(
    vazio({ clima: { cidade: 'sao-paulo' }, paredes: { N: { tipo: 'externa', material: 'alvenaria', cor: 'clara' } } })
  );
  const A = 4 * 2.7;
  const esperado = 2.4 * A * (8 + 3 * 0.6 * 0.85);
  near(r.itens.find((i) => i.id === 'parede-N').sensivel, esperado, 0.2);
});

test('janela oeste: condução + radiação solar × fator do vidro × proteção', () => {
  const base = { paredes: { O: { tipo: 'externa', janela: { largura: 2, altura: 1, vidro: 'comum', protecao: 'nenhuma' } } } };
  const r = T.calcular(vazio(base));
  const j = r.itens.find((i) => i.id === 'janela-O');
  near(j.sensivel, 5.8 * 2 * 8 + 2 * 420, 0.2);

  const r2 = T.calcular(vazio({ paredes: { O: { tipo: 'externa', janela: { largura: 2, altura: 1, vidro: 'duplo', protecao: 'externa' } } } }));
  const j2 = r2.itens.find((i) => i.id === 'janela-O');
  near(j2.sensivel, 2.8 * 2 * 8 + 2 * 420 * 0.45 * 0.35, 0.2);
  assert.ok(j2.sensivel < j.sensivel / 2);
});

test('orientação importa: janela oeste ganha mais que norte e sul', () => {
  const carga = (k) => {
    const p = { N: { tipo: 'interna_c' }, S: { tipo: 'interna_c' }, L: { tipo: 'interna_c' }, O: { tipo: 'interna_c' } };
    p[k] = { tipo: 'externa', janela: { largura: 1.5, altura: 1.2 } };
    return T.calcular(vazio({ paredes: p })).itens.find((i) => i.id === 'janela-' + k).sensivel;
  };
  assert.ok(carga('O') > carga('L'));
  assert.ok(carga('L') > carga('N'));
  assert.ok(carga('N') > carga('S'));
});

test('parede interna para área não condicionada usa ΔT − 3 K', () => {
  const r = T.calcular(vazio({ paredes: { L: { tipo: 'interna_nc', material: 'alvenaria' } } }));
  near(r.itens.find((i) => i.id === 'parede-L').sensivel, 2.4 * (5 * 2.7) * (8 - 3), 0.2);
});

test('cobertura: laje exposta carrega muito mais que cobertura isolada', () => {
  const c = (tipo) => T.calcular(vazio({ cobertura: { tipo } })).itens.find((i) => i.id === 'cobertura');
  assert.ok(c('exposta').sensivel > 2 * c('atico').sensivel);
  assert.ok(c('atico').sensivel > 2 * c('isolada').sensivel);
  assert.equal(T.calcular(vazio({ cobertura: { tipo: 'andar_c' } })).itens.find((i) => i.id === 'cobertura'), undefined);
});

test('infiltração: sensível 0,335·V·ΔT e latente 0,8336·V·Δw', () => {
  const r = T.calcular(vazio({ ar: { infiltracao: 'normal' } }));
  const V = 20 * 2.7 * 0.5;
  const i = r.itens.find((x) => x.id === 'infiltracao');
  near(i.sensivel, 0.335 * V * 8, 0.1);
  near(i.latente, 0.8336 * V * (T.umidadeAbsoluta(32, 55) - T.umidadeAbsoluta(24, 50)), 0.2);
});

test('ar externo mais seco que o interno não gera carga latente negativa', () => {
  const r = T.calcular(vazio({ clima: { tbsExt: 30, urExt: 20 } }));
  assert.equal(r.itens.find((i) => i.id === 'infiltracao').latente, 0);
});

test('ventilação mecânica adiciona carga (2,5 L/s·pessoa + 0,3 L/s·m²)', () => {
  const sem = T.calcular(vazio({ pessoas: { quantidade: 2 } }));
  const com = T.calcular(vazio({ pessoas: { quantidade: 2 }, ar: { ventilacao: true } }));
  const v = com.itens.find((i) => i.id === 'ventilacao');
  assert.ok(v && v.sensivel > 0 && v.latente > 0);
  assert.ok(com.total.btu > sem.total.btu);
  assert.match(v.rotulo, /\b(40|41|42)\s*m³\/h/); // 2×9 + 20×1,08 = 39,6
});

test('fator de segurança multiplica o subtotal', () => {
  const r = T.calcular(vazio({ pessoas: { quantidade: 2 }, seguranca: 0.1 }));
  near(r.total.watts, r.total.subtotal * 1.1, 0.5);
  near(r.total.seguranca, r.total.subtotal * 0.1, 0.5);
});

test('uso noturno reduz a carga (menos sol, ar mais frio)', () => {
  const base = { paredes: { O: { tipo: 'externa', janela: { largura: 2, altura: 1.2 } } }, cobertura: { tipo: 'exposta' } };
  const dia = T.calcular(T.mesclar(base, { clima: { uso: 'integral' } }));
  const noite = T.calcular(T.mesclar(base, { clima: { uso: 'noite' } }));
  assert.ok(noite.total.btu < dia.total.btu * 0.75);
});

test('SHR: razão entre carga sensível e total', () => {
  const r = T.calcular({});
  near(r.total.shr, r.total.sensivel / r.total.subtotal, 0.01);
  assert.ok(r.total.shr > 0.5 && r.total.shr <= 1);
});

test('dimensionamento comercial com tolerância de 5%', () => {
  assert.equal(T.dimensionar(11167).capacidade, 12000);
  assert.equal(T.dimensionar(12100).capacidade, 12000); // dentro dos 5%
  assert.equal(T.dimensionar(12700).capacidade, 18000);
  assert.equal(T.dimensionar(3000).capacidade, 7500);
  const grande = T.dimensionar(80000);
  assert.equal(grande.quantidade, 2);
  assert.ok(grande.capacidadeTotal >= 80000 / 1.05);
  assert.equal(T.dimensionar(5000).quantidade, 1);
});

test('capacidade total cobre a carga (com tolerância) em varredura', () => {
  for (let b = 2000; b <= 150000; b += 997) {
    const d = T.dimensionar(b);
    assert.ok(d.capacidadeTotal * 1.0 >= b / 1.05 - 1, `falhou em ${b}`);
  }
});

test('cenário padrão fica na ordem de grandeza da regra prática', () => {
  const r = T.calcular({});
  assert.ok(r.total.btu > 9000 && r.total.btu < 14000, `btu=${r.total.btu}`);
  assert.equal(r.regraPratica.btu, 600 * 20);
  assert.equal(r.equipamento.capacidade, 12000);
});

test('sol forte (janela oeste grande + laje exposta) supera a regra prática', () => {
  const r = T.calcular({ paredes: { O: { janela: { largura: 2.5 } } }, cobertura: { tipo: 'exposta' } });
  assert.ok(r.total.btu > r.regraPratica.btu * 1.25);
});

test('entradas inválidas não geram NaN nem Infinity', () => {
  const r = T.calcular({
    ambiente: { largura: 'abc', comprimento: -4, peDireito: 0 },
    pessoas: { quantidade: -3 },
    equipamentos: [{ nome: 'x', qtd: 'a', watts: 'b' }],
    clima: { tbsExt: 'xx' },
    paredes: { O: { janela: { largura: 999, altura: 999 } } },
  });
  const valores = [r.total.btu, r.total.watts, r.total.shr, r.energia.kWhMes, r.equipamento.capacidade];
  for (const v of valores) assert.ok(Number.isFinite(v), String(v));
});

test('janela é limitada pela geometria da parede', () => {
  const d = T.dimensoesJanela({ tipo: 'externa', janela: { largura: 50, altura: 50 } }, 4, 2.7);
  assert.ok(d.largura <= 3.6);
  assert.ok(d.area <= 0.8 * 4 * 2.7 + 1e-9);
  assert.equal(T.dimensoesJanela({ tipo: 'interna_nc', janela: { largura: 2, altura: 1 } }, 4, 2.7).area, 0);
});

test('energia: inverter consome menos que convencional', () => {
  const inv = T.energia(3500, { tipo: 'inverter', horasDia: 8, tarifa: 1 });
  const conv = T.energia(3500, { tipo: 'convencional', horasDia: 8, tarifa: 1 });
  assert.ok(inv.kWhMes < conv.kWhMes);
  near(inv.custoMes, inv.kWhMes, 0.5); // tarifa 1,00 (kWh arredondado)
});

test('oportunidades: ordenadas, positivas e coerentes com o recálculo', () => {
  const entrada = { paredes: { O: { janela: { largura: 2.5 } } }, cobertura: { tipo: 'exposta' }, iluminacao: 'incandescente' };
  const ops = T.oportunidades(entrada);
  assert.ok(ops.length >= 3);
  for (let i = 1; i < ops.length; i++) assert.ok(ops[i - 1].reducaoBTU >= ops[i].reducaoBTU);
  for (const o of ops) assert.ok(o.reducaoBTU > 0 && o.reducaoPct > 0);
  const prot = ops.find((o) => o.id === 'protecao-O');
  const antes = T.calcular(entrada).total.btu;
  const depois = T.calcular(T.mesclar(entrada, { paredes: { O: { janela: { protecao: 'externa' } } } })).total.btu;
  near(prot.reducaoBTU, antes - depois, 1);
});

test('oportunidades: nada a sugerir quando já está otimizado', () => {
  const ops = T.oportunidades(vazio({ pessoas: { quantidade: 1 } }));
  assert.equal(ops.length, 0);
});

test('sugestão de equipamento: sala grande pede piso-teto/cassete', () => {
  const grande = T.calcular({
    ambiente: { largura: 8, comprimento: 9, peDireito: 3 },
    pessoas: { quantidade: 20, atividade: 'moderada' },
    paredes: { O: { janela: { largura: 4 } } },
    cobertura: { tipo: 'exposta' },
  });
  const s = T.sugerirEquipamento(grande);
  assert.match(s.tipo, /piso-teto|cassete/i);
  const pequeno = T.sugerirEquipamento(T.calcular({}));
  assert.match(pequeno.tipo, /hi-wall/i);
});

test('porta: largura em texto é convertida e limitada pela parede', () => {
  const r = T.calcular({ porta: { parede: 'N', pos: '0.5', largura: '0.8' } });
  assert.equal(typeof r.entrada.porta.largura, 'number');
  assert.equal(r.entrada.porta.largura, 0.8);
  assert.equal(r.entrada.porta.pos, 0.5);
  assert.equal(T.calcular({ porta: { largura: 99 } }).entrada.porta.largura, 3.6); // parede S tem 4 m
  assert.equal(T.calcular({ porta: { parede: 'X' } }).entrada.porta.parede, 'S');
});
