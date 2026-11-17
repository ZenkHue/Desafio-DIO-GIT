/*
 * Planta 2D (SVG) vista de cima. Unidades do desenho = metros.
 * A = parede de cima, B = direita, C = de baixo, D = esquerda.
 * Arrastar móveis, tocar numa parede para editá-la e escolher entre as posições sugeridas.
 */
const M = 1.3;
const f = (n) => (Math.round(n * 1000) / 1000).toString();
const SOL = { manha: '☀️ manhã', tarde: '☀️ tarde', diatodo: '☀️ dia todo' };

export function criarPlanta(container, { Pos, aoMoverItem, aoSelecionarPosicao, aoSelecionarItem, aoSelecionarParede }) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Planta do ambiente com paredes, janelas, portas, móveis e a posição sugerida do ar-condicionado');
  container.appendChild(svg);
  let estado = null;
  let arrasto = null;
  let pendente = null;

  function ponto(ev) {
    const pt = svg.createSVGPoint();
    pt.x = ev.clientX;
    pt.y = ev.clientY;
    const m = svg.getScreenCTM();
    return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
  }

  function segmento(k, a, b, W, L) {
    return { A: [a, 0, b, 0], C: [a, L, b, L], D: [0, a, 0, b], B: [W, a, W, b] }[k];
  }

  function desenhar() {
    const { res, sug, selecionado, itens, itemSel, alcance } = estado;
    const e = res.entrada;
    const W = e.ambiente.largura;
    const L = e.ambiente.comprimento;
    svg.setAttribute('viewBox', `${f(-M)} ${f(-M)} ${f(W + 2 * M)} ${f(L + 2 * M)}`);
    const p = [];
    p.push(`<defs><clipPath id="recorte-planta"><rect x="0" y="0" width="${f(W)}" height="${f(L)}"/></clipPath></defs>`);
    p.push(`<rect x="0" y="0" width="${f(W)}" height="${f(L)}" fill="var(--surface)" opacity=".85"/>`);
    for (let x = 1; x < W; x++) p.push(`<line x1="${x}" y1="0" x2="${x}" y2="${f(L)}" stroke="var(--border)" stroke-width=".02"/>`);
    for (let z = 1; z < L; z++) p.push(`<line x1="0" y1="${z}" x2="${f(W)}" y2="${z}" stroke="var(--border)" stroke-width=".02"/>`);

    for (const k of ['A', 'B', 'C', 'D']) {
      const t = e.paredes[k].tipo;
      const len = k === 'A' || k === 'C' ? W : L;
      const [x1, y1, x2, y2] = segmento(k, 0, len, W, L);
      const estilo = t === 'externa' ? 'stroke="var(--text)" stroke-width=".16"' : t === 'interna' ? 'stroke="var(--muted)" stroke-width=".1" stroke-dasharray=".25 .12"' : 'stroke="var(--border)" stroke-width=".08"';
      p.push(`<line x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" ${estilo} stroke-linecap="square"/>`);
      // área clicável da parede
      p.push(`<line class="parede-alvo" data-parede="${k}" x1="${f(x1)}" y1="${f(y1)}" x2="${f(x2)}" y2="${f(y2)}" stroke="transparent" stroke-width=".5" style="cursor:pointer"/>`);
      // janela
      const j = res.geometria.paredes[k].janela;
      if (j.area > 0) {
        const c = e.paredes[k].janela.pos * len;
        const [a1, b1, a2, b2] = segmento(k, c - j.largura / 2, c + j.largura / 2, W, L);
        p.push(`<line x1="${f(a1)}" y1="${f(b1)}" x2="${f(a2)}" y2="${f(b2)}" stroke="#4aa3d6" stroke-width=".2"/>`);
      }
      // porta
      const d = res.geometria.paredes[k].porta;
      if (d.area > 0) {
        const c = e.paredes[k].porta.pos * len;
        const a = c - d.largura / 2;
        const w = d.largura;
        const arco = {
          A: `M ${f(a)} 0 L ${f(a)} ${f(w)} A ${f(w)} ${f(w)} 0 0 0 ${f(a + w)} 0`,
          C: `M ${f(a)} ${f(L)} L ${f(a)} ${f(L - w)} A ${f(w)} ${f(w)} 0 0 1 ${f(a + w)} ${f(L)}`,
          D: `M 0 ${f(a)} L ${f(w)} ${f(a)} A ${f(w)} ${f(w)} 0 0 1 0 ${f(a + w)}`,
          B: `M ${f(W)} ${f(a)} L ${f(W - w)} ${f(a)} A ${f(w)} ${f(w)} 0 0 0 ${f(W)} ${f(a + w)}`,
        }[k];
        p.push(`<path d="${arco}" fill="none" stroke="#8a5a33" stroke-width=".05"/>`);
      }
      // letra e sol
      const pos = { A: [W / 2, -0.55], C: [W / 2, L + 0.75], D: [-0.6, L / 2], B: [W + 0.6, L / 2] }[k];
      const exp = res.exposicao[k];
      p.push(`<text x="${f(pos[0])}" y="${f(pos[1])}" font-size=".42" font-weight="800" text-anchor="middle">${k}</text>`);
      if (SOL[exp]) {
        const ps = { A: [W / 2, -0.95], C: [W / 2, L + 1.15], D: [-0.6, L / 2 + 0.45], B: [W + 0.6, L / 2 + 0.45] }[k];
        p.push(`<text x="${f(ps[0])}" y="${f(ps[1])}" font-size=".26" text-anchor="middle" opacity=".85">${SOL[exp]}</text>`);
      }
    }

    // jato de ar da posição escolhida
    const esc = selecionado || sug.melhor;
    if (esc) {
      const n = esc.normal;
      const prof = esc.parede === 'A' || esc.parede === 'C' ? L : W;
      const R = Math.min(alcance, prof * 0.97);
      const ang = Math.atan2(n.z, n.x);
      const th = (28 * Math.PI) / 180;
      const q1 = { x: esc.x + R * Math.cos(ang - th), z: esc.z + R * Math.sin(ang - th) };
      const q2 = { x: esc.x + R * Math.cos(ang + th), z: esc.z + R * Math.sin(ang + th) };
      p.push(`<path d="M ${f(esc.x)} ${f(esc.z)} L ${f(q1.x)} ${f(q1.z)} A ${f(R)} ${f(R)} 0 0 1 ${f(q2.x)} ${f(q2.z)} Z" fill="#4db8ff" opacity=".2" stroke="#2a9fd6" stroke-width=".03" stroke-dasharray=".12 .1" clip-path="url(#recorte-planta)"/>`);
    }

    // móveis
    itens.forEach((it, i) => {
      const info = Pos.pontosItem(it);
      p.push(
        `<g class="movel${i === itemSel ? ' sel' : ''}" data-i="${i}" tabindex="0" role="button" aria-label="${info.cat.rotulo}">` +
          `<rect x="${f(it.x - info.w / 2)}" y="${f(it.z - info.d / 2)}" width="${f(info.w)}" height="${f(info.d)}" rx=".08" fill="${info.cat.cor}" opacity=".85" stroke="var(--text)" stroke-width=".02"/>` +
          `<text x="${f(it.x)}" y="${f(it.z + 0.1)}" font-size=".28" text-anchor="middle" style="fill:#fff;paint-order:stroke;stroke:#0006;stroke-width:.04">${info.cat.rotulo}</text></g>`
      );
    });

    // evaporadora e condensadora
    if (esc) {
      const n = esc.normal;
      const horiz = esc.parede === 'A' || esc.parede === 'C';
      const w = horiz ? sug.larguraUnidade : 0.22;
      const h = horiz ? 0.22 : sug.larguraUnidade;
      p.push(`<rect x="${f(esc.x - w / 2 + n.x * 0.11)}" y="${f(esc.z - h / 2 + n.z * 0.11)}" width="${f(w)}" height="${f(h)}" rx=".05" fill="#fff" stroke="#2a9fd6" stroke-width=".05"/>`);
      if (esc.condensadora) {
        const c = esc.condensadora;
        const cw = horiz ? 0.85 : 0.35;
        const ch = horiz ? 0.35 : 0.85;
        p.push(`<rect x="${f(c.x - cw / 2)}" y="${f(c.z - ch / 2)}" width="${f(cw)}" height="${f(ch)}" rx=".05" fill="#f59e0b" opacity=".9"><title>Condensadora</title></rect>`);
      }
    }

    // alternativas
    sug.porParede.forEach((c, i) => {
      if (esc && c.parede === esc.parede) return;
      const cx = c.x + c.normal.x * 0.3;
      const cy = c.z + c.normal.z * 0.3;
      p.push(
        `<g class="alt" data-parede="${c.parede}" tabindex="0" role="button" aria-label="Posição ${i + 1}: ${c.rotulo}">` +
          `<circle cx="${f(cx)}" cy="${f(cy)}" r=".26" fill="#35c28d" stroke="#fff" stroke-width=".04"/>` +
          `<text x="${f(cx)}" y="${f(cy + 0.1)}" font-size=".28" font-weight="700" text-anchor="middle" style="fill:#06281c">${i + 1}</text></g>`
      );
    });

    p.push(`<text x="${f(W / 2)}" y="${f(L + 0.42)}" font-size=".3" text-anchor="middle" opacity=".7">${W.toFixed(1).replace('.', ',')} m</text>`);
    p.push(`<text x="${f(W + 0.25)}" y="${f(L + 0.42)}" font-size=".3" opacity=".7">${L.toFixed(1).replace('.', ',')} m ↕</text>`);
    svg.innerHTML = p.join('');
  }

  svg.addEventListener('pointerdown', (ev) => {
    if (!estado) return;
    const alvo = ev.target.closest ? ev.target : null;
    const alt = alvo && alvo.closest('.alt');
    if (alt) return aoSelecionarPosicao(alt.dataset.parede);
    const parede = alvo && alvo.closest('.parede-alvo');
    if (parede) return aoSelecionarParede && aoSelecionarParede(parede.dataset.parede);
    const g = alvo && alvo.closest('.movel');
    if (!g) return aoSelecionarItem(null);
    const i = Number(g.dataset.i);
    const pt = ponto(ev);
    const it = estado.itens[i];
    arrasto = { i, dx: it.x - pt.x, dz: it.z - pt.y, moveu: false, x0: ev.clientX, y0: ev.clientY };
    svg.setPointerCapture(ev.pointerId);
    aoSelecionarItem(i);
  });
  svg.addEventListener('pointermove', (ev) => {
    if (!arrasto || !estado) return;
    if (Math.hypot(ev.clientX - arrasto.x0, ev.clientY - arrasto.y0) > 4) arrasto.moveu = true;
    if (!arrasto.moveu) return;
    const pt = ponto(ev);
    const e = estado.res.entrada;
    const it = estado.itens[arrasto.i];
    const novo = Pos.manterDentro({ ...it, x: pt.x + arrasto.dx, z: pt.y + arrasto.dz }, e.ambiente.largura, e.ambiente.comprimento);
    novo.x = Math.round(novo.x * 20) / 20;
    novo.z = Math.round(novo.z * 20) / 20;
    const i = arrasto.i;
    if (pendente) cancelAnimationFrame(pendente);
    pendente = requestAnimationFrame(() => {
      pendente = null;
      aoMoverItem(i, novo);
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
    if (ev.key !== 'Enter' && ev.key !== ' ') return;
    const t = ev.target;
    if (t.classList && t.classList.contains('alt')) {
      ev.preventDefault();
      aoSelecionarPosicao(t.dataset.parede);
    } else if (t.classList && t.classList.contains('movel')) {
      ev.preventDefault();
      aoSelecionarItem(Number(t.dataset.i));
    }
  });

  return {
    atualizar(novo) {
      estado = novo;
      desenhar();
    },
  };
}
