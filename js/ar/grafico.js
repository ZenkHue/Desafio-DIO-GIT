/*
 * Gráfico de barras empilhadas: calor (BTU/h) em cada hora do dia, por origem,
 * com a capacidade real do aparelho escolhido e as horas em que o ar fica desligado.
 */
const GRUPOS = [
  { k: 'construcao', rotulo: 'Sol, paredes e teto', cor: 'var(--s2)', soma: ['construcao', 'sol'] },
  { k: 'interno', rotulo: 'Pessoas e aparelhos', cor: 'var(--s1)', soma: ['interno'] },
  { k: 'ar', rotulo: 'Ar de fora', cor: 'var(--s3)', soma: ['ar'] },
  { k: 'partida', rotulo: 'Calor acumulado ao ligar', cor: 'var(--s4)', soma: ['partida'] },
];
const BTU = 3.412142;
const VB = { w: 640, h: 250, l: 46, r: 8, t: 14, b: 26 };
const nf = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
const hh = (h) => `${String(h).padStart(2, '0')}h`;

function passoBonito(max) {
  const bruto = max / 4;
  const p = Math.pow(10, Math.floor(Math.log10(bruto)));
  const n = bruto / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/** Retângulo com cantos de cima arredondados (4px) e base reta. */
function barraArredondada(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

/** Divide a carga total da hora entre os grupos (só partes positivas, escaladas para somar o total). */
function partes(hora) {
  const brutos = GRUPOS.map((g) => Math.max(0, g.soma.reduce((s, k) => s + (hora.grupos[k] || 0), 0)));
  const soma = brutos.reduce((a, b) => a + b, 0);
  const f = soma > 0 ? hora.total / soma : 0;
  return brutos.map((v) => v * f * BTU);
}

export function criarGrafico(container, { aoEscolherHora } = {}) {
  container.innerHTML = '';
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${VB.w} ${VB.h}`);
  svg.setAttribute('role', 'img');
  const dica = document.createElement('div');
  dica.className = 'dica-graf';
  dica.hidden = true;
  const legenda = document.createElement('ul');
  legenda.className = 'legenda-graf';
  container.append(svg, dica, legenda);
  let dados = null;

  function mostrarDica(h, ev) {
    if (!dados) return;
    const hora = dados.horas[h];
    const ps = partes(hora);
    dica.innerHTML =
      `<b>${hh(h)} · ${hora.emUso ? 'ar ligado' : 'ar desligado'} · fora ${String(hora.te).replace('.', ',')} °C</b>` +
      GRUPOS.map((g, i) => (ps[i] > 0.5 ? `<div><span><i style="--c:${g.cor}"></i>${g.rotulo}</span><span>${nf.format(ps[i])}</span></div>` : '')).join('') +
      `<div><span><b>Total</b></span><span><b>${nf.format(hora.total * BTU)} BTU/h</b></span></div>`;
    dica.hidden = false;
    const r = container.getBoundingClientRect();
    const x = ev.clientX - r.left;
    const largura = dica.offsetWidth || 200;
    dica.style.left = `${Math.max(0, Math.min(r.width - largura, x - largura / 2))}px`;
    dica.style.top = `${Math.max(0, ev.clientY - r.top - dica.offsetHeight - 14)}px`;
  }

  function desenhar() {
    const { horas, capacidadeEfetiva, rotuloCapacidade, horaPico, horaSel } = dados;
    const totais = horas.map((h) => h.total * BTU);
    const max = Math.max(capacidadeEfetiva || 0, ...totais, 1) * 1.12;
    const passo = passoBonito(max);
    const topo = Math.ceil(max / passo) * passo;
    const pw = VB.w - VB.l - VB.r;
    const ph = VB.h - VB.t - VB.b;
    const y = (v) => VB.t + ph - (v / topo) * ph;
    const slot = pw / 24;
    const bw = slot - 4;
    const p = [];

    // horas com o ar desligado (fundo)
    horas.forEach((h, i) => {
      if (!h.emUso) p.push(`<rect class="desligado" x="${VB.l + i * slot}" y="${VB.t}" width="${slot}" height="${ph}"/>`);
    });
    // grade e eixo y
    for (let v = 0; v <= topo + 1; v += passo) {
      p.push(`<line class="grade-linha" x1="${VB.l}" x2="${VB.w - VB.r}" y1="${y(v)}" y2="${y(v)}"/>`);
      p.push(`<text class="rot" x="${VB.l - 6}" y="${y(v) + 4}" text-anchor="end">${v >= 1000 ? nf.format(v / 1000) + ' mil' : nf.format(v)}</text>`);
    }
    // barras empilhadas
    horas.forEach((h, i) => {
      const x = VB.l + i * slot + 2;
      const ps = partes(h);
      let base = 0;
      const ultimo = ps.reduce((u, v, j) => (v > 0.5 ? j : u), -1);
      const cls = `barra-h ${h.emUso ? 'ativa' : 'dim'}`;
      p.push(`<g class="${cls}">`);
      ps.forEach((v, j) => {
        if (v <= 0.5) return;
        const y0 = y(base + v);
        const alt = y(base) - y0;
        const forma = j === ultimo ? `<path d="${barraArredondada(x, y0, bw, alt, 4)}"` : `<rect x="${x}" y="${y0}" width="${bw}" height="${alt}"`;
        p.push(`${forma} fill="${GRUPOS[j].cor}" stroke="var(--surface)" stroke-width="1"/>`);
        base += v;
      });
      p.push('</g>');
      if (i === horaSel) p.push(`<rect x="${x - 1.5}" y="${VB.t}" width="${bw + 3}" height="${ph}" fill="none" stroke="var(--text)" stroke-width="1" stroke-dasharray="2 3" rx="3"/>`);
    });
    // pico
    const xp = VB.l + horaPico * slot + slot / 2;
    let yPico = y(totais[horaPico]) - 6;
    if (capacidadeEfetiva && Math.abs(yPico - y(capacidadeEfetiva)) < 14) yPico = y(capacidadeEfetiva) - 6; // não deixa a linha cortar o texto
    p.push(`<text class="rot" x="${xp}" y="${Math.max(VB.t + 10, yPico)}" text-anchor="middle" style="font-weight:700;fill:var(--text)">pico</text>`);
    // capacidade real do aparelho
    if (capacidadeEfetiva) {
      const yc = y(capacidadeEfetiva);
      p.push(`<line class="capacidade" x1="${VB.l}" x2="${VB.w - VB.r}" y1="${yc}" y2="${yc}"/>`);
      // rótulo à esquerda, longe da marca de pico (que costuma ficar à direita, à noite)
      const xRot = horaPico >= 12 ? VB.l + 4 : VB.w - VB.r - 2;
      p.push(`<text class="capacidade-rot" x="${xRot}" y="${yc - 6}" text-anchor="${horaPico >= 12 ? 'start' : 'end'}">${rotuloCapacidade}</text>`);
    }
    // eixo x
    for (let i = 0; i < 24; i += 3) p.push(`<text class="rot" x="${VB.l + i * slot + slot / 2}" y="${VB.h - 8}" text-anchor="middle">${hh(i)}</text>`);
    // alvos de interação (maiores que a barra)
    horas.forEach((h, i) => p.push(`<rect class="alvo" data-h="${i}" x="${VB.l + i * slot}" y="${VB.t}" width="${slot}" height="${ph}"/>`));
    svg.innerHTML = p.join('');
    svg.setAttribute('aria-label', `Gráfico de calor por hora. Pico às ${hh(horaPico)} com ${nf.format(totais[horaPico])} BTU/h.`);

    legenda.innerHTML =
      GRUPOS.map((g) => `<li><i style="--c:${g.cor}"></i>${g.rotulo}</li>`).join('') +
      (capacidadeEfetiva ? '<li><i class="linha"></i>O que o aparelho entrega</li>' : '') +
      '<li><i class="off"></i>Ar desligado</li>';
  }

  svg.addEventListener('pointermove', (ev) => {
    const alvo = ev.target.closest && ev.target.closest('.alvo');
    if (alvo) mostrarDica(Number(alvo.dataset.h), ev);
    else dica.hidden = true;
  });
  svg.addEventListener('pointerleave', () => (dica.hidden = true));
  svg.addEventListener('click', (ev) => {
    const alvo = ev.target.closest && ev.target.closest('.alvo');
    if (alvo && aoEscolherHora) aoEscolherHora(Number(alvo.dataset.h));
  });

  return {
    atualizar(d) {
      dados = d;
      desenhar();
    },
  };
}

export { GRUPOS, partes };
