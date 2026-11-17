/*
 * Recomendação de posição para a evaporadora (split hi-wall) em um ambiente retangular.
 * Módulo puro (sem DOM). Eixos: x = Leste, z = Sul (Norte em z = 0), y = altura.
 *
 * Cada posição candidata (parede + posição ao longo dela) recebe 0–100 pontos:
 *   cobertura (25)  fração do piso alcançada pelo jato de ar
 *   conforto  (25)  evita jato direto sobre cama, mesa e sofá
 *   instalação(20)  parede externa (tubulação curta) e condensadora fora do sol da tarde
 *   carga     (15)  proximidade da maior fonte de calor (janela/parede mais carregada)
 *   layout    (15)  distância da porta, do canto e de obstruções
 * Heurística de boas práticas — o manual do fabricante e o instalador têm a palavra final.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.Posicao = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const NOMES = { N: 'Norte', S: 'Sul', L: 'Leste', O: 'Oeste' };
  const ITENS = {
    cama: { rotulo: 'Cama', w: 1.6, d: 2.0, peso: 0.6, cor: '#6a7fb5' },
    mesa: { rotulo: 'Mesa / estação de trabalho', w: 1.4, d: 0.7, peso: 0.45, cor: '#b58a5a' },
    sofa: { rotulo: 'Sofá', w: 2.0, d: 0.9, peso: 0.35, cor: '#8a6ab5' },
  };
  const TAN_JATO = Math.tan((55 * Math.PI) / 180); // abertura do jato para cobertura
  const TAN_DIRETO = Math.tan((35 * Math.PI) / 180); // zona de correnteza direta

  const arred = (n, d = 0) => {
    const f = Math.pow(10, d);
    return Math.round((n + Number.EPSILON) * f) / f;
  };
  const limitar = (n, a, b) => Math.min(b, Math.max(a, n));

  /** Referencial de cada parede: ponto sobre ela (a partir da posição ao longo s) e normal para dentro. */
  function referencial(k, W, L) {
    switch (k) {
      case 'N': return { len: W, depth: L, normal: { x: 0, z: 1 }, ponto: (s) => ({ x: s, z: 0 }) };
      case 'S': return { len: W, depth: L, normal: { x: 0, z: -1 }, ponto: (s) => ({ x: s, z: L }) };
      case 'L': return { len: L, depth: W, normal: { x: -1, z: 0 }, ponto: (s) => ({ x: W, z: s }) };
      default: return { len: L, depth: W, normal: { x: 1, z: 0 }, ponto: (s) => ({ x: 0, z: s }) }; // 'O'
    }
  }

  const larguraUnidade = (cap) => (cap >= 24000 ? 1.1 : cap >= 12000 ? 0.95 : 0.8);
  const alturaMontagem = (pe) => Math.min(2.3, pe - 0.25);

  /** Retângulo do móvel -> cantos e centro (para testes de exposição). */
  function pontosItem(it) {
    const cat = ITENS[it.tipo] || ITENS.mesa;
    const rot = (it.rot || 0) % 180 !== 0;
    const w = rot ? cat.d : cat.w;
    const d = rot ? cat.w : cat.d;
    const x = it.x;
    const z = it.z;
    return {
      cat, w, d,
      pts: [
        { x, z },
        { x: x - w / 2, z: z - d / 2 }, { x: x + w / 2, z: z - d / 2 },
        { x: x - w / 2, z: z + d / 2 }, { x: x + w / 2, z: z + d / 2 },
      ],
    };
  }

  /** Move o móvel para dentro do ambiente. */
  function manterDentro(it, W, L) {
    const { w, d } = pontosItem(it);
    return { ...it, x: limitar(it.x, w / 2, Math.max(w / 2, W - w / 2)), z: limitar(it.z, d / 2, Math.max(d / 2, L - d / 2)) };
  }

  /** Fração do piso alcançada pelo jato (amostragem em grade de 0,25 m). */
  function cobertura(p, n, alcance, W, L) {
    const passo = 0.25;
    let total = 0;
    let coberto = 0;
    for (let x = passo / 2; x < W; x += passo) {
      for (let z = passo / 2; z < L; z += passo) {
        total++;
        const dx = x - p.x;
        const dz = z - p.z;
        const dist = Math.hypot(dx, dz);
        const f = dx * n.x + dz * n.z;
        const lat = Math.abs(dx * -n.z + dz * n.x);
        if (dist <= alcance && (dist < 1.5 || (f > 0.3 && lat <= f * TAN_JATO + 0.6))) coberto++;
      }
    }
    return total ? coberto / total : 0;
  }

  /** Fração dos pontos do móvel dentro da correnteza direta do jato. */
  function exposicao(it, p, n, alcance) {
    const { pts } = pontosItem(it);
    let dentro = 0;
    for (const q of pts) {
      const dx = q.x - p.x;
      const dz = q.z - p.z;
      const f = dx * n.x + dz * n.z;
      const lat = Math.abs(dx * -n.z + dz * n.x);
      if (f >= 1.0 && f <= alcance * 0.85 && lat <= f * TAN_DIRETO + 0.3) dentro++;
    }
    return dentro / pts.length;
  }

  /** Conflito físico da unidade com janela/porta na mesma parede. */
  function conflito(k, s, larguraUn, mountH, e) {
    const ref = referencial(k, e.ambiente.largura, e.ambiente.comprimento);
    const p = e.paredes[k];
    const topo = mountH + 0.15;
    const base = mountH - 0.15;
    const meia = larguraUn / 2 + 0.1;
    if (p.tipo === 'externa' && p.janela && p.janela.largura > 0) {
      const c = limitar(p.janela.pos, 0, 1) * ref.len;
      const jw = Math.min(p.janela.largura, Math.max(0, ref.len - 0.4));
      const j0 = p.janela.peitoril;
      const j1 = p.janela.peitoril + p.janela.altura;
      const sobreposicaoVertical = j1 > base && j0 < topo;
      if (sobreposicaoVertical && Math.abs(s - c) < jw / 2 + meia) return 'janela';
    }
    return null;
  }

  function descreverPosicao(k, t) {
    const lado = k === 'N' || k === 'S' ? (t < 0.4 ? 'lado oeste' : t > 0.6 ? 'lado leste' : 'centro') : t < 0.4 ? 'lado norte' : t > 0.6 ? 'lado sul' : 'centro';
    return `Parede ${NOMES[k]}, ${lado}`;
  }

  /**
   * @param {object} e   entrada térmica normalizada (ambiente, paredes, porta, ...)
   * @param {object} opt { capacidade, itens:[{tipo,x,z,rot}], cargas: porSuperficie do cálculo térmico }
   */
  function sugerir(e, opt) {
    const W = e.ambiente.largura;
    const L = e.ambiente.comprimento;
    const cap = opt.capacidade || 12000;
    const alcance = opt.alcance || 7;
    const itens = (opt.itens || []).map((it) => manterDentro(it, W, L));
    const cargas = opt.cargas || {};
    const larguraUn = larguraUnidade(cap);
    const mountH = alturaMontagem(e.ambiente.peDireito);

    // Maior fonte de calor entre as paredes externas (centro da janela, se houver, senão da parede).
    let dominante = null;
    for (const k of ['N', 'S', 'L', 'O']) {
      const p = e.paredes[k];
      if (p.tipo !== 'externa') continue;
      const w = (cargas[k] && cargas[k].watts) || 0;
      if (w > 0 && (!dominante || w > dominante.watts)) {
        const ref = referencial(k, W, L);
        const s = (p.janela && p.janela.largura > 0 ? limitar(p.janela.pos, 0, 1) : 0.5) * ref.len;
        dominante = { parede: k, watts: w, ponto: ref.ponto(s) };
      }
    }

    // todas as portas do ambiente (cada parede pode ter uma)
    const portas = ['N', 'S', 'L', 'O']
      .filter((q) => e.paredes[q].porta && e.paredes[q].porta.ativa)
      .map((q) => ({ parede: q, pos: e.paredes[q].porta.pos, largura: e.paredes[q].porta.largura }));
    const candidatos = [];
    for (const k of ['N', 'S', 'L', 'O']) {
      const ref = referencial(k, W, L);
      const margem = larguraUn / 2 + 0.3;
      if (ref.len < larguraUn + 0.6) continue;
      const p = e.paredes[k];
      for (let t = 0.1; t <= 0.9001; t += 0.05) {
        const s = t * ref.len;
        if (s < margem || s > ref.len - margem) continue;
        if (conflito(k, s, larguraUn, mountH, e)) continue;
        const ponto = ref.ponto(s);
        const n = ref.normal;
        const motivos = [];
        const alertas = [];

        // 1) cobertura
        const cob = cobertura(ponto, n, alcance, W, L);
        const pCob = 25 * cob;
        if (cob >= 0.85) motivos.push(`Jato alcança ${arred(cob * 100)}% do piso`);
        else if (cob < 0.6) alertas.push(`Cobre só ${arred(cob * 100)}% do piso (alcance ~${alcance} m): considere outra parede ou 2 unidades`);

        // 2) conforto
        let pen = 0;
        for (const it of itens) {
          const info = pontosItem(it);
          const ex = exposicao(it, ponto, n, alcance);
          if (ex > 0) {
            pen += 25 * info.cat.peso * ex;
            if (ex >= 0.4) alertas.push(`Jato direto sobre ${info.cat.rotulo.toLowerCase()}`);
          }
          // unidade sobre a cabeceira / sobre o móvel
          const dentroParede = Math.abs((it.x - ponto.x) * n.x + (it.z - ponto.z) * n.z);
          const lateral = Math.abs((it.x - ponto.x) * -n.z + (it.z - ponto.z) * n.x);
          if (it.tipo === 'cama' && dentroParede < info.d / 2 + 0.9 && lateral < info.w / 2 + 0.4) {
            pen += 10;
            alertas.push('Unidade acima/ao lado da cabeceira da cama');
          }
        }
        const pConf = Math.max(0, 25 - pen);
        if (itens.length && pen === 0) motivos.push('Evita jato direto sobre cama, mesa e sofá');

        // 3) instalação
        let pInst;
        let condensadora = null;
        let tubulacao;
        if (p.tipo === 'externa') {
          const bonus = { S: 6, L: 4, N: 2, O: 0 }[k];
          pInst = 14 + bonus;
          tubulacao = 3;
          const fora = { x: ponto.x - n.x * 0.45, z: ponto.z - n.z * 0.45 };
          condensadora = { x: fora.x, z: fora.z, y: 0.7, parede: k };
          motivos.push(`Parede externa: condensadora logo atrás, tubulação curta (~${tubulacao} m)`);
          if (k === 'O') alertas.push('Condensadora ficaria no sol da tarde (oeste): prever sombra/ventilação');
          else if (k === 'S') motivos.push('Condensadora na fachada sul recebe menos sol');
        } else {
          pInst = p.tipo === 'interna_nc' ? 7 : 2;
          let melhor = Infinity;
          for (const q of ['N', 'S', 'L', 'O']) {
            if (e.paredes[q].tipo !== 'externa') continue;
            const dist = q === 'N' ? ponto.z : q === 'S' ? L - ponto.z : q === 'O' ? ponto.x : W - ponto.x;
            melhor = Math.min(melhor, dist);
          }
          tubulacao = Number.isFinite(melhor) ? arred(3 + melhor, 1) : null;
          alertas.push(
            tubulacao
              ? `Parede interna: tubulação percorre ~${tubulacao} m até uma fachada (confira o limite do fabricante)`
              : 'Não há parede externa: a condensadora precisará de um ponto de instalação externo'
          );
        }

        // 4) proximidade da fonte de calor
        let pCarga = 8;
        if (dominante) {
          const dist = Math.hypot(ponto.x - dominante.ponto.x, ponto.z - dominante.ponto.z);
          const maxD = Math.hypot(W, L);
          pCarga = 15 * (1 - Math.min(1, dist / maxD));
          if (k === dominante.parede) motivos.push(`Na mesma parede da maior fonte de calor (${NOMES[dominante.parede]})`);
          else if (dist < maxD * 0.45) motivos.push(`Próxima da maior fonte de calor (${NOMES[dominante.parede]})`);
        }

        // 5) layout
        let pLay = 15;
        let pertoPorta = false;
        let jatoPorta = false;
        for (const porta of portas) {
          if (porta.parede === k) {
            const sPorta = limitar(porta.pos, 0, 1) * ref.len;
            if (Math.abs(s - sPorta) < 1.2 + larguraUn / 2 + porta.largura / 2 - 0.4) pertoPorta = true;
          } else {
            const refP = referencial(porta.parede, W, L);
            const pp = refP.ponto(limitar(porta.pos, 0, 1) * refP.len);
            const f = (pp.x - ponto.x) * n.x + (pp.z - ponto.z) * n.z;
            const lat = Math.abs((pp.x - ponto.x) * -n.z + (pp.z - ponto.z) * n.x);
            if (f > 1 && lat < f * TAN_DIRETO + 0.4) jatoPorta = true;
          }
        }
        if (pertoPorta) {
          pLay -= 8;
          alertas.push('Muito perto da porta: o ar frio escapa e entra ar quente');
        }
        if (jatoPorta) {
          pLay -= 3;
          alertas.push('Jato aponta para a porta');
        }
        const frac = s / ref.len;
        if (frac < 0.25 || frac > 0.75) pLay -= 3;
        else if (frac >= 0.35 && frac <= 0.65) motivos.push('Posição central na parede: distribuição simétrica');
        pLay = Math.max(0, pLay);

        const total = pCob + pConf + pInst + pCarga + pLay;
        candidatos.push({
          parede: k,
          t: arred(t, 2),
          s: arred(s, 2),
          x: arred(ponto.x, 2),
          z: arred(ponto.z, 2),
          y: mountH,
          normal: n,
          rotulo: descreverPosicao(k, t),
          nota: arred(total, 0),
          partes: {
            cobertura: arred(pCob, 1),
            conforto: arred(pConf, 1),
            instalacao: arred(pInst, 1),
            carga: arred(pCarga, 1),
            layout: arred(pLay, 1),
          },
          cobertura: arred(cob, 2),
          condensadora,
          tubulacao,
          motivos,
          alertas: [...new Set(alertas)],
        });
      }
    }

    candidatos.sort((a, b) => b.nota - a.nota || a.parede.localeCompare(b.parede));
    // melhor posição por parede (opções realmente diferentes entre si)
    const vistas = new Set();
    const porParede = [];
    for (const c of candidatos) {
      if (!vistas.has(c.parede)) {
        vistas.add(c.parede);
        porParede.push(c);
      }
    }
    return {
      melhor: candidatos[0] || null,
      porParede,
      candidatos,
      larguraUnidade: larguraUn,
      alturaMontagem: mountH,
      dominante,
      itens,
    };
  }

  /** Posição inicial de móveis para o exemplo padrão (tudo encostado nas paredes). */
  function itensPadrao(W, L) {
    return [
      manterDentro({ tipo: 'mesa', x: W * 0.7, z: 0.5, rot: 0 }, W, L),
      manterDentro({ tipo: 'sofa', x: W * 0.4, z: L - 0.5, rot: 0 }, W, L),
    ];
  }

  return { NOMES, ITENS, sugerir, itensPadrao, manterDentro, pontosItem, cobertura, exposicao, referencial, larguraUnidade, alturaMontagem };
});
