import { criarVisualizador } from './visual3d.js';
import { criarPlanta } from './planta.js';
import { criarGrafico, partes, GRUPOS } from './grafico.js';

const N = window.Nucleo;
const P = window.Posicao;
const R = window.Rapido;
const M = window.Municipios;
const $ = (id) => document.getElementById(id);
const BTU = N.W_PARA_BTU;
const n0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const n1 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hh = (h) => `${String(h).padStart(2, '0')}h`;
const minuscula = (t) => t.charAt(0).toLowerCase() + t.slice(1);
const CHAVE = 'ar-btus-v2';
const NOMES_DIRECAO = { N: 'Norte', NE: 'Nordeste', L: 'Leste', SE: 'Sudeste', S: 'Sul', SO: 'Sudoeste', O: 'Oeste', NO: 'Noroeste' };
const HORARIOS = [
  { rotulo: 'À noite (21h–7h)', inicio: 21, fim: 7 },
  { rotulo: 'Tarde e noite (12h–0h)', inicio: 12, fim: 0 },
  { rotulo: 'Horário comercial (8h–18h)', inicio: 8, fim: 18 },
  { rotulo: '24 horas', inicio: 0, fim: 0 },
];
// Cidades que aparecem primeiro na busca: capitais por população, depois as cidades de referência.
const ORDEM_CAPITAIS = ['sao-paulo', 'rio-de-janeiro', 'brasilia', 'fortaleza', 'salvador', 'belo-horizonte', 'manaus', 'curitiba', 'recife', 'goiania', 'belem', 'porto-alegre', 'sao-luis', 'maceio', 'campo-grande', 'teresina', 'joao-pessoa', 'natal', 'aracaju', 'cuiaba', 'florianopolis', 'macapa', 'porto-velho', 'vitoria', 'boa-vista', 'rio-branco', 'palmas'];
const PRIORIDADE_CIDADES = new Map();
ORDEM_CAPITAIS.forEach((k, i) => PRIORIDADE_CIDADES.set(N.CIDADES[k].ibge, i));
for (const c of Object.values(N.CIDADES)) if (!PRIORIDADE_CIDADES.has(c.ibge)) PRIORIDADE_CIDADES.set(c.ibge, 100);
const APELIDOS = {
  sp: 'São Paulo SP', sampa: 'São Paulo SP', rj: 'Rio de Janeiro RJ', bh: 'Belo Horizonte MG', bsb: 'Brasília DF', poa: 'Porto Alegre RS',
  floripa: 'Florianópolis SC', cwb: 'Curitiba PR', ssa: 'Salvador BA', sjc: 'São José dos Campos SP', rp: 'Ribeirão Preto SP',
  sjrp: 'São José do Rio Preto SP', bauru: 'Bauru SP', vix: 'Vitória ES', gyn: 'Goiânia GO', jp: 'João Pessoa PB', cg: 'Campo Grande MS',
};
function buscarCidades(texto) {
  const k = M.semAcento(texto);
  return M.buscar(APELIDOS[k] || texto, 8, PRIORIDADE_CIDADES);
}
const CANTO = { A: ['esquerdo', 'direito'], C: ['esquerdo', 'direito'], B: ['de cima', 'de baixo'], D: ['de cima', 'de baixo'] };

/* ============================================================ estado */
let estado = carregar();
let res = null;
let sug = null;
let posSel = null;
let itemSel = null;
let hora = null; // hora escolhida para o 3D (null = acompanha o pico)
let agendado = false;
let viewer;
let planta;
let grafico;

function novoEstado() {
  const e = R.estadoInicial();
  e.modo = 'rapido';
  const n = N.normalizar(e);
  e.moveis = P.moveisPadrao(e.tipo, n.ambiente.largura, n.ambiente.comprimento);
  return e;
}

function carregar() {
  if (location.hash.startsWith('#c=')) {
    const o = N.decodificar(location.hash.slice(3));
    history.replaceState(null, '', location.pathname);
    if (o) {
      setTimeout(() => avisar('Cenário aberto a partir do link.'), 0);
      return { modo: 'detalhado', ...N.mesclar(N.PADRAO, o) };
    }
  }
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (s && s.v === 2) return { modo: s.rapido ? 'rapido' : 'detalhado', ...N.mesclar(N.PADRAO, s) };
  } catch (_) { /* sem armazenamento */ }
  return novoEstado();
}

function salvar() {
  try { localStorage.setItem(CHAVE, JSON.stringify(estado)); } catch (_) { /* modo privado */ }
}

const ler = (obj, caminho) => caminho.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
function gravar(obj, caminho, valor) {
  const ks = caminho.split('.');
  let o = obj;
  for (const k of ks.slice(0, -1)) o = o[k] ?? (o[k] = {});
  o[ks[ks.length - 1]] = valor;
}

function converter(el) {
  const t = el.dataset.tipo;
  if (el.type === 'checkbox') return el.checked;
  if (t === 'pct') return Number(el.value) / 100;
  if (t === 'int') return el.value === '' ? '' : Math.round(Number(el.value));
  if (t === 'num') return el.value;
  if (t === 'numnull') return el.value === '' ? null : el.value;
  return el.value;
}

/* ============================================================ construção do formulário */
const opcoes = (obj, campo = 'rotulo') => Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}">${esc(v[campo])}</option>`).join('');

function montar() {
  $('tipos').innerHTML =
    Object.entries(N.TIPOS).map(([k, t]) => `<label><input type="radio" name="tipo" value="${k}"><span>${t.icone} ${esc(t.rotulo)}</span></label>`).join('') +
    '<label><input type="radio" name="tipo" value="outro"><span>✏️ Outro</span></label>';
  $('cobertura').innerHTML = opcoes(N.COBERTURAS);
  $('piso').innerHTML = opcoes(N.PISOS);
  $('atividade').innerHTML = opcoes(N.ATIVIDADES);
  $('iluminacao').innerHTML = opcoes(N.ILUMINACAO);
  $('infiltracao').innerHTML = opcoes(N.INFILTRACAO);
  $('partida').innerHTML = opcoes(N.PARTIDAS);
  $('paredeA').innerHTML = Object.keys(N.DIRECOES).map((k) => `<option value="${k}">${NOMES_DIRECAO[k]}</option>`).join('');
  const horas = Array.from({ length: 24 }, (_, h) => `<option value="${h}">${hh(h)}</option>`).join('');
  $('inicio').innerHTML = horas;
  $('fim').innerHTML = horas;
  $('horarios').innerHTML = HORARIOS.map((h, i) => `<button type="button" data-horario="${i}" aria-pressed="false">${esc(h.rotulo)}</button>`).join('');

  $('paredes').innerHTML = N.PAREDES.map((k) => `
    <details class="parede" data-k="${k}" ${k === 'A' ? 'open' : ''}>
      <summary><b>Parede ${k}</b><span class="resumo-parede" id="rp-${k}"></span></summary>
      <div class="corpo">
        <label class="campo"><span>Essa parede…</span>
          <select data-bind="paredes.${k}.tipo">
            <option value="externa">Dá para fora (rua, quintal, área externa)</option>
            <option value="interna">Divide com outro cômodo sem ar</option>
            <option value="climatizada">Divide com cômodo com ar ligado</option>
          </select></label>
        <div class="so-externa" data-k="${k}">
          <div class="so-sol" data-k="${k}">
            <span class="rotulo-campo">Pega sol?</span>
            <div class="chips" role="radiogroup" aria-label="Sol na parede ${k}">
              ${Object.entries(N.EXPOSICOES).map(([v, r]) => `<label><input type="radio" name="sol-${k}" data-bind="paredes.${k}.sol" value="${v}"><span>${esc(r)}</span></label>`).join('')}
            </div>
          </div>
          <label class="check so-bussola" data-k="${k}"><input type="checkbox" data-bind="paredes.${k}.sombra"><span>Fica na sombra (prédio vizinho, árvore, varanda)</span></label>
          <div class="grade">
            <label class="campo"><span>Material</span><select data-bind="paredes.${k}.material">${opcoes(N.MATERIAIS)}</select></label>
            <label class="campo"><span>Cor por fora</span><select data-bind="paredes.${k}.cor"><option value="clara">Clara</option><option value="media">Média</option><option value="escura">Escura</option></select></label>
          </div>
          <div class="bloco">
            <label class="check"><input type="checkbox" data-acao="janela" data-k="${k}"><span><b>Tem janela</b> nesta parede</span></label>
            <div class="campos-janela" data-k="${k}">
              <div class="grade tres">
                <label class="campo"><span>Largura (m)</span><input data-bind="paredes.${k}.janela.largura" data-tipo="num" type="text" inputmode="decimal"></label>
                <label class="campo"><span>Altura (m)</span><input data-bind="paredes.${k}.janela.altura" data-tipo="num" type="text" inputmode="decimal"></label>
                <label class="campo"><span>Altura do chão (m)</span><input data-bind="paredes.${k}.janela.peitoril" data-tipo="num" type="text" inputmode="decimal"></label>
              </div>
              <label class="campo"><span>Posição: <b id="pj-${k}"></b></span><input data-bind="paredes.${k}.janela.pos" data-tipo="pct" type="range" min="5" max="95" step="5"></label>
              <div class="grade">
                <label class="campo"><span>Vidro</span><select data-bind="paredes.${k}.janela.vidro">${opcoes(N.VIDROS)}</select></label>
                <label class="campo"><span>Proteção do sol</span><select data-bind="paredes.${k}.janela.protecao">${opcoes(N.PROTECOES)}</select></label>
              </div>
            </div>
          </div>
        </div>
        <div class="bloco">
          <label class="check"><input type="checkbox" data-bind="paredes.${k}.porta.ativa"><span><b>Tem porta</b> nesta parede</span></label>
          <div class="campos-porta grade" data-k="${k}">
            <label class="campo"><span>Largura (m)</span><input data-bind="paredes.${k}.porta.largura" data-tipo="num" type="text" inputmode="decimal"></label>
            <label class="campo"><span>Posição: <b id="pp-${k}"></b></span><input data-bind="paredes.${k}.porta.pos" data-tipo="pct" type="range" min="5" max="95" step="5"></label>
          </div>
        </div>
      </div>
    </details>`).join('');

  $('aparelhos').innerHTML = N.APARELHOS.map((a) => `
    <div class="aparelho" data-ap="${a.id}">
      <span class="nome">${esc(a.nome)}<small>~${a.sens + (a.lat || 0)} W${a.sempre ? ' · 24 h' : a.cozinha ? ' · nas refeições' : ''}</small></span>
      <span class="mini-stepper"><button type="button" data-ap-d="-1" aria-label="Menos ${esc(a.nome)}">−</button><output>0</output><button type="button" data-ap-d="1" aria-label="Mais ${esc(a.nome)}">+</button></span>
    </div>`).join('');

  $('boasPraticas').innerHTML = [
    'Deixe pelo menos 15 cm entre o topo do aparelho e o teto (alguns fabricantes pedem mais).',
    'Nada de cortina, estante ou armário na frente do aparelho: o ar precisa sair e voltar livre.',
    'Não instale em cima da cama, do sofá ou da mesa: o vento frio direto incomoda.',
    'A condensadora (parte de fora) precisa de sombra e ventilação, longe do sol da tarde e de lugares abafados.',
    'Respeite o comprimento mínimo e máximo da tubulação e o desnível do seu modelo (está no manual).',
    'O dreno precisa de caimento e de um lugar certo para a água: nada pingando na calçada.',
    'Circuito elétrico só para o ar, com disjuntor e aterramento (NBR 5410). Instalação por técnico qualificado, com segurança para trabalho em altura.',
  ].map((t) => `<li>${esc(t)}</li>`).join('');
}

/* Preenche o formulário com o estado (usado no início, ao trocar de tipo e ao recomeçar). */
function escreverFormulario() {
  const norm = N.normalizar(estado);
  for (const el of $('form').querySelectorAll('[data-bind]')) {
    const caminho = el.dataset.bind;
    let v = ler(estado, caminho);
    if (v === undefined) v = ler(norm, caminho);
    if (el.type === 'radio') el.checked = String(v) === el.value;
    else if (el.type === 'checkbox') el.checked = !!v;
    else if (el.dataset.tipo === 'pct') el.value = Math.round(Number(ler(norm, caminho)) * 100);
    else if (el.dataset.tipo === 'num' || el.dataset.tipo === 'numnull') el.value = v === null || v === undefined || v === '' ? '' : String(v).replace('.', ',');
    else el.value = v === null || v === undefined ? '' : v;
  }
  for (const r of document.querySelectorAll('input[name=tipo]')) r.checked = r.value === estado.tipo;
  $('cidadeBusca').value = N.climaDaCidade(norm.cidade).nome;
  renderExtras();
}

function renderExtras() {
  $('extras').innerHTML = (estado.extras || [])
    .map((x, i) => `<div class="extra" data-i="${i}"><input type="text" value="${esc(x.nome)}" data-extra="nome" aria-label="Nome do aparelho"><input type="number" inputmode="numeric" min="0" step="10" value="${esc(x.watts)}" data-extra="watts" aria-label="Potência em watts"><button type="button" class="btn" data-extra-rm="${i}" aria-label="Remover">✕</button></div>`)
    .join('');
}

/* Mostra/esconde partes do formulário conforme o tipo de cada parede e o modo de sol. */
function visibilidade(norm) {
  const bussola = norm.orientacao.modo === 'bussola';
  $('campoBussola').hidden = !bussola;
  $('campoCorTeto').hidden = !!N.COBERTURAS[norm.cobertura.tipo].nula || !!N.COBERTURAS[norm.cobertura.tipo].adjacente;
  for (const k of N.PAREDES) {
    const p = norm.paredes[k];
    const ext = p.tipo === 'externa';
    document.querySelector(`.so-externa[data-k="${k}"]`).hidden = !ext;
    document.querySelector(`.so-sol[data-k="${k}"]`).hidden = !ext || bussola;
    document.querySelector(`.so-bussola[data-k="${k}"]`).hidden = !ext || !bussola;
    const temJanela = p.janela.largura > 0;
    document.querySelector(`[data-acao="janela"][data-k="${k}"]`).checked = temJanela;
    document.querySelector(`.campos-janela[data-k="${k}"]`).hidden = !temJanela;
    document.querySelector(`.campos-porta[data-k="${k}"]`).hidden = !p.porta.ativa;
    const len = N.comprimentoParede(norm, k);
    const partes = [p.tipo === 'externa' ? `para fora · ${N.EXPOSICOES[p.sol === 'naosei' ? 'tarde' : p.sol].toLowerCase()}` : p.tipo === 'interna' ? 'divisa com cômodo sem ar' : 'vizinho com ar'];
    if (temJanela) partes.push(`janela ${n1.format(p.janela.largura)} m`);
    if (p.porta.ativa) partes.push('porta');
    $(`rp-${k}`).textContent = partes.join(' · ');
    $(`pj-${k}`).textContent = `${n1.format(p.janela.pos * len)} m do canto ${CANTO[k][0]}`;
    $(`pp-${k}`).textContent = `${n1.format(p.porta.pos * len)} m do canto ${CANTO[k][0]}`;
  }
  for (const el of document.querySelectorAll('.aparelho')) {
    const q = norm.aparelhos[el.dataset.ap] || 0;
    el.querySelector('output').textContent = q;
    el.classList.toggle('ativo', q > 0);
  }
  for (const b of document.querySelectorAll('[data-horario]')) {
    const h = HORARIOS[Number(b.dataset.horario)];
    b.setAttribute('aria-pressed', String(h.inicio === norm.uso.inicio && h.fim % 24 === norm.uso.fim));
  }
  $('tempVal').textContent = `${norm.uso.temperatura} °C`;
  $('margemVal').textContent = `${Math.round(norm.avancado.margem * 100)}%`;
  const c = N.climaDaCidade(norm.cidade);
  $('tmax').placeholder = c.tmax;
  $('amp').placeholder = c.amp;
  $('ur').placeholder = c.ur;
}

/* ============================================================ resultado */
const nomeGrupo = { construcao: 'Sol, paredes e teto', sol: 'Sol, paredes e teto', interno: 'Pessoas e aparelhos', ar: 'Ar de fora', partida: 'Calor acumulado ao ligar' };
const corGrupo = { construcao: 'var(--s2)', sol: 'var(--s2)', interno: 'var(--s1)', ar: 'var(--s3)', partida: 'var(--s4)' };

function motivoDiferenca(r) {
  const top = r.pico.componentes.filter((c) => c.total > 0).slice(0, 2).map((c) => minuscula(c.rotulo));
  return top.join(' e ');
}

function renderLimite(r, ops) {
  const d = r.dimensionamento;
  const idx = N.CAPACIDADES.indexOf(d.capacidade);
  const menor = N.CAPACIDADES[idx - 1];
  const el = $('limite');
  if (d.quantidade !== 1 || !menor || d.necessarioBTU > menor * 1.15) {
    el.hidden = true;
    return;
  }
  const ajuda = ops.find((o) => o.reduzCapacidade);
  el.hidden = false;
  el.innerHTML = `⚖️ <b>No limite:</b> o ambiente pede ${n0.format(d.necessarioBTU)} BTU/h, pouco acima do aparelho de ${n0.format(menor)}.` +
    (ajuda ? ` Se fizer isto — <b>${esc(minuscula(ajuda.titulo))}</b> —, o de ${n0.format(ajuda.novaCapacidade)} já resolve.` : ' Pequenas melhorias (veja abaixo) podem trazer para o tamanho menor.');
}

const capComercial = (btu) => N.CAPACIDADES.find((c) => c >= btu * 0.95) || N.CAPACIDADES[N.CAPACIDADES.length - 1];
let ultimoAnuncio = '';

function renderResumo(r) {
  const d = r.dimensionamento;
  const m = r.mercado;
  const qtd = d.quantidade > 1 ? `${d.quantidade} × ` : '';
  const texto = `${qtd}${n0.format(d.capacidade)} BTUs`;
  $('btus').textContent = texto;
  $('tipoEquip').textContent = d.tipo;
  $('escala').innerHTML = N.CAPACIDADES.map((c) => `<li class="${c === d.capacidade ? 'sel' : ''} ${c === m.capacidade ? 'loja' : ''}">${n0.format(c)}</li>`).join('');
  const iRec = N.CAPACIDADES.indexOf(d.capacidade);
  const iLoja = N.CAPACIDADES.indexOf(m.capacidade);
  const passos = iRec - iLoja;
  $('seloLojas').textContent =
    d.quantidade > 1 ? 'Ambiente grande: mais de um aparelho' :
    passos === 0 ? '✓ O mesmo tamanho que as lojas indicam' :
    passos > 0 ? `${passos} tamanho${passos > 1 ? 's' : ''} acima do que as lojas indicam: o cálculo hora a hora viu mais calor` :
    'Abaixo do que as lojas indicam (você escolheu só o cálculo técnico)';
  $('seloLojas').className = `selo-lojas ${passos > 0 ? 'acima' : passos < 0 ? 'abaixo' : 'igual'}`;
  const fis = d.necessarioFisicoBTU;
  const linha = (rotulo, ajuda, btu, cap, vence) =>
    `<li class="${vence ? 'vence' : ''}"><span>${rotulo}<small>${ajuda}</small></span><b>${n0.format(btu)} BTU/h → ${n0.format(cap)}</b></li>`;
  $('tresNumeros').innerHTML =
    linha('Método de mercado', 'a conta que lojas e fabricantes ensinam', m.btu, m.capacidade, d.governa === 'mercado') +
    linha('Cálculo hora a hora', 'sol, teto, vidro e horário de uso (mínimo técnico)', fis, capComercial(fis), d.governa === 'fisico') +
    `<li class="nota-criterio">${d.criterio === 'maior' ? 'Recomendamos o <b>maior</b> dos dois: errar para menos é o que deixa o ar sem dar conta nos dias quentes.' : esc(N.CRITERIOS[d.criterio].rotulo)}</li>`;
  $('itensMercado').innerHTML = m.itens.map((x) => `<li><span>${esc(x.rotulo)}</span><b>${n0.format(x.btu)}</b></li>`).join('') + `<li class="total"><span>Total</span><b>${n0.format(m.btu)} BTU/h</b></li>`;
  $('porque').innerHTML = r.explicacoes.map((t) => `<li>${esc(t)}</li>`).join('');
  const cl = r.clima;
  const info = cl.estimado
    ? `Clima estimado a partir de ${cl.fontes.map((f) => `${f.nome.replace(/ \(..\)$/, '')} (${f.km} km)`).join(', ')}: máxima ~${n1.format(cl.tmax)} °C. Cidade de serra ou litoral pode ser diferente; ajuste em "Ajustes avançados".`
    : `Clima de referência: máxima ~${n1.format(cl.tmax)} °C, variação de ${n1.format(cl.amp)} °C no dia.`;
  for (const id of ['cidadeInfo', 'rapidoCidadeInfo']) if ($(id)) $(id).textContent = info;
  $('areaInfo').textContent = `Área: ${n1.format(r.geometria.area)} m² · Volume: ${n0.format(r.geometria.volume)} m³`;
  $('barraBtus').textContent = texto;
  $('barraInfo').textContent = `lojas: ${n0.format(m.capacidade)}`;
  const anuncio = `Recomendado: ${texto}.`;
  if (anuncio !== ultimoAnuncio) {
    ultimoAnuncio = anuncio;
    $('anuncio').textContent = anuncio;
  }
}

/** O que o motor corrigiu (valor fora do possível) — mostrado com gentileza, nada some em silêncio. */
const CAMPOS_AJUSTE = [
  ['ambiente.largura', 'Largura', 'm'], ['ambiente.comprimento', 'Comprimento', 'm'], ['ambiente.peDireito', 'Altura do teto', 'm'],
  ['pessoas.quantidade', 'Pessoas', ''],
  ...N.PAREDES.flatMap((k) => [[`paredes.${k}.janela.largura`, `Janela ${k}: largura`, 'm'], [`paredes.${k}.janela.altura`, `Janela ${k}: altura`, 'm'], [`paredes.${k}.janela.peitoril`, `Janela ${k}: altura do chão`, 'm']]),
];
function renderAjustes(r) {
  const avisos = [];
  for (const [caminho, rotulo, un] of CAMPOS_AJUSTE) {
    const bruto = ler(estado, caminho);
    if (bruto === undefined || bruto === null) continue;
    const digitado = typeof bruto === 'string' ? (bruto.trim() === '' ? NaN : Number(bruto.replace(',', '.'))) : Number(bruto);
    const usado = Number(ler(r.entrada, caminho));
    if (caminho.includes('.janela.') && !(ler(r.entrada, caminho.replace(/\.(altura|peitoril)$/, '.largura')) > 0)) continue;
    if (!Number.isFinite(digitado)) avisos.push(`${rotulo}: não entendemos “${esc(bruto)}”, usamos ${n1.format(usado)}${un ? ' ' + un : ''}.`);
    else if (Math.abs(digitado - usado) > 0.011) avisos.push(`${rotulo}: ${n1.format(digitado)}${un ? ' ' + un : ''} não cabe aqui, usamos ${n1.format(usado)}${un ? ' ' + un : ''}.`);
  }
  $('ajustes').hidden = !avisos.length;
  $('ajustes').innerHTML = avisos.length ? `<b>Ajustamos alguns valores:</b><ul>${avisos.map((a) => `<li>${a}</li>`).join('')}</ul>` : '';
}

function renderSuposicoes() {
  const lista = estado.modo === 'rapido' ? R.suposicoes(estado) : [];
  $('suposicoes').hidden = !lista.length;
  $('suposicoes').innerHTML = lista.length ? `<b>O que supusemos</b> (responda no modo rápido para ficar mais exato):<ul>${lista.map((t) => `<li>${esc(t)}</li>`).join('')}</ul>` : '';
}

function renderGrafico(r) {
  const d = r.dimensionamento;
  const efetiva = d.capacidadeTotal * d.fatores.rendimentoTemperatura * d.fatores.rendimentoCalor;
  grafico.atualizar({
    horas: r.horas,
    capacidadeEfetiva: efetiva,
    rotuloCapacidade: `Aparelho de ${n0.format(d.capacidadeTotal)} entrega ~${n0.format(efetiva)} a ${r.entrada.uso.temperatura} °C`,
    horaPico: r.pico.hora,
    horaSel: hora ?? r.pico.hora,
  });
  $('tabelaHoras').innerHTML =
    `<thead><tr><th>Hora</th><th class="num">Fora</th><th>Ar</th>${GRUPOS.map((g) => `<th class="num">${esc(g.rotulo)}</th>`).join('')}<th class="num">Total (BTU/h)</th></tr></thead><tbody>` +
    r.horas.map((h) => `<tr><td>${hh(h.h)}</td><td class="num">${n1.format(h.te)} °C</td><td>${h.emUso ? 'ligado' : '—'}</td>${partes(h).map((v) => `<td class="num">${n0.format(v)}</td>`).join('')}<td class="num"><b>${n0.format(h.total * BTU)}</b></td></tr>`).join('') +
    '</tbody>';
}

function renderPosicoes(s, sel) {
  const c = $('posicoes');
  if (!s.porParede.length) {
    c.innerHTML = '<p class="vazio">Nenhuma parede tem espaço livre para o aparelho. Aumente o ambiente ou diminua a janela.</p>';
    return;
  }
  const cor = (n) => (n >= 75 ? 'var(--calor-0)' : n >= 60 ? 'var(--calor-1)' : 'var(--calor-2)');
  const aviso = res.dimensionamento.quantidade > 1 ? '<p class="nota">A carga pede mais de um aparelho: as posições valem para o primeiro; divida o ambiente em zonas para o segundo.</p>' : '';
  c.innerHTML = aviso + s.porParede.map((p, i) => `
    <button type="button" class="pos" data-parede="${p.parede}" aria-pressed="${sel && p.parede === sel.parede}">
      <span class="nota-pos" data-n="${p.nota}" style="--p:${p.nota};--cor:${cor(p.nota)}" aria-label="Nota ${p.nota} de 100"></span>
      <span>
        <h3>${i + 1}. ${esc(p.rotulo)}${i === 0 ? '<span class="badge">Melhor</span>' : ''}</h3>
        <span class="sub">O ar alcança ${Math.round(p.cobertura * 100)}% do ambiente · altura ${n1.format(p.y)} m${p.tubulacao ? ` · tubulação ~${n1.format(p.tubulacao)} m` : ''}</span>
        <ul>${p.motivos.map((m) => `<li class="ok">${esc(m)}</li>`).join('')}${p.alertas.map((m) => `<li class="alerta">${esc(m)}</li>`).join('')}</ul>
      </span>
    </button>`).join('');
}

function renderConsultor(r, ops, s) {
  const itens = [];
  for (const o of r.dimensionamento.observacoes) itens.push({ ic: '⚠️', t: 'Atenção', d: o });
  if (s.melhor && s.melhor.alertas.length) itens.push({ ic: '📍', t: `Na posição recomendada (${s.melhor.rotulo})`, d: s.melhor.alertas.join(' · ') });
  for (const o of ops.slice(0, 6)) {
    itens.push({
      ic: '💡', t: o.titulo,
      d: o.descricao + (o.reduzCapacidade ? ` Com isso, um aparelho de ${n0.format(o.novaCapacidade)} BTUs já resolve.` : ''),
      ganho: `−${n0.format(o.reducaoBTU)} BTU/h`, sub: `${o.reducaoPct}% a menos`,
    });
  }
  if (!ops.length) itens.push({ ic: '✅', t: 'Ambiente já bem protegido', d: 'Nenhuma mudança simples reduziria a carga de forma relevante.' });
  $('consultor').innerHTML = itens.map((a) => `<div class="achado"><span class="ic" aria-hidden="true">${a.ic}</span><div><h3>${esc(a.t)}</h3><p>${esc(a.d)}</p></div>${a.ganho ? `<span class="ganho">${esc(a.ganho)}<small>${esc(a.sub)}</small></span>` : '<span></span>'}</div>`).join('');
}

function renderDetalhe(r) {
  const ordem = ['construcao', 'interno', 'ar', 'partida'];
  const comps = r.pico.componentes.filter((c) => c.total > 0.5);
  const max = Math.max(1, ...comps.map((c) => c.total));
  let html = '';
  for (const g of ordem) {
    const lista = comps.filter((c) => (g === 'construcao' ? c.grupo === 'construcao' || c.grupo === 'sol' : c.grupo === g));
    if (!lista.length) continue;
    const soma = lista.reduce((s, c) => s + c.total, 0);
    html += `<div class="grupo-titulo"><span>${esc(nomeGrupo[g])}</span><span>${n0.format(soma * BTU)} BTU/h</span></div>`;
    html += lista.map((c) => `<div class="barra-item" style="--cor:${corGrupo[c.grupo]}"><span>${esc(c.rotulo)}</span><span class="v">${n0.format(c.total * BTU)}</span><span class="trilho"><i style="width:${(c.total / max) * 100}%"></i></span></div>`).join('');
  }
  const d = r.dimensionamento;
  html += `<div class="grupo-titulo"><span>Calor no pior horário (${hh(r.pico.hora)})</span><span>${n0.format(d.cargaPicoBTU)} BTU/h</span></div>`;
  html += `<div class="grupo-titulo"><span>+ margem ${Math.round(d.fatores.margem * 100)}% e rendimento real do aparelho</span><span><b>${n0.format(d.necessarioBTU)} BTU/h</b></span></div>`;
  $('detalhe').innerHTML = html;
  const en = r.energia;
  $('energiaTexto').textContent = `Gasto estimado num mês quente: ~${n0.format(en.kWhMes)} kWh (${en.horasDia} h por dia ligado) ≈ ${brl.format(en.custoMes)} por mês a ${brl.format(en.tarifa)}/kWh. Clima usado: ${r.clima.cidade}, máxima de ${n1.format(r.clima.tmax)} °C.`;
}

function renderMiniPlanta(norm, r) {
  const W = norm.ambiente.largura;
  const L = norm.ambiente.comprimento;
  const esc100 = 100 / Math.max(W, L);
  const w = W * esc100;
  const h = L * esc100;
  const x0 = (100 - w) / 2;
  const y0 = (100 - h) / 2;
  const lados = { A: [x0, y0, x0 + w, y0], B: [x0 + w, y0, x0 + w, y0 + h], C: [x0, y0 + h, x0 + w, y0 + h], D: [x0, y0, x0, y0 + h] };
  const rot = { A: [50, y0 - 8], B: [x0 + w + 10, 52], C: [50, y0 + h + 16], D: [x0 - 10, 52] };
  const sol = { manha: '☀️', tarde: '☀️', diatodo: '☀️' };
  let s = `<rect x="${x0}" y="${y0}" width="${w}" height="${h}" fill="var(--surface)"/>`;
  for (const k of N.PAREDES) {
    const t = norm.paredes[k].tipo;
    const [a, b, c, d] = lados[k];
    const estilo = t === 'externa' ? 'stroke="var(--text)" stroke-width="5"' : t === 'interna' ? 'stroke="var(--muted)" stroke-width="3" stroke-dasharray="6 4"' : 'stroke="var(--border)" stroke-width="3"';
    s += `<g class="lado" data-parede="${k}"><line x1="${a}" y1="${b}" x2="${c}" y2="${d}" ${estilo}/><line x1="${a}" y1="${b}" x2="${c}" y2="${d}" stroke="transparent" stroke-width="16"/>`;
    s += `<text x="${rot[k][0]}" y="${rot[k][1]}" font-size="13" font-weight="800" text-anchor="middle">${k}${sol[r.exposicao[k]] ? ' ' + sol[r.exposicao[k]] : ''}</text></g>`;
  }
  $('miniPlanta').innerHTML = s;
}

function infoHora(r, h) {
  const s = r.sol[h];
  const t = r.horas[h];
  $('horaVal').textContent = hh(h);
  $('horaInfo').textContent = `· fora ${n1.format(t.te)} °C · ar ${t.emUso ? 'ligado' : 'desligado'} · ${s.altitude > 0 ? `sol a ${Math.round(s.altitude)}° de altura` : 'noite'}${h === r.pico.hora ? ' · pior horário' : ''}`;
  $('hora3d').value = h;
}

/* ============================================================ modo rápido (árvore de decisão) */
const nomeDo = () => R.NOME_COMODO[(estado.rapido && estado.rapido.comodo) || estado.tipo] || 'ambiente';
const respostas = () => ({ ...R.respostasPadrao(), ...(estado.rapido || {}) });
const chip = (pergunta, v, rotulo, marcado, extra = '') =>
  `<button type="button" class="opcao" data-resp="${pergunta}" data-v="${esc(v)}" aria-pressed="${marcado}">${rotulo}${extra}</button>`;

function textoResposta(id, r, n) {
  switch (id) {
    case 'comodo': return (R.COMODOS.find((c) => c.v === r.comodo) || {}).rotulo;
    case 'tamanho': return `${n1.format(n.ambiente.largura * n.ambiente.comprimento)} m²`;
    case 'local': return (R.LOCAIS.find((c) => c.v === r.local) || {}).rotulo;
    case 'teto': return ((R.TETOS[R.grupoTeto(r.local)] || []).find((c) => c.v === r.teto) || {}).rotulo;
    case 'sol': return (R.SOLS.find((c) => c.v === r.sol) || {}).rotulo;
    case 'janela': return (R.JANELAS.find((c) => c.v === r.janela) || {}).rotulo;
    case 'cidade': return N.climaDaCidade(n.cidade).nome;
    case 'horario': return `${hh(n.uso.inicio)}–${hh(n.uso.fim)}`;
    case 'ocupacao': return `${n.pessoas.quantidade} pessoa${n.pessoas.quantidade > 1 ? 's' : ''}`;
    default: return '';
  }
}

function htmlPergunta(id, r, n) {
  const nome = nomeDo();
  const t = (titulo, ajuda = '') => `<h2 class="pergunta" id="rapidoTitulo" tabindex="-1">${titulo}</h2>${ajuda ? `<p class="dica">${ajuda}</p>` : ''}`;
  switch (id) {
    case 'comodo':
      return t('Em que cômodo vai ficar o ar?', 'Isso já ajusta pessoas, aparelhos e horário típicos. Você confere no fim.') +
        `<div class="opcoes">${R.COMODOS.map((c) => chip('comodo', c.v, `<span class="ic">${c.icone}</span>${esc(c.rotulo)}`, r.comodo === c.v)).join('')}</div>`;
    case 'tamanho': {
      const area = n.ambiente.largura * n.ambiente.comprimento;
      return t(`Qual o tamanho do ${nome}?`, 'Na dúvida, escolha a faixa de cima: as lojas também arredondam para cima.') +
        `<div class="opcoes">${R.TAMANHOS.map((x) => chip('tamanho', x.v, `${esc(x.rotulo)}<small>ex.: ${esc(x.ex)}</small>`, r.tamanho === x.v)).join('')}</div>
        <div class="digitar">
          <label class="campo"><span>Ou digite os m²</span><input id="rapidoM2" type="text" inputmode="decimal" placeholder="ex.: 22" value="${/^m2:/.test(r.tamanho) ? esc(r.tamanho.slice(3).replace('.', ',')) : ''}"></label>
          <button type="button" class="btn" data-usar="m2">Usar</button>
        </div>
        <div class="digitar">
          <label class="campo"><span>Ou as medidas (m)</span><span class="medidas"><input id="rapidoL" type="text" inputmode="decimal" placeholder="largura" aria-label="Largura em metros"> × <input id="rapidoC" type="text" inputmode="decimal" placeholder="comprimento" aria-label="Comprimento em metros"></span></label>
          <button type="button" class="btn" data-usar="lxc">Usar</button>
        </div>
        <p class="dica">Agora: ${n1.format(area)} m². Não sabe medir? Conte passos largos de parede a parede: cada passo tem uns 80 cm.</p>`;
    }
    case 'local':
      return t('É casa ou apartamento?') + `<div class="opcoes">${R.LOCAIS.map((c) => chip('local', c.v, `<span class="ic">${c.icone}</span>${esc(c.rotulo)}`, r.local === c.v)).join('')}</div>`;
    case 'teto': {
      const g = R.grupoTeto(r.local);
      const titulo = g === 'casa' ? `Olhe para o teto do ${nome}. O que você vê?` : g === 'predio' ? 'O que tem em cima do seu apartamento?' : 'O que tem em cima da loja ou sala?';
      return t(titulo, 'O teto que pega sol é uma das coisas que mais esquentam um cômodo.') +
        `<div class="opcoes">${R.TETOS[g].map((c) => chip('teto', c.v, esc(c.rotulo), r.teto === c.v)).join('')}</div>`;
    }
    case 'sol':
      return t(`Bate sol no ${nome}? Pense na parede ou na janela que dá para a rua.`, 'Sol da tarde é o que mais esquenta: as lojas contam 800 BTU por m² em vez de 600.') +
        `<div class="opcoes">${R.SOLS.map((c) => chip('sol', c.v, `<span class="ic">${c.icone}</span>${esc(c.rotulo)}`, r.sol === c.v)).join('')}</div>`;
    case 'janela':
      return t('Como é a janela que pega esse sol?') + `<div class="opcoes">${R.JANELAS.map((c) => chip('janela', c.v, esc(c.rotulo), r.janela === c.v)).join('')}</div>`;
    case 'cidade':
      return t('Em que cidade fica?', 'Todas as 5.570 cidades do Brasil. Pode escrever sem acento.') +
        `<div class="busca-cidade"><div class="combo">
          <input id="rapidoCidade" type="search" autocomplete="off" spellcheck="false" value="${esc(N.climaDaCidade(n.cidade).nome)}" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="rapidoCidadeLista" aria-label="Cidade">
          <ul id="rapidoCidadeLista" class="sugestoes" role="listbox" aria-label="Cidades encontradas" hidden></ul>
        </div><small class="dica" id="rapidoCidadeInfo"></small></div>
        <button type="button" class="btn" id="usarLocalizacao">📍 Usar minha localização</button> <small class="dica-inline">fica só no seu aparelho</small>`;
    case 'horario': {
      const tip = N.TIPOS[r.comodo === 'outro' ? 'sala' : r.comodo] || N.TIPOS.sala;
      return t('Quando o ar vai ficar ligado?', 'Quem liga o ar só à noite precisa tirar o calor que o cômodo guardou durante o dia.') +
        `<div class="opcoes">${R.HORARIOS.map((h) => chip('horario', h.v, h.v === 'tipico' ? `O de costume para ${esc(nome)} (${hh(tip.inicio)} às ${hh(tip.fim % 24)})` : `<span class="ic">${h.icone}</span>${esc(h.rotulo)}`, r.horario === h.v)).join('')}</div>`;
    }
    case 'ocupacao':
      return t(`Quem e o que fica no ${nome} com o ar ligado?`, 'Cada pessoa e cada aparelho ligado esquentam o ambiente.') +
        `<div class="pessoas-rapido"><span>Pessoas</span><div class="stepper"><button type="button" data-rp="-1" aria-label="Menos uma pessoa">−</button><output aria-live="polite">${n.pessoas.quantidade}</output><button type="button" data-rp="1" aria-label="Mais uma pessoa">+</button></div></div>
        <div class="opcoes">${R.aparelhosDo(r.comodo).map((a) => chip('aparelho', a.id, `<span class="ic">${a.icone}</span>${esc(a.rotulo)}`, !!n.aparelhos[a.id])).join('')}
        ${chip('nenhum_aparelho', '1', 'Nada disso', !Object.keys(n.aparelhos).length)}</div>`;
    default:
      return '';
  }
}

function renderRapido() {
  if (estado.modo !== 'rapido') return;
  const r = respostas();
  const n = N.normalizar(estado);
  const ids = R.perguntas(r);
  const passo = Math.max(0, Math.min(r.passo || 0, ids.length - 1));
  const id = ids[passo];
  $('rapidoProgresso').textContent = `Pergunta ${passo + 1} de ${ids.length}`;
  $('rapidoBarra').style.width = `${((passo + 1) / ids.length) * 100}%`;
  // só as perguntas já passadas viram atalho (toque para mudar)
  $('rapidoTrilha').innerHTML = ids
    .map((q, i) => (i >= passo ? '' : `<button type="button" class="trilha-item${(r.respondidas || []).includes(q) ? '' : ' padrao'}" data-ir="${i}" title="Mudar">${esc(textoResposta(q, r, n) || '')} ✎</button>`))
    .join('');
  const alvo = $('rapidoPergunta');
  if (alvo.dataset.id !== id || alvo.dataset.chave !== JSON.stringify([r, n.aparelhos, n.pessoas.quantidade, n.cidade])) {
    // guarda o foco do teclado para devolvê-lo ao mesmo botão depois de redesenhar
    const foco = document.activeElement && alvo.contains(document.activeElement) ? document.activeElement : null;
    const chaveFoco = foco && (foco.dataset.resp ? `[data-resp="${foco.dataset.resp}"][data-v="${CSS.escape(foco.dataset.v)}"]` : foco.dataset.rp ? `[data-rp="${foco.dataset.rp}"]` : null);
    alvo.innerHTML = htmlPergunta(id, r, n);
    if (chaveFoco && alvo.dataset.id === id) {
      const de = alvo.querySelector(chaveFoco);
      if (de) de.focus({ preventScroll: true });
    }
    alvo.dataset.id = id;
    alvo.dataset.chave = JSON.stringify([r, n.aparelhos, n.pessoas.quantidade, n.cidade]);
    if (id === 'cidade') ligarBusca($('rapidoCidade'), $('rapidoCidadeLista'), () => $('rapidoContinuar').focus());
  }
  $('rapidoVoltar').disabled = passo === 0;
  $('rapidoContinuar').textContent = passo === ids.length - 1 ? 'Ver o resultado ↓' : 'Continuar →';
}

function irPara(passo, focar = true) {
  estado.rapido = { ...respostas(), passo };
  renderRapido();
  if (focar) {
    const t = $('rapidoTitulo');
    if (t) t.focus({ preventScroll: true });
    $('rapido').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  salvar();
}

function aplicarModo() {
  const rapido = estado.modo === 'rapido';
  $('rapido').hidden = !rapido;
  $('detalhado').hidden = rapido;
  for (const el of document.querySelectorAll('input[name=modoApp]')) el.checked = el.value === (rapido ? 'rapido' : 'detalhado');
  if (!rapido) escreverFormulario();
  renderRapido();
}

/** Troca o cômodo e oferece "Desfazer" (as respostas típicas substituem pessoas, aparelhos e horário). */
function trocarComodo(novoTipo, viaRapido) {
  const anterior = JSON.parse(JSON.stringify(estado));
  estado = viaRapido ? R.responder(estado, 'comodo', novoTipo) : N.aplicarTipo(estado, novoTipo);
  estado.modo = anterior.modo;
  const n = N.normalizar(estado);
  estado.moveis = P.moveisPadrao(novoTipo, n.ambiente.largura, n.ambiente.comprimento);
  if (anterior.tipo !== novoTipo) {
    const rot = (R.COMODOS.find((c) => c.v === novoTipo) || {}).rotulo || novoTipo;
    avisar(`Usamos pessoas, aparelhos e horário típicos de ${rot}.`, 'Desfazer', () => {
      estado = anterior;
      escreverFormulario();
      aplicarModo();
      agendar();
    });
  }
}

/* ============================================================ ciclo */
function atualizar() {
  const norm = N.normalizar(estado);
  estado.moveis = (estado.moveis || []).map((m) => P.manterDentro(m, norm.ambiente.largura, norm.ambiente.comprimento));
  res = N.calcular(estado);
  const carga = Object.fromEntries(N.PAREDES.map((k) => [k, res.porSuperficie[k].watts[res.pico.hora]]));
  sug = P.sugerir(res.entrada, { capacidade: res.dimensionamento.capacidade, alcance: res.dimensionamento.alcance, exposicao: res.exposicao, cargaParede: carga, itens: estado.moveis });
  if (posSel && !sug.porParede.some((c) => c.parede === posSel)) posSel = null;
  const sel = (posSel && sug.porParede.find((c) => c.parede === posSel)) || sug.melhor;
  if (itemSel !== null && !estado.moveis[itemSel]) itemSel = null;
  const h = hora ?? res.pico.hora;

  visibilidade(res.entrada);
  renderMiniPlanta(res.entrada, res);
  renderResumo(res);
  renderAjustes(res);
  renderSuposicoes();
  renderRapido();
  renderGrafico(res);
  renderPosicoes(sug, sel);
  const ops = N.oportunidades(estado);
  renderLimite(res, ops);
  renderConsultor(res, ops, sug);
  renderDetalhe(res);
  infoHora(res, h);
  viewer.atualizar({ res, sug, selecionado: sel, Pos: P, alcance: res.dimensionamento.alcance, dim: { W: res.entrada.ambiente.largura, L: res.entrada.ambiente.comprimento, H: res.entrada.ambiente.peDireito }, hora: h });
  planta.atualizar({ res, sug, selecionado: sel, itens: sug.itens, itemSel, alcance: res.dimensionamento.alcance });
  $('itemGirar').disabled = itemSel === null;
  $('itemRemover').disabled = itemSel === null;
  salvar();
  window.__ar = { estado, res, sug, selecionado: sel, viewer };
}

function agendar() {
  if (agendado) return;
  agendado = true;
  requestAnimationFrame(() => {
    agendado = false;
    atualizar();
  });
}

function avisar(txt, rotuloAcao, acao) {
  const el = $('avisoLink');
  el.textContent = txt;
  if (rotuloAcao) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn pequeno';
    b.textContent = rotuloAcao;
    b.addEventListener('click', () => {
      el.textContent = '';
      acao();
    });
    el.append(' ', b);
  }
}

function abrirParede(k) {
  for (const d of document.querySelectorAll('.parede')) d.open = d.dataset.k === k;
  const alvo = document.querySelector(`.parede[data-k="${k}"]`);
  alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
  alvo.querySelector('summary').focus({ preventScroll: true });
}

/* ============================================================ busca de cidade */
/** Liga um campo de busca de cidade (5.570 municípios, sem acento, apelidos, cidades grandes primeiro). */
function ligarBusca(busca, lista, depois) {
  let achados = [];
  let ativo = -1;
  let recemEscolhida = false;
  const fechar = () => {
    lista.hidden = true;
    busca.setAttribute('aria-expanded', 'false');
    busca.removeAttribute('aria-activedescendant');
    ativo = -1;
  };
  const escolher = (m) => {
    estado = { ...R.responder(estado, 'cidade', 'ibge:' + m.codigo), modo: estado.modo };
    busca.value = `${m.nome} (${m.uf})`;
    recemEscolhida = true;
    fechar();
    agendar();
    if (depois) depois();
  };
  const desenhar = () => {
    lista.innerHTML = achados.length
      ? achados.map((m, i) => `<li role="option" id="${lista.id}-${i}" data-i="${i}" aria-selected="${i === ativo}">${esc(m.nome)} <small>${m.uf}</small></li>`).join('')
      : '<li class="vazio" role="option" aria-disabled="true">Nenhuma cidade encontrada</li>';
    lista.hidden = false;
    busca.setAttribute('aria-expanded', 'true');
    if (ativo >= 0) busca.setAttribute('aria-activedescendant', `${lista.id}-${ativo}`);
  };
  busca.addEventListener('beforeinput', () => {
    // depois de escolher, a próxima tecla começa uma busca nova (sem grudar no nome anterior)
    if (recemEscolhida) {
      busca.value = '';
      recemEscolhida = false;
    }
  });
  busca.addEventListener('input', (ev) => {
    ev.stopPropagation();
    achados = buscarCidades(busca.value);
    ativo = achados.length ? 0 : -1;
    if (busca.value.trim().length < 2) return fechar();
    desenhar();
  });
  busca.addEventListener('change', (ev) => ev.stopPropagation());
  busca.addEventListener('keydown', (ev) => {
    if (lista.hidden) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      if (!achados.length) return;
      ativo = (ativo + (ev.key === 'ArrowDown' ? 1 : -1) + achados.length) % achados.length;
      desenhar();
    } else if (ev.key === 'Enter') {
      ev.preventDefault();
      if (achados[ativo]) escolher(achados[ativo]);
    } else if (ev.key === 'Escape') fechar();
  });
  lista.addEventListener('pointerdown', (ev) => {
    const li = ev.target.closest('li[data-i]');
    if (li) {
      ev.preventDefault();
      escolher(achados[Number(li.dataset.i)]);
    }
  });
  busca.addEventListener('focus', () => {
    recemEscolhida = false;
    busca.placeholder = busca.value || 'Digite o nome da sua cidade';
    busca.value = '';
  });
  busca.addEventListener('blur', () =>
    setTimeout(() => {
      fechar();
      if (document.activeElement !== busca) busca.value = N.climaDaCidade(N.normalizar(estado).cidade).nome;
    }, 150)
  );
}

/* ============================================================ eventos */
function ligar() {
  const form = $('form');
  form.addEventListener('submit', (e) => e.preventDefault());
  const aoMudar = (ev) => {
    const el = ev.target;
    if (el.name === 'modoApp') {
      if (!el.checked) return;
      estado.modo = el.value;
      aplicarModo();
      return agendar();
    }
    if (el.name === 'tipo') {
      if (!el.checked) return;
      trocarComodo(el.value, false);
      escreverFormulario();
      return agendar();
    }
    if (el.dataset.acao === 'janela') {
      const k = el.dataset.k;
      estado.paredes[k].janela = { ...N.PADRAO.paredes.A.janela, ...(estado.paredes[k].janela || {}), largura: el.checked ? 1.2 : 0 };
      escreverFormulario();
      return agendar();
    }
    if (el.dataset.extra) {
      const i = Number(el.closest('.extra').dataset.i);
      estado.extras[i][el.dataset.extra] = el.dataset.extra === 'watts' ? Number(el.value) || 0 : el.value;
      return agendar();
    }
    if (!el.dataset.bind) return;
    if (el.type === 'radio' && !el.checked) return;
    gravar(estado, el.dataset.bind, converter(el));
    if (/^ambiente\./.test(el.dataset.bind)) posSel = null;
    agendar();
  };
  form.addEventListener('input', aoMudar);
  form.addEventListener('change', aoMudar);

  form.addEventListener('click', (ev) => {
    const st = ev.target.closest('[data-step]');
    if (st) {
      const v = Math.max(0, (Number(ler(estado, st.dataset.step)) || 0) + Number(st.dataset.d));
      gravar(estado, st.dataset.step, v);
      escreverFormulario();
      return agendar();
    }
    const ap = ev.target.closest('[data-ap-d]');
    if (ap) {
      const id = ap.closest('.aparelho').dataset.ap;
      const q = Math.max(0, (estado.aparelhos[id] || 0) + Number(ap.dataset.apD));
      estado.aparelhos = { ...estado.aparelhos, [id]: q };
      if (!q) delete estado.aparelhos[id];
      return agendar();
    }
    const hr = ev.target.closest('[data-horario]');
    if (hr) {
      const h = HORARIOS[Number(hr.dataset.horario)];
      estado.uso = { ...estado.uso, inicio: h.inicio, fim: h.fim };
      escreverFormulario();
      return agendar();
    }
    const rm = ev.target.closest('[data-extra-rm]');
    if (rm) {
      estado.extras.splice(Number(rm.dataset.extraRm), 1);
      renderExtras();
      return agendar();
    }
  });
  $('addExtra').addEventListener('click', () => {
    estado.extras = [...(estado.extras || []), { nome: 'Outro aparelho', watts: 100 }];
    renderExtras();
    agendar();
  });

  ligarBusca($('cidadeBusca'), $('cidadeLista'));

  // ---------- modo rápido
  const rap = $('rapido');
  rap.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-resp]');
    if (b) {
      const q = b.dataset.resp;
      if (q === 'comodo') trocarComodo(b.dataset.v, true);
      else estado = { ...R.responder(estado, q, b.dataset.v), modo: 'rapido' };
      return agendar();
    }
    const usar = ev.target.closest('[data-usar]');
    if (usar) {
      const valor = usar.dataset.usar === 'm2' ? `m2:${($('rapidoM2').value || '').trim()}` : `lxc:${($('rapidoL').value || '').trim()}x${($('rapidoC').value || '').trim()}`;
      const novo = R.responder(estado, 'tamanho', valor.replace(/\s+/g, ''));
      if (novo === estado) return avisar('Digite um número, por exemplo 22 ou 4,5 × 5.');
      estado = { ...novo, modo: 'rapido' };
      avisar('');
      return agendar();
    }
    const rp = ev.target.closest('[data-rp]');
    if (rp) {
      estado = { ...R.responder(estado, 'pessoas', N.normalizar(estado).pessoas.quantidade + Number(rp.dataset.rp)), modo: 'rapido' };
      return agendar();
    }
    const ir = ev.target.closest('[data-ir]');
    if (ir) return irPara(Number(ir.dataset.ir));
    if (ev.target.closest('#usarLocalizacao')) {
      if (!navigator.geolocation) return avisar('Seu navegador não permite usar a localização. Digite o nome da cidade.');
      avisar('Procurando sua cidade…');
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const m = M.maisProximo(pos.coords.latitude, pos.coords.longitude);
          estado = { ...R.responder(estado, 'cidade', 'ibge:' + m.codigo), modo: 'rapido' };
          avisar(`Cidade encontrada: ${m.nome} (${m.uf}).`);
          agendar();
        },
        () => avisar('Não conseguimos a localização. Digite o nome da cidade.'),
        { timeout: 10000, maximumAge: 600000 }
      );
    }
  });
  rap.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && ev.target.matches('#rapidoM2, #rapidoL, #rapidoC')) {
      ev.preventDefault();
      rap.querySelector(`[data-usar="${ev.target.id === 'rapidoM2' ? 'm2' : 'lxc'}"]`).click();
    }
  });
  $('rapidoVoltar').addEventListener('click', () => irPara((respostas().passo || 0) - 1));
  $('rapidoContinuar').addEventListener('click', () => {
    const r = respostas();
    const ids = R.perguntas(r);
    const passo = r.passo || 0;
    estado.rapido = { ...r, respondidas: [...new Set([...(r.respondidas || []), ids[passo]])] };
    if (passo >= ids.length - 1) {
      salvar();
      agendar();
      $('resumo').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    irPara(passo + 1);
    agendar();
  });
  $('verAgora').addEventListener('click', (ev) => {
    ev.preventDefault();
    $('resumo').scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  $('miniPlanta').addEventListener('click', (ev) => {
    const g = ev.target.closest('.lado');
    if (g) abrirParede(g.dataset.parede);
  });

  $('compartilhar').addEventListener('click', async () => {
    const url = `${location.origin}${location.pathname}#c=${N.codificar(estado)}`;
    try {
      await navigator.clipboard.writeText(url);
      avisar('Link copiado! Cole numa mensagem para mostrar exatamente este cenário.');
    } catch (_) {
      avisar(url);
    }
  });
  $('recomecar').addEventListener('click', () => {
    const anterior = JSON.parse(JSON.stringify(estado));
    estado = novoEstado();
    posSel = null;
    itemSel = null;
    hora = null;
    escreverFormulario();
    aplicarModo();
    avisar('Começamos de novo.', 'Desfazer', () => {
      estado = anterior;
      escreverFormulario();
      aplicarModo();
      agendar();
    });
    agendar();
  });

  $('posicoes').addEventListener('click', (ev) => {
    const b = ev.target.closest('.pos');
    if (!b) return;
    posSel = b.dataset.parede;
    agendar();
  });

  document.querySelectorAll('[data-vista]').forEach((b) => b.addEventListener('click', () => viewer.vista(b.dataset.vista)));
  $('optCalor').addEventListener('change', (e) => {
    viewer.opcoes({ calor: e.target.checked });
    $('legendaCalor').hidden = !e.target.checked;
  });
  $('optTeto').addEventListener('change', (e) => viewer.opcoes({ teto: e.target.checked }));
  $('optGirar').addEventListener('change', (e) => viewer.opcoes({ girar: e.target.checked }));
  $('hora3d').addEventListener('input', (e) => {
    hora = Number(e.target.value);
    agendar();
  });

  document.querySelectorAll('[data-item]').forEach((b) =>
    b.addEventListener('click', () => {
      const norm = N.normalizar(estado);
      estado.moveis.push(P.manterDentro({ tipo: b.dataset.item, x: norm.ambiente.largura / 2, z: norm.ambiente.comprimento / 2, rot: 0 }, norm.ambiente.largura, norm.ambiente.comprimento));
      itemSel = estado.moveis.length - 1;
      agendar();
    })
  );
  $('itemGirar').addEventListener('click', () => {
    if (itemSel === null) return;
    const norm = N.normalizar(estado);
    const it = estado.moveis[itemSel];
    estado.moveis[itemSel] = P.manterDentro({ ...it, rot: it.rot ? 0 : 90 }, norm.ambiente.largura, norm.ambiente.comprimento);
    agendar();
  });
  $('itemRemover').addEventListener('click', () => {
    if (itemSel === null) return;
    estado.moveis.splice(itemSel, 1);
    itemSel = null;
    agendar();
  });
}

/* ============================================================ início */
montar();
escreverFormulario();
viewer = criarVisualizador($('viz3d'), { aoSelecionar: (p) => { posSel = p; agendar(); } });
planta = criarPlanta($('planta'), {
  Pos: P,
  aoMoverItem: (i, novo) => { estado.moveis[i] = novo; agendar(); },
  aoSelecionarPosicao: (p) => { posSel = p; agendar(); },
  aoSelecionarItem: (i) => { itemSel = i; agendar(); },
  aoSelecionarParede: abrirParede,
});
grafico = criarGrafico($('grafico'), { aoEscolherHora: (h) => { hora = h; agendar(); } });
ligar();
aplicarModo();
atualizar();
if ('IntersectionObserver' in window) {
  new IntersectionObserver((es) => document.body.classList.toggle('resumo-fora', !es[0].isIntersecting)).observe($('resumo'));
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* sem HTTPS: segue sem offline */ }));
}
