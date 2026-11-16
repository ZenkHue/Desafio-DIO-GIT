(function () {
  'use strict';

  const C = window.CalcCLT;
  const $ = (id) => document.getElementById(id);
  const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const pct = (n, d = 1) =>
    (n * 100).toLocaleString('pt-BR', { minimumFractionDigits: d, maximumFractionDigits: d }) + '%';
  const STORAGE_KEY = 'simulador-clt-v1';

  const campos = [
    'salarioBruto', 'dependentes', 'jornadaMensal', 'adicional',
    'he50', 'he100', 'horasNoturnas', 'diasUteis', 'diasDSR', 'outrosProventos',
    'vtCusto', 'vrDesconto', 'planoSaude', 'pensao', 'outrosDescontos',
    'avos', 'diasFerias',
  ];

  /* ---------- helpers de DOM (sem innerHTML) ---------- */
  function el(tag, props = {}, ...filhos) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v;
      else if (k === 'style') Object.assign(e.style, v);
      else e.setAttribute(k, v);
    }
    for (const f of filhos) e.append(f);
    return e;
  }
  const td = (txt, cls) => el('td', cls ? { class: cls } : {}, txt);
  const trocar = (container, ...nos) => container.replaceChildren(...nos);

  function lerEntrada() {
    const e = {};
    for (const id of campos) e[id] = $(id).value;
    e.vtAtivo = $('vtAtivo').checked;
    return e;
  }

  /* ---------- render: mensal ---------- */
  function renderMensal(r) {
    $('liquido').textContent = brl.format(r.liquido);
    $('bruto').textContent = brl.format(r.bruto);
    $('totalDescontos').textContent = brl.format(r.totalDescontos);
    $('pctDescontos').textContent = pct(r.percentualDescontos);
    $('fgts').textContent = brl.format(r.fgts);

    // barra: líquido / INSS / IRRF / demais descontos
    const demais = Math.max(0, r.totalDescontos - r.inss.valor - r.irrf.valor);
    const partes = [
      { nome: 'Líquido', valor: r.liquido, cor: 'var(--c-liquido)' },
      { nome: 'INSS', valor: r.inss.valor, cor: 'var(--c-inss)' },
      { nome: 'IRRF', valor: r.irrf.valor, cor: 'var(--c-irrf)' },
      { nome: 'Outros descontos', valor: demais, cor: 'var(--c-outros)' },
    ].filter((p) => p.valor > 0);
    const total = r.bruto || 1;
    trocar($('barra'), ...partes.map((p) => el('span', { style: { width: (p.valor / total) * 100 + '%', background: p.cor }, title: p.nome })));
    trocar($('legenda'), ...partes.map((p) => {
      const li = el('li', {}, `${p.nome} ${pct(p.valor / total)}`);
      li.style.setProperty('--cor', p.cor);
      return li;
    }));

    // contracheque
    trocar($('contracheque'),
      ...r.proventos.map((p) => el('tr', {}, td(p.rotulo), td(brl.format(p.valor), 'num'), td('', 'num'))),
      ...r.descontos.map((d) => el('tr', {}, td(d.rotulo), td('', 'num'), td(brl.format(d.valor), 'num neg'))));
    trocar($('contrachequeTotal'),
      el('tr', {}, td('Totais'), td(brl.format(r.bruto), 'num'), td(brl.format(r.totalDescontos), 'num neg')),
      el('tr', { class: 'liq' }, td('Líquido a receber'), el('td', { class: 'num', colspan: '2' }, brl.format(r.liquido))));

    // detalhe INSS
    trocar($('detalheInss'), ...r.inss.detalhe.map((f) =>
      el('tr', {}, td(`${brl.format(f.de)} a ${brl.format(f.ate)}`), td(pct(f.aliquota), 'num'),
        td(brl.format(f.base), 'num'), td(brl.format(f.valor), 'num'))));

    // detalhe IRRF
    const i = r.irrf;
    const linhas = [
      ['Rendimento tributável', brl.format(r.bruto)],
      [i.usaSimplificado ? 'Desconto simplificado (mais vantajoso)' : 'Deduções legais (INSS + dependentes + pensão)', `− ${brl.format(i.deducao)}`],
      ['Base de cálculo', brl.format(i.base)],
      [`Imposto pela tabela (alíq. ${pct(i.aliquotaFaixa)})`, brl.format(i.impostoTabela)],
      ['Redutor Lei 15.270/2025', `− ${brl.format(i.redutor)}`],
      ['IRRF devido', brl.format(i.valor)],
    ];
    trocar($('detalheIrrf'), ...linhas.flatMap(([k, v]) => [el('dt', {}, k), el('dd', {}, v)]));
  }

  /* ---------- render: 13º ---------- */
  function linhaTabela(rotulo, valor, cls) {
    return el('tr', {}, td(rotulo), td(brl.format(valor), 'num' + (cls ? ' ' + cls : '')));
  }
  function render13(r) {
    $('liquido13').textContent = brl.format(r.liquido);
    $('parcela1').textContent = brl.format(r.primeiraParcela);
    $('parcela2').textContent = brl.format(r.segundaParcela);
    $('bruto13').textContent = brl.format(r.bruto);
    trocar($('tabela13'),
      linhaTabela(`13º proporcional (${r.meses}/12)`, r.bruto),
      linhaTabela('INSS', -r.inss, 'neg'),
      linhaTabela('IRRF (tributação exclusiva)', -r.irrf, 'neg'),
      linhaTabela('FGTS do empregador (8%)', r.fgts));
  }

  /* ---------- render: férias ---------- */
  function renderFerias(r) {
    $('liquidoFerias').textContent = brl.format(r.liquido);
    $('brutoFerias').textContent = brl.format(r.bruto);
    $('inssFerias').textContent = brl.format(r.inss);
    $('irrfFerias').textContent = brl.format(r.irrf);
    trocar($('tabelaFerias'),
      linhaTabela(`Férias (${r.dias} dias)`, r.valor),
      linhaTabela('1/3 constitucional', r.terco),
      linhaTabela('INSS', -r.inss, 'neg'),
      linhaTabela('IRRF', -r.irrf, 'neg'));
  }

  /* ---------- ciclo principal ---------- */
  function atualizar() {
    const entrada = lerEntrada();
    $('vtCustoCampo').hidden = !entrada.vtAtivo;
    const mensal = C.simularMensal(entrada);
    renderMensal(mensal);
    render13(C.simular13(mensal.bruto, entrada.avos, entrada));
    renderFerias(C.simularFerias(mensal.bruto, entrada.diasFerias, entrada));
    salvar(entrada);
  }

  function salvar(entrada) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entrada)); } catch (_) { /* modo privado */ }
  }
  function restaurar() {
    try {
      const salvo = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (!salvo) return;
      for (const id of campos) if (salvo[id] !== undefined && $(id)) $(id).value = salvo[id];
      $('vtAtivo').checked = !!salvo.vtAtivo;
    } catch (_) { /* ignora dados corrompidos */ }
  }

  /* ---------- abas ---------- */
  function ativarAba(aba) {
    for (const b of document.querySelectorAll('.abas [role=tab]')) {
      const ativa = b === aba;
      b.setAttribute('aria-selected', String(ativa));
      b.tabIndex = ativa ? 0 : -1;
      $(b.getAttribute('aria-controls')).hidden = !ativa;
    }
    aba.focus();
  }
  function iniciarAbas() {
    const abas = [...document.querySelectorAll('.abas [role=tab]')];
    abas.forEach((b, i) => {
      b.addEventListener('click', () => ativarAba(b));
      b.addEventListener('keydown', (ev) => {
        if (ev.key === 'ArrowRight') ativarAba(abas[(i + 1) % abas.length]);
        else if (ev.key === 'ArrowLeft') ativarAba(abas[(i - 1 + abas.length) % abas.length]);
      });
    });
  }

  $('anoTabelas').textContent = C.TABELAS.ano;
  restaurar();
  iniciarAbas();
  $('form').addEventListener('input', atualizar);
  $('form').addEventListener('submit', (e) => e.preventDefault());
  $('avos').addEventListener('input', atualizar);
  $('diasFerias').addEventListener('input', atualizar);
  atualizar();

  // PWA: funciona offline e pode ser instalado na tela inicial do Android.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => { /* sem HTTPS/localhost: segue sem offline */ });
    });
  }
})();
