import { criarVisualizador } from './visual3d.js';
import { criarPlanta } from './planta.js';
import { criarGrafico, partes, GRUPOS } from './grafico.js';

const N = window.Nucleo;
const P = window.Posicao;
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
  const e = JSON.parse(JSON.stringify(N.PADRAO));
  e.moveis = P.moveisPadrao(e.tipo, e.ambiente.largura, e.ambiente.comprimento);
  return e;
}

function carregar() {
  if (location.hash.startsWith('#c=')) {
    const o = N.decodificar(location.hash.slice(3));
    history.replaceState(null, '', location.pathname);
    if (o) {
      setTimeout(() => avisar('Cenário aberto a partir do link.'), 0);
      return N.mesclar(N.PADRAO, o);
    }
  }
  try {
    const s = JSON.parse(localStorage.getItem(CHAVE) || 'null');
    if (s && s.v === 2) return N.mesclar(N.PADRAO, s);
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
                <label class="campo"><span>Largura (m)</span><input data-bind="paredes.${k}.janela.largura" data-tipo="num" type="number" inputmode="decimal" min="0" step="0.1"></label>
                <label class="campo"><span>Altura (m)</span><input data-bind="paredes.${k}.janela.altura" data-tipo="num" type="number" inputmode="decimal" min="0" step="0.1"></label>
                <label class="campo"><span>Altura do chão (m)</span><input data-bind="paredes.${k}.janela.peitoril" data-tipo="num" type="number" inputmode="decimal" min="0" step="0.1"></label>
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
            <label class="campo"><span>Largura (m)</span><input data-bind="paredes.${k}.porta.largura" data-tipo="num" type="number" inputmode="decimal" min="0.5" max="2.5" step="0.1"></label>
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
    (ajuda ? ` Com <b>${esc(minuscula(ajuda.titulo))}</b>, o de ${n0.format(ajuda.novaCapacidade)} já resolve.` : ' Pequenas melhorias (veja abaixo) podem trazer para o tamanho menor.');
}

function renderResumo(r) {
  const d = r.dimensionamento;
  const rl = r.regraLojas;
  const qtd = d.quantidade > 1 ? `${d.quantidade} × ` : '';
  $('btus').textContent = `${qtd}${n0.format(d.capacidade)} BTUs`;
  $('tipoEquip').textContent = d.tipo;
  $('escala').innerHTML = N.CAPACIDADES.map((c) => `<li class="${c === d.capacidade ? 'sel' : ''} ${c === rl.capacidade ? 'loja' : ''}">${n0.format(c)}</li>`).join('');
  $('horaPico').textContent = `${hh(r.pico.hora)} (${n1.format(r.horas[r.pico.hora].te)} °C fora)`;
  $('cargaPico').textContent = `${n0.format(d.cargaPicoBTU)} BTU/h`;
  $('necessario').textContent = `${n0.format(d.necessarioBTU)} BTU/h`;
  const regra = `A <b>regra das lojas</b> (${rl.base} BTU por m²${rl.solTarde ? ', porque pega sol da tarde' : ''}, + 600 por pessoa extra e por eletrônico) daria <b>${n0.format(rl.btu)} BTUs → ${n0.format(rl.capacidade)}</b>.`;
  let conclusao;
  if (rl.capacidade === d.capacidade && d.quantidade === 1) conclusao = ' ✓ O cálculo hora a hora chegou ao mesmo tamanho.';
  else if (d.capacidadeTotal > rl.capacidade) conclusao = ` O cálculo detalhado pede mais porque considera ${esc(motivoDiferenca(r))}, que a regra simples não enxerga.`;
  else conclusao = ' O cálculo detalhado pede menos: este ambiente recebe pouco calor de fora. Se quiser folga extra, o tamanho das lojas também funciona.';
  $('comparacao').innerHTML = regra + conclusao;
  $('porque').innerHTML = r.explicacoes.map((t) => `<li>${esc(t)}</li>`).join('');
  const cl = r.clima;
  $('cidadeInfo').textContent = cl.estimado
    ? `Clima estimado a partir de ${cl.fontes.map((f) => `${f.nome.replace(/ \(..\)$/, '')} (${f.km} km)`).join(', ')}: máxima ~${n1.format(cl.tmax)} °C. Cidade de serra ou litoral pode ser diferente; ajuste em "Ajustes avançados".`
    : `Clima de referência: máxima ~${n1.format(cl.tmax)} °C, variação de ${n1.format(cl.amp)} °C no dia.`;
  $('areaInfo').textContent = `Área: ${n1.format(r.geometria.area)} m² · Volume: ${n0.format(r.geometria.volume)} m³`;
  $('barraBtus').textContent = `${qtd}${n0.format(d.capacidade)} BTUs`;
  $('barraInfo').textContent = `pico às ${hh(r.pico.hora)}`;
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

function avisar(txt) {
  $('avisoLink').textContent = txt;
}

function abrirParede(k) {
  for (const d of document.querySelectorAll('.parede')) d.open = d.dataset.k === k;
  const alvo = document.querySelector(`.parede[data-k="${k}"]`);
  alvo.scrollIntoView({ behavior: 'smooth', block: 'center' });
  alvo.querySelector('summary').focus({ preventScroll: true });
}

/* ============================================================ eventos */
function ligar() {
  const form = $('form');
  form.addEventListener('submit', (e) => e.preventDefault());
  const aoMudar = (ev) => {
    const el = ev.target;
    if (el.name === 'tipo') {
      estado = N.aplicarTipo(estado, el.value);
      const norm = N.normalizar(estado);
      estado.moveis = P.moveisPadrao(el.value, norm.ambiente.largura, norm.ambiente.comprimento);
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

  // ---------- busca de cidade (5.570 municípios, sem acento)
  const busca = $('cidadeBusca');
  const lista = $('cidadeLista');
  let achados = [];
  let ativo = -1;
  const fechar = () => {
    lista.hidden = true;
    busca.setAttribute('aria-expanded', 'false');
    ativo = -1;
  };
  const escolher = (m) => {
    estado.cidade = 'ibge:' + m.codigo;
    busca.value = `${m.nome} (${m.uf})`;
    fechar();
    busca.blur();
    agendar();
  };
  const desenharLista = () => {
    lista.innerHTML = achados.length
      ? achados.map((m, i) => `<li role="option" id="cid-${i}" data-i="${i}" aria-selected="${i === ativo}">${esc(m.nome)} <small>${m.uf}</small></li>`).join('')
      : '<li class="vazio" role="option" aria-disabled="true">Nenhuma cidade encontrada</li>';
    lista.hidden = false;
    busca.setAttribute('aria-expanded', 'true');
    busca.setAttribute('aria-activedescendant', ativo >= 0 ? `cid-${ativo}` : '');
  };
  busca.addEventListener('input', (ev) => {
    ev.stopPropagation();
    achados = window.Municipios.buscar(busca.value, 8);
    ativo = achados.length ? 0 : -1;
    if (busca.value.trim().length < 2) return fechar();
    desenharLista();
  });
  busca.addEventListener('change', (ev) => ev.stopPropagation());
  busca.addEventListener('keydown', (ev) => {
    if (lista.hidden) return;
    if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') {
      ev.preventDefault();
      ativo = (ativo + (ev.key === 'ArrowDown' ? 1 : -1) + achados.length) % achados.length;
      desenharLista();
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
    // campo limpo para digitar; o nome atual fica como dica
    busca.placeholder = busca.value || 'Digite o nome da sua cidade';
    busca.value = '';
  });
  busca.addEventListener('blur', () =>
    setTimeout(() => {
      fechar();
      busca.value = N.climaDaCidade(N.normalizar(estado).cidade).nome;
    }, 150)
  );

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
    estado = novoEstado();
    posSel = null;
    itemSel = null;
    hora = null;
    escreverFormulario();
    avisar('');
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
atualizar();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => { /* sem HTTPS: segue sem offline */ }));
}
