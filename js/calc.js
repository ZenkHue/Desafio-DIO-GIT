/*
 * Núcleo de cálculo do simulador de salário líquido (CLT).
 * Sem dependências e sem acesso ao DOM: funciona no navegador e no Node (testes).
 *
 * Tabelas vigentes em 2026:
 *  - INSS: Portaria Interministerial MPS/MF nº 13/2026 (alíquotas progressivas).
 *  - IRRF: tabela progressiva mensal + isenção até R$ 5.000 e redutor
 *          até R$ 7.350 (Lei 15.270/2025).
 * Atualize o objeto TABELAS quando houver reajuste.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CalcCLT = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const TABELAS = {
    ano: 2026,
    salarioMinimo: 1621.0,
    inss: {
      teto: 8475.55,
      faixas: [
        { ate: 1621.0, aliquota: 0.075 },
        { ate: 2902.84, aliquota: 0.09 },
        { ate: 4354.27, aliquota: 0.12 },
        { ate: 8475.55, aliquota: 0.14 },
      ],
    },
    irrf: {
      faixas: [
        { ate: 2428.8, aliquota: 0, deducao: 0 },
        { ate: 2826.65, aliquota: 0.075, deducao: 182.16 },
        { ate: 3751.05, aliquota: 0.15, deducao: 394.16 },
        { ate: 4664.68, aliquota: 0.225, deducao: 675.49 },
        { ate: Infinity, aliquota: 0.275, deducao: 908.73 },
      ],
      deducaoDependente: 189.59,
      descontoSimplificado: 607.2,
      // Lei 15.270/2025
      limiteIsencao: 5000.0,
      limiteRedutor: 7350.0,
      redutorA: 978.62,
      redutorB: 0.133145,
    },
    fgtsAliquota: 0.08,
    vtAliquota: 0.06,
    insalubridade: { nenhum: 0, grau10: 0.1, grau20: 0.2, grau40: 0.4 },
    periculosidade: 0.3,
    adicionalNoturno: 0.2,
    he50: 1.5,
    he100: 2.0,
  };

  const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;
  const num = (v) => {
    const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
    return Number.isFinite(n) && n > 0 ? n : 0;
  };

  /** INSS progressivo (cada faixa incide só sobre a parcela que cabe nela). */
  function calcularINSS(base, t = TABELAS) {
    const b = Math.min(num(base), t.inss.teto);
    let anterior = 0;
    let total = 0;
    const detalhe = [];
    for (const f of t.inss.faixas) {
      const parcela = Math.max(0, Math.min(b, f.ate) - anterior);
      const valor = parcela * f.aliquota;
      detalhe.push({
        de: anterior,
        ate: f.ate,
        aliquota: f.aliquota,
        base: round2(parcela),
        valor: round2(valor),
      });
      total += valor;
      anterior = f.ate;
    }
    return { valor: round2(total), baseLimitada: b, detalhe };
  }

  /**
   * IRRF mensal.
   * @param {object} p
   * @param {number} p.rendimento   rendimentos tributáveis brutos do mês
   * @param {number} p.inss         INSS descontado
   * @param {number} p.dependentes  nº de dependentes
   * @param {number} p.pensao       pensão alimentícia (dedutível)
   * @param {boolean} p.aplicarRedutor  aplica a isenção/redutor da Lei 15.270
   */
  function calcularIRRF(p, t = TABELAS) {
    const rendimento = num(p.rendimento);
    const inss = num(p.inss);
    const dependentes = Math.floor(num(p.dependentes));
    const pensao = num(p.pensao);
    const aplicarRedutor = p.aplicarRedutor !== false;
    const ir = t.irrf;

    const deducaoDependentes = round2(dependentes * ir.deducaoDependente);
    const deducaoLegal = round2(inss + deducaoDependentes + pensao);
    const usaSimplificado = ir.descontoSimplificado > deducaoLegal;
    const deducao = usaSimplificado ? ir.descontoSimplificado : deducaoLegal;
    const base = round2(Math.max(0, rendimento - deducao));

    const faixa = ir.faixas.find((f) => base <= f.ate);
    const impostoTabela = round2(Math.max(0, base * faixa.aliquota - faixa.deducao));

    let redutor = 0;
    if (aplicarRedutor) {
      if (rendimento <= ir.limiteIsencao) redutor = impostoTabela;
      else if (rendimento <= ir.limiteRedutor)
        redutor = Math.min(impostoTabela, Math.max(0, ir.redutorA - ir.redutorB * rendimento));
    }
    redutor = round2(redutor);

    const valor = round2(Math.max(0, impostoTabela - redutor));
    return {
      valor,
      base,
      deducao: round2(deducao),
      deducaoDependentes,
      usaSimplificado,
      aliquotaFaixa: faixa.aliquota,
      impostoTabela,
      redutor,
    };
  }

  /** Simulação do salário mensal. */
  function simularMensal(entrada, t = TABELAS) {
    const salario = num(entrada.salarioBruto);
    const jornada = num(entrada.jornadaMensal) || 220;
    const dependentes = Math.floor(num(entrada.dependentes));

    // Adicional de periculosidade OU insalubridade (não se acumulam).
    let adicionalFixo = 0;
    let adicionalFixoRotulo = '';
    const tipo = entrada.adicional || 'nenhum';
    if (tipo === 'periculosidade') {
      adicionalFixo = salario * t.periculosidade;
      adicionalFixoRotulo = 'Adicional de periculosidade (30%)';
    } else if (t.insalubridade[tipo]) {
      adicionalFixo = t.salarioMinimo * t.insalubridade[tipo];
      adicionalFixoRotulo = `Adicional de insalubridade (${t.insalubridade[tipo] * 100}% do salário mínimo)`;
    }
    adicionalFixo = round2(adicionalFixo);

    const valorHora = (salario + adicionalFixo) / jornada;
    const he50 = round2(num(entrada.he50) * valorHora * t.he50);
    const he100 = round2(num(entrada.he100) * valorHora * t.he100);
    const noturno = round2(num(entrada.horasNoturnas) * valorHora * t.adicionalNoturno);

    const diasUteis = num(entrada.diasUteis);
    const diasDSR = num(entrada.diasDSR);
    const variaveis = he50 + he100 + noturno;
    const dsr = diasUteis > 0 ? round2((variaveis / diasUteis) * diasDSR) : 0;

    const outrosProventos = round2(num(entrada.outrosProventos));

    const proventos = [
      { chave: 'salario', rotulo: 'Salário base', valor: round2(salario) },
      { chave: 'adicional', rotulo: adicionalFixoRotulo, valor: adicionalFixo },
      { chave: 'he50', rotulo: 'Horas extras 50%', valor: he50 },
      { chave: 'he100', rotulo: 'Horas extras 100%', valor: he100 },
      { chave: 'noturno', rotulo: 'Adicional noturno (20%)', valor: noturno },
      { chave: 'dsr', rotulo: 'DSR sobre horas extras e adicional noturno', valor: dsr },
      { chave: 'outros', rotulo: 'Outros proventos tributáveis', valor: outrosProventos },
    ].filter((p) => p.valor > 0);

    const bruto = round2(proventos.reduce((s, p) => s + p.valor, 0));

    const inss = calcularINSS(bruto, t);
    const irrf = calcularIRRF(
      { rendimento: bruto, inss: inss.valor, dependentes, pensao: entrada.pensao },
      t
    );

    // Vale-transporte: 6% do salário base, limitado ao custo real do VT.
    let vt = 0;
    if (entrada.vtAtivo) {
      vt = round2(salario * t.vtAliquota);
      const custo = num(entrada.vtCusto);
      if (custo > 0) vt = Math.min(vt, round2(custo));
    }

    const descontos = [
      { chave: 'inss', rotulo: 'INSS', valor: inss.valor },
      { chave: 'irrf', rotulo: 'IRRF (imposto de renda)', valor: irrf.valor },
      { chave: 'vt', rotulo: 'Vale-transporte (6%)', valor: vt },
      { chave: 'vr', rotulo: 'Vale-refeição / alimentação', valor: round2(num(entrada.vrDesconto)) },
      { chave: 'saude', rotulo: 'Plano de saúde / odontológico', valor: round2(num(entrada.planoSaude)) },
      { chave: 'pensao', rotulo: 'Pensão alimentícia', valor: round2(num(entrada.pensao)) },
      { chave: 'outros', rotulo: 'Outros descontos', valor: round2(num(entrada.outrosDescontos)) },
    ].filter((d) => d.valor > 0);

    const totalDescontos = round2(descontos.reduce((s, d) => s + d.valor, 0));
    const liquido = round2(bruto - totalDescontos);

    return {
      proventos,
      descontos,
      bruto,
      totalDescontos,
      liquido,
      inss,
      irrf,
      fgts: round2(bruto * t.fgtsAliquota),
      valorHora: round2(valorHora),
      percentualDescontos: bruto > 0 ? totalDescontos / bruto : 0,
      percentualImpostos: bruto > 0 ? (inss.valor + irrf.valor) / bruto : 0,
    };
  }

  /**
   * 13º salário. O IRRF do 13º é tributado de forma exclusiva e separada,
   * pela tabela progressiva, sem o redutor mensal da Lei 15.270.
   * @param {number} remuneracao base mensal (salário + adicionais/médias)
   * @param {number} avos        meses trabalhados (1 a 12)
   */
  function simular13(remuneracao, avos, entrada, t = TABELAS) {
    const meses = Math.min(12, Math.max(0, Math.floor(num(avos))));
    const bruto = round2((num(remuneracao) * meses) / 12);
    const inss = calcularINSS(bruto, t);
    const irrf = calcularIRRF(
      {
        rendimento: bruto,
        inss: inss.valor,
        dependentes: entrada.dependentes,
        pensao: 0,
        aplicarRedutor: false,
      },
      t
    );
    const liquido = round2(bruto - inss.valor - irrf.valor);
    const primeira = round2(bruto / 2);
    return {
      meses,
      bruto,
      inss: inss.valor,
      irrf: irrf.valor,
      liquido,
      primeiraParcela: primeira,
      segundaParcela: round2(liquido - primeira),
      fgts: round2(bruto * t.fgtsAliquota),
    };
  }

  /**
   * Férias + 1/3 constitucional. INSS e IRRF calculados isoladamente
   * (estimativa: na prática o INSS do mês soma férias e salário e respeita o teto).
   */
  function simularFerias(remuneracao, dias, entrada, t = TABELAS) {
    const d = Math.min(30, Math.max(0, Math.floor(num(dias))));
    const valor = round2((num(remuneracao) / 30) * d);
    const terco = round2(valor / 3);
    const bruto = round2(valor + terco);
    const inss = calcularINSS(bruto, t);
    const irrf = calcularIRRF(
      { rendimento: bruto, inss: inss.valor, dependentes: entrada.dependentes, pensao: 0 },
      t
    );
    return {
      dias: d,
      valor,
      terco,
      bruto,
      inss: inss.valor,
      irrf: irrf.valor,
      liquido: round2(bruto - inss.valor - irrf.valor),
    };
  }

  return { TABELAS, calcularINSS, calcularIRRF, simularMensal, simular13, simularFerias, round2 };
});
