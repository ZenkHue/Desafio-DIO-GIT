/*
 * Visualizador 3D do ambiente (Three.js). Planta: A = parede de cima (z = 0), B = direita (x = W),
 * C = de baixo (z = L), D = esquerda (x = 0); y para cima.
 * Mostra o sol na posição da hora escolhida, mapa de calor por superfície naquela hora, janelas,
 * portas, móveis, a evaporadora sugerida com o jato de ar, a condensadora e as alternativas clicáveis.
 */
import * as THREE from 'three';
import { OrbitControls } from '../../vendor/OrbitControls.js';

const COR_CALOR = [new THREE.Color(0x2e9f6e), new THREE.Color(0xe3c04a), new THREE.Color(0xd6452f)];
const ESPESSURA = 0.12;

function corCalor(t) {
  const x = Math.min(1, Math.max(0, t)) * 2;
  const i = Math.min(1, Math.floor(x));
  return COR_CALOR[i].clone().lerp(COR_CALOR[i + 1], x - i);
}

/** Rótulo com tamanho constante na tela (não cresce quando a câmera se aproxima). */
function sprite(texto, { cor = '#17202a', fundo = 'rgba(255,255,255,.85)', escala = 1, tamanhoFonte = 34, circulo = false } = {}) {
  const c = document.createElement('canvas');
  const g = c.getContext('2d');
  if (circulo) {
    c.width = 128;
    c.height = 128;
    g.fillStyle = fundo;
    g.beginPath();
    g.arc(64, 64, 58, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 6;
    g.strokeStyle = '#ffffff';
    g.stroke();
    g.font = `800 ${tamanhoFonte}px system-ui, sans-serif`;
    g.fillStyle = cor;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(texto, 64, 68);
  } else {
    c.width = 320;
    c.height = 80;
    g.font = `700 ${tamanhoFonte}px system-ui, sans-serif`;
    const w = Math.min(310, g.measureText(texto).width + 36);
    g.fillStyle = fundo;
    g.beginPath();
    g.roundRect((c.width - w) / 2, 10, w, 60, 16);
    g.fill();
    g.fillStyle = cor;
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(texto, c.width / 2, 41);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true, sizeAttenuation: false });
  const sp = new THREE.Sprite(mat);
  // com sizeAttenuation=false, 1 unidade ≈ 0,73 da altura da viewport (fov 40°)
  if (circulo) sp.scale.set(0.075 * escala, 0.075 * escala, 1);
  else sp.scale.set(0.21 * escala, 0.0525 * escala, 1);
  sp.renderOrder = 10;
  return sp;
}

function limpar(grupo) {
  grupo.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) {
      if (m.map) m.map.dispose();
      m.dispose();
    }
  });
  grupo.clear();
}

const caixa = (w, h, d, cor, extra = {}) =>
  new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color: cor, roughness: 0.8, ...extra }));

function arestas(mesh, cor = 0x55616d, opacidade = 0.7) {
  const l = new THREE.LineSegments(
    new THREE.EdgesGeometry(mesh.geometry),
    new THREE.LineBasicMaterial({ color: cor, transparent: true, opacity: opacidade })
  );
  mesh.add(l);
}

function criarMovel(it, info) {
  const g = new THREE.Group();
  const { w, d } = info;
  const cor = new THREE.Color(info.cat.cor);
  const claro = cor.clone().lerp(new THREE.Color(0xffffff), 0.65);
  if (it.tipo === 'cama') {
    const base = caixa(info.cat.w, 0.35, info.cat.d, cor.getHex());
    base.position.y = 0.175;
    const col = caixa(info.cat.w - 0.1, 0.2, info.cat.d - 0.1, 0xf2f2f2);
    col.position.y = 0.45;
    const cab = caixa(info.cat.w, 0.9, 0.08, cor.getHex());
    cab.position.set(0, 0.45, -info.cat.d / 2 + 0.04);
    const t1 = caixa(0.55, 0.12, 0.35, 0xffffff);
    t1.position.set(-info.cat.w / 4, 0.62, -info.cat.d / 2 + 0.3);
    const t2 = t1.clone();
    t2.position.x = info.cat.w / 4;
    g.add(base, col, cab, t1, t2);
  } else if (it.tipo === 'sofa') {
    const base = caixa(info.cat.w, 0.42, info.cat.d, cor.getHex());
    base.position.y = 0.21;
    const assento = caixa(info.cat.w - 0.3, 0.14, info.cat.d - 0.25, claro.getHex());
    assento.position.set(0, 0.49, -0.05);
    const encosto = caixa(info.cat.w, 0.5, 0.22, cor.getHex());
    encosto.position.set(0, 0.62, info.cat.d / 2 - 0.11);
    g.add(base, assento, encosto);
  } else {
    const tampo = caixa(info.cat.w, 0.05, info.cat.d, cor.getHex());
    tampo.position.y = 0.75;
    g.add(tampo);
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      const p = caixa(0.05, 0.75, 0.05, 0x4a4a4a);
      p.position.set(sx * (info.cat.w / 2 - 0.05), 0.375, sz * (info.cat.d / 2 - 0.05));
      g.add(p);
    }
    const tela = caixa(0.55, 0.34, 0.03, 0x1c2024);
    tela.position.set(0, 0.97, -info.cat.d / 2 + 0.2);
    g.add(tela);
  }
  g.position.set(it.x, 0, it.z);
  g.rotation.y = -((it.rot || 0) * Math.PI) / 180;
  return g;
}

function criarEvaporadora(largura) {
  const g = new THREE.Group();
  const corpo = caixa(largura, 0.3, 0.22, 0xf5f7f8, { roughness: 0.4 });
  const aleta = caixa(largura - 0.12, 0.05, 0.14, 0xcfd6db);
  aleta.position.set(0, -0.14, 0.07);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 8), new THREE.MeshBasicMaterial({ color: 0x3ddc84 }));
  led.position.set(largura / 2 - 0.1, 0.02, 0.112);
  arestas(corpo, 0x8a96a0, 0.8);
  g.add(corpo, aleta, led);
  return g;
}

function criarCondensadora() {
  const g = new THREE.Group();
  const corpo = caixa(0.85, 0.6, 0.32, 0xe6e9eb, { roughness: 0.5 });
  const grade = new THREE.Mesh(new THREE.CircleGeometry(0.2, 24), new THREE.MeshBasicMaterial({ color: 0x39434b }));
  grade.position.set(0, 0, 0.162);
  const suporte = caixa(0.8, 0.05, 0.3, 0x59626a);
  suporte.position.y = -0.33;
  arestas(corpo, 0x8a96a0, 0.8);
  g.add(corpo, grade, suporte);
  return g;
}

const ROTULO_EXP = { manha: 'sol da manhã', tarde: 'sol da tarde', diatodo: 'sol o dia todo', nao: 'sem sol' };

/** Para onde a parede A está virada (graus a partir do Norte), para posicionar o sol na cena. */
function azimuteDaParedeA(e, exposicao) {
  if (e.orientacao.modo === 'bussola') return { N: 0, NE: 45, L: 90, SE: 135, S: 180, SO: 225, O: 270, NO: 315 }[e.orientacao.paredeA] || 0;
  const desloc = { A: 0, B: 90, C: 180, D: 270 };
  for (const k of ['A', 'B', 'C', 'D']) {
    if (exposicao[k] === 'tarde') return (270 - desloc[k] + 360) % 360;
    if (exposicao[k] === 'manha') return (90 - desloc[k] + 360) % 360;
  }
  return 0;
}

export function criarVisualizador(container, { aoSelecionar } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (_) {
    const m = document.createElement('div');
    m.className = 'sem-webgl';
    m.textContent = 'Seu navegador ou aparelho não suporta 3D (WebGL). Use a planta abaixo para ver a posição sugerida.';
    container.appendChild(m);
    return { disponivel: false, atualizar() {}, vista() {}, opcoes() {}, _estado: () => ({}) };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
  const ceu = new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.3);
  const sol = new THREE.DirectionalLight(0xfff1d6, 1.8);
  scene.add(ceu, sol, sol.target);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 2;
  controls.maxDistance = 60;
  controls.autoRotateSpeed = 1.6;

  const modelo = new THREE.Group();
  scene.add(modelo);

  let dados = null;
  let opcoes = { calor: true, teto: false };
  let chaveGeometria = '';
  let jato = null;
  let marcadores = [];
  let janelasInfo = [];
  let visivel = true;
  const escuro = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  function enquadrar(nome) {
    if (!dados) return;
    const { W, L, H } = dados.dim;
    const centro = new THREE.Vector3(W / 2, H * 0.4, L / 2);
    const dist = Math.max(4, Math.hypot(W, L, H) * 1.35);
    controls.target.copy(centro);
    const dirs = { iso: [0.62, 0.62, 0.78], topo: [0, 1, 0.001], frente: [0, 0.28, 1] };
    const v = new THREE.Vector3(...(dirs[nome] || dirs.iso)).normalize().multiplyScalar(nome === 'topo' ? dist * 1.05 : dist);
    camera.position.copy(centro).add(v);
    controls.update();
  }

  function construir() {
    limpar(modelo);
    marcadores = [];
    janelasInfo = [];
    jato = null;
    if (!dados) return;
    const { res, sug, selecionado, Pos, hora } = dados;
    const e = res.entrada;
    const W = e.ambiente.largura;
    const L = e.ambiente.comprimento;
    const H = e.ambiente.peDireito;
    const dark = escuro();
    const txt = dark ? '#e8eef3' : '#17202a';
    const fundoRot = dark ? 'rgba(24,32,39,.88)' : 'rgba(255,255,255,.9)';

    // ---------- sol da hora escolhida
    const s = res.sol[hora];
    const azA = azimuteDaParedeA(e, res.exposicao);
    const rel = ((s.azimute - azA) * Math.PI) / 180;
    const alt = (Math.max(s.altitude, -5) * Math.PI) / 180;
    const R = Math.hypot(W, L) + 4;
    const dirSol = new THREE.Vector3(Math.sin(rel) * Math.cos(alt), Math.sin(alt), -Math.cos(rel) * Math.cos(alt));
    sol.position.set(W / 2 + dirSol.x * R, dirSol.y * R, L / 2 + dirSol.z * R);
    sol.target.position.set(W / 2, 0, L / 2);
    const dia = s.altitude > 0;
    sol.intensity = dia ? 0.6 + 1.4 * Math.sin(Math.max(alt, 0)) : 0.15;
    ceu.intensity = dia ? 1.3 : 0.7;
    if (dia) {
      const bola = sprite('☀️', { fundo: 'rgba(255,214,102,.0)', escala: 1.2, tamanhoFonte: 64, circulo: true });
      bola.position.set(W / 2 + dirSol.x * (R * 0.55), Math.max(0.6, dirSol.y * R * 0.55), L / 2 + dirSol.z * (R * 0.55));
      modelo.add(bola);
    }

    // ---------- chão
    const piso = new THREE.Mesh(new THREE.PlaneGeometry(W, L), new THREE.MeshStandardMaterial({ color: dark ? 0x2b363e : 0xdfe6eb, roughness: 0.95 }));
    piso.rotation.x = -Math.PI / 2;
    piso.position.set(W / 2, 0, L / 2);
    const grade = new THREE.GridHelper(Math.max(W, L), Math.round(Math.max(W, L)), dark ? 0x4b5963 : 0xb0bcc5, dark ? 0x3a464f : 0xc3cdd5);
    grade.position.set(W / 2, 0.005, L / 2);
    grade.material.transparent = true;
    grade.material.opacity = 0.5;
    modelo.add(piso, grade);

    // ---------- escala do mapa de calor (máximo do dia inteiro, para as cores não "pularem" com a hora)
    let maxWm2 = 1;
    for (const k of ['A', 'B', 'C', 'D', 'teto']) for (const v of res.porSuperficie[k].wm2) maxWm2 = Math.max(maxWm2, v);

    const defs = {
      A: { pos: [W / 2, H / 2, -ESPESSURA / 2], tam: [W + 2 * ESPESSURA, H, ESPESSURA], rot: [W / 2, H + 0.35, -0.6] },
      C: { pos: [W / 2, H / 2, L + ESPESSURA / 2], tam: [W + 2 * ESPESSURA, H, ESPESSURA], rot: [W / 2, H + 0.35, L + 0.6] },
      D: { pos: [-ESPESSURA / 2, H / 2, L / 2], tam: [ESPESSURA, H, L], rot: [-0.7, H + 0.35, L / 2] },
      B: { pos: [W + ESPESSURA / 2, H / 2, L / 2], tam: [ESPESSURA, H, L], rot: [W + 0.7, H + 0.35, L / 2] },
    };
    const geo = {
      A: { len: W, ponto: (t) => new THREE.Vector3(t, 0, 0), x: true, n: new THREE.Vector3(0, 0, 1) },
      C: { len: W, ponto: (t) => new THREE.Vector3(t, 0, L), x: true, n: new THREE.Vector3(0, 0, -1) },
      D: { len: L, ponto: (t) => new THREE.Vector3(0, 0, t), x: false, n: new THREE.Vector3(1, 0, 0) },
      B: { len: L, ponto: (t) => new THREE.Vector3(W, 0, t), x: false, n: new THREE.Vector3(-1, 0, 0) },
    };

    for (const k of ['A', 'B', 'C', 'D']) {
      const p = e.paredes[k];
      const d = defs[k];
      const g = geo[k];
      const gp = res.geometria.paredes[k];
      const externa = p.tipo === 'externa';
      const wm2 = res.porSuperficie[k].wm2[hora];
      let cor = dark ? 0x7d8b96 : 0xc3ced6;
      if (opcoes.calor && p.tipo !== 'climatizada') cor = corCalor(Math.max(0, wm2) / maxWm2).getHex();
      const opac = p.tipo === 'climatizada' ? 0.1 : externa ? 0.32 : 0.2;
      const m = caixa(...d.tam, cor, { transparent: true, opacity: opac, depthWrite: false, roughness: 1 });
      m.position.set(...d.pos);
      arestas(m, dark ? 0x93a1ac : 0x55616d, 0.55);
      modelo.add(m);

      const desc = externa ? ROTULO_EXP[res.exposicao[k]] : p.tipo === 'climatizada' ? 'vizinho com ar' : 'interna';
      const r = sprite(`${k} · ${desc}${p.tipo !== 'climatizada' ? ` · ${Math.round(wm2)} W/m²` : ''}`, { cor: txt, fundo: fundoRot, escala: 1, tamanhoFonte: 28 });
      r.position.set(...d.rot);
      modelo.add(r);

      // janela
      if (externa && gp.janela.area > 0) {
        const j = p.janela;
        const t = j.pos * g.len;
        const cy = j.peitoril + j.altura / 2;
        const base = g.ponto(t);
        const vidro = new THREE.Mesh(
          new THREE.BoxGeometry(g.x ? j.largura : ESPESSURA * 1.2, j.altura, g.x ? ESPESSURA * 1.2 : j.largura),
          new THREE.MeshStandardMaterial({ color: 0x7cc4ee, transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.2 })
        );
        vidro.position.set(base.x - g.n.x * ESPESSURA * 0.5, cy, base.z - g.n.z * ESPESSURA * 0.5);
        arestas(vidro, 0x1d5f8a, 1);
        modelo.add(vidro);
        janelasInfo.push({ parede: k, x: vidro.position.x, y: vidro.position.y, z: vidro.position.z });
        if (j.protecao === 'externa') {
          const toldo = caixa(g.x ? j.largura + 0.3 : 0.7, 0.05, g.x ? 0.7 : j.largura + 0.3, 0x4f5b66);
          toldo.position.set(base.x - g.n.x * 0.45, j.peitoril + j.altura + 0.08, base.z - g.n.z * 0.45);
          modelo.add(toldo);
        } else if (j.protecao === 'cortina') {
          const c = new THREE.Mesh(new THREE.PlaneGeometry(j.largura + 0.2, j.altura + 0.3), new THREE.MeshStandardMaterial({ color: 0xf1e3c8, transparent: true, opacity: 0.7, side: THREE.DoubleSide }));
          c.position.set(base.x + g.n.x * 0.1, cy, base.z + g.n.z * 0.1);
          c.rotation.y = g.x ? 0 : Math.PI / 2;
          modelo.add(c);
        }
        // raios de sol entrando: só se a janela recebe sol direto nesta hora
        const direto = res.solDireto[k] ? res.solDireto[k][hora] : 0;
        if (opcoes.calor && direto > 40) {
          const dir = dirSol.clone().negate().normalize();
          for (let i = 0; i < 3; i++) {
            const off = (i - 1) * Math.min(0.5, j.largura / 3);
            const alvo = new THREE.Vector3(base.x + (g.x ? off : 0), cy + (i - 1) * 0.15, base.z + (g.x ? 0 : off));
            const origem = alvo.clone().addScaledVector(dir, -1.6);
            modelo.add(new THREE.ArrowHelper(dir, origem, 1.45, 0xf59e0b, 0.28, 0.14));
          }
        }
      }
      // porta
      if (gp.porta.area > 0) {
        const t = p.porta.pos * g.len;
        const base = g.ponto(t);
        const porta = caixa(g.x ? gp.porta.largura : ESPESSURA * 1.3, gp.porta.altura, g.x ? ESPESSURA * 1.3 : gp.porta.largura, 0x8a5a33, { transparent: true, opacity: 0.55, depthWrite: false });
        porta.position.set(base.x - g.n.x * ESPESSURA * 0.5, gp.porta.altura / 2, base.z - g.n.z * ESPESSURA * 0.5);
        arestas(porta, 0x3b2616, 1);
        modelo.add(porta);
      }
    }

    // ---------- teto
    const wTeto = res.porSuperficie.teto.wm2[hora];
    const temTeto = !['apartamento_ar'].includes(e.cobertura.tipo);
    if (temTeto) {
      if (opcoes.teto) {
        const cor = opcoes.calor ? corCalor(Math.max(0, wTeto) / maxWm2).getHex() : dark ? 0x7d8b96 : 0xc3ced6;
        const laje = caixa(W + 2 * ESPESSURA, ESPESSURA, L + 2 * ESPESSURA, cor, { transparent: true, opacity: 0.55, depthWrite: false });
        laje.position.set(W / 2, H + ESPESSURA / 2, L / 2);
        arestas(laje, dark ? 0x93a1ac : 0x55616d, 0.6);
        modelo.add(laje);
      }
      const r = sprite(`Teto · ${Math.round(wTeto)} W/m²`, { cor: txt, fundo: fundoRot, escala: 1, tamanhoFonte: 28 });
      r.position.set(W / 2, H + 0.9, L / 2);
      modelo.add(r);
    }

    // ---------- cotas e móveis
    const cx = sprite(`${W.toFixed(1).replace('.', ',')} m`, { cor: txt, fundo: fundoRot, escala: 0.75 });
    cx.position.set(W / 2, 0.05, L + 0.5);
    const cz = sprite(`${L.toFixed(1).replace('.', ',')} m`, { cor: txt, fundo: fundoRot, escala: 0.75 });
    cz.position.set(-0.5, 0.05, L / 2);
    modelo.add(cx, cz);
    for (const it of sug.itens) modelo.add(criarMovel(it, Pos.pontosItem(it)));

    // ---------- aparelho sugerido, jato e condensadora
    const esc = selecionado || sug.melhor;
    if (esc) {
      const n = new THREE.Vector3(esc.normal.x, 0, esc.normal.z);
      const un = criarEvaporadora(sug.larguraUnidade);
      un.position.set(esc.x + n.x * 0.11, esc.y, esc.z + n.z * 0.11);
      un.rotation.y = Math.atan2(n.x, n.z);
      modelo.add(un);

      const recorte = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), 0), new THREE.Plane(new THREE.Vector3(-1, 0, 0), W),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), 0), new THREE.Plane(new THREE.Vector3(0, 0, -1), L),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), new THREE.Plane(new THREE.Vector3(0, -1, 0), H),
      ];
      const prof = esc.parede === 'A' || esc.parede === 'C' ? L : W;
      const comp = Math.min(dados.alcance, prof * 0.97);
      const dir = new THREE.Vector3(n.x, -0.12, n.z).normalize();
      const raio = comp * Math.tan((28 * Math.PI) / 180);
      const cone = new THREE.Mesh(
        new THREE.CylinderGeometry(raio, 0.05, comp, 28, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x4db8ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: recorte })
      );
      const origem = new THREE.Vector3(esc.x + n.x * 0.2, esc.y - 0.1, esc.z + n.z * 0.2);
      cone.position.copy(origem).addScaledVector(dir, comp / 2);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      modelo.add(cone);
      const N = 150;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      modelo.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xa8e3ff, size: 0.07, transparent: true, opacity: 0.9, depthWrite: false, clippingPlanes: recorte })));
      const p1 = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      const p2 = new THREE.Vector3().crossVectors(dir, p1).normalize();
      jato = {
        g, N, origem, dir, p1, p2, comp, raio,
        u: Float32Array.from({ length: N }, () => Math.random()),
        v: Float32Array.from({ length: N }, () => 0.5 + Math.random() * 0.8),
        a: Float32Array.from({ length: N }, () => Math.random() * Math.PI * 2),
        r: Float32Array.from({ length: N }, () => Math.sqrt(Math.random())),
      };
      if (esc.condensadora) {
        const c = esc.condensadora;
        const cond = criarCondensadora();
        cond.position.set(c.x, c.y, c.z);
        cond.rotation.y = Math.atan2(-n.x, -n.z);
        modelo.add(cond);
        modelo.add(new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(esc.x - n.x * 0.05, esc.y - 0.1, esc.z - n.z * 0.05),
            new THREE.Vector3(esc.x - n.x * 0.3, esc.y - 0.1, esc.z - n.z * 0.3),
            new THREE.Vector3(c.x, c.y + 0.15, c.z),
          ]),
          new THREE.LineBasicMaterial({ color: 0xc87533 })
        ));
        const rc = sprite('Condensadora', { cor: txt, fundo: fundoRot, escala: 0.8, tamanhoFonte: 28 });
        rc.position.set(c.x - n.x * 0.5, c.y + 0.7, c.z - n.z * 0.5);
        modelo.add(rc);
      }
    }

    // ---------- alternativas clicáveis
    sug.porParede.forEach((c, i) => {
      if (esc && c.parede === esc.parede) return;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), new THREE.MeshStandardMaterial({ color: 0x35c28d, emissive: 0x1f8a63, transparent: true, opacity: 0.35 }));
      m.position.set(c.x + c.normal.x * 0.2, c.y, c.z + c.normal.z * 0.2);
      m.userData.parede = c.parede;
      modelo.add(m);
      marcadores.push(m);
      const num = sprite(String(i + 1), { cor: '#06281c', fundo: 'rgba(53,194,141,1)', escala: 1, tamanhoFonte: 72, circulo: true });
      num.position.copy(m.position);
      modelo.add(num);
    });
  }

  const relogio = new THREE.Clock();
  function animar() {
    requestAnimationFrame(animar);
    if (!visivel || document.hidden) return;
    const dt = Math.min(relogio.getDelta(), 0.05);
    if (jato) {
      const j = jato;
      const pos = j.g.attributes.position.array;
      for (let i = 0; i < j.N; i++) {
        j.u[i] += dt * 0.28 * j.v[i];
        if (j.u[i] > 1) {
          j.u[i] = 0;
          j.a[i] = Math.random() * Math.PI * 2;
          j.r[i] = Math.sqrt(Math.random());
        }
        const u = j.u[i];
        const rad = j.raio * u * j.r[i] * 0.9;
        const ca = Math.cos(j.a[i]);
        const sa = Math.sin(j.a[i]);
        pos[i * 3] = j.origem.x + j.dir.x * u * j.comp + (j.p1.x * ca + j.p2.x * sa) * rad;
        pos[i * 3 + 1] = j.origem.y + j.dir.y * u * j.comp + (j.p1.y * ca + j.p2.y * sa) * rad;
        pos[i * 3 + 2] = j.origem.z + j.dir.z * u * j.comp + (j.p1.z * ca + j.p2.z * sa) * rad;
      }
      j.g.attributes.position.needsUpdate = true;
    }
    controls.update();
    renderer.render(scene, camera);
  }

  function redimensionar() {
    const w = container.clientWidth || 300;
    const h = container.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(redimensionar).observe(container);
  redimensionar();
  if ('IntersectionObserver' in window) new IntersectionObserver((es) => (visivel = es[0].isIntersecting)).observe(container);
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', () => construir());
  }

  const raycaster = new THREE.Raycaster();
  let inicio = null;
  renderer.domElement.addEventListener('pointerdown', (ev) => (inicio = { x: ev.clientX, y: ev.clientY, t: performance.now() }));
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!inicio || !aoSelecionar) return;
    const moveu = Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y);
    const rapido = performance.now() - inicio.t < 500;
    inicio = null;
    if (moveu > 6 || !rapido || !marcadores.length) return;
    const r = renderer.domElement.getBoundingClientRect();
    raycaster.setFromCamera(new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1), camera);
    const hit = raycaster.intersectObjects(marcadores, false)[0];
    if (hit) aoSelecionar(hit.object.userData.parede);
  });

  animar();

  return {
    disponivel: true,
    atualizar(novos) {
      dados = novos;
      const { W, L, H } = novos.dim;
      const chave = `${W}|${L}|${H}`;
      construir();
      if (chave !== chaveGeometria) {
        chaveGeometria = chave;
        enquadrar('iso');
      }
    },
    vista: enquadrar,
    opcoes(o) {
      opcoes = { ...opcoes, ...o };
      if ('girar' in o) controls.autoRotate = !!o.girar;
      if (dados && ('calor' in o || 'teto' in o)) construir();
    },
    _estado: () => ({ marcadores: marcadores.length, janelas: janelasInfo, jato: !!jato }),
  };
}
