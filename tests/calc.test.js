const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../js/calc.js');

const near = (a, b, msg) => assert.ok(Math.abs(a - b) < 0.011, `${msg || ''} esperado ${b}, obtido ${a}`);

test('INSS: teto 2026 = R$ 988,09', () => {
  near(C.calcularINSS(8475.55).valor, 988.09);
  near(C.calcularINSS(50000).valor, 988.09, 'acima do teto');
});

test('INSS: salário mínimo = 7,5%', () => {
  near(C.calcularINSS(1621).valor, 121.58);
});

test('INSS: R$ 3.000 (progressivo)', () => {
  // 121,575 + 115,3656 + (3000-2902,84)*0,12 = 11,6592
  near(C.calcularINSS(3000).valor, 248.6);
});

test('IRRF: isento até R$ 5.000 de rendimento', () => {
  const inss = C.calcularINSS(5000).valor;
  const r = C.calcularIRRF({ rendimento: 5000, inss });
  assert.equal(r.valor, 0);
  near(r.impostoTabela, 312.89);
});

test('IRRF: R$ 6.000 com redutor', () => {
  const inss = C.calcularINSS(6000).valor; // 641,51
  const r = C.calcularIRRF({ rendimento: 6000, inss });
  near(r.base, 5358.49);
  near(r.impostoTabela, 564.85);
  near(r.redutor, 179.75);
  near(r.valor, 385.1);
});

test('IRRF: acima de R$ 7.350 não há redutor', () => {
  const inss = C.calcularINSS(8000).valor;
  const r = C.calcularIRRF({ rendimento: 8000, inss });
  assert.equal(r.redutor, 0);
  assert.ok(r.valor > 0);
});

test('IRRF: continuidade da tabela em R$ 5.000 e R$ 7.350', () => {
  const at = (v) => C.calcularIRRF({ rendimento: v, inss: C.calcularINSS(v).valor }).valor;
  assert.ok(at(5000.01) < 1, 'logo acima de 5.000 o imposto é quase zero (sem degrau)');
  near(at(7350.01), at(7350), 'sem degrau em 7.350 (redutor chega a zero)');
  // o imposto nunca diminui quando a renda sobe
  let anterior = 0;
  for (let v = 4000; v <= 9000; v += 50) {
    const atual = at(v);
    assert.ok(atual + 0.011 >= anterior, `monotonia quebrada em ${v}`);
    anterior = atual;
  }
});

test('IRRF: dependentes reduzem a base e o desconto simplificado é usado quando melhor', () => {
  const r = C.calcularIRRF({ rendimento: 2000, inss: 0, aplicarRedutor: false });
  assert.equal(r.usaSimplificado, true);
  assert.equal(r.deducao, 607.2);
  const d = C.calcularIRRF({ rendimento: 6000, inss: 641.51, dependentes: 2, aplicarRedutor: false });
  assert.equal(d.usaSimplificado, false);
  near(d.deducaoDependentes, 379.18);
  near(d.base, 6000 - 641.51 - 379.18);
});

test('Mensal: salário de R$ 3.000 sem extras', () => {
  const r = C.simularMensal({ salarioBruto: 3000 });
  near(r.bruto, 3000);
  near(r.inss.valor, 248.6);
  // base 3000-607,20 (simplificado) = 2392,80 -> isento
  assert.equal(r.irrf.valor, 0);
  near(r.liquido, 3000 - 248.6);
});

test('Mensal: R$ 6.000 com VT, plano de saúde e dependente', () => {
  const r = C.simularMensal({
    salarioBruto: 6000,
    dependentes: 1,
    vtAtivo: true,
    planoSaude: 200,
  });
  const vt = 360;
  near(r.descontos.find((d) => d.chave === 'vt').valor, vt);
  near(r.totalDescontos, r.inss.valor + r.irrf.valor + vt + 200);
  near(r.liquido, 6000 - r.totalDescontos);
});

test('Mensal: VT limitado ao custo real', () => {
  const r = C.simularMensal({ salarioBruto: 3000, vtAtivo: true, vtCusto: 100 });
  near(r.descontos.find((d) => d.chave === 'vt').valor, 100);
});

test('Mensal: horas extras, noturno e DSR', () => {
  const r = C.simularMensal({
    salarioBruto: 2200,
    jornadaMensal: 220,
    he50: 10,
    he100: 4,
    horasNoturnas: 20,
    diasUteis: 25,
    diasDSR: 5,
  });
  // valor hora = 10
  near(r.valorHora, 10);
  near(r.proventos.find((p) => p.chave === 'he50').valor, 150);
  near(r.proventos.find((p) => p.chave === 'he100').valor, 80);
  near(r.proventos.find((p) => p.chave === 'noturno').valor, 40);
  near(r.proventos.find((p) => p.chave === 'dsr').valor, (270 / 25) * 5);
});

test('Mensal: periculosidade 30% e insalubridade sobre salário mínimo', () => {
  const p = C.simularMensal({ salarioBruto: 3000, adicional: 'periculosidade' });
  near(p.proventos.find((x) => x.chave === 'adicional').valor, 900);
  const i = C.simularMensal({ salarioBruto: 3000, adicional: 'grau20' });
  near(i.proventos.find((x) => x.chave === 'adicional').valor, 324.2);
});

test('Mensal: entradas vazias ou inválidas não geram NaN', () => {
  const r = C.simularMensal({ salarioBruto: '', he50: 'abc' });
  assert.equal(r.bruto, 0);
  assert.equal(r.liquido, 0);
  assert.ok(Number.isFinite(r.percentualDescontos));
});

test('13º: 12 avos, parcelas somam o líquido', () => {
  const r = C.simular13(3000, 12, { dependentes: 0 });
  near(r.bruto, 3000);
  near(r.primeiraParcela, 1500);
  near(r.primeiraParcela + r.segundaParcela, r.liquido);
  near(r.inss, 248.6);
});

test('13º: proporcional aos avos', () => {
  const r = C.simular13(3000, 6, { dependentes: 0 });
  near(r.bruto, 1500);
});

test('Férias: 30 dias + 1/3', () => {
  const r = C.simularFerias(3000, 30, { dependentes: 0 });
  near(r.valor, 3000);
  near(r.terco, 1000);
  near(r.bruto, 4000);
  near(r.liquido, 4000 - r.inss - r.irrf);
});
