import { criarVisualizador } from './room3d.js';
import { criarPlanta } from './planta.js';

const T = window.Termica;
const P = window.Posicao;
const $ = (id) => document.getElementById(id);
const nf = (d = 0) => new Intl.NumberFormat('pt-BR', { maximumFractionDigits: d, minimumFractionDigits: d });
const n0 = nf(0);
const n1 = nf(1);
const n2 = nf(2);
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const STORAGE_KEY = 'ar-termica-v1';
const ORDEM_PAREDES = ['N', 'L', 'S', 'O'];
const NOME_PAREDE = T.ORIENTACOES;

/* ---------- estado ---------- */
let equip = [{ nome: 'Notebook', qtd: 1, watts: 65 }];
let itens = P.itensPadrao(T.PADRAO.ambiente.largura, T.PADRAO.ambiente.comprimento);
let itemSel = null;
let posSel = null; // parede escolhida (letra) ou null = melhor
let agendado = false;

const opcoes = (obj, campo = 'rotulo') =>
  Object.entries(obj).map(([k, v]) => `<option value="${esc(k)}">${esc(v[campo])}</option>`).join('');

/* ---------- construção do formulário ---------- */
function montarFormulario() {
  $('cidade').innerHTML = opcoes(T.CIDADES, 'nome');
  $('atividade').innerHTML = opcoes(T.ATIVIDADES);
  $('atividade').value = 'escritorio';
  $('iluminacao').innerHTML = opcoes(T.ILUMINACAO);
  $('iluminacao').value = 'led';
  $('infiltracao').innerHTML = opcoes(T.INFILTRACAO);
  $('infiltracao').value = 'normal';
  $('coberturaTipo').innerHTML = opcoes(T.COBERTURAS);
  $('coberturaTipo').value = T.PADRAO.cobertura.tipo;
  $('portaParede').innerHTML = ORDEM_PAREDES.map((k) => `<option value="${k}">${NOME_PAREDE[k]}</option>`).join('');
  $('portaParede').value = T.PADRAO.porta.parede;
  $('portaPos').value = T.PADRAO.porta.pos * 100;
  $('equipPreset').innerHTML =
    T.EQUIPAMENTOS_PADRAO.map((q, i) => `<option value="${i}">${esc(q.nome)} (${q.watts} W)</option>`).join('') +
    '<option value="custom">Outro equipamento…</option>';

  $('paredes').innerHTML = ORDEM_PAREDES.map((k) => {
    const p = T.PADRAO.paredes[k];
    const j = p.janela;
    return `
    <details class="parede" data-k="${k}" ${k === 'O' || k === 'N' ? 'open' : ''}>
      <summary><span>Parede ${NOME_PAREDE[k]}</span><span class="resumo-parede" id="rp-${k}"></span></summary>
      <div class="corpo">
        <div class="grade tres">
          <label class="campo"><span>Tipo</span>
            <select id="p-${k}-tipo">
              <option value="externa">Externa (fachada)</option>
              <option value="interna_nc">Interna: área não climatizada</option>
              <option value="interna_c">Interna: ambiente climatizado</option>
            </select></label>
          <label class="campo"><span>Material</span><select id="p-${k}-material">${opcoes(T.MATERIAIS)}</select></label>
          <label class="campo"><span>Cor externa</span>
            <select id="p-${k}-cor"><option value="clara">Clara</option><option value="media">Média</option><option value="escura">Escura</option></select></label>
        </div>
        <div class="janela" id="j-${k}">
          <h4>Janela desta parede</h4>
          <div class="grade tres">
            <label class="campo"><span>Largura (m)</span><input id="j-${k}-largura" type="number" inputmode="decimal" min="0" step="0.1" value="${j.largura}"></label>
            <label class="campo"><span>Altura (m)</span><input id="j-${k}-altura" type="number" inputmode="decimal" min="0" step="0.1" value="${j.altura}"></label>
            <label class="campo"><span>Peitoril (m)</span><input id="j-${k}-peitoril" type="number" inputmode="decimal" min="0" step="0.1" value="${j.peitoril}"></label>
          </div>
          <label class="campo"><span>Posição ao longo da parede (%)</span><input id="j-${k}-pos" type="range" min="10" max="90" step="5" value="${j.pos * 100}"></label>
          <div class="grade">
            <label class="campo"><span>Vidro</span><select id="j-${k}-vidro">${opcoes(T.VIDROS)}</select></label>
            <label class="campo"><span>Proteção solar</span><select id="j-${k}-protecao">${opcoes(T.PROTECOES)}</select></label>
          </div>
          <small class="dica">Largura 0 = sem janela. A janela é limitada pelo tamanho da parede.</small>
        </div>
      </div>
    </details>`;
  }).join('');

  for (const k of ORDEM_PAREDES) {
    const p = T.PADRAO.paredes[k];
    $(`p-${k}-tipo`).value = p.tipo;
    $(`p-${k}-material`).value = p.material;
    $(`p-${k}-cor`).value = p.cor;
    $(`j-${k}-vidro`).value = p.janela.vidro;
    $(`j-${k}-protecao`).value = p.janela.protecao;
  }

  $('boasPraticas').innerHTML = [
    'Mantenha pelo menos 15 cm entre o topo da unidade e o teto (alguns fabricantes pedem mais): confira o manual.',
    'Evite cortinas, estantes altas e móveis na frente do jato. Obstáculos reduzem alcance e eficiência.',
    'Não instale sobre cama, sofá ou mesa de trabalho: o ar frio direto incomoda e causa desconforto.',
    'Condensadora com as folgas do manual, fora do sol direto e de locais abafados. Evite fachada oeste sem sombra.',
    'Respeite o comprimento mínimo/máximo e o desnível máximo da tubulação do seu modelo.',
    'O dreno precisa de caimento contínuo e destino adequado; evite jogar a água em calçada de passagem.',
    'Circuito elétrico dedicado, com disjuntor e aterramento adequados (NBR 5410). Instalação por técnico qualificado, atento às regras de trabalho em altura.',
  ].map((t) => `<li>${esc(t)}</li>`).join('');
}

/* ---------- equipamentos (lista dinâmica) ---------- */
function renderEquip() {
  const c = $('equipamentos');
  if (!equip.length) {
    c.innerHTML = '<p class="equip-vazio">Nenhum equipamento. Adicione abaixo (TV, computador, frigobar…).</p>';
    return;
  }
  c.innerHTML = equip
    .map(
      (q, i) => `
    <div class="equip-linha" data-i="${i}">
      <input type="text" aria-label="Nome do equipamento" value="${esc(q.nome)}" data-campo="nome" class="eq-nome">
      <input type="number" aria-label="Quantidade" min="0" step="1" value="${q.qtd}" data-campo="qtd" inputmode="numeric">
      <input type="number" aria-label="Potência em watts" min="0" step="5" value="${q.watts}" data-campo="watts" inputmode="numeric">
      <button type="button" class="btn rm" data-rm="${i}" aria-label="Remover ${esc(q.nome)}">✕</button>
    </div>`
    )
    .join('');
}

/* ---------- leitura do formulário ---------- */
const val = (id) => $(id).value;
function lerEntrada() {
  const paredes = {};
  for (const k of ORDEM_PAREDES) {
    paredes[k] = {
      tipo: val(`p-${k}-tipo`),
      material: val(`p-${k}-material`),
      cor: val(`p-${k}-cor`),
      janela: {
        largura: val(`j-${k}-largura`),
        altura: val(`j-${k}-altura`),
        peitoril: val(`j-${k}-peitoril`),
        pos: Number(val(`j-${k}-pos`)) / 100,
        vidro: val(`j-${k}-vidro`),
        protecao: val(`j-${k}-protecao`),
      },
    };
  }
  return {
    ambiente: { largura: val('largura'), comprimento: val('comprimento'), peDireito: val('peDireito') },
    clima: {
      cidade: val('cidade'),
      tbsExt: val('tbsExt') === '' ? null : val('tbsExt'),
      urExt: val('urExt') === '' ? null : val('urExt'),
      tbsInt: val('tbsInt'),
      urInt: val('urInt'),
      uso: val('uso'),
    },
    paredes,
    cobertura: { tipo: val('coberturaTipo'), cor: val('coberturaCor') },
    porta: { parede: val('portaParede'), pos: Number(val('portaPos')) / 100, largura: val('portaLargura') },
    pessoas: { quantidade: val('pessoas'), atividade: val('atividade') },
    equipamentos: equip,
    iluminacao: val('iluminacao'),
    ar: { infiltracao: val('infiltracao'), ventilacao: $('ventilacao').checked },
    seguranca: Number(val('seguranca')) / 100,
    uso: { horasDia: val('horasDia'), tarifa: val('tarifa'), tipo: val('tecnologia') },
  };
}

/* ---------- persistência ---------- */
function salvar() {
  try {
    const campos = {};
    for (const el of $('form').querySelectorAll('input[id], select[id]')) {
      if (el.closest('.equip')) continue;
      campos[el.id] = el.type === 'checkbox' ? el.checked : el.value;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ campos, equip, itens }));
  } catch (_) { /* modo privado */ }
}
function restaurar() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (!s) return;
    for (const [id, v] of Object.entries(s.campos || {})) {
      const el = $(id);
      if (!el) continue;
      if (el.type === 'checkbox') el.checked = !!v;
      else if (el.tagName !== 'SELECT' || [...el.options].some((o) => o.value === v)) el.value = v;
    }
    if (Array.isArray(s.equip)) equip = s.equip;
    if (Array.isArray(s.itens)) itens = s.itens.filter((i) => P.ITENS[i.tipo]);
  } catch (_) { /* dados antigos/corrompidos */ }
}

/* ---------- renderizações ---------- */
function renderResumo(res, sugEq) {
  const t = res.total;
  const eq = res.equipamento;
  $('btu').textContent = `${n0.format(t.btu)} BTU/h`;
  $('barraBtu').textContent = `${n0.format(t.btu)} BTU/h`;
  $('barraEquip').textContent = `→ ${eq.quantidade > 1 ? eq.quantidade + ' × ' : ''}${n0.format(eq.capacidade)}`;
  const unidades = eq.quantidade > 1 ? `${eq.quantidade} × ${n0.format(eq.capacidade)}` : n0.format(eq.capacidade);
  $('equipTexto').textContent = `${unidades} BTU/h`;
  $('equipTipo').textContent = `${sugEq.tipo} · folga de ${eq.folga}% sobre a carga`;
  $('kw').textContent = `${n2.format(t.kW)} kW`;
  $('tr').textContent = n2.format(t.tr);
  $('btuM2').textContent = n0.format(t.btuPorM2);
  $('shr').textContent = `${n0.format(t.shr * 100)}%`;
  const rp = res.regraPratica.btu;
  const dif = ((t.btu - rp) / rp) * 100;
  let txt = `Regra prática de mercado (600 BTU/h por m²): ${n0.format(rp)} BTU/h. `;
  if (Math.abs(dif) < 12) txt += 'O cálculo detalhado ficou próximo da regra.';
  else if (dif > 0) txt += `O cálculo detalhado pede ${n0.format(dif)}% a mais: sol, cobertura ou cargas internas pesam neste ambiente.`;
  else txt += `O cálculo detalhado pede ${n0.format(-dif)}% a menos: o ambiente recebe pouco calor externo.`;
  $('comparacao').textContent = txt;
}

function corNota(n) {
  return n >= 75 ? 'var(--calor-0)' : n >= 60 ? 'var(--calor-1)' : 'var(--calor-2)';
}

function renderPosicoes(sug, selecionado, res) {
  const c = $('posicoes');
  if (!sug.porParede.length) {
    c.innerHTML = '<p class="vazio">Nenhuma parede tem espaço livre para a unidade. Aumente o ambiente ou reduza a janela.</p>';
    return;
  }
  const eq = res.equipamento;
  const aviso =
    eq.quantidade > 1
      ? `<p class="nota">A carga pede ${eq.quantidade} unidades. As posições abaixo valem para a primeira: divida o ambiente em zonas e repita o raciocínio para a segunda.</p>`
      : '';
  c.innerHTML =
    aviso +
    sug.porParede
      .map((p, i) => {
        const sel = selecionado && p.parede === selecionado.parede;
        const itensLi =
          p.motivos.map((m) => `<li class="ok">${esc(m)}</li>`).join('') + p.alertas.map((m) => `<li class="alerta">${esc(m)}</li>`).join('');
        return `
      <button type="button" class="pos" data-parede="${p.parede}" aria-pressed="${sel}">
        <span class="nota-pos" data-n="${p.nota}" style="--p:${p.nota};--cor:${corNota(p.nota)}" aria-label="Nota ${p.nota} de 100"></span>
        <span>
          <h3>${i + 1}. ${esc(p.rotulo)}${i === 0 ? '<span class="badge">Recomendada</span>' : ''}</h3>
          <span class="sub">Cobertura ${n0.format(p.cobertura * 100)}% do piso · altura ${n1.format(p.y)} m${p.tubulacao ? ` · tubulação ~${n1.format(p.tubulacao)} m` : ''}</span>
          <ul>${itensLi}</ul>
        </span>
      </button>`;
      })
      .join('');
}

function renderConsultor(res, sugEq, sug, ops) {
  const achados = [];
  const eq = res.equipamento;
  achados.push({
    ic: '❄️',
    t: `${eq.quantidade > 1 ? `${eq.quantidade} unidades de ` : ''}${n0.format(eq.capacidade)} BTU/h · ${sugEq.tipo}`,
    d: `Carga de ${n0.format(res.total.btu)} BTU/h (${n2.format(res.total.kW)} kW), incluindo ${n0.format(res.total.seguranca * 3.412)} BTU/h de margem. Alcance típico do hi-wall dessa capacidade: ~${eq.alcance} m.`,
  });
  for (const o of sugEq.observacoes) achados.push({ ic: '⚠️', t: 'Atenção', d: o });
  const melhor = sug.melhor;
  if (melhor && melhor.alertas.length) achados.push({ ic: '📍', t: `Na posição recomendada (${melhor.rotulo})`, d: melhor.alertas.join(' · ') });
  for (const o of ops.slice(0, 5)) {
    achados.push({
      ic: '💡',
      t: o.titulo,
      d: o.descricao + (o.reduzCapacidade ? ` Com isso o equipamento cai para ${n0.format(o.novaCapacidade)} BTU/h.` : ''),
      ganho: `−${n0.format(o.reducaoBTU)} BTU/h`,
      sub: `${o.reducaoPct}% da carga`,
    });
  }
  if (!ops.length) achados.push({ ic: '✅', t: 'Sem melhorias óbvias', d: 'Nenhuma alteração simples reduziria a carga de forma relevante.' });
  $('consultor').innerHTML = achados
    .map(
      (a) => `<div class="achado"><span class="ic" aria-hidden="true">${a.ic}</span><div><h3>${esc(a.t)}</h3><p>${esc(a.d)}</p></div>${
        a.ganho ? `<span class="ganho">${esc(a.ganho)}<small>${esc(a.sub)}</small></span>` : '<span></span>'
      }</div>`
    )
    .join('');
}

function renderDetalhe(res) {
  const grupos = [
    ['envoltoria', 'Envoltória: paredes, janelas e cobertura', 'var(--c-inss)'],
    ['interna', 'Cargas internas: pessoas, equipamentos, luz', 'var(--brand)'],
    ['ar', 'Ar externo: infiltração e renovação', 'var(--fria)'],
  ];
  const max = Math.max(1, ...res.itens.map((i) => i.sensivel + i.latente));
  const html = grupos
    .map(([g, titulo, cor]) => {
      const lista = res.itens.filter((i) => i.grupo === g).sort((a, b) => b.sensivel + b.latente - (a.sensivel + a.latente));
      if (!lista.length) return '';
      const tot = res.grupos[g].total;
      return (
        `<div class="grupo-titulo"><span>${esc(titulo)}</span><span>${n0.format(tot * T.W_PARA_BTU)} BTU/h</span></div>` +
        lista
          .map((i) => {
            const w = i.sensivel + i.latente;
            const lat = i.latente > 0 ? ` (${n0.format(i.latente)} W latente)` : '';
            return `<div class="barra-item" style="--cor:${cor}"><span>${esc(i.rotulo)}</span><span class="v">${n0.format(w * T.W_PARA_BTU)} BTU/h</span><span class="trilho" title="${n0.format(w)} W${esc(lat)}"><i style="width:${(w / max) * 100}%"></i></span></div>`;
          })
          .join('')
      );
    })
    .join('');
  const t = res.total;
  $('detalhe').innerHTML =
    html +
    `<div class="grupo-titulo"><span>Subtotal</span><span>${n0.format(t.subtotal * T.W_PARA_BTU)} BTU/h</span></div>` +
    `<div class="grupo-titulo"><span>Margem de segurança (${n0.format(res.entrada.seguranca * 100)}%)</span><span>${n0.format(t.seguranca * T.W_PARA_BTU)} BTU/h</span></div>` +
    `<div class="grupo-titulo"><span><b>Total de projeto</b></span><span><b>${n0.format(t.btu)} BTU/h</b></span></div>`;
  const en = res.energia;
  $('energiaTexto').textContent =
    `Consumo estimado: ~${n0.format(en.kWhMes)} kWh/mês (${en.horasDia} h/dia, COP ${en.cop}) ≈ ${brl.format(en.custoMes)}/mês na tarifa de ${brl.format(en.tarifa)}/kWh. ` +
    `Clima de projeto: ${res.clima.cidade}, ${res.clima.tbsExt} °C e ${res.clima.urExt}% UR externos; interno ${res.clima.tbsInt} °C e ${res.clima.urInt}%.`;
}

function renderResumoParedes(res) {
  const e = res.entrada;
  for (const k of ORDEM_PAREDES) {
    const p = e.paredes[k];
    const j = res.geometria.janelas[k];
    const tipo = p.tipo === 'externa' ? 'Externa' : p.tipo === 'interna_nc' ? 'Interna' : 'Vizinho climatizado';
    const jtxt = j.area > 0 ? ` · janela ${n1.format(j.largura)}×${n1.format(j.altura)} m` : '';
    $(`rp-${k}`).textContent = tipo + jtxt;
    $(`j-${k}`).hidden = p.tipo !== 'externa';
  }
}

/* ---------- ciclo principal ---------- */
let viewer;
let planta;

function atualizar() {
  const entrada = lerEntrada();
  const res = T.calcular(entrada);
  const e = res.entrada;
  const W = e.ambiente.largura;
  const L = e.ambiente.comprimento;

  itens = itens.map((it) => P.manterDentro(it, W, L));
  if (itemSel !== null && !itens[itemSel]) itemSel = null;

  const sugEq = T.sugerirEquipamento(res);
  const sug = P.sugerir(e, { capacidade: res.equipamento.capacidade, alcance: res.equipamento.alcance, itens, cargas: res.porSuperficie });
  const selecionado = (posSel && sug.porParede.find((c) => c.parede === posSel)) || sug.melhor;
  if (posSel && !sug.porParede.find((c) => c.parede === posSel)) posSel = null;
  const ops = T.oportunidades(entrada);

  $('segurancaVal').textContent = `${$('seguranca').value}%`;
  renderResumoParedes(res);
  renderResumo(res, sugEq);
  renderPosicoes(sug, selecionado, res);
  renderConsultor(res, sugEq, sug, ops);
  renderDetalhe(res);

  viewer.atualizar({ res, sug, selecionado, Pos: P, alcance: res.equipamento.alcance, dim: { W, L, H: e.ambiente.peDireito } });
  planta.atualizar({ res, sug, selecionado, itens, itemSel, alcance: res.equipamento.alcance });

  $('itemGirar').disabled = itemSel === null;
  $('itemRemover').disabled = itemSel === null;
  salvar();
  window.__ar = { res, sug, selecionado }; // facilita testes/depuração
}

function agendar() {
  if (agendado) return;
  agendado = true;
  requestAnimationFrame(() => {
    agendado = false;
    atualizar();
  });
}

/* ---------- eventos ---------- */
function ligarEventos() {
  $('form').addEventListener('input', (ev) => {
    const alvo = ev.target;
    const linha = alvo.closest && alvo.closest('.equip-linha');
    if (linha) {
      const q = equip[Number(linha.dataset.i)];
      const campo = alvo.dataset.campo;
      if (q && campo) q[campo] = campo === 'nome' ? alvo.value : Number(alvo.value) || 0;
    }
    if (['largura', 'comprimento', 'peDireito'].includes(alvo.id)) posSel = null;
    agendar();
  });
  $('form').addEventListener('change', agendar);
  $('form').addEventListener('submit', (e) => e.preventDefault());

  $('equipamentos').addEventListener('click', (ev) => {
    const rm = ev.target.closest('[data-rm]');
    if (!rm) return;
    equip.splice(Number(rm.dataset.rm), 1);
    renderEquip();
    agendar();
  });
  $('equipAdd').addEventListener('click', () => {
    const v = $('equipPreset').value;
    const preset = v === 'custom' ? { nome: 'Equipamento', watts: 100 } : T.EQUIPAMENTOS_PADRAO[Number(v)];
    const existente = equip.find((q) => q.nome === preset.nome && q.watts === preset.watts);
    if (existente) existente.qtd += 1;
    else equip.push({ nome: preset.nome, qtd: 1, watts: preset.watts });
    renderEquip();
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

  document.querySelectorAll('[data-item]').forEach((b) =>
    b.addEventListener('click', () => {
      const e = T.normalizar(lerEntrada());
      const novo = P.manterDentro({ tipo: b.dataset.item, x: e.ambiente.largura / 2, z: e.ambiente.comprimento / 2, rot: 0 }, e.ambiente.largura, e.ambiente.comprimento);
      itens.push(novo);
      itemSel = itens.length - 1;
      agendar();
    })
  );
  $('itemGirar').addEventListener('click', () => {
    if (itemSel === null) return;
    const e = T.normalizar(lerEntrada());
    const it = itens[itemSel];
    itens[itemSel] = P.manterDentro({ ...it, rot: (it.rot || 0) % 180 === 0 ? 90 : 0 }, e.ambiente.largura, e.ambiente.comprimento);
    agendar();
  });
  $('itemRemover').addEventListener('click', () => {
    if (itemSel === null) return;
    itens.splice(itemSel, 1);
    itemSel = null;
    agendar();
  });
}

/* ---------- início ---------- */
montarFormulario();
restaurar();
renderEquip();
viewer = criarVisualizador($('viz3d'), {
  aoSelecionar: (parede) => {
    posSel = parede;
    agendar();
  },
});
planta = criarPlanta($('planta'), {
  Pos: P,
  aoMudar: (i, novo) => {
    itens[i] = novo;
    agendar();
  },
  aoSelecionarPosicao: (parede) => {
    posSel = parede;
    agendar();
  },
  aoSelecionarItem: (i) => {
    itemSel = i;
    agendar();
  },
});
ligarEventos();
atualizar();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* sem HTTPS/localhost: segue sem offline */ });
  });
}
