/*
 * Planta 2D (SVG) do ambiente, Norte para cima. Unidades do desenho = metros.
 * Permite arrastar os móveis e escolher entre as posições sugeridas.
 */
const NS = 'http://www.w3.org/2000/svg';
const MARGEM = 1.3;

const f = (n) => (Math.round(n * 1000) / 1000).toString();

export function criarPlanta(container, { Pos, aoMudar, aoSelecionarPosicao, aoSelecionarItem }) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Planta do ambiente com a posição sugerida do ar-condicionado');
  container.appendChild(svg);

  let estado = null;
  let arrasto = null; // { i, dx, dz, moveu }
  let pendente = null;

  function ponto(ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }

  function setaNorte(W) {
    const x = W + MARGEM * 0.55;
    return `<g><path d="M ${f(x)} -0.15 l -0.17 0.5 l 0.17 -0.12 l 0.17 0.12 z" fill="currentColor" opacity=".7"/><text x="${f(x)}" y="-0.35" font-size=".42" text-anchor="middle" font-weight="700">N</text></g>`;
  }

  function desenhar() {
    if (!estado) return;
    const { res, sug, selecionado, itens, itemSel } = estado;
    const e = res.entrada;
    const W = e.ambiente.largura;
    const L = e.ambiente.comprimento;
    svg.setAttribute('viewBox', `${f(-MARGEM)} ${f(-MARGEM)} ${f(W + 2 * MARGEM)} ${f(L + 2 * MARGEM)}`);
    const partes = [];

    partes.push(`<defs><clipPath id="recorte-sala"><rect x="0" y="0" width="${f(W)}" height="${f(L)}"/></clipPath></defs>`);
    partes.push(`<rect x="0" y="0" width="${f(W)}" height="${f(L)}" fill="var(--surface)" opacity=".85"/>`);
    // grade de 1 m
    for (let x = 1; x < W; x++) partes.push(`<line x1="${x}" y1="0" x2="${x}" y2="${f(L)}" stroke="var(--border)" stroke-width=".02"/>`);
    for (let z = 1; z < L; z++) partes.push(`<line x1="0" y1="${z}" x2="${f(W)}" y2="${z}" stroke="var(--border)" stroke-width=".02"/>`);

    // paredes
    const seg = {
      N: [0, 0, W, 0], S: [0, L, W, L], O: [0, 0, 0, L], L: [W, 0, W, L],
    };
    for (const k of ['N', 'S', 'L', 'O']) {
      const t = e.paredes[k].tipo;
      const [x1, y1, x2, y2] = seg[k];
      const estilo = t === 'externa' ? 'stroke="var(--text)" stroke-width=".16"' : t === 'interna_nc' ? 'stroke="var(--muted)" stroke-width=".1" stroke-dasharray=".25 .12"' : 'stroke="var(--border)" stroke-width=".08"';
      partes.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" ${estilo} stroke-linecap="square"/>`);
    }

    // janelas
    for (const k of ['N', 'S', 'L', 'O']) {
      const j = res.geometria.janelas[k];
      if (!j || j.area <= 0) continue;
      const jc = e.paredes[k].janela;
      const len = k === 'N' || k === 'S' ? W : L;
      const c = Math.min(Math.max(jc.pos, 0), 1) * len;
      const a = c - j.largura / 2;
      const b = c + j.largura / 2;
      const [x1, y1, x2, y2] = k === 'N' ? [a, 0, b, 0] : k === 'S' ? [a, L, b, L] : k === 'O' ? [0, a, 0, b] : [W, a, W, b];
      partes.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="#4aa3d6" stroke-width=".2"/>`);
    }

    // portas (uma por parede, no máximo)
    for (const k of ['N', 'S', 'L', 'O']) {
      const dp = res.geometria.portas[k];
      if (!dp || dp.area <= 0) continue;
      const len = k === 'N' || k === 'S' ? W : L;
      const c = Math.min(Math.max(e.paredes[k].porta.pos, 0), 1) * len;
      const a = Math.max(0, c - dp.largura / 2);
      const w = dp.largura;
      let d;
      if (k === 'N') d = `M ${f(a)} 0 L ${f(a)} ${f(w)} A ${f(w)} ${f(w)} 0 0 0 ${f(a + w)} 0`;
      else if (k === 'S') d = `M ${f(a)} ${f(L)} L ${f(a)} ${f(L - w)} A ${f(w)} ${f(w)} 0 0 1 ${f(a + w)} ${f(L)}`;
      else if (k === 'O') d = `M 0 ${f(a)} L ${f(w)} ${f(a)} A ${f(w)} ${f(w)} 0 0 1 0 ${f(a + w)}`;
      else d = `M ${f(W)} ${f(a)} L ${f(W - w)} ${f(a)} A ${f(w)} ${f(w)} 0 0 0 ${f(W)} ${f(a + w)}`;
      partes.push(`<path d="${d}" fill="none" stroke="#8a5a33" stroke-width=".05"/>`);
    }

    // jato de ar da posição escolhida
    const esc = selecionado || sug.melhor;
    if (esc) {
      const n = esc.normal;
      const alcance = estado.alcance;
      const prof = esc.parede === 'N' || esc.parede === 'S' ? L : W;
      const R = Math.min(alcance, prof * 0.97);
      const ang = Math.atan2(n.z, n.x);
      const th = (28 * Math.PI) / 180;
      const p1 = { x: esc.x + R * Math.cos(ang - th), z: esc.z + R * Math.sin(ang - th) };
      const p2 = { x: esc.x + R * Math.cos(ang + th), z: esc.z + R * Math.sin(ang + th) };
      partes.push(
        `<path d="M ${f(esc.x)} ${f(esc.z)} L ${f(p1.x)} ${f(p1.z)} A ${f(R)} ${f(R)} 0 0 1 ${f(p2.x)} ${f(p2.z)} Z" fill="#4db8ff" opacity=".2" stroke="#2a9fd6" stroke-width=".03" stroke-dasharray=".12 .1" clip-path="url(#recorte-sala)"/>`
      );
    }

    // móveis
    itens.forEach((it, i) => {
      const info = Pos.pontosItem(it);
      const sel = i === itemSel;
      partes.push(
        `<g class="movel${sel ? ' sel' : ''}" data-i="${i}" tabindex="0" role="button" aria-label="${info.cat.rotulo}">` +
          `<rect x="${f(it.x - info.w / 2)}" y="${f(it.z - info.d / 2)}" width="${f(info.w)}" height="${f(info.d)}" rx=".08" fill="${info.cat.cor}" opacity=".85" stroke="var(--text)" stroke-width=".02"/>` +
          `<text x="${f(it.x)}" y="${f(it.z + 0.12)}" font-size=".3" text-anchor="middle" fill="#fff" style="fill:#fff;paint-order:stroke;stroke:#0006;stroke-width:.04">${info.cat.rotulo.split(' ')[0]}</text></g>`
      );
    });

    // evaporadora escolhida e condensadora
    if (esc) {
      const n = esc.normal;
      const largura = sug.larguraUnidade;
      const horiz = esc.parede === 'N' || esc.parede === 'S';
      const w = horiz ? largura : 0.22;
      const h = horiz ? 0.22 : largura;
      partes.push(
        `<rect x="${f(esc.x - w / 2 + n.x * 0.11)}" y="${f(esc.z - h / 2 + n.z * 0.11)}" width="${f(w)}" height="${f(h)}" rx=".05" fill="#fff" stroke="#2a9fd6" stroke-width=".05"/>`
      );
      if (esc.condensadora) {
        const c = esc.condensadora;
        const cw = horiz ? 0.85 : 0.35;
        const ch = horiz ? 0.35 : 0.85;
        partes.push(
          `<rect x="${f(c.x - cw / 2)}" y="${f(c.z - ch / 2)}" width="${f(cw)}" height="${f(ch)}" rx=".05" fill="#f59e0b" opacity=".9"/>` +
            `<text x="${f(c.x + (horiz ? 0 : -n.x * 0.9))}" y="${f(c.z + (horiz ? -n.z * 0.55 : 0.1))}" font-size=".28" text-anchor="middle" font-weight="700">Cond.</text>`
        );
      }
    }

    // alternativas
    sug.porParede.forEach((c, i) => {
      if (esc && c.parede === esc.parede) return;
      partes.push(
        `<g class="alt" data-parede="${c.parede}" tabindex="0" role="button" aria-label="Posição ${i + 1}: ${c.rotulo}">` +
          `<circle cx="${f(c.x + c.normal.x * 0.25)}" cy="${f(c.z + c.normal.z * 0.25)}" r=".28" fill="#35c28d" stroke="#fff" stroke-width=".04"/>` +
          `<text x="${f(c.x + c.normal.x * 0.25)}" y="${f(c.z + c.normal.z * 0.25 + 0.1)}" font-size=".3" font-weight="700" text-anchor="middle" style="fill:#06281c">${i + 1}</text></g>`
      );
    });

    // rótulos e cotas
    partes.push(setaNorte(W));
    partes.push(`<text x="${f(W / 2)}" y="${f(L + 0.75)}" font-size=".34" text-anchor="middle" fill="currentColor" opacity=".75">${W.toFixed(1).replace('.', ',')} m</text>`);
    partes.push(`<text x="-0.75" y="${f(L / 2)}" font-size=".34" text-anchor="middle" fill="currentColor" opacity=".75" transform="rotate(-90 -0.75 ${f(L / 2)})">${L.toFixed(1).replace('.', ',')} m</text>`);

    // Substitui só o conteúdo: o <svg> (que captura o ponteiro) permanece.
    svg.innerHTML = partes.join('');
  }

  /* ---------- interação ---------- */
  svg.addEventListener('pointerdown', (ev) => {
    const g = ev.target.closest && ev.target.closest('.movel');
    const alt = ev.target.closest && ev.target.closest('.alt');
    if (alt) {
      aoSelecionarPosicao(alt.dataset.parede);
      return;
    }
    if (!g || !estado) {
      aoSelecionarItem(null);
      return;
    }
    const i = Number(g.dataset.i);
    const p = ponto(ev);
    const it = estado.itens[i];
    arrasto = { i, dx: it.x - p.x, dz: it.z - p.y, moveu: false, inicio: { x: ev.clientX, y: ev.clientY } };
    svg.setPointerCapture(ev.pointerId);
    aoSelecionarItem(i);
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!arrasto || !estado) return;
    if (Math.hypot(ev.clientX - arrasto.inicio.x, ev.clientY - arrasto.inicio.y) > 4) arrasto.moveu = true;
    if (!arrasto.moveu) return;
    const p = ponto(ev);
    const e = estado.res.entrada;
    const it = estado.itens[arrasto.i];
    const novo = Pos.manterDentro({ ...it, x: p.x + arrasto.dx, z: p.y + arrasto.dz }, e.ambiente.largura, e.ambiente.comprimento);
    // aproxima de 5 cm para facilitar o encaixe junto à parede
    novo.x = Math.round(novo.x * 20) / 20;
    novo.z = Math.round(novo.z * 20) / 20;
    if (pendente) cancelAnimationFrame(pendente);
    pendente = requestAnimationFrame(() => {
      pendente = null;
      aoMudar(arrasto ? arrasto.i : 0, novo);
    });
  });
  const fim = (ev) => {
    if (arrasto) {
      try { svg.releasePointerCapture(ev.pointerId); } catch (_) { /* já liberado */ }
    }
    arrasto = null;
  };
  svg.addEventListener('pointerup', fim);
  svg.addEventListener('pointercancel', fim);
  svg.addEventListener('keydown', (ev) => {
    if ((ev.key === 'Enter' || ev.key === ' ') && ev.target.classList) {
      ev.preventDefault();
      if (ev.target.classList.contains('alt')) aoSelecionarPosicao(ev.target.dataset.parede);
      else if (ev.target.classList.contains('movel')) aoSelecionarItem(Number(ev.target.dataset.i));
    }
  });

  return {
    atualizar(novo) {
      estado = novo;
      desenhar();
    },
  };
}
