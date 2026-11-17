/*
 * Visualizador 3D do ambiente (Three.js). Eixos: x = Leste, y = altura, z = Sul (Norte em z = 0).
 * Mostra paredes com mapa de calor, janelas e proteções, porta, móveis, a evaporadora sugerida
 * com o jato de ar (partículas), a condensadora e alternativas clicáveis.
 */
import * as THREE from 'three';
import { OrbitControls } from '../vendor/OrbitControls.js';

const COR_CALOR = [new THREE.Color(0x2e9f6e), new THREE.Color(0xe3c04a), new THREE.Color(0xd6452f)];
const NOMES = { N: 'Norte', S: 'Sul', L: 'Leste', O: 'Oeste' };
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

export function criarVisualizador(container, { aoSelecionar } = {}) {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  } catch (_) {
    const m = document.createElement('div');
    m.className = 'sem-webgl';
    m.textContent = 'Seu navegador ou dispositivo não suporta WebGL. Use a planta 2D abaixo para ver a posição sugerida.';
    container.appendChild(m);
    return { disponivel: false, atualizar() {}, vista() {}, opcoes() {} };
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 300);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.5));
  const sol = new THREE.DirectionalLight(0xffffff, 1.6);
  sol.position.set(6, 12, 8);
  scene.add(sol);

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
  let fatiaJato = null; // dados para animar partículas
  let marcadores = [];
  let janelasInfo = []; // para testes: posição real das janelas no 3D
  let visivel = true;
  const escuro = () => window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;

  /* ---------- enquadramento de câmera ---------- */
  function enquadrar(nome) {
    if (!dados) return;
    const { W, L, H } = dados.dim;
    const centro = new THREE.Vector3(W / 2, H * 0.4, L / 2);
    const dist = Math.max(4, Math.hypot(W, L, H) * 1.35);
    controls.target.copy(centro);
    const dirs = {
      iso: [0.62, 0.62, 0.78],
      topo: [0, 1.0, 0.001],
      sul: [0, 0.28, 1],
    };
    const v = new THREE.Vector3(...(dirs[nome] || dirs.iso)).normalize().multiplyScalar(nome === 'topo' ? dist * 1.05 : dist);
    camera.position.copy(centro).add(v);
    controls.update();
  }

  /* ---------- construção do modelo ---------- */
  function construir() {
    limpar(modelo);
    marcadores = [];
    janelasInfo = [];
    fatiaJato = null;
    if (!dados) return;
    const { res, sug, selecionado, Pos } = dados;
    const e = res.entrada;
    const W = e.ambiente.largura;
    const L = e.ambiente.comprimento;
    const H = e.ambiente.peDireito;
    const noite = e.clima.uso === 'noite';
    const dark = escuro();
    const txt = dark ? '#e8eef3' : '#17202a';
    const fundoRotulo = dark ? 'rgba(24,32,39,.88)' : 'rgba(255,255,255,.88)';

    // chão
    const piso = new THREE.Mesh(
      new THREE.PlaneGeometry(W, L),
      new THREE.MeshStandardMaterial({ color: dark ? 0x2b363e : 0xdfe6eb, roughness: 0.95 })
    );
    piso.rotation.x = -Math.PI / 2;
    piso.position.set(W / 2, 0, L / 2);
    const grade = new THREE.GridHelper(Math.max(W, L), Math.round(Math.max(W, L)), dark ? 0x4b5963 : 0xb0bcc5, dark ? 0x3a464f : 0xc3cdd5);
    grade.position.set(W / 2, 0.005, L / 2);
    grade.material.transparent = true;
    grade.material.opacity = 0.5;
    modelo.add(piso, grade);

    // escala do mapa de calor
    const sup = res.porSuperficie;
    const ext = ['N', 'S', 'L', 'O'].filter((k) => e.paredes[k].tipo === 'externa').map((k) => sup[k].wm2);
    if (e.cobertura.tipo !== 'andar_c') ext.push(sup.cobertura.wm2);
    const maxWm2 = Math.max(1, ...ext);

    // paredes
    const defs = {
      N: { pos: [W / 2, H / 2, -ESPESSURA / 2], tam: [W + 2 * ESPESSURA, H, ESPESSURA], rotulo: [W / 2, H + 0.35, -0.9] },
      S: { pos: [W / 2, H / 2, L + ESPESSURA / 2], tam: [W + 2 * ESPESSURA, H, ESPESSURA], rotulo: [W / 2, H + 0.35, L + 0.9] },
      O: { pos: [-ESPESSURA / 2, H / 2, L / 2], tam: [ESPESSURA, H, L], rotulo: [-1.1, H + 0.35, L / 2] },
      L: { pos: [W + ESPESSURA / 2, H / 2, L / 2], tam: [ESPESSURA, H, L], rotulo: [W + 1.1, H + 0.35, L / 2] },
    };
    const geoParede = {
      N: { len: W, ponto: (s) => new THREE.Vector3(s, 0, 0), alongX: true, n: new THREE.Vector3(0, 0, 1) },
      S: { len: W, ponto: (s) => new THREE.Vector3(s, 0, L), alongX: true, n: new THREE.Vector3(0, 0, -1) },
      O: { len: L, ponto: (s) => new THREE.Vector3(0, 0, s), alongX: false, n: new THREE.Vector3(1, 0, 0) },
      L: { len: L, ponto: (s) => new THREE.Vector3(W, 0, s), alongX: false, n: new THREE.Vector3(-1, 0, 0) },
    };

    for (const k of ['N', 'S', 'L', 'O']) {
      const p = e.paredes[k];
      const d = defs[k];
      const g = geoParede[k];
      const externa = p.tipo === 'externa';
      let cor = dark ? 0x7d8b96 : 0xc3ced6;
      let opac = p.tipo === 'interna_c' ? 0.1 : p.tipo === 'interna_nc' ? 0.2 : 0.3;
      if (opcoes.calor && externa) cor = corCalor(sup[k].wm2 / maxWm2).getHex();
      const m = caixa(...d.tam, cor, { transparent: true, opacity: opac, depthWrite: false, roughness: 1 });
      m.position.set(...d.pos);
      arestas(m, dark ? 0x93a1ac : 0x55616d, 0.55);
      modelo.add(m);

      const rot = sprite(
        externa ? `${NOMES[k]} · ${sup[k].wm2} W/m²` : `${NOMES[k]} · ${p.tipo === 'interna_c' ? 'vizinho climatizado' : 'interna'}`,
        { cor: txt, fundo: fundoRotulo, escala: 1, tamanhoFonte: 30 }
      );
      rot.position.set(...d.rotulo);
      modelo.add(rot);

      // janela e proteções
      const jan = res.geometria.janelas[k];
      if (externa && jan.area > 0) {
        const jc = e.paredes[k].janela;
        const s = Math.min(Math.max(jc.pos, 0), 1) * g.len;
        const cy = jc.peitoril + jan.altura / 2;
        const vidro = new THREE.Mesh(
          new THREE.BoxGeometry(g.alongX ? jan.largura : ESPESSURA * 1.2, jan.altura, g.alongX ? ESPESSURA * 1.2 : jan.largura),
          new THREE.MeshStandardMaterial({ color: 0x7cc4ee, transparent: true, opacity: 0.6, roughness: 0.1, metalness: 0.2 })
        );
        const base = g.ponto(s);
        vidro.position.set(base.x - g.n.x * ESPESSURA * 0.5, cy, base.z - g.n.z * ESPESSURA * 0.5);
        arestas(vidro, 0x1d5f8a, 1);
        modelo.add(vidro);
        janelasInfo.push({ parede: k, x: vidro.position.x, y: vidro.position.y, z: vidro.position.z });

        const prot = jc.protecao;
        if (prot === 'externa') {
          const toldo = caixa(g.alongX ? jan.largura + 0.3 : 0.7, 0.05, g.alongX ? 0.7 : jan.largura + 0.3, 0x4f5b66);
          toldo.position.set(base.x - g.n.x * 0.45, jc.peitoril + jan.altura + 0.08, base.z - g.n.z * 0.45);
          modelo.add(toldo);
        } else if (prot === 'cortina') {
          const cort = new THREE.Mesh(
            new THREE.PlaneGeometry(g.alongX ? jan.largura + 0.2 : jan.largura + 0.2, jan.altura + 0.3),
            new THREE.MeshStandardMaterial({ color: 0xf1e3c8, transparent: true, opacity: 0.7, side: THREE.DoubleSide })
          );
          cort.position.set(base.x + g.n.x * 0.1, cy, base.z + g.n.z * 0.1);
          cort.rotation.y = g.alongX ? 0 : Math.PI / 2;
          modelo.add(cort);
        }

        if (opcoes.calor && !noite) {
          const n = 3;
          for (let i = 0; i < n; i++) {
            const off = (i - 1) * Math.min(0.5, jan.largura / 3);
            const alvo = new THREE.Vector3(base.x + (g.alongX ? off : 0), cy + (i - 1) * 0.15, base.z + (g.alongX ? 0 : off));
            const dir = g.n.clone().multiplyScalar(1).setY(-0.35).normalize();
            const origem = alvo.clone().addScaledVector(dir, -1.5);
            origem.addScaledVector(g.n, 0); // vem de fora
            const seta = new THREE.ArrowHelper(dir, origem, 1.35, 0xf59e0b, 0.28, 0.14);
            modelo.add(seta);
          }
        }
      }
    }

    // portas (uma por parede, no máximo)
    for (const k of ['N', 'S', 'L', 'O']) {
      const dp = res.geometria.portas[k];
      if (!dp || dp.area <= 0) continue;
      const g = geoParede[k];
      const s = Math.min(Math.max(e.paredes[k].porta.pos, 0), 1) * g.len;
      const base = g.ponto(s);
      const porta = caixa(g.alongX ? dp.largura : ESPESSURA * 1.3, dp.altura, g.alongX ? ESPESSURA * 1.3 : dp.largura, 0x8a5a33, { transparent: true, opacity: 0.55, depthWrite: false });
      porta.position.set(base.x - g.n.x * ESPESSURA * 0.5, dp.altura / 2, base.z - g.n.z * ESPESSURA * 0.5);
      arestas(porta, 0x3b2616, 1);
      modelo.add(porta);
    }

    // cobertura
    const cobAtiva = e.cobertura.tipo !== 'andar_c';
    if (cobAtiva) {
      const cor = opcoes.calor ? corCalor(sup.cobertura.wm2 / maxWm2).getHex() : dark ? 0x7d8b96 : 0xc3ced6;
      const laje = caixa(W + 2 * ESPESSURA, ESPESSURA, L + 2 * ESPESSURA, cor, { transparent: true, opacity: opcoes.teto ? 0.55 : 0.0, depthWrite: false });
      laje.position.set(W / 2, H + ESPESSURA / 2, L / 2);
      laje.visible = opcoes.teto;
      if (opcoes.teto) arestas(laje, dark ? 0x93a1ac : 0x55616d, 0.6);
      modelo.add(laje);
      const rot = sprite(`Cobertura · ${sup.cobertura.wm2} W/m²`, { cor: txt, fundo: fundoRotulo, escala: 1, tamanhoFonte: 30 });
      rot.position.set(W / 2, H + 0.9, L / 2);
      modelo.add(rot);
    }

    // cotas
    const cotaX = sprite(`${W.toFixed(1).replace('.', ',')} m`, { cor: txt, fundo: fundoRotulo, escala: 0.75 });
    cotaX.position.set(W / 2, 0.05, L + 0.55);
    const cotaZ = sprite(`${L.toFixed(1).replace('.', ',')} m`, { cor: txt, fundo: fundoRotulo, escala: 0.75 });
    cotaZ.position.set(-0.55, 0.05, L / 2);
    modelo.add(cotaX, cotaZ);

    // móveis
    for (const it of sug.itens) {
      modelo.add(criarMovel(it, Pos.pontosItem(it)));
    }

    // equipamento sugerido
    const alt = sug.porParede;
    const escolhido = selecionado || sug.melhor;
    if (escolhido) {
      const n = new THREE.Vector3(escolhido.normal.x, 0, escolhido.normal.z);
      const un = criarEvaporadora(sug.larguraUnidade);
      un.position.set(escolhido.x + n.x * 0.11, escolhido.y, escolhido.z + n.z * 0.11);
      un.rotation.y = Math.atan2(n.x, n.z);
      modelo.add(un);

      const recorte = [
        new THREE.Plane(new THREE.Vector3(1, 0, 0), 0),
        new THREE.Plane(new THREE.Vector3(-1, 0, 0), W),
        new THREE.Plane(new THREE.Vector3(0, 0, 1), 0),
        new THREE.Plane(new THREE.Vector3(0, 0, -1), L),
        new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
        new THREE.Plane(new THREE.Vector3(0, -1, 0), H),
      ];
      const alcance = dados.alcance;
      const prof = escolhido.parede === 'N' || escolhido.parede === 'S' ? L : W;
      const comp = Math.min(alcance, prof * 0.97);
      const dir = new THREE.Vector3(n.x, -0.12, n.z).normalize();
      const raio = comp * Math.tan((28 * Math.PI) / 180);
      const cone = new THREE.Mesh(
        new THREE.CylinderGeometry(raio, 0.05, comp, 28, 1, true),
        new THREE.MeshBasicMaterial({ color: 0x4db8ff, transparent: true, opacity: 0.12, depthWrite: false, side: THREE.DoubleSide, clippingPlanes: recorte })
      );
      const origem = new THREE.Vector3(escolhido.x + n.x * 0.2, escolhido.y - 0.1, escolhido.z + n.z * 0.2);
      cone.position.copy(origem).addScaledVector(dir, comp / 2);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      modelo.add(cone);

      // partículas do jato
      const N = 150;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
      const pontos = new THREE.Points(
        geo,
        new THREE.PointsMaterial({ color: 0xa8e3ff, size: 0.07, transparent: true, opacity: 0.9, depthWrite: false, clippingPlanes: recorte })
      );
      modelo.add(pontos);
      const p1 = new THREE.Vector3().crossVectors(dir, new THREE.Vector3(0, 1, 0)).normalize();
      if (p1.lengthSq() < 0.5) p1.set(1, 0, 0);
      const p2 = new THREE.Vector3().crossVectors(dir, p1).normalize();
      fatiaJato = {
        geo, N, origem, dir, p1, p2, comp, raio,
        u: Float32Array.from({ length: N }, () => Math.random()),
        v: Float32Array.from({ length: N }, () => 0.5 + Math.random() * 0.8),
        a: Float32Array.from({ length: N }, () => Math.random() * Math.PI * 2),
        r: Float32Array.from({ length: N }, () => Math.sqrt(Math.random())),
      };

      // condensadora e tubulação
      if (escolhido.condensadora) {
        const c = escolhido.condensadora;
        const cond = criarCondensadora();
        cond.position.set(c.x, c.y, c.z);
        cond.rotation.y = Math.atan2(-n.x, -n.z);
        modelo.add(cond);
        const tubo = new THREE.Line(
          new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(escolhido.x - n.x * 0.05, escolhido.y - 0.1, escolhido.z - n.z * 0.05),
            new THREE.Vector3(escolhido.x - n.x * 0.3, escolhido.y - 0.1, escolhido.z - n.z * 0.3),
            new THREE.Vector3(c.x, c.y + 0.15, c.z),
          ]),
          new THREE.LineBasicMaterial({ color: 0xc87533 })
        );
        modelo.add(tubo);
        const rc = sprite('Condensadora', { cor: txt, fundo: fundoRotulo, escala: 0.8, tamanhoFonte: 30 });
        rc.position.set(c.x - n.x * 0.5, c.y + 0.7, c.z - n.z * 0.5);
        modelo.add(rc);
      }
    }

    // alternativas clicáveis
    alt.forEach((c, i) => {
      if (escolhido && c.parede === escolhido.parede) return;
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(0.22, 16, 12),
        new THREE.MeshStandardMaterial({ color: 0x35c28d, emissive: 0x1f8a63, transparent: true, opacity: 0.35 })
      );
      m.position.set(c.x + c.normal.x * 0.2, c.y, c.z + c.normal.z * 0.2);
      m.userData.parede = c.parede;
      modelo.add(m);
      marcadores.push(m);
      const num = sprite(String(i + 1), { cor: '#06281c', fundo: 'rgba(53,194,141,1)', escala: 1, tamanhoFonte: 72, circulo: true });
      num.position.copy(m.position);
      modelo.add(num);
    });
  }

  /* ---------- animação ---------- */
  const relogio = new THREE.Clock();
  function animar() {
    requestAnimationFrame(animar);
    if (!visivel || document.hidden) return;
    const dt = Math.min(relogio.getDelta(), 0.05);
    if (fatiaJato) {
      const j = fatiaJato;
      const pos = j.geo.attributes.position.array;
      for (let i = 0; i < j.N; i++) {
        j.u[i] += dt * 0.28 * j.v[i];
        if (j.u[i] > 1) {
          j.u[i] = 0;
          j.a[i] = Math.random() * Math.PI * 2;
          j.r[i] = Math.sqrt(Math.random());
        }
        const u = j.u[i];
        const rad = j.raio * u * j.r[i] * 0.9;
        pos[i * 3] = j.origem.x + j.dir.x * u * j.comp + (j.p1.x * Math.cos(j.a[i]) + j.p2.x * Math.sin(j.a[i])) * rad;
        pos[i * 3 + 1] = j.origem.y + j.dir.y * u * j.comp + (j.p1.y * Math.cos(j.a[i]) + j.p2.y * Math.sin(j.a[i])) * rad;
        pos[i * 3 + 2] = j.origem.z + j.dir.z * u * j.comp + (j.p1.z * Math.cos(j.a[i]) + j.p2.z * Math.sin(j.a[i])) * rad;
      }
      j.geo.attributes.position.needsUpdate = true;
    }
    controls.update();
    renderer.render(scene, camera);
  }

  /* ---------- tamanho e visibilidade ---------- */
  function redimensionar() {
    const w = container.clientWidth || 300;
    const h = container.clientHeight || 300;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(redimensionar).observe(container);
  redimensionar();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver((es) => (visivel = es[0].isIntersecting), { threshold: 0 }).observe(container);
  }
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    (mq.addEventListener ? mq.addEventListener.bind(mq, 'change') : mq.addListener.bind(mq))(() => construir());
  }

  /* ---------- seleção por clique ---------- */
  const raio = new THREE.Raycaster();
  let inicio = null;
  renderer.domElement.addEventListener('pointerdown', (ev) => {
    inicio = { x: ev.clientX, y: ev.clientY, t: performance.now() };
  });
  renderer.domElement.addEventListener('pointerup', (ev) => {
    if (!inicio || !aoSelecionar) return;
    const moveu = Math.hypot(ev.clientX - inicio.x, ev.clientY - inicio.y);
    const rapido = performance.now() - inicio.t < 500;
    inicio = null;
    if (moveu > 6 || !rapido || !marcadores.length) return;
    const r = renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    raio.setFromCamera(ndc, camera);
    const hit = raio.intersectObjects(marcadores, false)[0];
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
    // para testes automatizados
    _estado: () => ({ marcadores: marcadores.length, particulas: !!fatiaJato, janelas: janelasInfo }),
  };
}
