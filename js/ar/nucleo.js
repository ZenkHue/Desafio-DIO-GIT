/*
 * Núcleo da Calculadora de Ar-Condicionado (v2) — cálculo de carga térmica HORA A HORA.
 * Puro (sem DOM): roda no navegador (window.Nucleo) e no Node (testes e CLI).
 *
 * Como funciona, em uma frase: para cada hora do "dia quente de projeto" calcula o sol em cada
 * parede (posição real do sol na latitude da cidade), a temperatura externa daquela hora, o calor
 * que as paredes/teto deixam passar com atraso térmico, o sol que entra pelos vidros, as pessoas,
 * os aparelhos e o ar de fora — e dimensiona pelo PIOR horário em que o ar fica ligado.
 *
 * Métodos (simplificados) e referências: geometria solar e modelo de céu claro da ASHRAE;
 * temperatura de sol-ar; fator de decremento e atraso térmico (método da admitância/CIBSE, valores
 * de atraso na linha da NBR 15220-3); séries temporais radiantes (RTS, ASHRAE) para o calor que entra
 * por radiação. Detalhes, premissas e grau de confiança: docs/estudo-carga-termica.md.
 * É PRÉ-DIMENSIONAMENTO: não substitui projeto conforme a ABNT NBR 16401.
 *
 * Geometria: planta vista de cima. Parede A = em cima, B = direita, C = embaixo, D = esquerda.
 * Eixos: x para a direita (largura), z para baixo (comprimento), y para cima.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Nucleo = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ===================================================================== constantes */
  const W_PARA_BTU = 3.412142;
  const PAREDES = ['A', 'B', 'C', 'D'];
  const CAPACIDADES = [7500, 9000, 12000, 18000, 22000, 24000, 30000, 36000, 48000, 60000];
  // Alcance típico do jato de ar (m) — referência de mercado; o manual do modelo prevalece.
  const ALCANCE = { 7500: 5, 9000: 6, 12000: 7, 18000: 8, 22000: 8.5, 24000: 9, 30000: 10, 36000: 11, 48000: 12, 60000: 13 };

  /**
   * Clima de projeto de verão — VALORES APROXIMADOS de referência (editáveis no app).
   * tmax: temperatura máxima do dia quente (°C) · amp: amplitude diária (°C) · ur: umidade relativa na hora mais quente (%).
   */
  const CIDADES = {
    'sao-paulo': { nome: 'São Paulo (SP)', lat: -23.55, tmax: 31.5, amp: 9, ur: 50 },
    campinas: { nome: 'Campinas (SP)', lat: -22.91, tmax: 32, amp: 10, ur: 45 },
    'rio-de-janeiro': { nome: 'Rio de Janeiro (RJ)', lat: -22.91, tmax: 35.5, amp: 7, ur: 50 },
    'belo-horizonte': { nome: 'Belo Horizonte (MG)', lat: -19.92, tmax: 31, amp: 10, ur: 45 },
    vitoria: { nome: 'Vitória (ES)', lat: -20.32, tmax: 34, amp: 7, ur: 55 },
    curitiba: { nome: 'Curitiba (PR)', lat: -25.43, tmax: 30, amp: 10, ur: 50 },
    florianopolis: { nome: 'Florianópolis (SC)', lat: -27.59, tmax: 32, amp: 7, ur: 60 },
    'porto-alegre': { nome: 'Porto Alegre (RS)', lat: -30.03, tmax: 34.5, amp: 10, ur: 45 },
    brasilia: { nome: 'Brasília (DF)', lat: -15.79, tmax: 30.5, amp: 11, ur: 40 },
    goiania: { nome: 'Goiânia (GO)', lat: -16.68, tmax: 34, amp: 12, ur: 35 },
    cuiaba: { nome: 'Cuiabá (MT)', lat: -15.6, tmax: 38, amp: 11, ur: 40 },
    'campo-grande': { nome: 'Campo Grande (MS)', lat: -20.47, tmax: 34, amp: 11, ur: 40 },
    salvador: { nome: 'Salvador (BA)', lat: -12.97, tmax: 32, amp: 6, ur: 60 },
    aracaju: { nome: 'Aracaju (SE)', lat: -10.91, tmax: 32, amp: 6, ur: 60 },
    maceio: { nome: 'Maceió (AL)', lat: -9.67, tmax: 32, amp: 6, ur: 60 },
    recife: { nome: 'Recife (PE)', lat: -8.05, tmax: 32, amp: 6, ur: 60 },
    'joao-pessoa': { nome: 'João Pessoa (PB)', lat: -7.12, tmax: 32, amp: 6, ur: 60 },
    natal: { nome: 'Natal (RN)', lat: -5.79, tmax: 32, amp: 6, ur: 60 },
    fortaleza: { nome: 'Fortaleza (CE)', lat: -3.73, tmax: 32, amp: 7, ur: 60 },
    teresina: { nome: 'Teresina (PI)', lat: -5.09, tmax: 38, amp: 12, ur: 35 },
    'sao-luis': { nome: 'São Luís (MA)', lat: -2.53, tmax: 33, amp: 7, ur: 60 },
    belem: { nome: 'Belém (PA)', lat: -1.46, tmax: 33.5, amp: 8, ur: 60 },
    macapa: { nome: 'Macapá (AP)', lat: 0.03, tmax: 33.5, amp: 8, ur: 60 },
    manaus: { nome: 'Manaus (AM)', lat: -3.12, tmax: 35, amp: 9, ur: 50 },
    'boa-vista': { nome: 'Boa Vista (RR)', lat: 2.82, tmax: 35, amp: 10, ur: 45 },
    'porto-velho': { nome: 'Porto Velho (RO)', lat: -8.76, tmax: 35, amp: 10, ur: 50 },
    'rio-branco': { nome: 'Rio Branco (AC)', lat: -9.97, tmax: 35, amp: 11, ur: 50 },
    palmas: { nome: 'Palmas (TO)', lat: -10.18, tmax: 37, amp: 12, ur: 35 },
  };

  // Fração da amplitude diária abaixo da máxima, por hora (0h..23h). Perfil-padrão da ASHRAE (máxima às 15h, mínima às 5h).
  const FRACAO_AMPLITUDE = [0.82, 0.87, 0.92, 0.96, 0.99, 1.0, 0.98, 0.93, 0.84, 0.71, 0.56, 0.39, 0.23, 0.11, 0.03, 0.0, 0.03, 0.1, 0.21, 0.34, 0.47, 0.58, 0.68, 0.76];

  // Modelo de céu claro (ASHRAE, janeiro): A [W/m²], B, C. "Clareza" < 1 para a névoa/umidade tropical.
  const CEU = { A: 1202, B: 0.141, C: 0.103, clareza: 0.9, refletanciaSolo: 0.2, diaDoAno: 21 };

  /** Paredes: U [W/m²K], atraso térmico [h]. Valores na linha da NBR 15220-3 (aproximados). */
  const MATERIAIS = {
    alvenaria: { rotulo: 'Tijolo ou bloco cerâmico rebocado (parede comum)', U: 2.45, atraso: 3.8, massa: 'media' },
    grossa: { rotulo: 'Parede grossa, dupla ou de tijolo maciço (~25 cm)', U: 1.7, atraso: 6.5, massa: 'pesada' },
    concreto: { rotulo: 'Concreto (parede de prédio, ~10 cm)', U: 4.4, atraso: 2.7, massa: 'pesada' },
    drywall: { rotulo: 'Drywall ou divisória leve', U: 1.8, atraso: 0.5, massa: 'leve' },
    isolada: { rotulo: 'Parede com isolamento (lã, EPS, drywall com lã)', U: 0.6, atraso: 1.5, massa: 'leve' },
  };

  /** O que há em cima do ambiente. alfa vem da cor. */
  const COBERTURAS = {
    apartamento: { rotulo: 'Outro andar em cima, sem ar ligado (apartamento ou sobrado)', U: 2.3, adjacente: true },
    apartamento_ar: { rotulo: 'Andar de cima com ar-condicionado ligado', nula: true },
    laje_telhado: { rotulo: 'Laje com telhado por cima', U: 1.9, atraso: 4 },
    forro: { rotulo: 'Telhado com forro (PVC, gesso ou madeira), sem laje', U: 2.0, atraso: 1.3 },
    telha: { rotulo: 'Só telhado: sem laje e sem forro (telha à vista)', U: 4.55, atraso: 0.3 },
    laje_exposta: { rotulo: 'Laje sem telhado, pegando sol (último andar, terraço)', U: 3.7, atraso: 2.7 },
    isolada: { rotulo: 'Teto com isolamento (manta, lã ou telha sanduíche)', U: 0.7, atraso: 2 },
  };

  /** O que há embaixo do ambiente. */
  const PISOS = {
    andar: { rotulo: 'Outro andar embaixo (apartamento ou sobrado)', U: 2.0, adjacente: true },
    terreo: { rotulo: 'Térreo, direto no chão', nulo: true },
    aberto: { rotulo: 'Garagem ou área aberta embaixo (pilotis)', U: 2.5, externo: true },
  };

  const ABSORTANCIA = { clara: 0.3, media: 0.6, escura: 0.85 };

  const VIDROS = {
    comum: { rotulo: 'Vidro comum (incolor)', U: 5.8, shgc: 0.82 },
    fume: { rotulo: 'Vidro fumê, verde ou bronze', U: 5.8, shgc: 0.6 },
    pelicula: { rotulo: 'Vidro com película (insulfilm) de controle solar', U: 5.6, shgc: 0.4 },
    refletivo: { rotulo: 'Vidro refletivo / espelhado', U: 5.6, shgc: 0.35 },
    duplo: { rotulo: 'Vidro duplo / insulado (low-e)', U: 2.8, shgc: 0.4 },
  };
  // fDir/fDif multiplicam o sol direto/difuso que atravessa o vidro.
  const PROTECOES = {
    nenhuma: { rotulo: 'Nenhuma', fDir: 1, fDif: 1 },
    cortina: { rotulo: 'Cortina ou persiana por dentro', fDir: 0.65, fDif: 0.65 },
    externa: { rotulo: 'Toldo, brise, persiana externa ou varanda funda', fDir: 0.2, fDif: 0.7 },
  };

  /** Calor por pessoa [W] (ASHRAE, aproximado). */
  const ATIVIDADES = {
    dormindo: { rotulo: 'Dormindo / descansando', sens: 60, lat: 30 },
    sentado: { rotulo: 'Sentado (TV, leitura, estudo)', sens: 70, lat: 45 },
    escritorio: { rotulo: 'Trabalho de escritório', sens: 75, lat: 55 },
    em_pe: { rotulo: 'Em pé / andando (loja, cozinha)', sens: 75, lat: 75 },
    exercicio: { rotulo: 'Exercício físico', sens: 150, lat: 250 },
  };

  /**
   * Fontes de calor: calor MÉDIO liberado no ambiente enquanto em uso [W], já considerando quanto do
   * tempo o aparelho fica de fato ligado (ex.: micro-ondas liga poucos minutos por hora).
   * sempre = funciona 24 h (geladeira); cozinha = só nos horários de refeição; eletronico = conta na regra das lojas.
   */
  const APARELHOS = [
    { id: 'tv', nome: 'TV até 43"', sens: 70, eletronico: true },
    { id: 'tv_grande', nome: 'TV grande (50" ou mais)', sens: 130, eletronico: true },
    { id: 'notebook', nome: 'Notebook', sens: 50, eletronico: true },
    { id: 'pc', nome: 'Computador + monitor', sens: 180, eletronico: true },
    { id: 'pc_gamer', nome: 'PC gamer (jogando)', sens: 400, eletronico: true },
    { id: 'videogame', nome: 'Videogame', sens: 160, eletronico: true },
    { id: 'som', nome: 'Som / home theater', sens: 40, eletronico: true },
    { id: 'impressora', nome: 'Impressora', sens: 30, eletronico: true },
    { id: 'geladeira', nome: 'Geladeira', sens: 90, sempre: true },
    { id: 'frigobar', nome: 'Frigobar', sens: 50, sempre: true },
    { id: 'freezer', nome: 'Freezer', sens: 110, sempre: true },
    { id: 'aquario', nome: 'Aquário', sens: 60, sempre: true },
    { id: 'micro_ondas', nome: 'Micro-ondas', sens: 150, cozinha: true },
    { id: 'air_fryer', nome: 'Air fryer', sens: 400, cozinha: true },
    { id: 'forno', nome: 'Forno elétrico', sens: 700, cozinha: true },
    { id: 'fogao', nome: 'Fogão a gás (cozinhando)', sens: 1500, lat: 400, cozinha: true },
    { id: 'cafeteira', nome: 'Cafeteira', sens: 80, cozinha: true },
    { id: 'lampada', nome: 'Lâmpada incandescente/halógena (cada)', sens: 60 },
    { id: 'servidor', nome: 'Servidor / rack de rede', sens: 400, sempre: true, eletronico: true },
  ];
  const APARELHOS_POR_ID = Object.fromEntries(APARELHOS.map((a) => [a.id, a]));
  const HORAS_COZINHA = [11, 12, 18, 19];

  const ILUMINACAO = {
    led: { rotulo: 'LED', wm2: 5 },
    fluorescente: { rotulo: 'Fluorescente', wm2: 10 },
    incandescente: { rotulo: 'Incandescente / halógena', wm2: 20 },
    nenhuma: { rotulo: 'Pouca ou nenhuma', wm2: 0 },
  };

  const INFILTRACAO = {
    baixa: { rotulo: 'Bem fechado (janelas boas, porta fechada)', ach: 0.3 },
    normal: { rotulo: 'Normal', ach: 0.6 },
    alta: { rotulo: 'Abre muito (porta para a rua, cozinha, loja)', ach: 1.2 },
  };

  // Séries temporais radiantes (fração do calor radiante que vira carga 0, 1, 2… horas depois).
  const RTS_BASE = {
    leve: [0.53, 0.17, 0.09, 0.05, 0.04, 0.03, 0.02, 0.02, 0.01, 0.01, 0.01, 0.01, 0.01],
    media: [0.4, 0.16, 0.09, 0.06, 0.05, 0.04, 0.03, 0.03, 0.02, 0.02, 0.02, 0.02, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01],
    pesada: [0.28, 0.12, 0.08, 0.06, 0.05, 0.04, 0.04, 0.03, 0.03, 0.03, 0.03, 0.03, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.02, 0.01, 0.01, 0.01],
  };
  const RTS = Object.fromEntries(
    Object.entries(RTS_BASE).map(([k, v]) => {
      const s = v.reduce((a, b) => a + b, 0);
      return [k, v.map((x) => x / s)];
    })
  );

  /** Quanto da carga de partida o aparelho deve vencer na 1ª hora. */
  const PARTIDAS = {
    rapida: { rotulo: 'Gelar rápido: ~1 hora depois de ligar', fator: 1 },
    normal: { rotulo: 'Sem pressa: ~2 horas', fator: 0.5 },
    nenhuma: { rotulo: 'Não considerar (ar ligado o tempo todo)', fator: 0 },
  };

  const DIRECOES = { N: 0, NE: 45, L: 90, SE: 135, S: 180, SO: 225, O: 270, NO: 315 };
  const DESLOCAMENTO_PAREDE = { A: 0, B: 90, C: 180, D: 270 }; // sentido horário na planta
  const AZIMUTE_EXPOSICAO = { manha: 90, tarde: 270 };
  const EXPOSICOES = {
    nao: 'Não pega sol',
    manha: 'Sol da manhã',
    tarde: 'Sol da tarde',
    diatodo: 'Sol o dia todo',
    naosei: 'Não sei',
  };

  /** Presets por tipo de ambiente (o que o brasileiro costuma ter). */
  const TIPOS = {
    quarto: { rotulo: 'Quarto', icone: '🛏️', pessoas: 2, atividade: 'dormindo', inicio: 21, fim: 7, aparelhos: { tv: 1 }, iluminacao: 'led', infiltracao: 'baixa', luzDia: false },
    sala: { rotulo: 'Sala', icone: '🛋️', pessoas: 3, atividade: 'sentado', inicio: 12, fim: 24, aparelhos: { tv_grande: 1 }, iluminacao: 'led', infiltracao: 'normal', luzDia: false },
    escritorio: { rotulo: 'Escritório / home office', icone: '💻', pessoas: 1, atividade: 'escritorio', inicio: 8, fim: 18, aparelhos: { pc: 1 }, iluminacao: 'led', infiltracao: 'normal', luzDia: true },
    cozinha: { rotulo: 'Cozinha', icone: '🍳', pessoas: 2, atividade: 'em_pe', inicio: 10, fim: 21, aparelhos: { geladeira: 1, micro_ondas: 1, fogao: 1 }, iluminacao: 'led', infiltracao: 'alta', luzDia: true },
    loja: { rotulo: 'Loja / comércio', icone: '🏪', pessoas: 6, atividade: 'em_pe', inicio: 9, fim: 19, aparelhos: { pc: 1 }, iluminacao: 'fluorescente', infiltracao: 'alta', luzDia: true },
    academia: { rotulo: 'Academia / estúdio', icone: '🏋️', pessoas: 6, atividade: 'exercicio', inicio: 6, fim: 22, aparelhos: { som: 1 }, iluminacao: 'led', infiltracao: 'normal', luzDia: true },
  };

  const janelaPadrao = (largura = 0) => ({ largura, altura: 1.2, peitoril: 1.0, pos: 0.5, vidro: 'comum', protecao: 'nenhuma' });
  const portaPadrao = (ativa = false, pos = 0.5) => ({ ativa, largura: 0.8, pos });

  /** Estado padrão: quarto 3 × 4 m, janela com sol da tarde, apartamento. */
  const PADRAO = {
    v: 2,
    tipo: 'quarto',
    ambiente: { largura: 3, comprimento: 4, peDireito: 2.6 },
    cidade: 'sao-paulo',
    clima: { tmax: null, amp: null, ur: null },
    cobertura: { tipo: 'apartamento', cor: 'media' },
    piso: 'andar',
    orientacao: { modo: 'sol', paredeA: 'N' },
    paredes: {
      A: { tipo: 'externa', sol: 'tarde', sombra: false, material: 'alvenaria', cor: 'media', janela: janelaPadrao(1.2), porta: portaPadrao() },
      B: { tipo: 'interna', sol: 'nao', sombra: false, material: 'alvenaria', cor: 'media', janela: janelaPadrao(), porta: portaPadrao() },
      C: { tipo: 'interna', sol: 'nao', sombra: false, material: 'alvenaria', cor: 'media', janela: janelaPadrao(), porta: portaPadrao(true, 0.8) },
      D: { tipo: 'interna', sol: 'nao', sombra: false, material: 'alvenaria', cor: 'media', janela: janelaPadrao(), porta: portaPadrao() },
    },
    pessoas: { quantidade: 2, atividade: 'dormindo' },
    aparelhos: { tv: 1 },
    extras: [],
    iluminacao: 'led',
    uso: { inicio: 21, fim: 7, temperatura: 23 },
    avancado: { margem: 0.1, infiltracao: 'baixa', massa: 'auto', partida: 'rapida' },
    energia: { tarifa: 0.95, tecnologia: 'inverter' },
    moveis: [{ tipo: 'cama', x: 1.5, z: 2.9, rot: 0 }],
  };

  /* ===================================================================== utilitários */
  const RAD = Math.PI / 180;
  const arred = (n, d = 0) => {
    const f = Math.pow(10, d);
    return Math.round((n + Number.EPSILON) * f) / f;
  };
  const num = (v, padrao = 0) => {
    const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
    return Number.isFinite(n) ? n : padrao;
  };
  const limitar = (n, a, b) => Math.min(b, Math.max(a, n));
  const clonar = (o) => JSON.parse(JSON.stringify(o));
  const zeros = () => new Array(24).fill(0);

  function mesclar(base, extra) {
    if (extra === undefined || extra === null) return clonar(base);
    if (Array.isArray(base) || typeof base !== 'object' || base === null) return clonar(extra);
    if (typeof extra !== 'object' || Array.isArray(extra)) return clonar(base);
    const out = {};
    for (const k of Object.keys(base)) out[k] = k in extra ? mesclar(base[k], extra[k]) : clonar(base[k]);
    for (const k of Object.keys(extra)) if (!(k in base)) out[k] = clonar(extra[k]);
    return out;
  }

  /** Horas em que o ar fica ligado: de `inicio` até `fim` (pode virar a meia-noite). inicio = fim → 24 h. */
  function horasDeUso(inicio, fim) {
    const i = ((Math.round(inicio) % 24) + 24) % 24;
    const f = ((Math.round(fim) % 24) + 24) % 24;
    if (i === f) return Array.from({ length: 24 }, (_, h) => h);
    const out = [];
    for (let h = i; h !== f; h = (h + 1) % 24) out.push(h);
    return out;
  }

  /* ===================================================================== psicrometria */
  const pressaoSaturacao = (t) => 0.61094 * Math.exp((17.625 * t) / (t + 243.04)); // kPa
  function umidadeAbsoluta(t, ur) {
    const pv = pressaoSaturacao(t) * (limitar(ur, 0, 100) / 100);
    return (622 * pv) / (101.325 - pv); // g/kg
  }

  /* ===================================================================== sol */
  function declinacao(dia) {
    return 23.45 * Math.sin(((360 * (284 + dia)) / 365) * RAD);
  }

  /** Posição do sol e radiação de céu claro na hora solar h. Azimute a partir do Norte, sentido horário. */
  function posicaoSol(h, lat, dia = CEU.diaDoAno) {
    const d = declinacao(dia) * RAD;
    const L = lat * RAD;
    const H = 15 * (h - 12) * RAD;
    const sinBeta = Math.cos(L) * Math.cos(d) * Math.cos(H) + Math.sin(L) * Math.sin(d);
    const beta = Math.asin(limitar(sinBeta, -1, 1));
    let az = Math.atan2(-Math.cos(d) * Math.sin(H), Math.sin(d) * Math.cos(L) - Math.cos(d) * Math.sin(L) * Math.cos(H)) / RAD;
    az = (az + 360) % 360;
    if (sinBeta <= 0.02) return { altitude: beta / RAD, azimute: az, idn: 0, difusa: 0 };
    const idn = CEU.A * Math.exp(-CEU.B / sinBeta) * CEU.clareza;
    return { altitude: beta / RAD, azimute: az, idn, difusa: CEU.C * idn };
  }

  /** Radiação numa superfície vertical voltada para `azSup` (graus). */
  function radiacaoVertical(s, azSup) {
    if (!s.idn) return { direta: 0, difusa: 0, cosTheta: 0 };
    const cosTheta = Math.cos(s.altitude * RAD) * Math.cos((s.azimute - azSup) * RAD);
    const Y = Math.max(0.45, 0.55 + 0.437 * cosTheta + 0.313 * cosTheta * cosTheta);
    const refletida = CEU.refletanciaSolo * (s.idn * Math.sin(s.altitude * RAD) + s.difusa) * 0.5;
    return { direta: s.idn * Math.max(0, cosTheta), difusa: s.difusa * Y + refletida, cosTheta };
  }

  function radiacaoHorizontal(s) {
    if (!s.idn) return { direta: 0, difusa: 0, cosTheta: 0 };
    const sinB = Math.sin(s.altitude * RAD);
    return { direta: s.idn * sinB, difusa: s.difusa, cosTheta: sinB };
  }

  /** Fator angular do vidro: o vidro reflete mais quando o sol chega rasante. */
  const fatorAngular = (cosTheta) => {
    if (cosTheta <= 0) return 0;
    const theta = Math.acos(Math.min(1, cosTheta)) / RAD;
    return Math.max(0, 1 - Math.pow(theta / 90, 4));
  };

  /** Exposição ao sol de uma parede ('nao' | 'manha' | 'tarde' | 'diatodo'), nos dois modos. */
  function exposicaoParede(e, k) {
    const p = e.paredes[k];
    if (p.tipo !== 'externa') return 'nao';
    if (e.orientacao.modo === 'sol') return p.sol === 'naosei' ? 'tarde' : p.sol;
    if (p.sombra) return 'nao';
    const az = azimuteParede(e, k);
    if (az > 45 && az < 135) return 'manha';
    if (az > 225 && az < 315) return 'tarde';
    // Norte/Sul: no verão perto do Trópico pegam sol parte do dia; tratamos como "dia todo" (fraco) para a condensadora
    return az <= 45 || az >= 315 ? 'diatodo' : 'nao';
  }

  function azimuteParede(e, k) {
    if (e.orientacao.modo === 'bussola') return (DIRECOES[e.orientacao.paredeA] + DESLOCAMENTO_PAREDE[k]) % 360;
    const s = e.paredes[k].sol === 'naosei' ? 'tarde' : e.paredes[k].sol;
    return AZIMUTE_EXPOSICAO[s] !== undefined ? AZIMUTE_EXPOSICAO[s] : null;
  }

  /** Radiação horária (24 valores) numa parede, conforme o modo (sol percebido ou bússola). */
  function radiacaoParede(e, k, sois) {
    const p = e.paredes[k];
    const modoSol = e.orientacao.modo === 'sol';
    const exp = modoSol ? (p.sol === 'naosei' ? 'tarde' : p.sol) : null;
    return sois.map((s) => {
      let r;
      if (modoSol && exp === 'diatodo') {
        const l = radiacaoVertical(s, 90);
        const o = radiacaoVertical(s, 270);
        r = l.direta >= o.direta ? l : o;
      } else if (modoSol && exp === 'nao') {
        r = { ...radiacaoVertical(s, 0), direta: 0, cosTheta: 0 };
        r.difusa = s.idn ? s.difusa * 0.45 + CEU.refletanciaSolo * (s.idn * Math.sin(s.altitude * RAD) + s.difusa) * 0.5 : 0;
      } else {
        r = radiacaoVertical(s, azimuteParede(e, k));
        if (!modoSol && p.sombra) r = { ...r, direta: 0, cosTheta: 0 };
      }
      return r;
    });
  }

  /* ===================================================================== normalização */
  function normalizar(entrada) {
    const e = mesclar(PADRAO, entrada || {});
    e.ambiente.largura = limitar(num(e.ambiente.largura, 3), 1, 40);
    e.ambiente.comprimento = limitar(num(e.ambiente.comprimento, 4), 1, 40);
    e.ambiente.peDireito = limitar(num(e.ambiente.peDireito, 2.6), 2, 6);
    if (!CIDADES[e.cidade]) e.cidade = 'sao-paulo';
    if (!TIPOS[e.tipo] && e.tipo !== 'outro') e.tipo = 'outro';
    if (!COBERTURAS[e.cobertura.tipo]) e.cobertura.tipo = 'apartamento';
    if (!ABSORTANCIA[e.cobertura.cor]) e.cobertura.cor = 'media';
    if (!PISOS[e.piso]) e.piso = 'andar';
    if (!['sol', 'bussola'].includes(e.orientacao.modo)) e.orientacao.modo = 'sol';
    if (DIRECOES[e.orientacao.paredeA] === undefined) e.orientacao.paredeA = 'N';
    for (const c of ['tmax', 'amp', 'ur']) {
      const v = e.clima[c];
      e.clima[c] = v === null || v === '' || v === undefined || !Number.isFinite(num(v, NaN)) ? null : num(v);
    }
    if (e.clima.tmax !== null) e.clima.tmax = limitar(e.clima.tmax, 20, 48);
    if (e.clima.amp !== null) e.clima.amp = limitar(e.clima.amp, 0, 20);
    if (e.clima.ur !== null) e.clima.ur = limitar(e.clima.ur, 5, 100);

    const pe = e.ambiente.peDireito;
    for (const k of PAREDES) {
      const p = e.paredes[k];
      if (!['externa', 'interna', 'climatizada'].includes(p.tipo)) p.tipo = 'interna';
      if (!EXPOSICOES[p.sol]) p.sol = 'nao';
      p.sombra = p.sombra === true || p.sombra === 'true';
      if (!MATERIAIS[p.material]) p.material = 'alvenaria';
      if (!ABSORTANCIA[p.cor]) p.cor = 'media';
      const len = k === 'A' || k === 'C' ? e.ambiente.largura : e.ambiente.comprimento;
      const j = p.janela;
      if (!VIDROS[j.vidro]) j.vidro = 'comum';
      if (!PROTECOES[j.protecao]) j.protecao = 'nenhuma';
      j.largura = limitar(num(j.largura), 0, Math.max(0, len - 0.4));
      j.altura = limitar(num(j.altura, 1.2), 0, Math.max(0, pe - 0.2));
      j.peitoril = limitar(num(j.peitoril, 1), 0, Math.max(0, pe - j.altura - 0.1));
      const meia = j.largura / 2 + 0.1;
      j.pos = limitar(limitar(num(j.pos, 0.5), 0.05, 0.95) * len, Math.min(meia, len / 2), Math.max(len - meia, len / 2)) / len;
      if (p.tipo !== 'externa') j.largura = 0;

      const d = p.porta;
      d.ativa = d.ativa === true || d.ativa === 'true';
      d.largura = limitar(num(d.largura, 0.8), 0.5, Math.max(0.5, Math.min(2.5, len - 0.4)));
      const meiaP = d.largura / 2 + 0.05;
      let c = limitar(num(d.pos, 0.5), 0.05, 0.95) * len;
      if (d.ativa && j.largura > 0) {
        let wc = j.pos * len;
        const folga = j.largura / 2 + d.largura / 2 + 0.1;
        if (Math.abs(c - wc) < folga) {
          if (wc + folga + meiaP <= len) c = wc + folga;
          else if (wc - folga - meiaP >= 0) c = wc - folga;
          else if (j.largura + d.largura + 0.3 <= len) {
            // não cabe ao lado: encosta a porta no canto mais próximo e desliza a janela para abrir espaço
            const direita = c >= wc;
            c = direita ? len - meiaP : meiaP;
            wc = direita ? Math.min(wc, c - d.largura / 2 - 0.1 - j.largura / 2) : Math.max(wc, c + d.largura / 2 + 0.1 + j.largura / 2);
            j.pos = wc / len;
          }
        }
      }
      d.pos = limitar(c, Math.min(meiaP, len / 2), Math.max(len - meiaP, len / 2)) / len;
    }

    e.pessoas.quantidade = limitar(Math.floor(num(e.pessoas.quantidade, 1)), 0, 200);
    if (!ATIVIDADES[e.pessoas.atividade]) e.pessoas.atividade = 'sentado';
    const ap = {};
    for (const [id, q] of Object.entries(e.aparelhos || {})) {
      if (APARELHOS_POR_ID[id]) {
        const n = limitar(Math.floor(num(q)), 0, 50);
        if (n > 0) ap[id] = n;
      }
    }
    e.aparelhos = ap;
    e.extras = (Array.isArray(e.extras) ? e.extras : [])
      .map((x) => ({ nome: String((x && x.nome) || 'Outro aparelho').slice(0, 40), watts: limitar(num(x && x.watts), 0, 20000) }))
      .filter((x) => x.watts > 0);
    if (!ILUMINACAO[e.iluminacao]) e.iluminacao = 'led';
    e.uso.inicio = limitar(Math.round(num(e.uso.inicio, 21)), 0, 24) % 24;
    e.uso.fim = limitar(Math.round(num(e.uso.fim, 7)), 0, 24) % 24;
    e.uso.temperatura = limitar(num(e.uso.temperatura, 23), 18, 28);
    e.avancado.margem = limitar(num(e.avancado.margem, 0.1), 0, 0.5);
    if (!INFILTRACAO[e.avancado.infiltracao]) e.avancado.infiltracao = 'normal';
    if (!['auto', 'leve', 'media', 'pesada'].includes(e.avancado.massa)) e.avancado.massa = 'auto';
    if (!PARTIDAS[e.avancado.partida]) e.avancado.partida = 'rapida';
    e.energia.tarifa = limitar(num(e.energia.tarifa, 0.95), 0, 10);
    if (!['inverter', 'convencional'].includes(e.energia.tecnologia)) e.energia.tecnologia = 'inverter';
    e.moveis = (Array.isArray(e.moveis) ? e.moveis : [])
      .filter((m) => m && ['cama', 'mesa', 'sofa'].includes(m.tipo))
      .map((m) => ({ tipo: m.tipo, x: num(m.x, 1), z: num(m.z, 1), rot: num(m.rot) % 180 === 0 ? 0 : 90 }));
    return e;
  }

  /** Aplica o preset de um tipo de ambiente (pessoas, horário, aparelhos…) mantendo geometria e paredes. */
  function aplicarTipo(estado, tipo) {
    const e = clonar(estado);
    const t = TIPOS[tipo];
    e.tipo = tipo;
    if (!t) return e;
    e.pessoas = { quantidade: t.pessoas, atividade: t.atividade };
    e.uso = { ...e.uso, inicio: t.inicio, fim: t.fim % 24 };
    e.aparelhos = { ...t.aparelhos };
    e.iluminacao = t.iluminacao;
    e.avancado = { ...e.avancado, infiltracao: t.infiltracao };
    return e;
  }

  /* ===================================================================== geometria */
  const comprimentoParede = (e, k) => (k === 'A' || k === 'C' ? e.ambiente.largura : e.ambiente.comprimento);

  function geometria(e) {
    const area = e.ambiente.largura * e.ambiente.comprimento;
    const out = { area, volume: area * e.ambiente.peDireito, paredes: {} };
    for (const k of PAREDES) {
      const p = e.paredes[k];
      const len = comprimentoParede(e, k);
      const total = len * e.ambiente.peDireito;
      const jan = p.tipo === 'externa' ? p.janela.largura * p.janela.altura : 0;
      const portaAlt = Math.min(2.1, e.ambiente.peDireito - 0.1);
      const porta = p.porta.ativa ? p.porta.largura * portaAlt : 0;
      out.paredes[k] = {
        comprimento: len,
        area: total,
        janela: { largura: p.tipo === 'externa' ? p.janela.largura : 0, altura: p.janela.altura, area: jan },
        porta: { largura: p.porta.ativa ? p.porta.largura : 0, altura: portaAlt, area: porta },
        opaca: Math.max(0, total - jan - porta),
      };
    }
    return out;
  }

  /* ===================================================================== núcleo físico */
  /** Convolução periódica (24 h) com uma série RTS. */
  function aplicarRTS(serie, rts) {
    const out = zeros();
    for (let h = 0; h < 24; h++) {
      let s = 0;
      for (let k = 0; k < rts.length; k++) s += rts[k] * serie[(h - k + 24 * 4) % 24];
      out[h] = s;
    }
    return out;
  }

  /** Fluxo por condução com atraso térmico: Q(h) = U·A·[(Tsa_média − Ti) + f·(Tsa(h − atraso) − Tsa_média)]. */
  function conducaoComAtraso(tsa, U, A, ti, atraso) {
    const media = tsa.reduce((a, b) => a + b, 0) / 24;
    const f = Math.exp(-atraso / 4.5); // fator de decremento estimado a partir do atraso
    const out = zeros();
    for (let h = 0; h < 24; h++) {
      const t = h - atraso;
      const i0 = Math.floor(t);
      const fr = t - i0;
      const a = tsa[((i0 % 24) + 24) % 24];
      const b = tsa[(((i0 + 1) % 24) + 24) % 24];
      out[h] = U * A * (media - ti + f * (a + (b - a) * fr - media));
    }
    return out;
  }

  function massaDoAmbiente(e) {
    if (e.avancado.massa !== 'auto') return e.avancado.massa;
    const cont = { leve: 0, media: 0, pesada: 0 };
    for (const k of PAREDES) cont[MATERIAIS[e.paredes[k].material].massa] += comprimentoParede(e, k);
    return Object.entries(cont).sort((a, b) => b[1] - a[1])[0][0];
  }

  function climaDe(e) {
    const c = CIDADES[e.cidade];
    const tmax = e.clima.tmax !== null ? e.clima.tmax : c.tmax;
    const amp = e.clima.amp !== null ? e.clima.amp : c.amp;
    const ur = e.clima.ur !== null ? e.clima.ur : c.ur;
    const te = FRACAO_AMPLITUDE.map((f) => tmax - amp * f);
    return { cidade: c.nome, lat: c.lat, tmax, amp, ur, te, w: umidadeAbsoluta(tmax, ur) };
  }

  /**
   * Calcula a carga térmica hora a hora e dimensiona o equipamento.
   */
  function calcular(entrada) {
    const e = normalizar(entrada);
    const geo = geometria(e);
    const clima = climaDe(e);
    const ti = e.uso.temperatura;
    const wi = umidadeAbsoluta(ti, 50);
    const dW = Math.max(0, clima.w - wi);
    // Cômodo vizinho sem ar: acompanha só metade da variação de fora, em torno da média do dia + 2 °C (gente, aparelhos, calor guardado)
    const teMedia = clima.te.reduce((a, b) => a + b, 0) / 24;
    const tAdj = clima.te.map((t) => 0.5 * t + 0.5 * (teMedia + 2));
    let condutancia = 0; // W/K de tudo o que liga o ambiente ao exterior/vizinhos (para a carga de partida)
    const sois = Array.from({ length: 24 }, (_, h) => posicaoSol(h, clima.lat));
    const massa = massaDoAmbiente(e);
    const rts = RTS[massa];
    const uso = horasDeUso(e.uso.inicio, e.uso.fim);
    const emUso = zeros().map((_, h) => (uso.includes(h) ? 1 : 0));
    const tipo = TIPOS[e.tipo] || { luzDia: false };

    // componentes: { id, rotulo, grupo, superficie, sens[24], lat[24] }
    const comps = [];
    const novo = (id, rotulo, grupo, superficie = null) => {
      const c = { id, rotulo, grupo, superficie, sens: zeros(), lat: zeros() };
      comps.push(c);
      return c;
    };
    const exposicao = {};
    const radParedes = {};

    // ---------- paredes, janelas e portas
    for (const k of PAREDES) {
      const p = e.paredes[k];
      const g = geo.paredes[k];
      exposicao[k] = exposicaoParede(e, k);
      if (p.tipo === 'climatizada') continue;
      const mat = MATERIAIS[p.material];
      if (p.tipo === 'interna') {
        const c = novo('parede-' + k, `Parede ${k} (divisa com cômodo sem ar)`, 'construcao', k);
        for (let h = 0; h < 24; h++) c.sens[h] = mat.U * g.opaca * (tAdj[h] - ti);
        condutancia += mat.U * g.opaca;
        if (g.porta.area > 0) {
          const d = novo('porta-' + k, `Porta da parede ${k}`, 'construcao', k);
          for (let h = 0; h < 24; h++) d.sens[h] = 2.0 * g.porta.area * (tAdj[h] - ti);
          condutancia += 2.0 * g.porta.area;
        }
        continue;
      }
      // externa
      const rad = radiacaoParede(e, k, sois);
      radParedes[k] = rad;
      const alfa = ABSORTANCIA[p.cor];
      const tsa = rad.map((r, h) => clima.te[h] + (alfa * (r.direta + r.difusa)) / 17);
      const c = novo('parede-' + k, `Parede ${k} (${EXPOSICOES[exposicao[k]].toLowerCase()})`, 'construcao', k);
      c.sens = conducaoComAtraso(tsa, mat.U, g.opaca, ti, mat.atraso);
      condutancia += mat.U * g.opaca;
      if (g.porta.area > 0) {
        const d = novo('porta-' + k, `Porta da parede ${k}`, 'construcao', k);
        d.sens = conducaoComAtraso(tsa, 2.5, g.porta.area, ti, 0.5);
        condutancia += 2.5 * g.porta.area;
      }
      if (g.janela.area > 0) {
        const v = VIDROS[p.janela.vidro];
        const pr = PROTECOES[p.janela.protecao];
        const cond = novo('vidro-' + k, `Janela ${k}: calor pelo vidro`, 'construcao', k);
        for (let h = 0; h < 24; h++) cond.sens[h] = v.U * g.janela.area * (clima.te[h] - ti);
        condutancia += v.U * g.janela.area;
        const solar = rad.map((r) => g.janela.area * v.shgc * (fatorAngular(r.cosTheta) * r.direta * pr.fDir + 0.9 * r.difusa * pr.fDif));
        const sol = novo('sol-' + k, `Janela ${k}: sol entrando`, 'sol', k);
        sol.sens = aplicarRTS(solar, RTS[massa]);
      }
    }

    // ---------- cobertura
    const cob = COBERTURAS[e.cobertura.tipo];
    let radTeto = null;
    if (cob.adjacente) {
      const c = novo('teto', 'Teto (andar de cima sem ar)', 'construcao', 'teto');
      for (let h = 0; h < 24; h++) c.sens[h] = cob.U * geo.area * (tAdj[h] - ti);
      condutancia += cob.U * geo.area;
    } else if (!cob.nula) {
      radTeto = sois.map(radiacaoHorizontal);
      const alfa = ABSORTANCIA[e.cobertura.cor];
      const tsa = radTeto.map((r, h) => clima.te[h] + (alfa * (r.direta + r.difusa)) / 17 - 3.9);
      const c = novo('teto', 'Teto / cobertura', 'construcao', 'teto');
      c.sens = conducaoComAtraso(tsa, cob.U, geo.area, ti, cob.atraso);
      condutancia += cob.U * geo.area;
    }
    const piso = PISOS[e.piso];
    if (!piso.nulo) {
      const c = novo('piso', piso.externo ? 'Piso (área aberta embaixo)' : 'Piso (andar de baixo sem ar)', 'construcao', null);
      for (let h = 0; h < 24; h++) c.sens[h] = piso.U * geo.area * ((piso.externo ? clima.te[h] : tAdj[h]) - ti);
      condutancia += piso.U * geo.area;
    }

    // ---------- pessoas (60% do sensível é radiante → RTS)
    const at = ATIVIDADES[e.pessoas.atividade];
    if (e.pessoas.quantidade > 0) {
      const c = novo('pessoas', `Pessoas (${e.pessoas.quantidade})`, 'interno');
      const rad = zeros();
      for (let h = 0; h < 24; h++) {
        const s = emUso[h] * e.pessoas.quantidade * at.sens;
        rad[h] = 0.6 * s;
        c.sens[h] = 0.4 * s;
        c.lat[h] = emUso[h] * e.pessoas.quantidade * at.lat;
      }
      const r = aplicarRTS(rad, rts);
      for (let h = 0; h < 24; h++) c.sens[h] += r[h];
    }

    // ---------- aparelhos (30% radiante)
    const ativos = Object.entries(e.aparelhos).map(([id, q]) => ({ ...APARELHOS_POR_ID[id], qtd: q }));
    for (const x of e.extras) ativos.push({ id: 'extra', nome: x.nome, sens: x.watts, qtd: 1 });
    if (ativos.length) {
      const c = novo('aparelhos', 'Aparelhos e eletrônicos', 'interno');
      const rad = zeros();
      for (let h = 0; h < 24; h++) {
        let s = 0;
        let l = 0;
        for (const a of ativos) {
          const ligado = a.sempre ? 1 : a.cozinha ? (HORAS_COZINHA.includes(h) ? emUso[h] : 0) : emUso[h];
          s += ligado * a.qtd * a.sens;
          l += ligado * a.qtd * (a.lat || 0);
        }
        rad[h] = 0.3 * s;
        c.sens[h] = 0.7 * s;
        c.lat[h] = l;
      }
      const r = aplicarRTS(rad, rts);
      for (let h = 0; h < 24; h++) c.sens[h] += r[h];
    }

    // ---------- iluminação (50% radiante); acesa quando o ambiente está em uso e está escuro (ou o dia todo em escritório/loja)
    const ilu = ILUMINACAO[e.iluminacao];
    if (ilu.wm2 > 0) {
      const c = novo('iluminacao', 'Iluminação', 'interno');
      const rad = zeros();
      for (let h = 0; h < 24; h++) {
        const acesa = emUso[h] && (tipo.luzDia || h >= 18 || h < 7) ? 1 : 0;
        const s = acesa * ilu.wm2 * geo.area;
        rad[h] = 0.5 * s;
        c.sens[h] = 0.5 * s;
      }
      const r = aplicarRTS(rad, rts);
      for (let h = 0; h < 24; h++) c.sens[h] += r[h];
    }

    // ---------- ar de fora (frestas, portas)
    const vaz = geo.volume * INFILTRACAO[e.avancado.infiltracao].ach;
    const inf = novo('ar', `Ar quente que entra (${arred(vaz)} m³/h)`, 'ar');
    for (let h = 0; h < 24; h++) {
      inf.sens[h] = 0.335 * vaz * (clima.te[h] - ti);
      inf.lat[h] = 0.8336 * vaz * dW;
    }
    condutancia += 0.335 * vaz;

    // ---------- carga de partida: o ar fica desligado parte do dia, o ambiente esquenta e acumula calor.
    // Ao ligar, além da carga normal, é preciso tirar esse calor do ar, dos móveis e da "pele" das paredes.
    let partida = null;
    if (uso.length < 24) {
      const hOn = uso[0];
      const hAntes = (hOn + 23) % 24;
      let ganhoAntes = 0;
      for (const c of comps) ganhoAntes += c.sens[hAntes];
      const dTlivre = limitar(ganhoAntes / Math.max(condutancia, 1), 0, 8); // quanto o ambiente "flutua" acima do desejado
      const areaInterna = 2 * (e.ambiente.largura + e.ambiente.comprimento) * e.ambiente.peDireito + 2 * geo.area;
      const capacidadeRapida = (1.2 * 1006 * geo.volume + 15000 * geo.area) / 3600; // ar + móveis, W/K em 1 h
      const qPartida = PARTIDAS[e.avancado.partida].fator * dTlivre * (capacidadeRapida + 0.3 * 8 * areaInterna);
      if (qPartida > 1) {
        const c = novo('partida', 'Calor acumulado ao ligar o ar', 'partida');
        c.sens[hOn] = qPartida;
        partida = { hora: hOn, watts: arred(qPartida), tempLivre: arred(ti + dTlivre, 1) };
      }
    }

    // ---------- totais por hora
    const horas = Array.from({ length: 24 }, (_, h) => {
      const grupos = { interno: 0, construcao: 0, sol: 0, ar: 0, partida: 0 };
      let sens = 0;
      let lat = 0;
      for (const c of comps) {
        sens += c.sens[h];
        lat += c.lat[h];
        grupos[c.grupo] += c.sens[h] + c.lat[h];
      }
      const total = Math.max(0, sens + lat);
      return { h, te: arred(clima.te[h], 1), sens: arred(sens), lat: arred(lat), total: arred(total), emUso: !!emUso[h], grupos: Object.fromEntries(Object.entries(grupos).map(([k, v]) => [k, arred(v)])) };
    });

    const horaPico = uso.reduce((best, h) => (horas[h].total > horas[best].total ? h : best), uso[0]);
    const pico = horas[horaPico];
    const componentesPico = comps
      .map((c) => ({ id: c.id, rotulo: c.rotulo, grupo: c.grupo, superficie: c.superficie, sens: arred(c.sens[horaPico]), lat: arred(c.lat[horaPico]), total: arred(c.sens[horaPico] + c.lat[horaPico]) }))
      .filter((c) => Math.abs(c.total) >= 1)
      .sort((a, b) => b.total - a.total);

    // carga por superfície em cada hora (W/m²), para o mapa de calor
    const porSuperficie = {};
    for (const k of [...PAREDES, 'teto']) {
      const area = k === 'teto' ? geo.area : geo.paredes[k].area;
      const serie = zeros();
      for (const c of comps) if (c.superficie === k) for (let h = 0; h < 24; h++) serie[h] += c.sens[h] + c.lat[h];
      porSuperficie[k] = { area: arred(area, 2), watts: serie.map((x) => arred(x)), wm2: serie.map((x) => (area > 0 ? arred(x / area, 1) : 0)) };
    }

    const dim = dimensionar(e, pico, horaPico, clima);
    const res = {
      entrada: e,
      clima: { ...clima, te: clima.te.map((t) => arred(t, 1)), w: arred(clima.w, 1), wi: arred(wi, 1) },
      geometria: geo,
      massa,
      uso,
      exposicao,
      partida,
      solDireto: Object.fromEntries(Object.entries(radParedes).map(([k, a]) => [k, a.map((r) => arred(r.direta))])),
      sol: sois.map((s) => ({ altitude: arred(s.altitude, 1), azimute: arred(s.azimute, 1), idn: arred(s.idn) })),
      horas,
      pico: { hora: horaPico, total: pico.total, sens: pico.sens, lat: pico.lat, componentes: componentesPico, shr: pico.total > 0 ? arred(pico.sens / pico.total, 2) : 1 },
      porSuperficie,
      dimensionamento: dim,
      regraLojas: regraLojas(e, geo),
      energia: energia(e, horas, uso),
    };
    res.explicacoes = explicar(res);
    return res;
  }

  /* ===================================================================== dimensionamento */
  function dimensionar(e, pico, horaPico, clima) {
    // O aparelho é ensaiado com 27 °C dentro e 35 °C fora; com o ambiente mais frio ou mais calor lá fora, rende menos.
    const fi = limitar(1 - 0.025 * (27 - e.uso.temperatura), 0.8, 1.05);
    const fe = limitar(1 - 0.012 * Math.max(0, clima.te[horaPico] - 35), 0.85, 1);
    const cargaW = pico.total;
    const comMargem = cargaW * (1 + e.avancado.margem);
    const necessarioW = comMargem / (fi * fe);
    const necessarioBTU = necessarioW * W_PARA_BTU;

    const max = CAPACIDADES[CAPACIDADES.length - 1];
    let quantidade = 1;
    let alvo = necessarioBTU;
    if (necessarioBTU > max * 1.05) {
      quantidade = Math.ceil(necessarioBTU / max);
      alvo = necessarioBTU / quantidade;
    }
    const capacidade = CAPACIDADES.find((c) => c >= alvo * 0.95) || max;
    const capacidadeTotal = capacidade * quantidade;
    const area = e.ambiente.largura * e.ambiente.comprimento;
    const maxDim = Math.max(e.ambiente.largura, e.ambiente.comprimento);
    const alcance = ALCANCE[capacidade] || 9;
    const obs = [];
    let tipo = e.energia.tecnologia === 'convencional' ? 'Split hi-wall convencional' : 'Split hi-wall inverter';
    if (capacidade >= 36000 || area > 45 || quantidade > 1) {
      tipo = 'Split piso-teto ou cassete (ou mais de um hi-wall)';
      obs.push('Para carga alta ou ambiente grande, um hi-wall sozinho distribui mal o ar.');
    } else if (maxDim > alcance * 1.25) {
      obs.push(`O ambiente tem ${arred(maxDim, 1)} m de comprimento e o jato desse aparelho alcança ~${alcance} m: instale na parede menor, soprando ao longo do lado maior.`);
    }
    if (capacidade === CAPACIDADES[0] && necessarioBTU < 0.7 * capacidade)
      obs.push('O menor aparelho do mercado já sobra para este ambiente: prefira inverter, que reduz a potência e não fica ligando e desligando.');
    if (pico.total > 0 && pico.sens / pico.total < 0.7) obs.push('Muita umidade no ambiente (pessoas, cozinha, ar de fora): não superdimensione e prefira um modelo com boa desumidificação.');

    return {
      cargaPicoW: arred(cargaW),
      cargaPicoBTU: arred(cargaW * W_PARA_BTU),
      necessarioBTU: arred(necessarioBTU),
      capacidade,
      quantidade,
      capacidadeTotal,
      folga: arred((capacidadeTotal / necessarioBTU - 1) * 100),
      alcance,
      tipo,
      observacoes: obs,
      fatores: { margem: e.avancado.margem, rendimentoTemperatura: arred(fi, 3), rendimentoCalor: arred(fe, 3) },
    };
  }

  /** "Regra das lojas": 600 BTU/m² (800 se pega sol da tarde) + 600 por pessoa a partir da 2ª + 600 por eletrônico. */
  function regraLojas(e, geo) {
    const solTarde = PAREDES.some((k) => e.paredes[k].tipo === 'externa' && ['tarde', 'diatodo'].includes(exposicaoParede(e, k)));
    const base = solTarde ? 800 : 600;
    let eletronicos = 0;
    for (const [id, q] of Object.entries(e.aparelhos)) if (APARELHOS_POR_ID[id].eletronico) eletronicos += q;
    eletronicos += e.extras.length;
    const pessoasExtra = Math.max(0, e.pessoas.quantidade - 1);
    const btu = geo.area * base + 600 * pessoasExtra + 600 * eletronicos;
    const capacidade = CAPACIDADES.find((c) => c >= btu * 0.95) || CAPACIDADES[CAPACIDADES.length - 1];
    return { btu: arred(btu), capacidade, base, solTarde, pessoasExtra, eletronicos };
  }

  /** Consumo estimado num mês quente: soma a carga das horas de uso / COP (o dia de projeto é o pior; usamos 65% dele). */
  function energia(e, horas, uso) {
    const cop = e.energia.tecnologia === 'inverter' ? 3.8 : 2.8;
    let wh = 0;
    for (const h of uso) wh += horas[h].total / cop;
    const kWhMes = (wh / 1000) * 30 * 0.65;
    return { cop, horasDia: uso.length, kWhMes: arred(kWhMes), custoMes: arred(kWhMes * e.energia.tarifa, 2), tarifa: e.energia.tarifa };
  }

  /* ===================================================================== explicações */
  const fmtHora = (h) => `${String(h).padStart(2, '0')}h`;
  const minuscula = (t) => t.charAt(0).toLowerCase() + t.slice(1); // mantém a letra da parede em maiúscula
  const virgula = (n) => String(n).replace('.', ',');
  function explicar(r) {
    const out = [];
    const d = r.dimensionamento;
    const top = r.pico.componentes.slice(0, 3).filter((c) => c.total > 0);
    out.push(`O momento mais quente com o ar ligado é por volta das ${fmtHora(r.pico.hora)} (lá fora: ${virgula(r.horas[r.pico.hora].te)} °C).`);
    if (top.length) out.push(`O que mais pesa nessa hora: ${top.map((c) => `${minuscula(c.rotulo)} (${Math.round((c.total / r.pico.total) * 100)}%)`).join(', ')}.`);
    const comSol = PAREDES.filter((k) => ['tarde', 'diatodo'].includes(r.exposicao[k]));
    if (comSol.length && r.pico.hora >= 18) out.push(`As paredes que pegam sol à tarde (${comSol.join(', ')}) guardam calor e devolvem à noite: por isso o pico fica depois do pôr do sol.`);
    if (d.fatores.rendimentoTemperatura < 1)
      out.push(`Você quer ${r.entrada.uso.temperatura} °C, mas o aparelho é testado com 27 °C dentro: mais frio, ele rende uns ${Math.round((1 - d.fatores.rendimentoTemperatura) * 100)}% menos que a etiqueta. Já descontamos isso.`);
    if (d.fatores.rendimentoCalor < 1) out.push(`Com mais de 35 °C lá fora o aparelho também perde rendimento (${Math.round((1 - d.fatores.rendimentoCalor) * 100)}%). Já descontamos.`);
    if (r.partida && r.pico.hora === r.partida.hora)
      out.push(`O ar fica desligado parte do dia: quando liga às ${fmtHora(r.partida.hora)}, o ambiente está por volta de ${String(r.partida.tempLivre).replace('.', ',')} °C e tem calor guardado nas paredes e móveis. Tirar isso soma ${Math.round(r.partida.watts * W_PARA_BTU).toLocaleString('pt-BR')} BTU/h na primeira hora.`);
    out.push(`Margem de segurança: ${Math.round(d.fatores.margem * 100)}%.`);
    return out;
  }

  /* ===================================================================== "e se?" */
  function oportunidades(entrada) {
    const base = calcular(entrada);
    const e0 = base.entrada;
    const lista = [];
    const tentar = (id, titulo, descricao, mutar) => {
      const e = clonar(e0);
      mutar(e);
      const r = calcular(e);
      const delta = base.dimensionamento.necessarioBTU - r.dimensionamento.necessarioBTU;
      if (delta >= 300 && delta / base.dimensionamento.necessarioBTU >= 0.025) {
        lista.push({
          id, titulo, descricao,
          reducaoBTU: arred(delta),
          reducaoPct: arred((delta / base.dimensionamento.necessarioBTU) * 100),
          novaCapacidade: r.dimensionamento.capacidadeTotal,
          reduzCapacidade: r.dimensionamento.capacidadeTotal < base.dimensionamento.capacidadeTotal,
        });
      }
    };
    for (const k of PAREDES) {
      const p = e0.paredes[k];
      if (p.tipo !== 'externa' || base.geometria.paredes[k].janela.area <= 0 || base.exposicao[k] === 'nao') continue;
      if (p.janela.protecao !== 'externa')
        tentar('toldo-' + k, `Toldo, brise ou persiana externa na janela ${k}`, 'Barra o sol antes de ele entrar pelo vidro: é a melhoria mais eficiente para janela que pega sol.', (e) => {
          e.paredes[k].janela.protecao = 'externa';
        });
      if (['comum', 'fume'].includes(p.janela.vidro))
        tentar('pelicula-' + k, `Película de controle solar na janela ${k}`, 'Insulfilm de controle solar corta boa parte do calor do sol (escolha um com fator solar baixo).', (e) => {
          e.paredes[k].janela.vidro = 'pelicula';
        });
      if (p.janela.protecao === 'nenhuma')
        tentar('cortina-' + k, `Cortina ou persiana na janela ${k}`, 'Fechada nas horas de sol, já ajuda (menos que a proteção por fora).', (e) => {
          e.paredes[k].janela.protecao = 'cortina';
        });
    }
    const t = e0.cobertura.tipo;
    if (t === 'telha')
      tentar('forro', 'Instalar forro sob o telhado', 'Forro de PVC, gesso ou madeira cria um colchão de ar entre a telha e o ambiente.', (e) => {
        e.cobertura.tipo = 'forro';
      });
    if (['telha', 'forro', 'laje_exposta', 'laje_telhado'].includes(t))
      tentar('isolar-teto', 'Isolar o teto (manta, lã ou telha sanduíche)', 'O teto é por onde entra mais sol: isolar costuma ter o melhor retorno.', (e) => {
        e.cobertura.tipo = 'isolada';
      });
    if (!COBERTURAS[t].nula && e0.cobertura.cor !== 'clara')
      tentar('teto-claro', 'Telhado ou laje de cor clara', 'Tinta branca/térmica ou telha clara absorvem bem menos sol.', (e) => {
        e.cobertura.cor = 'clara';
      });
    for (const k of PAREDES) {
      if (e0.paredes[k].tipo === 'externa' && base.exposicao[k] !== 'nao' && e0.paredes[k].cor !== 'clara')
        tentar('parede-clara-' + k, `Pintar a parede ${k} de cor clara (por fora)`, 'Parede clara absorve menos sol.', (e) => {
          e.paredes[k].cor = 'clara';
        });
    }
    if (['incandescente', 'fluorescente'].includes(e0.iluminacao))
      tentar('led', 'Trocar as lâmpadas por LED', 'LED esquenta bem menos.', (e) => {
        e.iluminacao = 'led';
      });
    if (e0.aparelhos.lampada)
      tentar('lampadas', 'Trocar as lâmpadas incandescentes por LED', 'Cada incandescente vira um pequeno aquecedor.', (e) => {
        delete e.aparelhos.lampada;
      });
    if (e0.avancado.infiltracao === 'alta')
      tentar('vedacao', 'Manter portas fechadas e vedar frestas', 'Menos ar quente e úmido entrando.', (e) => {
        e.avancado.infiltracao = 'normal';
      });
    lista.sort((a, b) => b.reducaoBTU - a.reducaoBTU);
    return lista;
  }

  /* ===================================================================== compartilhamento */
  function codificar(estado) {
    const json = JSON.stringify(estado);
    const b64 = typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(json))) : Buffer.from(json, 'utf8').toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decodificar(txt) {
    try {
      const b64 = String(txt).replace(/-/g, '+').replace(/_/g, '/');
      const json = typeof atob === 'function' ? decodeURIComponent(escape(atob(b64))) : Buffer.from(b64, 'base64').toString('utf8');
      const o = JSON.parse(json);
      return o && typeof o === 'object' ? o : null;
    } catch (_) {
      return null;
    }
  }

  return {
    W_PARA_BTU, PAREDES, CAPACIDADES, ALCANCE, CIDADES, FRACAO_AMPLITUDE, CEU, MATERIAIS, COBERTURAS, ABSORTANCIA,
    PISOS, PARTIDAS, VIDROS, PROTECOES, ATIVIDADES, APARELHOS, APARELHOS_POR_ID, ILUMINACAO, INFILTRACAO, RTS, DIRECOES, EXPOSICOES, TIPOS, PADRAO,
    calcular, normalizar, aplicarTipo, oportunidades, regraLojas, horasDeUso, posicaoSol, radiacaoVertical, radiacaoHorizontal,
    fatorAngular, exposicaoParede, azimuteParede, conducaoComAtraso, aplicarRTS, umidadeAbsoluta, geometria, comprimentoParede,
    codificar, decodificar, mesclar, arred,
  };
});
