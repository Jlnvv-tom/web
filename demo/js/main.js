/**
 * DJI Osmo Action 4 · 3D 拆解可视化 —— 主程序
 * 依赖：Three.js（本地 vendor）、data / geom / model / controls / labels
 */
import * as THREE from 'three';
import { PARTS, DEMO_SEQUENCE } from './data.js';
import { buildAction4, buildEnvironment } from './model.js';
import { OrbitCam } from './controls.js';
import { LabelLayer } from './labels.js';
import { dotTexture, glowTexture, shadowTexture } from './geom.js';

/* ============================================================
   0. DOM
   ============================================================ */
const $ = (s) => document.querySelector(s);
const canvas = $('#scene');
const labelHost = $('#labels');
const svgLeaders = $('#leaders');
const partListEl = $('#partList');
const detailBody = $('#detailBody');
const detailPanel = $('#detail');
const inventoryPanel = $('#inventory');
const loader = $('#loader');
const loadFill = $('#loadFill');
const loadStep = $('#loadStep');
const stView = $('#stView');
const stSel = $('#stSel');
const stFps = $('#stFps');

const setLoad = (pct, txt) => {
  loadFill.style.width = pct + '%';
  if (txt) loadStep.textContent = txt;
};

/* ============================================================
   1. 渲染器 / 场景 / 相机
   ============================================================ */
setLoad(8, '初始化渲染器…');

const renderer = new THREE.WebGLRenderer({
  canvas, antialias: true, alpha: true, powerPreference: 'high-performance'
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(window.innerWidth, window.innerHeight, false);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const scene = new THREE.Scene();
scene.fog = new THREE.FogExp2(0x04070d, 0.0165);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 400);
camera.position.set(14, 9, 20);

setLoad(20, '生成环境反射…');
const envTex = buildEnvironment(renderer);
scene.environment = envTex;

/* ============================================================
   2. 灯光
   ============================================================ */
scene.add(new THREE.HemisphereLight(0x2c4f68, 0x080c12, 0.9));

const key = new THREE.DirectionalLight(0xffffff, 1.9);
key.position.set(9, 15, 12);
scene.add(key);

const rim = new THREE.DirectionalLight(0x7dd3fc, 1.35);
rim.position.set(-10, 7, -13);
scene.add(rim);

const fill = new THREE.DirectionalLight(0xffb27a, 0.62);
fill.position.set(6, -6, 8);
scene.add(fill);

const cyan = new THREE.PointLight(0x22d3ee, 26, 26, 2);
cyan.position.set(-8, 3, 5);
scene.add(cyan);

const orange = new THREE.PointLight(0xff8a3d, 18, 24, 2);
orange.position.set(8, -3, -5);
scene.add(orange);

/* ============================================================
   3. 背景（星点 / 地面网格 / 光晕 / 接触阴影）
   ============================================================ */
setLoad(32, '构建科技感背景…');

// 星点
const starGeo = new THREE.BufferGeometry();
{
  const N = 900, pos = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    const r = 55 + Math.random() * 55;
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph) * 0.6 + 6;
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({
  size: 0.55, map: dotTexture(), color: 0x9fd8ff, transparent: true, opacity: 0.75,
  blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true, fog: false
}));
scene.add(stars);

// 地面网格
const grid = new THREE.GridHelper(70, 34, 0x1e5a72, 0x10303e);
grid.position.y = -3.6;
grid.material.transparent = true;
grid.material.opacity = 0.34;
grid.material.depthWrite = false;
scene.add(grid);

// 地面光晕环
const ring = new THREE.Mesh(
  new THREE.RingGeometry(5.4, 8.2, 64),
  new THREE.MeshBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.1, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
);
ring.rotation.x = -Math.PI / 2;
ring.position.y = -3.58;
scene.add(ring);

// 接触阴影
const contact = new THREE.Mesh(
  new THREE.PlaneGeometry(16, 12),
  new THREE.MeshBasicMaterial({ map: shadowTexture(), transparent: true, opacity: 0.85, depthWrite: false })
);
contact.rotation.x = -Math.PI / 2;
contact.position.y = -3.56;
scene.add(contact);

/* ============================================================
   4. 模型
   ============================================================ */
setLoad(52, '生成 DJI Osmo Action 4 机身…');
const { root, parts } = buildAction4();
scene.add(root);

// 可点击网格
const clickable = [];
Object.values(parts).forEach(p => p.meshes.forEach(m => clickable.push(m)));

setLoad(74, '注册 16 个部件与标注…');
const labels = new LabelLayer(labelHost, svgLeaders);
const SHORT = {
  lensCap: '155° 光学玻璃盖', lensGroup: '155° f/2.8', frontCover: 'IP68 前壳',
  frontScreen: '1.4" 320×320', sensor: '1/1.3" CMOS', chassis: '铝合金中框',
  pcb: 'SoC · Wi-Fi 6', heatsink: '石墨烯导热', battery: '1770 mAh',
  screen: '2.25" 360×640', speaker: '48kHz 音频', micArray: '3 麦克风',
  rearCover: '硅胶密封圈', ioBoard: 'USB-C · 512GB', buttons: '电源 / QS / 录制',
  magneticBase: '1/4" 螺孔'
};
PARTS.forEach(p => labels.register(p.id, parts[p.id].anchor, p.name, SHORT[p.id] || '', p.color));

/* ============================================================
   5. 控制器
   ============================================================ */
const controls = new OrbitCam(camera, canvas);
controls.onUserInteract = () => stopDemo();

/* ---------- 自动取景：按目标状态（组装/拆解）的包围盒投影精确计算 ---------- */
let viewTheta = Math.PI * 0.28, viewPhi = Math.PI * 0.34;
const _size = new THREE.Vector3(), _center = new THREE.Vector3(),
      _dir = new THREE.Vector3(), _right = new THREE.Vector3(), _up = new THREE.Vector3(),
      _half = new THREE.Vector3(), _delta = new THREE.Vector3();

/** 计算目标状态下的整体包围盒（不受当前动画进度影响） */
function computeBox(explodedState) {
  const box = new THREE.Box3();
  Object.values(parts).forEach(p => {
    const g = p.group, b = p.base, e = p.explode;
    const lb = new THREE.Box3().setFromObject(g);
    _delta.set(explodedState ? e.x : 0, explodedState ? e.y : 0, explodedState ? e.z : 0);
    lb.translate(_delta);
    box.union(lb);
  });
  return box;
}

function frameAll(instant = false, useTarget = true) {
  const box = computeBox(useTarget ? exploded : false);
  if (box.isEmpty()) return;
  box.getSize(_size); box.getCenter(_center);
  const th = viewTheta, ph = viewPhi;
  _dir.set(Math.sin(ph) * Math.sin(th), Math.cos(ph), Math.sin(ph) * Math.cos(th));
  _right.set(Math.cos(th), 0, -Math.sin(th));
  _up.crossVectors(_right, _dir).normalize();
  _half.copy(_size).multiplyScalar(0.5);
  const projW = Math.abs(_half.x * _right.x) + Math.abs(_half.y * _right.y) + Math.abs(_half.z * _right.z);
  const projH = Math.abs(_half.x * _up.x) + Math.abs(_half.y * _up.y) + Math.abs(_half.z * _up.z);
  const tanV = Math.tan((camera.fov * Math.PI) / 360);
  const rV = projH / tanV;
  const rH = projW / (tanV * camera.aspect);
  const r = Math.max(rV, rH) * 1.16;
  controls.setView(th, ph, r, _center);
  if (instant) controls.focusOn(_center, r, true);
}

/* ============================================================
   6. 状态
   ============================================================ */
let exploded = false;
let explodeT = 0;
let selected = null;
let xray = false;
let demoT = null;

/* ---------- 高亮 ---------- */
const halo = new THREE.Sprite(new THREE.SpriteMaterial({
  map: glowTexture(), color: 0x22d3ee, transparent: true, opacity: 0,
  blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false
}));
halo.renderOrder = 999;
scene.add(halo);

function clearHighlight() {
  Object.values(parts).forEach(p => {
    p.meshes.forEach(m => {
      const s = m.userData._hl;
      if (s) {
        m.material.emissive.setHex(s.c);
        m.material.emissiveIntensity = s.i;
        m.userData._hl = null;
      }
    });
  });
  halo.material.opacity = 0;
}

function applyHighlight(id) {
  clearHighlight();
  const p = parts[id];
  if (!p) return;
  p.meshes.forEach(m => {
    if (!m.material.emissive) return;
    if (!m.userData._hl) {
      m.userData._hl = { c: m.material.emissive.getHex(), i: m.material.emissiveIntensity };
    }
    m.material.emissive.setHex(0x22d3ee);
    m.material.emissiveIntensity = 0.62;
  });
  // 光晕尺寸
  const box = new THREE.Box3().setFromObject(p.group);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  halo.position.copy(sphere.center);
  const s = Math.max(sphere.radius * 3.0, 1.6);
  halo.scale.set(s, s, 1);
  halo.material.opacity = 0.5;
}

/* ---------- 选中 ---------- */
function selectPart(id, { focus = true, keepDemo = false } = {}) {
  if (!keepDemo && demoT) stopDemo();
  if (selected === id) {
    if (focus) focusOn(id);
    return;
  }
  selected = id;
  applyHighlight(id);
  labels.setSelected(id);
  renderDetail(id);
  renderList();
  if (focus) focusOn(id);
  stSel.textContent = parts[id].def.name;
}

function deselect() {
  selected = null;
  clearHighlight();
  labels.setSelected(null);
  renderDetail(null);
  renderList();
  stSel.textContent = '—';
}

function focusOn(id) {
  const p = parts[id];
  const box = new THREE.Box3().setFromObject(p.group);
  const sphere = box.getBoundingSphere(new THREE.Sphere());
  const r = Math.max(sphere.radius * 3.4, 6.5);
  controls.focusOn(sphere.center, r);
}

/* ---------- 拆解 ---------- */
function setExploded(v) {
  exploded = v;
  stView.textContent = v ? '拆解' : '组装';
  $('#explodeLabel').textContent = v ? '组装' : '拆解';
  $('#btnExplode').classList.toggle('primary', !v);
  // 按目标状态重新取景（不等动画结束）
  frameAll(false);
}

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
function updateExplode(dt) {
  const goal = exploded ? 1 : 0;
  if (Math.abs(explodeT - goal) < 0.0005 && explodeT === goal) return;
  explodeT += (goal - explodeT) * Math.min(1, dt * 2.6);
  if (Math.abs(explodeT - goal) < 0.0005) explodeT = goal;

  const N = PARTS.length, span = 0.55;
  PARTS.forEach((p, i) => {
    const d = (i / N) * span;
    let local = (explodeT - d) / (1 - span);
    local = Math.max(0, Math.min(1, local));
    const e = easeOutCubic(local);
    const g = parts[p.id].group;
    const b = parts[p.id].base, ex = parts[p.id].explode;
    g.position.set(b.x + ex.x * e, b.y + ex.y * e, b.z + ex.z * e);
  });
}

/* ---------- 透视 ---------- */
function setXray(v) {
  xray = v;
  $('#btnXray').dataset.on = v;
  root.traverse(o => {
    if (!o.isMesh || !o.userData.xray) return;
    const m = o.material;
    if (v) {
      if (!m.userData._o) m.userData._o = { op: m.opacity, tr: m.transparent, dw: m.depthWrite };
      m.transparent = true;
      m.opacity = 0.14;
      m.depthWrite = false;
    } else if (m.userData._o) {
      m.opacity = m.userData._o.op;
      m.transparent = m.userData._o.tr;
      m.depthWrite = m.userData._o.dw;
      m.userData._o = null;
    }
  });
}

/* ============================================================
   7. UI 渲染
   ============================================================ */
function renderList() {
  partListEl.innerHTML = '';
  PARTS.forEach((p, i) => {
    const li = document.createElement('li');
    li.className = selected === p.id ? 'active' : '';
    li.innerHTML =
      `<span class="idx">${String(i + 1).padStart(2, '0')}</span>` +
      `<i class="swatch" style="background:${p.color};color:${p.color}"></i>` +
      `<span class="nm">${p.name}<em>${p.en}</em></span>`;
    li.addEventListener('click', () => {
      if (!exploded) setExploded(true);
      selectPart(p.id);
    });
    partListEl.appendChild(li);
  });
  $('#partCount').textContent = PARTS.length;
}

function renderDetail(id) {
  if (!id) {
    detailBody.innerHTML =
      `<div class="detail-empty"><div class="detail-empty-icon">◉</div>` +
      `<p>在模型上<b>点击任意部件</b>，<br />或从左侧清单中选择，<br />查看该部件的参数与说明。</p></div>`;
    detailPanel.classList.remove('open');
    inventoryPanel.classList.remove('hide-mobile');
    return;
  }
  const p = parts[id].def;
  detailBody.innerHTML =
    `<div class="d-title"><i class="d-swatch" style="background:${p.color};color:${p.color}"></i>` +
    `<div><h3>${p.name}</h3><div class="en">${p.en}</div></div></div>` +
    `<span class="d-cat">${p.cat}</span>` +
    `<div class="spec-table">${p.specs.map(([k, v]) =>
      `<div class="spec-row"><span class="k">${k}</span><span class="v">${v}</span></div>`).join('')}</div>` +
    `<p class="d-desc">${p.desc}</p>` +
    `<div class="d-actions">` +
    `<button class="d-btn" id="dFocus">在模型中定位</button>` +
    `<button class="d-btn ghost" id="dSolo">仅看此部件</button>` +
    `</div>`;
  $('#dFocus').addEventListener('click', () => focusOn(id));
  $('#dSolo').addEventListener('click', () => soloMode(id));
  detailPanel.classList.add('open');
  inventoryPanel.classList.add('hide-mobile');
}

let soloId = null;
function soloMode(id) {
  // 仅显示当前部件，其余半透明 ghost
  const on = soloId !== id;
  soloId = on ? id : null;
  Object.entries(parts).forEach(([pid, p]) => {
    const ghost = soloId && pid !== soloId;
    p.meshes.forEach(m => {
      if (!m.userData._g) m.userData._g = { op: m.material.opacity, tr: m.material.transparent, dw: m.material.depthWrite, v: m.visible };
      m.visible = true;
      if (ghost) {
        m.material.transparent = true;
        m.material.opacity = 0.07;
        m.material.depthWrite = false;
      } else {
        m.material.opacity = m.userData._g.op;
        m.material.transparent = m.userData._g.tr;
        m.material.depthWrite = m.userData._g.dw;
      }
    });
  });
  $('#dSolo').textContent = on ? '退出单独查看' : '仅看此部件';
  $('#dSolo').classList.toggle('ghost', !on);
  if (on) focusOn(id);
}

/* ============================================================
   8. 拾取
   ============================================================ */
const ray = new THREE.Raycaster();
const ndc = new THREE.Vector2();

canvas.addEventListener('pointerup', (e) => {
  if (!controls.isClick()) return;
  const rect = canvas.getBoundingClientRect();
  ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
  ray.setFromCamera(ndc, camera);
  const hits = ray.intersectObjects(clickable, false);
  for (const h of hits) {
    if (!h.object.visible) continue;
    const id = h.object.userData.partId;
    if (id) {
      if (!exploded) setExploded(true);
      selectPart(id);
      return;
    }
  }
  if (selected) deselect();
});

/* ============================================================
   9. 工具栏
   ============================================================ */
$('#btnExplode').addEventListener('click', () => {
  stopDemo();
  setExploded(!exploded);
  if (!exploded) deselect();
});
$('#btnSpin').addEventListener('click', (e) => {
  controls.autoRotate = !controls.autoRotate;
  e.currentTarget.dataset.on = controls.autoRotate;
});
$('#btnXray').addEventListener('click', (e) => setXray(!xray));
$('#btnLabels').addEventListener('click', (e) => {
  labels.visible = !labels.visible;
  e.currentTarget.dataset.on = labels.visible;
});
$('#btnReset').addEventListener('click', () => {
  stopDemo();
  setExploded(false);
  deselect();
  soloId = null;
  Object.values(parts).forEach(p => p.meshes.forEach(m => {
    if (m.userData._g) {
      m.material.opacity = m.userData._g.op;
      m.material.transparent = m.userData._g.tr;
      m.material.depthWrite = m.userData._g.dw;
      m.userData._g = null;
    }
  }));
  controls.setView(viewTheta, viewPhi, controls.radiusGoal, controls.targetGoal);
  frameAll(true);
});
$('#detailClose').addEventListener('click', () => deselect());

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { deselect(); stopDemo(); }
  if (e.key === ' ') { e.preventDefault(); $('#btnExplode').click(); }
  if (e.key === 'r' || e.key === 'R') $('#btnReset').click();
});

/* ============================================================
   10. 一键演示
   ============================================================ */
const demoToast = $('#demoToast');
$('#btnDemo').addEventListener('click', () => (demoT ? stopDemo() : startDemo()));

function startDemo() {
  stopDemo();
  setExploded(true);
  controls.autoRotate = false;
  $('#btnSpin').dataset.on = 'false';
  demoToast.classList.add('show');
  demoT = { phase: 0, t: 0, idx: -1 };
}

function stopDemo() {
  if (!demoT) return;
  demoT = null;
  demoToast.classList.remove('show');
}

function updateDemo(dt) {
  if (!demoT) return;
  demoT.t += dt;
  const D = demoT;
  if (D.phase === 0) {                       // 等拆解展开
    if (D.t > 1.1) { D.phase = 1; D.t = 0; D.idx = 0; }
  } else if (D.phase === 1) {                // 逐件讲解
    const STEP = 0.95;
    if (D.t >= STEP) {
      D.t = 0;
      D.idx++;
      if (D.idx >= DEMO_SEQUENCE.length) { D.phase = 2; D.t = 0; return; }
    }
    if (D.t < dt * 1.5) {
      const id = DEMO_SEQUENCE[D.idx];
      selectPart(id, { focus: true, keepDemo: true });
      $('#demoToastText').textContent =
        `自动演示 ${D.idx + 1}/${DEMO_SEQUENCE.length} · ${parts[id].def.name}`;
    }
  } else if (D.phase === 2) {                // 收尾复位
    if (D.t > 0.9) {
      setExploded(false);
      deselect();
      frameAll(true);
      stopDemo();
    }
  }
}

/* ============================================================
   11. 操作引导
   ============================================================ */
const GUIDE = [
  { ico: '①', t: '旋转视角', d: '按住左键拖拽即可 360° 旋转机身，滚轮缩放，右键平移。所有部件均由代码实时生成。' },
  { ico: '②', t: '拆解模型', d: '点击模型上任意部件，或点击底部「拆解」按钮，整机将分离为 16 个部件并呈现发光高亮。' },
  { ico: '③', t: '查看详情', d: '选中部件后，右侧面板展示该部件的官方参数与说明；左侧清单可快速定位任意部件。' },
  { ico: '④', t: '一键演示', d: '点击「一键演示」自动完成拆解并逐件讲解；按 Esc 取消选中，空格键切换拆解 / 组装。' }
];
let guideIdx = 0;
const guideDots = $('#guideDots');
GUIDE.forEach(() => guideDots.appendChild(document.createElement('i')));
function renderGuide() {
  guideDots.querySelectorAll('i').forEach((d, i) => d.classList.toggle('on', i <= guideIdx));
  $('#guideIco').textContent = GUIDE[guideIdx].ico;
  $('#guideTitle').textContent = GUIDE[guideIdx].t;
  $('#guideText').textContent = GUIDE[guideIdx].d;
  $('#guideNext').textContent = guideIdx === GUIDE.length - 1 ? '开始体验' : '下一步';
}
$('#guideNext').addEventListener('click', () => {
  guideIdx++;
  if (guideIdx >= GUIDE.length) $('#guide').classList.add('hide');
  else renderGuide();
});
$('#guideSkip').addEventListener('click', () => $('#guide').classList.add('hide'));

/* ============================================================
   12. 主循环
   ============================================================ */
let lastT = performance.now();
let fpsAcc = 0, fpsCnt = 0, fpsT = 0;

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  frameAll(false);
}
window.addEventListener('resize', resize);
resize();

function animate() {
  requestAnimationFrame(animate);
  const now = performance.now();
  const dt = Math.min((now - lastT) / 1000, 0.05);
  lastT = now;

  updateExplode(dt);
  updateDemo(dt);
  controls.update(dt);

  // 选中光晕呼吸
  if (selected) {
    const s = 0.5 + Math.sin(performance.now() * 0.0035) * 0.12;
    halo.material.opacity = s;
  }
  // 星点缓慢自转
  stars.rotation.y += dt * 0.008;
  ring.material.opacity = 0.08 + Math.sin(performance.now() * 0.0016) * 0.025;

  const w = window.innerWidth, h = window.innerHeight;
  labels.update(camera, exploded ? 'exploded' : 'assembled', w, h);

  renderer.render(scene, camera);

  // FPS
  fpsAcc += dt; fpsCnt++; fpsT += dt;
  if (fpsT > 0.5) {
    stFps.textContent = Math.round(fpsCnt / fpsAcc) + ' fps';
    fpsAcc = 0; fpsCnt = 0; fpsT = 0;
  }
}

/* ============================================================
   13. 启动
   ============================================================ */
renderList();
renderDetail(null);
setExploded(false);
frameAll(true);
setLoad(92, '编译着色器…');
renderer.compile(scene, camera);
setLoad(100, '完成');
animate();

setTimeout(() => {
  loader.classList.add('hide');
  setTimeout(() => { loader.style.display = 'none'; renderGuide(); }, 700);
}, 320);

// 调试 / 自动化钩子
window.__demo = { controls, parts, scene, camera, renderer, root, frameAll, setExploded, selectPart, deselect, labels };
