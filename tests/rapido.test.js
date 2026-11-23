const test = require('node:test');
const assert = require('node:assert/strict');
const N = require('../js/ar/nucleo.js');
const R = require('../js/ar/rapido.js');

const resp = (pares, base = R.estadoInicial()) => pares.reduce((e, [p, v]) => R.responder(e, p, v), base);

test('estado inicial: as respostas marcadas (★) já estão aplicadas no cálculo', () => {
  const e = R.estadoInicial();
  const n = N.normalizar(e);
  assert.equal(n.tipo, 'quarto');
  assert.equal(n.ambiente.largura * n.ambiente.comprimento, 12);
  assert.equal(n.piso, 'terreo', 'casa térrea');
  assert.equal(n.cobertura.tipo, 'laje_telhado');
  assert.equal(n.paredes.A.sol, 'naosei');
  assert.deepEqual(e.rapido.respondidas, []);
  assert.ok(N.calcular(e).dimensionamento.capacidadeTotal >= N.calcular(e).mercado.capacidade);
});

test('árvore: apartamento pula o teto; casa e último andar perguntam; sem sol pula a janela', () => {
  assert.deepEqual(R.perguntas({ local: 'apartamento', sol: 'tarde' }), ['comodo', 'tamanho', 'local', 'sol', 'janela', 'cidade', 'horario', 'ocupacao']);
  assert.ok(R.perguntas({ local: 'casa_terrea', sol: 'tarde' }).includes('teto'));
  assert.ok(R.perguntas({ local: 'ultimo_andar', sol: 'tarde' }).includes('teto'));
  assert.ok(!R.perguntas({ local: 'sobrado_baixo', sol: 'tarde' }).includes('teto'));
  assert.ok(!R.perguntas({ local: 'casa_terrea', sol: 'nao' }).includes('janela'));
  assert.equal(R.perguntas({ local: 'apartamento', sol: 'nao' }).length, 7, 'caminho mais curto: 7 perguntas');
  assert.equal(R.perguntas({ local: 'casa_terrea', sol: 'tarde' }).length, 9, 'caminho mais longo: 9 perguntas');
});

test('casa ou apartamento muda teto e piso', () => {
  const apto = N.normalizar(resp([['local', 'apartamento']]));
  assert.equal(apto.cobertura.tipo, 'apartamento');
  assert.equal(apto.piso, 'andar');
  const ultimo = N.normalizar(resp([['local', 'ultimo_andar']]));
  assert.equal(ultimo.cobertura.tipo, 'laje_telhado', 'padrão: o telhado do prédio');
  assert.equal(ultimo.piso, 'andar');
  const ultimoNaoSei = N.normalizar(resp([['local', 'ultimo_andar'], ['teto', 'naosei']]));
  assert.equal(ultimoNaoSei.cobertura.tipo, 'laje_exposta', 'não sei no prédio = laje pegando sol (pior caso)');
  const casaNaoSei = N.normalizar(resp([['teto', 'naosei']]));
  assert.equal(casaNaoSei.cobertura.tipo, 'telha', 'não sei na casa = telhas à vista (pior caso)');
  const loja = N.normalizar(resp([['comodo', 'loja']]));
  assert.equal(loja.cobertura.tipo, 'apartamento', 'loja vai para o ramo comercial com outro andar em cima');
  assert.equal(loja.piso, 'terreo');
});

test('tamanho: faixas, m² digitados (com vírgula) e medidas', () => {
  const area = (e) => {
    const n = N.normalizar(e);
    return Math.round(n.ambiente.largura * n.ambiente.comprimento * 100) / 100;
  };
  assert.equal(area(resp([['tamanho', '25']])), 25);
  assert.equal(area(resp([['tamanho', 'm2:22']])), 22);
  assert.equal(area(resp([['tamanho', 'm2:22,5']])), 22.5);
  assert.equal(area(resp([['tamanho', 'lxc:4,4x5']])), 22);
  const e0 = R.estadoInicial();
  assert.equal(R.responder(e0, 'tamanho', 'lixo'), e0, 'resposta inválida devolve o mesmo estado, sem mudança');
});

test('22 m² digitados no modo rápido nunca dão 12.000', () => {
  for (const local of ['casa_terrea', 'apartamento', 'ultimo_andar', 'sobrado_cima'])
    for (const sol of ['nao', 'manha', 'tarde', 'naosei'])
      for (const horario of ['noite', 'tarde_noite', 'dia', 'sempre']) {
        const e = resp([['tamanho', 'm2:22'], ['local', local], ['sol', sol], ['horario', horario]]);
        assert.ok(N.calcular(e).dimensionamento.capacidadeTotal >= 18000, `${local}/${sol}/${horario}`);
      }
});

test('trocar o cômodo aplica o típico, mas não mexe num tamanho já respondido', () => {
  const e = resp([['tamanho', 'm2:22'], ['comodo', 'sala']]);
  const n = N.normalizar(e);
  assert.equal(n.tipo, 'sala');
  assert.equal(Math.round(n.ambiente.largura * n.ambiente.comprimento), 22);
  assert.equal(n.pessoas.quantidade, 3);
  const cozinha = N.normalizar(resp([['comodo', 'cozinha']]));
  assert.equal(cozinha.ambiente.largura * cozinha.ambiente.comprimento, 9, 'cozinha: 9 m² típico');
});

test('sol e janela vão para a parede que dá para fora', () => {
  const e = N.normalizar(resp([['sol', 'tarde'], ['janela', 'grande']]));
  assert.equal(e.paredes.A.tipo, 'externa');
  assert.equal(e.paredes.A.sol, 'tarde');
  assert.equal(e.paredes.A.janela.largura, 2);
  const vidro = N.normalizar(resp([['sol', 'tarde'], ['janela', 'vidro']]));
  assert.equal(vidro.paredes.A.janela.peitoril, 0);
  assert.equal(N.normalizar(resp([['janela', 'sem']])).paredes.A.janela.largura, 0);
});

test('horário: típico do cômodo, opções fixas e 24 h', () => {
  assert.deepEqual(N.normalizar(resp([['comodo', 'escritorio'], ['horario', 'tipico']])).uso.inicio, 8);
  const n = N.normalizar(resp([['horario', 'sempre']]));
  assert.equal(n.uso.inicio, n.uso.fim);
  assert.equal(N.normalizar(resp([['horario', 'noite']])).uso.inicio, 21);
});

test('pessoas e aparelhos: liga e desliga cada um; "nada disso" limpa tudo', () => {
  let e = resp([['comodo', 'quarto']]);
  assert.equal(N.normalizar(e).aparelhos.tv, 1);
  e = R.responder(e, 'aparelho', 'tv');
  assert.equal(N.normalizar(e).aparelhos.tv, undefined, 'tirar a TV funciona');
  e = R.responder(e, 'aparelho', 'videogame');
  assert.equal(N.normalizar(e).aparelhos.videogame, 1);
  e = R.responder(e, 'nenhum_aparelho');
  assert.deepEqual(N.normalizar(e).aparelhos, {});
  e = R.responder(e, 'pessoas', 4);
  assert.equal(N.normalizar(e).pessoas.quantidade, 4);
  assert.ok(R.aparelhosDo('cozinha').some((a) => a.id === 'fogao'));
  assert.ok(!R.aparelhosDo('quarto').some((a) => a.id === 'fogao'));
});

test('o que supusemos: aparece o que não foi respondido e os "não sei"', () => {
  const s0 = R.suposicoes(R.estadoInicial());
  assert.ok(s0.some((t) => /Tamanho/.test(t)));
  assert.ok(s0.some((t) => /sol da tarde/.test(t)), 'sol ★ "não sei" = sol da tarde');
  const s1 = R.suposicoes(resp([['tamanho', 'm2:22'], ['sol', 'nao'], ['horario', 'noite'], ['pessoas', 2]]));
  assert.ok(!s1.some((t) => /Tamanho|Sol|Horário|Pessoas/.test(t)), s1.join(' | '));
});
