/*
 * Motor de carga térmica para dimensionamento de ar-condicionado (pré-projeto).
 * Sem dependências e sem DOM: roda no navegador e no Node (testes e CLI).
 *
 * Método: soma de cargas por componente em regime de projeto (hora de pico),
 * com ganhos solares e de condução simplificados por diferença equivalente de
 * temperatura (inspirado no CLTD/CLF da ASHRAE). Veja docs/estudo-carga-termica.md
 * para premissas, fontes e limitações. NÃO substitui projeto conforme a NBR 16401.
 *
 * Convenção de eixos do ambiente: x = Leste, z = Sul (o Norte fica em z = 0),
 * y = vertical. Largura é a dimensão Leste-Oeste, comprimento a Norte-Sul.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Termica = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const W_PARA_BTU = 3.412142; // 1 W = 3,412 BTU/h
  const BTU_POR_TR = 12000; // 1 TR = 12.000 BTU/h
  const CAPACIDADES = [7500, 9000, 12000, 18000, 24000, 30000, 36000, 48000, 60000];
  // Alcance de projeção do ar (m) de splits hi-wall típicos. Referência de mercado,
  // varia por fabricante: consulte o manual do modelo escolhido.
  const ALCANCE = { 7500: 5, 9000: 6, 12000: 7, 18000: 8, 24000: 9, 30000: 10, 36000: 11, 48000: 12, 60000: 13 };

  /** Condições de projeto de verão APROXIMADAS (TBS °C / UR %). Ajuste manualmente se tiver o dado da NBR 16401-1. */
  const CIDADES = {
    'sao-paulo': { nome: 'São Paulo (SP)', tbs: 32, ur: 55 },
    'rio-de-janeiro': { nome: 'Rio de Janeiro (RJ)', tbs: 35, ur: 60 },
    'belo-horizonte': { nome: 'Belo Horizonte (MG)', tbs: 31, ur: 55 },
    brasilia: { nome: 'Brasília (DF)', tbs: 31, ur: 50 },
    curitiba: { nome: 'Curitiba (PR)', tbs: 30, ur: 60 },
    florianopolis: { nome: 'Florianópolis (SC)', tbs: 33, ur: 65 },
    'porto-alegre': { nome: 'Porto Alegre (RS)', tbs: 35, ur: 55 },
    goiania: { nome: 'Goiânia (GO)', tbs: 34, ur: 50 },
    cuiaba: { nome: 'Cuiabá (MT)', tbs: 38, ur: 50 },
    'campo-grande': { nome: 'Campo Grande (MS)', tbs: 35, ur: 50 },
    vitoria: { nome: 'Vitória (ES)', tbs: 34, ur: 65 },
    salvador: { nome: 'Salvador (BA)', tbs: 33, ur: 65 },
    recife: { nome: 'Recife (PE)', tbs: 33, ur: 65 },
    fortaleza: { nome: 'Fortaleza (CE)', tbs: 33, ur: 65 },
    natal: { nome: 'Natal (RN)', tbs: 33, ur: 70 },
    teresina: { nome: 'Teresina (PI)', tbs: 38, ur: 50 },
    belem: { nome: 'Belém (PA)', tbs: 34, ur: 70 },
    manaus: { nome: 'Manaus (AM)', tbs: 35, ur: 65 },
    palmas: { nome: 'Palmas (TO)', tbs: 37, ur: 50 },
  };

  const MATERIAIS = {
    alvenaria: { rotulo: 'Alvenaria cerâmica rebocada (≈14–19 cm)', U: 2.4, amort: 0.85 },
    concreto: { rotulo: 'Concreto / bloco de concreto (≈15 cm)', U: 3.2, amort: 0.75 },
    drywall: { rotulo: 'Drywall (gesso acartonado) com lã', U: 0.9, amort: 1.0 },
    isolada: { rotulo: 'Parede com isolamento térmico (EPS / lã)', U: 0.6, amort: 0.9 },
  };

  // dTsol: acréscimo de temperatura equivalente por radiação solar (K) para cor média, hora de pico.
  const COBERTURAS = {
    exposta: { rotulo: 'Laje exposta ao sol (sem forro / sem isolamento)', U: 3.0, dTsol: 18, amort: 0.8 },
    atico: { rotulo: 'Telhado com forro / ático ventilado', U: 1.5, dTsol: 8, amort: 0.9 },
    isolada: { rotulo: 'Cobertura com isolamento térmico', U: 0.6, dTsol: 8, amort: 0.9 },
    andar_nc: { rotulo: 'Andar acima NÃO condicionado', U: 2.5, dTsol: 0, amort: 1, interna: true },
    andar_c: { rotulo: 'Andar acima condicionado (sem carga)', U: 0, dTsol: 0, amort: 1, nula: true },
  };

  const DT_SOL_PAREDE = { N: 3, S: 1, L: 5, O: 8 }; // K, cor média
  const FATOR_COR = { clara: 0.6, media: 1.0, escura: 1.3 };
  // Ganho solar de projeto por m² de vidro comum (W/m²) por orientação — simplificado p/ latitudes ≈ 23°S.
  const SOLAR_VIDRO = { N: 170, S: 110, L: 300, O: 420 };

  const VIDROS = {
    comum: { rotulo: 'Vidro simples comum (3–6 mm)', U: 5.8, fs: 1.0 },
    fume: { rotulo: 'Vidro fumê / refletivo', U: 5.8, fs: 0.6 },
    pelicula: { rotulo: 'Vidro com película de controle solar', U: 5.8, fs: 0.5 },
    duplo: { rotulo: 'Vidro duplo (low-e)', U: 2.8, fs: 0.45 },
  };
  const PROTECOES = {
    nenhuma: { rotulo: 'Sem proteção', fator: 1.0 },
    cortina: { rotulo: 'Cortina / persiana interna', fator: 0.65 },
    externa: { rotulo: 'Toldo / brise / persiana externa', fator: 0.35 },
  };

  // Calor liberado por pessoa (W). Referência: ASHRAE Fundamentals (valores aproximados).
  const ATIVIDADES = {
    repouso: { rotulo: 'Sentado em repouso / dormindo leve', sens: 72, lat: 45 },
    escritorio: { rotulo: 'Trabalho de escritório / residencial', sens: 75, lat: 65 },
    moderada: { rotulo: 'Atividade moderada (em pé, comércio)', sens: 75, lat: 75 },
    intensa: { rotulo: 'Atividade intensa (academia, dança)', sens: 120, lat: 210 },
  };

  const ILUMINACAO = {
    nenhuma: { rotulo: 'Sem iluminação relevante', wm2: 0 },
    led: { rotulo: 'LED (≈6 W/m²)', wm2: 6 },
    fluorescente: { rotulo: 'Fluorescente com reator (≈12 W/m²)', wm2: 12 },
    incandescente: { rotulo: 'Incandescente / halógena (≈20 W/m²)', wm2: 20 },
  };

  const INFILTRACAO = {
    baixa: { rotulo: 'Ambiente bem vedado (0,3 troca/h)', ach: 0.3 },
    normal: { rotulo: 'Normal (0,5 troca/h)', ach: 0.5 },
    alta: { rotulo: 'Porta/janela abre com frequência (1,0 troca/h)', ach: 1.0 },
  };

  const EQUIPAMENTOS_PADRAO = [
    { nome: 'Notebook', watts: 65 },
    { nome: 'Computador + monitor', watts: 200 },
    { nome: 'TV', watts: 120 },
    { nome: 'Frigobar', watts: 80 },
    { nome: 'Impressora', watts: 50 },
    { nome: 'Servidor / rack pequeno', watts: 500 },
  ];

  const PADRAO = {
    ambiente: { largura: 4, comprimento: 5, peDireito: 2.7 },
    clima: { cidade: 'sao-paulo', tbsExt: null, urExt: null, tbsInt: 24, urInt: 50, uso: 'integral' },
    paredes: {
      N: { tipo: 'externa', material: 'alvenaria', cor: 'media', janela: { largura: 0, altura: 1.2, pos: 0.5, peitoril: 1.0, vidro: 'comum', protecao: 'nenhuma' } },
      S: { tipo: 'interna_nc', material: 'alvenaria', cor: 'media', janela: { largura: 0, altura: 1.2, pos: 0.5, peitoril: 1.0, vidro: 'comum', protecao: 'nenhuma' } },
      L: { tipo: 'interna_nc', material: 'alvenaria', cor: 'media', janela: { largura: 0, altura: 1.2, pos: 0.5, peitoril: 1.0, vidro: 'comum', protecao: 'nenhuma' } },
      O: { tipo: 'externa', material: 'alvenaria', cor: 'media', janela: { largura: 1.5, altura: 1.2, pos: 0.5, peitoril: 1.0, vidro: 'comum', protecao: 'nenhuma' } },
    },
    cobertura: { tipo: 'atico', cor: 'media' },
    porta: { parede: 'S', pos: 0.85, largura: 0.8 },
    pessoas: { quantidade: 2, atividade: 'escritorio' },
    equipamentos: [{ nome: 'Notebook', qtd: 1, watts: 65 }],
    iluminacao: 'led',
    ar: { infiltracao: 'normal', ventilacao: false },
    seguranca: 0.1,
    uso: { horasDia: 8, tarifa: 0.95, tipo: 'inverter' },
  };

  const ORIENTACOES = { N: 'Norte', S: 'Sul', L: 'Leste', O: 'Oeste' };

  /* ---------- utilitários ---------- */
  const arred = (n, d = 0) => {
    const f = Math.pow(10, d);
    return Math.round((n + Number.EPSILON) * f) / f;
  };
  const num = (v, padrao = 0) => {
    const n = typeof v === 'string' ? parseFloat(v.replace(',', '.')) : Number(v);
    return Number.isFinite(n) ? n : padrao;
  };
  const limitar = (n, min, max) => Math.min(max, Math.max(min, n));
  const clonar = (o) => JSON.parse(JSON.stringify(o));

  function mesclar(base, extra) {
    if (extra === undefined || extra === null) return clonar(base);
    if (Array.isArray(base) || typeof base !== 'object' || base === null) return clonar(extra);
    const out = {};
    for (const k of Object.keys(base)) out[k] = k in extra ? mesclar(base[k], extra[k]) : clonar(base[k]);
    for (const k of Object.keys(extra)) if (!(k in base)) out[k] = clonar(extra[k]);
    return out;
  }

  /* ---------- psicrometria ---------- */
  /** Pressão de saturação do vapor (kPa) — fórmula de Magnus-Tetens. */
  const pressaoSaturacao = (t) => 0.61094 * Math.exp((17.625 * t) / (t + 243.04));
  /** Umidade absoluta (g de vapor / kg de ar seco) a 101,325 kPa. */
  function umidadeAbsoluta(tbs, ur, pressao = 101.325) {
    const pv = pressaoSaturacao(tbs) * (limitar(ur, 0, 100) / 100);
    return (622 * pv) / (pressao - pv);
  }

  /* ---------- geometria ---------- */
  function comprimentosParedes(amb) {
    return { N: amb.largura, S: amb.largura, L: amb.comprimento, O: amb.comprimento };
  }

  /** Dimensões da janela de uma parede, já limitadas pela geometria. */
  function dimensoesJanela(parede, compParede, peDireito) {
    const j = parede.janela || {};
    if (parede.tipo !== 'externa') return { largura: 0, altura: 0, area: 0 };
    const largura = limitar(num(j.largura), 0, Math.max(0, compParede - 0.4));
    const altura = limitar(num(j.altura, 1.2), 0, Math.max(0, peDireito - 0.2));
    const area = Math.min(largura * altura, 0.8 * compParede * peDireito);
    return { largura, altura, area };
  }

  /** Normaliza a entrada: aplica padrões e limites seguros. */
  function normalizar(entrada) {
    const e = mesclar(PADRAO, entrada || {});
    e.ambiente.largura = limitar(num(e.ambiente.largura, 4), 1, 50);
    e.ambiente.comprimento = limitar(num(e.ambiente.comprimento, 5), 1, 50);
    e.ambiente.peDireito = limitar(num(e.ambiente.peDireito, 2.7), 2, 6);
    e.pessoas.quantidade = Math.max(0, Math.floor(num(e.pessoas.quantidade)));
    e.seguranca = limitar(num(e.seguranca, 0.1), 0, 0.5);
    e.clima.tbsInt = limitar(num(e.clima.tbsInt, 24), 16, 28);
    e.clima.urInt = limitar(num(e.clima.urInt, 50), 30, 80);
    const compPorta = comprimentosParedes(e.ambiente);
    if (!compPorta[e.porta.parede]) e.porta.parede = 'S';
    e.porta.largura = limitar(num(e.porta.largura, 0.8), 0, Math.max(0, compPorta[e.porta.parede] - 0.4));
    e.porta.pos = limitar(num(e.porta.pos, 0.85), 0.05, 0.95);
    e.equipamentos = (e.equipamentos || []).map((q) => ({
      nome: String(q.nome || 'Equipamento'),
      qtd: Math.max(0, Math.floor(num(q.qtd))),
      watts: Math.max(0, num(q.watts)),
    }));
    return e;
  }

  /* ---------- cálculo principal ---------- */
  function calcular(entrada) {
    const e = normalizar(entrada);
    const { largura, comprimento, peDireito } = e.ambiente;
    const area = largura * comprimento;
    const volume = area * peDireito;
    const comps = comprimentosParedes(e.ambiente);

    // Clima
    const cid = CIDADES[e.clima.cidade] || CIDADES['sao-paulo'];
    const noite = e.clima.uso === 'noite';
    const tbsExt = (e.clima.tbsExt !== null && e.clima.tbsExt !== '' ? num(e.clima.tbsExt, cid.tbs) : cid.tbs) - (noite ? 3 : 0);
    const urExt = e.clima.urExt !== null && e.clima.urExt !== '' ? num(e.clima.urExt, cid.ur) : cid.ur;
    const tbsInt = e.clima.tbsInt;
    const dT = tbsExt - tbsInt;
    const wExt = umidadeAbsoluta(tbsExt, urExt);
    const wInt = umidadeAbsoluta(tbsInt, e.clima.urInt);
    const dW = Math.max(0, wExt - wInt);
    const fSolar = noite ? 0.35 : 1; // calor armazenado em lajes e paredes ainda é devolvido à noite (~35% do efeito solar)

    const itens = [];
    const add = (id, grupo, rotulo, sens, lat = 0, superficie = null) =>
      (sens > 0.05 || lat > 0.05) &&
      itens.push({ id, grupo, rotulo, sensivel: arred(sens, 1), latente: arred(lat, 1), superficie });

    // Paredes e janelas
    const areaSuperficie = { cobertura: area };
    for (const k of ['N', 'S', 'L', 'O']) {
      const p = e.paredes[k];
      const nome = ORIENTACOES[k];
      const j = dimensoesJanela(p, comps[k], peDireito);
      const areaTotal = comps[k] * peDireito;
      areaSuperficie[k] = areaTotal;
      if (p.tipo === 'interna_c') continue;
      const mat = MATERIAIS[p.material] || MATERIAIS.alvenaria;
      const areaOpaca = Math.max(0, areaTotal - j.area);
      if (p.tipo === 'externa') {
        const dTeq = dT + DT_SOL_PAREDE[k] * (FATOR_COR[p.cor] || 1) * mat.amort * fSolar;
        add('parede-' + k, 'envoltoria', `Parede ${nome} (externa)`, mat.U * areaOpaca * Math.max(0, dTeq), 0, k);
        if (j.area > 0) {
          const v = VIDROS[p.janela.vidro] || VIDROS.comum;
          const pr = PROTECOES[p.janela.protecao] || PROTECOES.nenhuma;
          const cond = v.U * j.area * dT;
          const sol = j.area * SOLAR_VIDRO[k] * v.fs * pr.fator * fSolar;
          add('janela-' + k, 'envoltoria', `Janela ${nome} (${arred(j.area, 2)} m²)`, Math.max(0, cond) + sol, 0, k);
        }
      } else if (p.tipo === 'interna_nc') {
        add('parede-' + k, 'envoltoria', `Parede ${nome} (para área não condicionada)`, mat.U * areaOpaca * Math.max(0, dT - 3), 0, k);
      }
    }

    // Cobertura
    const cob = COBERTURAS[e.cobertura.tipo] || COBERTURAS.atico;
    if (!cob.nula) {
      let dTeq;
      if (cob.interna) dTeq = Math.max(0, dT - 3);
      else dTeq = dT + cob.dTsol * (FATOR_COR[e.cobertura.cor] || 1) * cob.amort * fSolar;
      add('cobertura', 'envoltoria', 'Cobertura / teto', cob.U * area * Math.max(0, dTeq), 0, 'cobertura');
    }

    // Pessoas
    const ativ = ATIVIDADES[e.pessoas.atividade] || ATIVIDADES.escritorio;
    if (e.pessoas.quantidade > 0) {
      add('pessoas', 'interna', `Pessoas (${e.pessoas.quantidade})`, e.pessoas.quantidade * ativ.sens, e.pessoas.quantidade * ativ.lat);
    }

    // Equipamentos
    let wattsEquip = 0;
    let qtdEquip = 0;
    for (const q of e.equipamentos) {
      wattsEquip += q.qtd * q.watts;
      qtdEquip += q.qtd;
    }
    if (wattsEquip > 0) add('equipamentos', 'interna', `Equipamentos (${qtdEquip})`, wattsEquip);

    // Iluminação
    const ilum = ILUMINACAO[e.iluminacao] || ILUMINACAO.led;
    if (ilum.wm2 > 0) add('iluminacao', 'interna', 'Iluminação', ilum.wm2 * area);

    // Infiltração e ventilação (ar externo)
    const inf = INFILTRACAO[e.ar.infiltracao] || INFILTRACAO.normal;
    const vazInf = volume * inf.ach; // m³/h
    const vazVent = e.ar.ventilacao ? e.pessoas.quantidade * 9 + area * 1.08 : 0; // ASHRAE 62.1: 2,5 L/s·pessoa + 0,3 L/s·m²
    const calorSens = (v) => 0.335 * v * Math.max(0, dT); // ρ·cp/3600 ≈ 0,335 W por (m³/h·K)
    const calorLat = (v) => 0.8336 * v * dW; // ρ·hlv/3600 ≈ 0,8336 W por (m³/h·g/kg)
    add('infiltracao', 'ar', `Infiltração de ar (${arred(vazInf, 0)} m³/h)`, calorSens(vazInf), calorLat(vazInf));
    if (vazVent > 0) add('ventilacao', 'ar', `Renovação de ar (${arred(vazVent, 0)} m³/h)`, calorSens(vazVent), calorLat(vazVent));

    // Totais
    const soma = (f, g) => itens.filter((i) => !g || i.grupo === g).reduce((s, i) => s + i[f], 0);
    const sens = soma('sensivel');
    const lat = soma('latente');
    const subtotal = sens + lat;
    const segW = subtotal * e.seguranca;
    const totalW = subtotal + segW;
    const btu = totalW * W_PARA_BTU;

    const grupo = (g) => ({ sensivel: soma('sensivel', g), latente: soma('latente', g), total: soma('sensivel', g) + soma('latente', g) });
    const porSuperficie = {};
    for (const k of ['N', 'S', 'L', 'O', 'cobertura']) {
      const w = itens.filter((i) => i.superficie === k).reduce((s, i) => s + i.sensivel + i.latente, 0);
      porSuperficie[k] = { watts: arred(w, 1), area: arred(areaSuperficie[k], 2), wm2: areaSuperficie[k] > 0 ? arred(w / areaSuperficie[k], 1) : 0 };
    }

    const equipamento = dimensionar(btu);
    const total = {
      sensivel: arred(sens, 1),
      latente: arred(lat, 1),
      subtotal: arred(subtotal, 1),
      seguranca: arred(segW, 1),
      watts: arred(totalW, 1),
      kW: arred(totalW / 1000, 2),
      btu: arred(btu, 0),
      tr: arred(btu / BTU_POR_TR, 2),
      shr: subtotal > 0 ? arred(sens / subtotal, 2) : 1,
      btuPorM2: arred(btu / area, 0),
    };

    return {
      entrada: e,
      clima: { cidade: cid.nome, tbsExt: arred(tbsExt, 1), urExt, tbsInt, urInt: e.clima.urInt, wExt: arred(wExt, 2), wInt: arred(wInt, 2), dT: arred(dT, 1), dW: arred(dW, 2) },
      geometria: { area, volume, comps, areaSuperficie, janelas: janelasDe(e, comps) },
      itens,
      grupos: { envoltoria: grupo('envoltoria'), interna: grupo('interna'), ar: grupo('ar') },
      porSuperficie,
      total,
      equipamento,
      regraPratica: regraPratica(area, e.pessoas.quantidade, qtdEquip),
      energia: energia(totalW, e.uso),
    };
  }

  function janelasDe(e, comps) {
    const out = {};
    for (const k of ['N', 'S', 'L', 'O']) out[k] = dimensoesJanela(e.paredes[k], comps[k], e.ambiente.peDireito);
    return out;
  }

  /** Escolhe a capacidade comercial: menor equipamento que atende a carga com tolerância de 5%. */
  function dimensionar(btu, tol = 0.05) {
    const max = CAPACIDADES[CAPACIDADES.length - 1];
    let quantidade = 1;
    let alvo = btu;
    if (btu > max * (1 + tol)) {
      quantidade = Math.ceil(btu / max);
      alvo = btu / quantidade;
    }
    const capacidade = CAPACIDADES.find((c) => c >= alvo / (1 + tol)) || max;
    const total = capacidade * quantidade;
    return {
      capacidade,
      quantidade,
      capacidadeTotal: total,
      folga: arred((total / btu - 1) * 100, 0), // % acima da carga
      alcance: ALCANCE[capacidade] || 8,
      sobredimensionado: total / btu > 1.4,
    };
  }

  /** Regra prática de mercado, só para comparação: 600 BTU/h·m² (+600/pessoa acima de 2 e por equipamento acima do 1º). */
  function regraPratica(area, pessoas, equipamentos) {
    const btu = 600 * area + 600 * Math.max(0, pessoas - 2) + 600 * Math.max(0, equipamentos - 1);
    return { btu: arred(btu, 0) };
  }

  /** Estimativa de consumo e custo mensal. Fator de carga médio 0,6; COP típico (inverter 3,8 / convencional 2,9). */
  function energia(cargaW, uso) {
    const cop = uso.tipo === 'convencional' ? 2.9 : 3.8;
    const horas = limitar(num(uso.horasDia, 8), 0, 24);
    const tarifa = Math.max(0, num(uso.tarifa, 0.95));
    const kWhMes = ((cargaW * 0.6) / 1000 / cop) * horas * 30;
    return { cop, horasDia: horas, kWhMes: arred(kWhMes, 0), custoMes: arred(kWhMes * tarifa, 2), tarifa };
  }

  /** Tipo de equipamento sugerido conforme carga, área e geometria. */
  function sugerirEquipamento(res) {
    const { area, comps } = res.geometria;
    const { largura, comprimento, peDireito } = res.entrada.ambiente;
    const eq = res.equipamento;
    const maxDim = Math.max(largura, comprimento);
    const obs = [];
    let tipo = 'Split hi-wall inverter';
    let quantidade = eq.quantidade;
    let capacidade = eq.capacidade;

    if (res.total.btu > 36000 || area > 45) {
      tipo = 'Split piso-teto ou cassete (ou 2 hi-wall)';
      obs.push('Para cargas altas ou ambientes grandes, a distribuição de ar de um único hi-wall fica deficiente.');
      if (quantidade === 1 && maxDim > eq.alcance * 1.1 && res.total.btu > 18000) {
        quantidade = 2;
        capacidade = CAPACIDADES.find((c) => c >= res.total.btu / 2 / 1.05) || capacidade;
        obs.push('Dividir em 2 equipamentos dá redundância e melhor distribuição.');
      }
    } else if (maxDim > eq.alcance * 1.25) {
      obs.push(`A maior dimensão (${arred(maxDim, 1)} m) passa do alcance típico do equipamento (~${eq.alcance} m): posicione na parede menor, soprando ao longo do lado maior, ou use 2 unidades.`);
    }
    if (eq.sobredimensionado && eq.capacidade === CAPACIDADES[0])
      obs.push('A menor capacidade comercial (7.500 BTU/h) já excede a carga calculada. Prefira inverter: ele modula abaixo da potência nominal e evita liga/desliga frequente.');
    else if (eq.sobredimensionado) obs.push('A capacidade comercial mais próxima fica bem acima da carga: equipamento inverter mitiga liga/desliga frequente e má desumidificação.');
    if (res.total.shr < 0.7) obs.push('Carga latente alta (SHR baixo): prefira equipamento com boa desumidificação e evite sobredimensionar.');
    if (peDireito > 3.2) obs.push('Pé-direito alto: considere o volume de ar estratificado e verifique o alcance vertical do equipamento.');
    return { tipo, quantidade, capacidade, observacoes: obs };
  }

  /* ---------- diagnóstico (what-if) ---------- */
  /** Reexecuta o cálculo com melhorias e devolve quanto cada uma reduz a carga. */
  function oportunidades(entrada) {
    const base = calcular(entrada);
    const e0 = normalizar(entrada);
    const lista = [];
    const tentar = (id, titulo, descricao, mutar) => {
      const e = clonar(e0);
      if (mutar(e) === false) return;
      const r = calcular(e);
      const delta = base.total.btu - r.total.btu;
      if (delta >= 300 && delta / base.total.btu >= 0.02) {
        lista.push({
          id,
          titulo,
          descricao,
          reducaoBTU: arred(delta, 0),
          reducaoPct: arred((delta / base.total.btu) * 100, 0),
          novaCapacidade: r.equipamento.capacidade * r.equipamento.quantidade,
          reduzCapacidade: r.equipamento.capacidadeTotal < base.equipamento.capacidadeTotal,
        });
      }
    };

    for (const k of ['N', 'S', 'L', 'O']) {
      const p = e0.paredes[k];
      const j = base.geometria.janelas[k];
      if (!j || j.area <= 0) continue;
      if (p.janela.protecao !== 'externa')
        tentar('protecao-' + k, `Proteção solar externa na janela ${ORIENTACOES[k]}`, 'Toldo, brise ou persiana externa barram a radiação antes de entrar.', (e) => {
          e.paredes[k].janela.protecao = 'externa';
        });
      if (p.janela.vidro === 'comum')
        tentar('pelicula-' + k, `Película de controle solar na janela ${ORIENTACOES[k]}`, 'Reduz o ganho solar do vidro em ~50%.', (e) => {
          e.paredes[k].janela.vidro = 'pelicula';
        });
    }
    if (['exposta', 'atico'].includes(e0.cobertura.tipo))
      tentar('isolamento-cobertura', 'Isolar a cobertura', 'Manta, lã ou EPS sob a telha/laje reduz muito o calor vindo do teto.', (e) => {
        e.cobertura.tipo = 'isolada';
      });
    if (e0.cobertura.cor !== 'clara' && ['exposta', 'atico'].includes(e0.cobertura.tipo))
      tentar('cobertura-clara', 'Pintar/escolher cobertura de cor clara', 'Superfícies claras absorvem menos radiação solar.', (e) => {
        e.cobertura.cor = 'clara';
      });
    for (const k of ['N', 'L', 'O', 'S']) {
      if (e0.paredes[k].tipo === 'externa' && e0.paredes[k].cor !== 'clara')
        tentar('cor-' + k, `Parede ${ORIENTACOES[k]} em cor clara`, 'Tinta clara/refletiva reduz o ganho solar da parede.', (e) => {
          e.paredes[k].cor = 'clara';
        });
    }
    if (e0.iluminacao === 'incandescente' || e0.iluminacao === 'fluorescente')
      tentar('led', 'Trocar a iluminação por LED', 'LED emite bem menos calor para a mesma iluminância.', (e) => {
        e.iluminacao = 'led';
      });
    if (e0.ar.infiltracao === 'alta')
      tentar('vedacao', 'Melhorar a vedação do ambiente', 'Vedar frestas e manter portas fechadas reduz a entrada de ar quente e úmido.', (e) => {
        e.ar.infiltracao = 'normal';
      });

    lista.sort((a, b) => b.reducaoBTU - a.reducaoBTU);
    return lista;
  }

  return {
    W_PARA_BTU, BTU_POR_TR, CAPACIDADES, ALCANCE, CIDADES, MATERIAIS, COBERTURAS, VIDROS, PROTECOES,
    ATIVIDADES, ILUMINACAO, INFILTRACAO, EQUIPAMENTOS_PADRAO, PADRAO, ORIENTACOES,
    FATOR_COR, DT_SOL_PAREDE, SOLAR_VIDRO,
    calcular, normalizar, dimensionar, regraPratica, energia, sugerirEquipamento, oportunidades,
    umidadeAbsoluta, pressaoSaturacao, comprimentosParedes, dimensoesJanela, mesclar, arred,
  };
});
