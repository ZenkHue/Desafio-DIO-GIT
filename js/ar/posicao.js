/*
 * Onde instalar a evaporadora (split hi-wall) e a condensadora. Puro (sem DOM).
 * Planta vista de cima: A = parede de cima, B = direita, C = de baixo, D = esquerda.
 * Eixos: x para a direita (largura), z para baixo (comprimento).
 *
 * Cada posição candidata recebe 0–100 pontos:
 *   cobertura  (25) fração do piso que o jato de ar alcança
 *   conforto   (25) não soprar direto em cama, mesa ou sofá, nem ficar sobre a cabeceira
 *   instalação (20) parede que dá para fora (tubulação curta) e condensadora fora do sol da tarde
 *   calor      (15) perto da maior fonte de calor (janela/parede que mais esquenta)
 *   layout     (15) longe de portas e cantos
 * É heurística de boas práticas; o manual do fabricante e o instalador têm a palavra final.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Posicao = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const PAREDES = ['A', 'B', 'C', 'D'];
  const ITENS = {
    cama: { rotulo: 'Cama', w: 1.6, d: 2.0, peso: 0.6, cor: '#6a7fb5' },
    mesa: { rotulo: 'Mesa', w: 1.4, d: 0.7, peso: 0.45, cor: '#b58a5a' },
    sofa: { rotulo: 'Sofá', w: 2.0, d: 0.9, peso: 0.35, cor: '#8a6ab5' },
  };
  const BONUS_CONDENSADORA = { nao: 6, manha: 4, diatodo: 1, tarde: 0 };
  const TAN_JATO = Math.tan((55 * Math.PI) / 180);
  const TAN_DIRETO = Math.tan((35 * Math.PI) / 180);

  const arred = (n, d = 0) => {
    const f = Math.pow(10, d);
    return Math.round((n + Number.EPSILON) * f) / f;
  };
  const limitar = (n, a, b) => Math.min(b, Math.max(a, n));

  /** Ponto sobre a parede (pela distância s a partir do canto de referência) e normal apontando para dentro. */
  function referencial(k, W, L) {
    switch (k) {
      case 'A': return { len: W, prof: L, normal: { x: 0, z: 1 }, ponto: (s) => ({ x: s, z: 0 }) };
      case 'B': return { len: L, prof: W, normal: { x: -1, z: 0 }, ponto: (s) => ({ x: W, z: s }) };
      case 'C': return { len: W, prof: L, normal: { x: 0, z: -1 }, ponto: (s) => ({ x: s, z: L }) };
      default: return { len: L, prof: W, normal: { x: 1, z: 0 }, ponto: (s) => ({ x: 0, z: s }) };
    }
  }

  const larguraUnidade = (cap) => (cap >= 24000 ? 1.1 : cap >= 12000 ? 0.95 : 0.8);
  const alturaMontagem = (pe) => Math.min(2.3, pe - 0.25);

  function pontosItem(it) {
    const cat = ITENS[it.tipo] || ITENS.mesa;
    const girado = (it.rot || 0) % 180 !== 0;
    const w = girado ? cat.d : cat.w;
    const d = girado ? cat.w : cat.d;
    return {
      cat, w, d,
      pts: [
        { x: it.x, z: it.z },
        { x: it.x - w / 2, z: it.z - d / 2 }, { x: it.x + w / 2, z: it.z - d / 2 },
        { x: it.x - w / 2, z: it.z + d / 2 }, { x: it.x + w / 2, z: it.z + d / 2 },
      ],
    };
  }

  function manterDentro(it, W, L) {
    const { w, d } = pontosItem(it);
    return { ...it, x: limitar(it.x, w / 2, Math.max(w / 2, W - w / 2)), z: limitar(it.z, d / 2, Math.max(d / 2, L - d / 2)) };
  }

  const frente = (p, n, q) => (q.x - p.x) * n.x + (q.z - p.z) * n.z;
  const lado = (p, n, q) => Math.abs((q.x - p.x) * -n.z + (q.z - p.z) * n.x);

  /** Fração do piso alcançada pelo jato (grade de 0,25 m). */
  function cobertura(p, n, alcance, W, L) {
    const passo = 0.25;
    let total = 0;
    let ok = 0;
    for (let x = passo / 2; x < W; x += passo) {
      for (let z = passo / 2; z < L; z += passo) {
        total++;
        const q = { x, z };
        const dist = Math.hypot(x - p.x, z - p.z);
        const f = frente(p, n, q);
        if (dist <= alcance && (dist < 1.5 || (f > 0.3 && lado(p, n, q) <= f * TAN_JATO + 0.6))) ok++;
      }
    }
    return total ? ok / total : 0;
  }

  /** Fração dos pontos do móvel dentro da correnteza direta. */
  function exposicao(it, p, n, alcance) {
    const { pts } = pontosItem(it);
    let dentro = 0;
    for (const q of pts) {
      const f = frente(p, n, q);
      if (f >= 1.0 && f <= alcance * 0.85 && lado(p, n, q) <= f * TAN_DIRETO + 0.3) dentro++;
    }
    return dentro / pts.length;
  }

  function nomeParede(k) {
    return { A: 'Parede A (em cima na planta)', B: 'Parede B (direita)', C: 'Parede C (embaixo)', D: 'Parede D (esquerda)' }[k];
  }
  function descrever(k, t) {
    const pos = t < 0.4 ? 'perto do começo' : t > 0.6 ? 'perto do fim' : 'no centro';
    return `Parede ${k}, ${pos}`;
  }

  /**
   * @param {object} e  estado normalizado (Nucleo.normalizar)
   * @param {object} o  { capacidade, alcance, exposicao:{A..D}, cargaParede:{A..D: W no pico}, itens }
   */
  function sugerir(e, o) {
    const W = e.ambiente.largura;
    const L = e.ambiente.comprimento;
    const cap = o.capacidade || 12000;
    const alcance = o.alcance || 7;
    const itens = (o.itens || e.moveis || []).map((it) => manterDentro(it, W, L));
    const larg = larguraUnidade(cap);
    const yMont = alturaMontagem(e.ambiente.peDireito);
    const exp = o.exposicao || {};
    const carga = o.cargaParede || {};

    // maior fonte de calor: parede externa com mais carga no pico (centro da janela, se houver)
    let dominante = null;
    for (const k of PAREDES) {
      const p = e.paredes[k];
      const w = carga[k] || 0;
      if (p.tipo !== 'externa' || w <= 0) continue;
      if (!dominante || w > dominante.watts) {
        const ref = referencial(k, W, L);
        const s = (p.janela.largura > 0 ? p.janela.pos : 0.5) * ref.len;
        dominante = { parede: k, watts: w, ponto: ref.ponto(s) };
      }
    }

    const portas = PAREDES.filter((k) => e.paredes[k].porta.ativa).map((k) => ({ parede: k, pos: e.paredes[k].porta.pos, largura: e.paredes[k].porta.largura }));

    const candidatos = [];
    for (const k of PAREDES) {
      const p = e.paredes[k];
      const ref = referencial(k, W, L);
      const margem = larg / 2 + 0.3;
      if (ref.len < larg + 0.6) continue;
      for (let t = 0.1; t <= 0.9001; t += 0.05) {
        const s = t * ref.len;
        if (s < margem || s > ref.len - margem) continue;
        // não pode ficar em cima da janela (se a janela vai até a altura da unidade)
        if (p.tipo === 'externa' && p.janela.largura > 0) {
          const topoJanela = p.janela.peitoril + p.janela.altura;
          if (topoJanela > yMont - 0.15 && Math.abs(s - p.janela.pos * ref.len) < p.janela.largura / 2 + larg / 2 + 0.1) continue;
        }
        const pt = ref.ponto(s);
        const n = ref.normal;
        const motivos = [];
        const alertas = [];

        // 1) cobertura do jato
        const cob = cobertura(pt, n, alcance, W, L);
        const pCob = 25 * cob;
        if (cob >= 0.85) motivos.push(`O ar alcança ${Math.round(cob * 100)}% do ambiente`);
        else if (cob < 0.6) alertas.push(`O ar só alcança ${Math.round(cob * 100)}% do ambiente (alcance ~${alcance} m)`);

        // 2) conforto
        let pen = 0;
        for (const it of itens) {
          const info = pontosItem(it);
          const ex = exposicao(it, pt, n, alcance);
          if (ex > 0) {
            pen += 25 * info.cat.peso * ex;
            if (ex >= 0.4) alertas.push(`Sopra direto na ${info.cat.rotulo.toLowerCase()}`.replace('na sofá', 'no sofá'));
          }
          const dentro = Math.abs(frente(pt, n, it));
          if (it.tipo === 'cama' && dentro < info.d / 2 + 0.9 && lado(pt, n, it) < info.w / 2 + 0.4) {
            pen += 10;
            alertas.push('Fica em cima da cabeceira da cama');
          }
        }
        const pConf = Math.max(0, 25 - pen);
        if (itens.length && pen === 0) motivos.push('Não sopra direto em quem está na cama, mesa ou sofá');

        // 3) instalação
        let pInst;
        let condensadora = null;
        let tubulacao = null;
        if (p.tipo === 'externa') {
          const ex = exp[k] || 'nao';
          pInst = 14 + BONUS_CONDENSADORA[ex];
          tubulacao = 3;
          condensadora = { x: pt.x - n.x * 0.45, z: pt.z - n.z * 0.45, y: 0.7, parede: k };
          motivos.push('Parede que dá para fora: condensadora logo atrás, tubulação curta');
          if (ex === 'tarde') alertas.push('A condensadora ficaria no sol da tarde: precisa de sombra e ventilação');
          else if (ex === 'nao') motivos.push('A condensadora fica num lado sem sol (rende mais)');
        } else {
          pInst = p.tipo === 'interna' ? 7 : 2;
          let melhor = Infinity;
          for (const q of PAREDES) {
            if (e.paredes[q].tipo !== 'externa') continue;
            const dist = q === 'A' ? pt.z : q === 'C' ? L - pt.z : q === 'D' ? pt.x : W - pt.x;
            melhor = Math.min(melhor, dist);
          }
          tubulacao = Number.isFinite(melhor) ? arred(3 + melhor, 1) : null;
          alertas.push(tubulacao ? `Parede interna: a tubulação passa por ~${String(tubulacao).replace('.', ',')} m até o lado de fora` : 'Nenhuma parede dá para fora: a condensadora vai precisar de outro lugar');
        }

        // 4) perto da fonte de calor
        let pCalor = 8;
        if (dominante) {
          const dist = Math.hypot(pt.x - dominante.ponto.x, pt.z - dominante.ponto.z);
          const max = Math.hypot(W, L);
          pCalor = 15 * (1 - Math.min(1, dist / max));
          if (k === dominante.parede) motivos.push(`Na mesma parede que mais esquenta (${dominante.parede})`);
          else if (dist < max * 0.45) motivos.push(`Perto da parede que mais esquenta (${dominante.parede})`);
        }

        // 5) layout
        let pLay = 15;
        let perto = false;
        let aponta = false;
        for (const d of portas) {
          if (d.parede === k) {
            if (Math.abs(s - d.pos * ref.len) < 1.2 + larg / 2 + d.largura / 2 - 0.4) perto = true;
          } else {
            const r2 = referencial(d.parede, W, L);
            const pp = r2.ponto(d.pos * r2.len);
            const f = frente(pt, n, pp);
            if (f > 1 && lado(pt, n, pp) < f * TAN_DIRETO + 0.4) aponta = true;
          }
        }
        if (perto) {
          pLay -= 8;
          alertas.push('Muito perto da porta: o ar frio escapa');
        }
        if (aponta) {
          pLay -= 3;
          alertas.push('O jato aponta para a porta');
        }
        const frac = s / ref.len;
        if (frac < 0.25 || frac > 0.75) pLay -= 3;
        else if (frac >= 0.35 && frac <= 0.65) motivos.push('No centro da parede: espalha o ar por igual');
        pLay = Math.max(0, pLay);

        candidatos.push({
          parede: k, t: arred(t, 2), s: arred(s, 2), x: arred(pt.x, 2), z: arred(pt.z, 2), y: yMont, normal: n,
          rotulo: descrever(k, t),
          nota: Math.round(pCob + pConf + pInst + pCalor + pLay),
          partes: { cobertura: arred(pCob, 1), conforto: arred(pConf, 1), instalacao: arred(pInst, 1), calor: arred(pCalor, 1), layout: arred(pLay, 1) },
          cobertura: arred(cob, 2), condensadora, tubulacao, motivos, alertas: [...new Set(alertas)],
        });
      }
    }
    candidatos.sort((a, b) => b.nota - a.nota || a.parede.localeCompare(b.parede));
    const vistas = new Set();
    const porParede = candidatos.filter((c) => (vistas.has(c.parede) ? false : vistas.add(c.parede)));
    return { melhor: candidatos[0] || null, porParede, candidatos, larguraUnidade: larg, alturaMontagem: yMont, dominante, itens };
  }

  /** Móveis iniciais por tipo de ambiente, encostados nas paredes. */
  function moveisPadrao(tipo, W, L) {
    const m = {
      quarto: [{ tipo: 'cama', x: W / 2, z: L - 1.05, rot: 0 }],
      sala: [{ tipo: 'sofa', x: W / 2, z: L - 0.5, rot: 0 }],
      escritorio: [{ tipo: 'mesa', x: W / 2, z: 0.45, rot: 0 }],
      loja: [{ tipo: 'mesa', x: W / 2, z: L - 0.5, rot: 0 }],
    }[tipo] || [];
    return m.map((it) => manterDentro(it, W, L));
  }

  return { PAREDES, ITENS, sugerir, moveisPadrao, manterDentro, pontosItem, cobertura, exposicao, referencial, larguraUnidade, alturaMontagem, nomeParede };
});
