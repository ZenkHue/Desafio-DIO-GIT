/*
 * Modo rápido: a árvore de decisão das perguntas da Calculadora de BTUs.
 * Puro (sem DOM). Cada resposta altera o estado do motor (js/ar/nucleo.js) de um jeito documentado,
 * e algumas respostas pulam perguntas que não se aplicam (ex.: apartamento não pergunta o teto).
 *
 * Ordem pelo impacto medido no resultado: cômodo → tamanho → casa/apartamento (→ teto) → sol (→ janela)
 * → cidade → horário → pessoas e aparelhos. "Não sei" sobre a construção usa o pior caso (com aviso);
 * "Não sei" sobre o uso fica no típico do cômodo.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./nucleo.js'));
  else root.Rapido = factory(root.Nucleo);
})(typeof self !== 'undefined' ? self : this, function (N) {
  'use strict';

  const clonar = (o) => JSON.parse(JSON.stringify(o));

  const COMODOS = [
    { v: 'quarto', rotulo: 'Quarto', icone: '🛏️' },
    { v: 'sala', rotulo: 'Sala', icone: '🛋️' },
    { v: 'escritorio', rotulo: 'Escritório ou home office', icone: '💻' },
    { v: 'cozinha', rotulo: 'Cozinha', icone: '🍳' },
    { v: 'loja', rotulo: 'Loja ou comércio', icone: '🏪' },
    { v: 'academia', rotulo: 'Academia ou estúdio', icone: '🏋️' },
    { v: 'outro', rotulo: 'Outro', icone: '✏️' },
  ];
  const NOME_COMODO = { quarto: 'quarto', sala: 'sala', escritorio: 'escritório', cozinha: 'cozinha', loja: 'loja', academia: 'academia', outro: 'ambiente' };

  const TAMANHOS = [
    { v: '9', rotulo: 'Até 9 m²', ex: '3 × 3 m', l: 3, c: 3 },
    { v: '12', rotulo: 'Até 12 m²', ex: '3 × 4 m', l: 3, c: 4 },
    { v: '16', rotulo: 'Até 16 m²', ex: '4 × 4 m', l: 4, c: 4 },
    { v: '20', rotulo: 'Até 20 m²', ex: '4 × 5 m', l: 4, c: 5 },
    { v: '25', rotulo: 'Até 25 m²', ex: '5 × 5 m', l: 5, c: 5 },
    { v: '30', rotulo: 'Até 30 m²', ex: '5 × 6 m', l: 5, c: 6 },
    { v: '40', rotulo: 'Até 40 m²', ex: '5 × 8 m', l: 5, c: 8 },
  ];
  const TAMANHO_PADRAO = { quarto: '12', sala: '20', escritorio: '9', cozinha: '9', loja: '30', academia: '40', outro: '12' };

  const LOCAIS = [
    { v: 'casa_terrea', rotulo: 'Casa térrea', icone: '🏠' },
    { v: 'sobrado_cima', rotulo: 'Sobrado – andar de cima', icone: '🏡' },
    { v: 'sobrado_baixo', rotulo: 'Sobrado – andar de baixo', icone: '🏡' },
    { v: 'apartamento', rotulo: 'Apartamento (vizinho em cima e embaixo)', icone: '🏢' },
    { v: 'ultimo_andar', rotulo: 'Apartamento no último andar ou cobertura', icone: '🏙️' },
    { v: 'comercial', rotulo: 'Loja ou sala comercial', icone: '🏪' },
    { v: 'naosei', rotulo: 'Não sei', icone: '🤷' },
  ];

  const TETOS = {
    casa: [
      { v: 'laje_telhado', rotulo: 'Teto liso (laje), com telhado em cima' },
      { v: 'laje_exposta', rotulo: 'Teto liso (laje) sem telhado: a laje pega sol' },
      { v: 'forro', rotulo: 'Forro de PVC, gesso ou madeira' },
      { v: 'telha', rotulo: 'Dá para ver as telhas e as madeiras' },
      { v: 'naosei', rotulo: 'Não sei' },
    ],
    predio: [
      { v: 'laje_telhado', rotulo: 'O telhado do prédio' },
      { v: 'laje_exposta', rotulo: 'Laje ou terraço que pega sol' },
      { v: 'naosei', rotulo: 'Não sei' },
    ],
    comercio: [
      { v: 'apartamento', rotulo: 'Outro andar (salas ou apartamentos)' },
      { v: 'laje_telhado', rotulo: 'Laje com telhado em cima' },
      { v: 'forro', rotulo: 'Forro com telhado em cima' },
      { v: 'telha', rotulo: 'Telhado à vista (tipo galpão)' },
      { v: 'laje_exposta', rotulo: 'Laje que pega sol' },
      { v: 'naosei', rotulo: 'Não sei' },
    ],
  };
  const TETO_PADRAO = { casa: 'laje_telhado', predio: 'laje_telhado', comercio: 'apartamento' };
  const TETO_NAO_SEI = { casa: 'telha', predio: 'laje_exposta', comercio: 'telha' };

  const SOLS = [
    { v: 'tarde', rotulo: 'Sim, sol da tarde', icone: '☀️' },
    { v: 'manha', rotulo: 'Só de manhã', icone: '🌅' },
    { v: 'diatodo', rotulo: 'O dia todo', icone: '🌞' },
    { v: 'nao', rotulo: 'Não bate sol direto', icone: '⛅' },
    { v: 'naosei', rotulo: 'Não sei', icone: '🤷' },
  ];

  const JANELAS = [
    { v: 'pequena', rotulo: 'Pequena (até 1 m)', j: { largura: 1.0, altura: 1.0, peitoril: 1.1 } },
    { v: 'comum', rotulo: 'Comum (uns 1,2 m)', j: { largura: 1.2, altura: 1.2, peitoril: 1.0 } },
    { v: 'grande', rotulo: 'Grande (2 m ou mais)', j: { largura: 2.0, altura: 1.2, peitoril: 1.0 } },
    { v: 'vidro', rotulo: 'Porta ou parede de vidro (sacada, vitrine)', j: { largura: 2.4, altura: 2.1, peitoril: 0 } },
    { v: 'sem', rotulo: 'Não tem janela: o sol bate só na parede', j: { largura: 0, altura: 1.2, peitoril: 1.0 } },
    { v: 'naosei', rotulo: 'Não sei', j: { largura: 1.5, altura: 1.2, peitoril: 1.0 } },
  ];

  const HORARIOS = [
    { v: 'tipico', rotulo: 'O horário de costume deste cômodo' },
    { v: 'noite', rotulo: 'À noite, para dormir (21h às 7h)', inicio: 21, fim: 7, icone: '🌙' },
    { v: 'tarde_noite', rotulo: 'Tarde e noite (12h à meia-noite)', inicio: 12, fim: 0, icone: '🌇' },
    { v: 'dia', rotulo: 'Durante o dia (8h às 18h)', inicio: 8, fim: 18, icone: '🏢' },
    { v: 'sempre', rotulo: 'O dia todo (24 horas)', inicio: 0, fim: 0, icone: '⏱️' },
  ];

  /** Aparelhos oferecidos no modo rápido (ids do motor); na cozinha aparecem também os de cozinhar. */
  function aparelhosDo(comodo) {
    const tv = comodo === 'sala' ? 'tv_grande' : 'tv';
    const gelada = comodo === 'cozinha' ? 'geladeira' : 'frigobar';
    const lista = [
      { id: tv, rotulo: 'TV', icone: '📺' },
      { id: 'pc', rotulo: 'Computador', icone: '🖥️' },
      { id: 'notebook', rotulo: 'Notebook', icone: '💻' },
      { id: 'videogame', rotulo: 'Videogame', icone: '🎮' },
      { id: 'pc_gamer', rotulo: 'PC gamer', icone: '🕹️' },
      { id: gelada, rotulo: comodo === 'cozinha' ? 'Geladeira' : 'Frigobar', icone: '🧊' },
    ];
    if (comodo === 'cozinha')
      lista.push({ id: 'fogao', rotulo: 'Fogão', icone: '🔥' }, { id: 'micro_ondas', rotulo: 'Micro-ondas', icone: '♨️' }, { id: 'air_fryer', rotulo: 'Air fryer', icone: '🍟' }, { id: 'forno', rotulo: 'Forno elétrico', icone: '🥘' });
    return lista;
  }

  /** Qual "teto" perguntar conforme o local (ou nenhum). */
  function grupoTeto(local) {
    if (local === 'casa_terrea' || local === 'sobrado_cima') return 'casa';
    if (local === 'ultimo_andar') return 'predio';
    if (local === 'comercial') return 'comercio';
    return null;
  }

  /** Respostas iniciais (o que aparece marcado com ★). */
  function respostasPadrao() {
    return {
      comodo: 'quarto', tamanho: TAMANHO_PADRAO.quarto, local: 'casa_terrea', teto: 'laje_telhado', sol: 'naosei',
      janela: 'comum', horario: 'tipico', respondidas: [],
    };
  }

  /** Lista das perguntas visíveis, na ordem, para as respostas atuais (a árvore). */
  function perguntas(r) {
    const out = ['comodo', 'tamanho', 'local'];
    if (grupoTeto(r.local)) out.push('teto');
    out.push('sol');
    if (r.sol !== 'nao') out.push('janela');
    out.push('cidade', 'horario', 'ocupacao');
    return out;
  }

  /** Ajusta largura × comprimento a partir de uma resposta de tamanho. */
  function medidas(valor) {
    const s = String(valor);
    const faixa = TAMANHOS.find((t) => t.v === s);
    if (faixa) return { largura: faixa.l, comprimento: faixa.c };
    let m = s.match(/^m2:(\d+(?:[.,]\d+)?)$/);
    if (m) {
      const area = Math.min(400, Math.max(4, Number(m[1].replace(',', '.'))));
      const largura = Math.round(Math.sqrt(area * 0.75) * 10) / 10;
      return { largura, comprimento: Math.round((area / largura) * 1000) / 1000 };
    }
    m = s.match(/^lxc:(\d+(?:[.,]\d+)?)x(\d+(?:[.,]\d+)?)$/);
    if (m) return { largura: Number(m[1].replace(',', '.')), comprimento: Number(m[2].replace(',', '.')) };
    return null;
  }

  /**
   * Aplica uma resposta. Devolve um NOVO estado (o original não muda).
   * O estado guarda as respostas em estado.rapido, para a tela mostrar os chips e "O que supusemos".
   */
  function responder(estado, pergunta, valor) {
    const e = clonar(estado);
    const r = { ...respostasPadrao(), ...(e.rapido || {}) };
    r.respondidas = [...new Set([...(r.respondidas || []), pergunta])];
    e.paredes = e.paredes || clonar(N.PADRAO.paredes);
    switch (pergunta) {
      case 'comodo': {
        const tipo = valor === 'outro' ? 'sala' : valor;
        const t = N.aplicarTipo(e, tipo);
        Object.assign(e, t);
        e.tipo = valor;
        r.comodo = valor;
        if (!r.respondidas.includes('tamanho')) {
          r.tamanho = TAMANHO_PADRAO[valor];
          Object.assign((e.ambiente = { ...(e.ambiente || N.PADRAO.ambiente) }), medidas(r.tamanho));
        }
        if (valor === 'loja' || valor === 'academia') {
          if (!r.respondidas.includes('local')) {
            r.local = 'comercial';
            Object.assign(e, aplicarLocal(e, r, 'comercial'));
          }
        }
        break;
      }
      case 'tamanho': {
        const m = medidas(valor);
        if (!m) return estado;
        r.tamanho = String(valor);
        e.ambiente = { ...(e.ambiente || N.PADRAO.ambiente), ...m };
        break;
      }
      case 'local':
        r.local = valor;
        Object.assign(e, aplicarLocal(e, r, valor));
        break;
      case 'teto': {
        r.teto = valor;
        const g = grupoTeto(r.local) || 'casa';
        e.cobertura = { ...(e.cobertura || {}), tipo: valor === 'naosei' ? TETO_NAO_SEI[g] : valor };
        break;
      }
      case 'sol':
        r.sol = valor;
        e.paredes.A = { ...e.paredes.A, tipo: 'externa', sol: valor };
        break;
      case 'janela': {
        const j = JANELAS.find((x) => x.v === valor);
        if (!j) return estado;
        r.janela = valor;
        e.paredes.A = { ...e.paredes.A, tipo: 'externa', janela: { ...(e.paredes.A.janela || {}), ...j.j } };
        break;
      }
      case 'cidade':
        e.cidade = valor;
        break;
      case 'horario': {
        r.horario = valor;
        const h = HORARIOS.find((x) => x.v === valor && x.inicio !== undefined);
        const tipico = N.TIPOS[r.comodo === 'outro' ? 'sala' : r.comodo] || N.TIPOS.sala;
        e.uso = { ...(e.uso || {}), inicio: h ? h.inicio : tipico.inicio, fim: h ? h.fim : tipico.fim % 24 };
        break;
      }
      case 'pessoas':
        e.pessoas = { ...(e.pessoas || {}), quantidade: Math.max(1, Math.min(50, Math.round(Number(valor) || 1))) };
        r.respondidas = [...new Set([...r.respondidas, 'ocupacao'])];
        break;
      case 'aparelho': {
        // valor: "id" alterna entre 0 e 1 (ou mantém a quantidade se já tinha mais)
        const ap = { ...(e.aparelhos || {}) };
        if (ap[valor]) delete ap[valor];
        else ap[valor] = 1;
        e.aparelhos = ap;
        r.respondidas = [...new Set([...r.respondidas, 'ocupacao'])];
        break;
      }
      case 'nenhum_aparelho':
        e.aparelhos = {};
        r.respondidas = [...new Set([...r.respondidas, 'ocupacao'])];
        break;
      default:
        return estado;
    }
    e.rapido = r;
    return e;
  }

  function aplicarLocal(e, r, local) {
    const out = {};
    const cob = { ...(e.cobertura || {}) };
    const g = grupoTeto(local);
    switch (local) {
      case 'casa_terrea':
      case 'comercial':
        out.piso = 'terreo';
        break;
      case 'sobrado_cima':
      case 'ultimo_andar':
        out.piso = 'andar';
        break;
      case 'sobrado_baixo':
        out.piso = 'terreo';
        cob.tipo = 'apartamento';
        break;
      case 'apartamento':
        out.piso = 'andar';
        cob.tipo = 'apartamento';
        break;
      default: // não sei: pior caso razoável para casa
        out.piso = 'terreo';
        cob.tipo = 'telha';
    }
    if (g) {
      // ao entrar num ramo com pergunta de teto, usa o padrão do ramo (ou a resposta, se já foi dada e serve)
      const opcoes = TETOS[g].map((x) => x.v);
      if (!r.respondidas.includes('teto') || !opcoes.includes(r.teto)) r.teto = TETO_PADRAO[g];
      cob.tipo = r.teto === 'naosei' ? TETO_NAO_SEI[g] : r.teto;
    }
    out.cobertura = cob;
    return out;
  }

  /** Estado inicial do app no modo rápido: o padrão do motor com as respostas ★ aplicadas. */
  function estadoInicial() {
    let e = clonar(N.PADRAO);
    e.rapido = respostasPadrao();
    e = responder(e, 'comodo', 'quarto');
    e = responder(e, 'local', 'casa_terrea');
    e = responder(e, 'sol', 'naosei');
    e = responder(e, 'janela', 'comum');
    e.rapido.respondidas = [];
    return e;
  }

  /** O que foi suposto (não respondido ou "Não sei"), para a tela mostrar com honestidade. */
  function suposicoes(estado) {
    const r = { ...respostasPadrao(), ...(estado.rapido || {}) };
    const resp = new Set(r.respondidas || []);
    const out = [];
    const nome = NOME_COMODO[r.comodo] || 'ambiente';
    if (!resp.has('tamanho')) out.push(`Tamanho: usamos ${(TAMANHOS.find((t) => t.v === r.tamanho) || {}).rotulo || 'o típico'} (típico de ${nome}).`);
    if (r.local === 'naosei') out.push('Casa ou apartamento: supusemos casa térrea com telhas à vista (pior caso).');
    if (r.teto === 'naosei' && grupoTeto(r.local)) out.push('Teto: supusemos o pior caso (telhado sem laje ou laje pegando sol).');
    if (r.sol === 'naosei') out.push('Sol: supusemos sol da tarde, o que mais esquenta.');
    if (r.janela === 'naosei' && r.sol !== 'nao') out.push('Janela: supusemos 1,5 m de largura.');
    if (!resp.has('horario') || r.horario === 'tipico') out.push(`Horário: usamos o de costume de ${nome}.`);
    if (!resp.has('ocupacao')) out.push(`Pessoas e aparelhos: usamos o típico de ${nome}.`);
    return out;
  }

  return { COMODOS, NOME_COMODO, TAMANHOS, TAMANHO_PADRAO, LOCAIS, TETOS, SOLS, JANELAS, HORARIOS, aparelhosDo, grupoTeto, perguntas, medidas, responder, respostasPadrao, estadoInicial, suposicoes };
});
