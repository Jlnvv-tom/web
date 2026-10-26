/**
 * DJI Osmo Action 4 程序化 3D 模型
 * 所有几何体与贴图均由代码生成，无任何外部 3D 模型文件
 *
 * 比例：1 unit = 10 mm
 * 整机 70.5 × 44.2 × 32.8 mm  →  7.05(x) × 4.42(z) × 3.28(y)
 *   +Z = 正面（镜头 / 前屏）   +X = 右侧（按键）   +Y = 顶部
 */
import * as THREE from 'three';
import { PARTS } from './data.js';
import {
  roundedBox, envTexture, logoTexture, rearScreenTexture, frontScreenTexture,
  batteryLabelTexture, pcbTexture, sensorTexture, grapheneTexture, meshTexture
} from './geom.js';

const W = 7.05, H = 3.28, D = 4.42;   // 长 / 高 / 宽
const HX = W / 2, HY = H / 2, HZ = D / 2;

/* ---------- 形状工具 ---------- */
function roundedRectShape(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  r = Math.min(r, w / 2, h / 2);
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  return s;
}
function roundedRectPath(w, h, r, cx = 0, cy = 0) {
  const p = new THREE.Path();
  const x = cx - w / 2, y = cy - h / 2;
  r = Math.min(r, w / 2, h / 2);
  p.moveTo(x + r, y);
  p.lineTo(x + w - r, y);
  p.quadraticCurveTo(x + w, y, x + w, y + r);
  p.lineTo(x + w, y + h - r);
  p.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  p.lineTo(x + r, y + h);
  p.quadraticCurveTo(x, y + h, x, y + h - r);
  p.lineTo(x, y + r);
  p.quadraticCurveTo(x, y, x + r, y);
  return p;
}
function circlePath(cx, cy, r) {
  const p = new THREE.Path();
  p.absarc(cx, cy, r, 0, Math.PI * 2, true);
  return p;
}
/** 带孔圆角框（挤出） */
function frameGeometry(w, h, d, r, holes) {
  const shape = roundedRectShape(w, h, r);
  holes.forEach(h => shape.holes.push(h));
  const bevel = 0.045;
  const depth = d - bevel * 2;
  const g = new THREE.ExtrudeGeometry(shape, {
    depth, bevelEnabled: true, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 2, curveSegments: 7
  });
  g.translate(0, 0, -depth / 2);
  g.computeVertexNormals();
  return g;
}

/* ---------- 材质工厂（每个部件独立材质，便于独立高亮） ---------- */
const std = (o) => new THREE.MeshStandardMaterial(o);

const MAT = {
  shell:      () => std({ color: 0x3a414b, metalness: 0.42, roughness: 0.46 }),
  shellDark:  () => std({ color: 0x262c35, metalness: 0.5, roughness: 0.4 }),
  frameMetal: () => std({ color: 0x8a939e, metalness: 0.92, roughness: 0.3 }),
  frameDark:  () => std({ color: 0x3a4149, metalness: 0.7, roughness: 0.42 }),
  lensBarrel: () => std({ color: 0x14181f, metalness: 0.55, roughness: 0.55, side: THREE.DoubleSide }),
  glass:      () => std({ color: 0x9fd8ff, metalness: 0.95, roughness: 0.06, transparent: true, opacity: 0.34 }),
  glassSolid: () => std({ color: 0x0d1219, metalness: 0.3, roughness: 0.15 }),
  pcb:        () => std({ map: pcbTexture(), color: 0xffffff, metalness: 0.25, roughness: 0.7 }),
  chip:       () => std({ color: 0x101418, metalness: 0.4, roughness: 0.5 }),
  chipGold:   () => std({ color: 0xc9a227, metalness: 0.95, roughness: 0.28 }),
  sensor:     () => std({ map: sensorTexture(), color: 0xffffff, metalness: 0.55, roughness: 0.35 }),
  graphene:   () => std({ map: grapheneTexture(), color: 0xffffff, metalness: 0.3, roughness: 0.8 }),
  battery:    () => std({ color: 0x2b2f38, metalness: 0.3, roughness: 0.6 }),
  battLabel:  () => std({ map: batteryLabelTexture(), color: 0xffffff, roughness: 0.75, metalness: 0.05 }),
  rubber:      () => std({ color: 0x0e1116, metalness: 0.1, roughness: 0.9 }),
  speaker:    () => std({ color: 0x1a1f27, metalness: 0.5, roughness: 0.6 }),
  mic:        () => std({ color: 0x0b0e13, metalness: 0.6, roughness: 0.5 }),
  button:     () => std({ color: 0x4b525c, metalness: 0.7, roughness: 0.35 }),
  buttonRed:  () => std({ color: 0xd93a3a, metalness: 0.35, roughness: 0.4 }),
  magnet:     () => std({ color: 0x9aa3ad, metalness: 0.95, roughness: 0.22 }),
  flex:       () => std({ color: 0xd8a24a, metalness: 0.7, roughness: 0.45 })
};

/* ---------- 模型构建 ---------- */
export function buildAction4() {
  const root = new THREE.Group();
  const parts = {};
  let meshIdx = 0;

  /** 注册一个部件 */
  function register(id, buildFn) {
    const def = PARTS.find(p => p.id === id);
    const g = new THREE.Group();
    g.userData.partId = id;
    buildFn(g);
    const base = def.base;
    g.position.set(base[0], base[1], base[2]);
    root.add(g);

    const meshes = [];
    g.traverse(o => { if (o.isMesh) { o.userData.partId = id; o.userData.meshIdx = meshIdx++; meshes.push(o); } });
    const anchor = new THREE.Object3D();
    anchor.position.fromArray(def.anchor);
    g.add(anchor);
    parts[id] = {
      id, group: g, meshes, anchor,
      base: new THREE.Vector3(...base),
      explode: new THREE.Vector3(...def.explode),
      def
    };
  }

  /* ========== 1. 镜头保护玻璃 ========== */
  register('lensCap', (g) => {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.72, 0.075, 14, 48),
      std({ color: 0x6b7683, metalness: 0.95, roughness: 0.25 })
    );
    ring.position.z = 0.09; g.add(ring);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.70, 48), MAT.glass());
    glass.position.z = 0.06; g.add(glass);
    const inner = new THREE.Mesh(new THREE.CircleGeometry(0.60, 48), MAT.glassSolid());
    inner.position.z = 0.055; g.add(inner);
    const dot = new THREE.Mesh(new THREE.CircleGeometry(0.075, 24),
      std({ color: 0x22d3ee, emissive: 0x22d3ee, emissiveIntensity: 0.7, roughness: 0.4 }));
    dot.position.set(0, 0.30, 0.075); g.add(dot);
  });

  /* ========== 2. 镜片组 ========== */
  register('lensGroup', (g) => {
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.60, 0.58, 0.86, 40, 1, true), MAT.lensBarrel());
    barrel.rotation.x = Math.PI / 2; g.add(barrel);

    const rings = [[0.545, -0.30, 0x0e1a26], [0.50, -0.10, 0x14314a], [0.455, 0.10, 0x0e1a26], [0.40, 0.30, 0x1b3d58]];
    rings.forEach(([r, z, col], i) => {
      const lens = new THREE.Mesh(new THREE.SphereGeometry(r, 32, 20, 0, Math.PI * 2, 0, Math.PI * 0.42),
        std({ color: col, metalness: 0.9, roughness: 0.08, transparent: true, opacity: 0.55, side: THREE.DoubleSide }));
      lens.rotation.x = -Math.PI / 2;
      lens.position.z = z;
      lens.scale.z = 0.55;
      g.add(lens);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.018, 8, 40),
        std({ color: 0x1b222c, metalness: 0.8, roughness: 0.3 }));
      rim.position.z = z + 0.02; g.add(rim);
      // 镀膜反光
      const coat = new THREE.Mesh(new THREE.CircleGeometry(r * 0.92, 32),
        std({ color: i % 2 ? 0x2f7fa8 : 0x1b4a6b, metalness: 0.2, roughness: 0.05,
             transparent: true, opacity: 0.22, side: THREE.DoubleSide }));
      coat.position.z = z + 0.035; g.add(coat);
    });
    const rear = new THREE.Mesh(new THREE.CircleGeometry(0.52, 32), MAT.glassSolid());
    rear.position.z = -0.40; g.add(rear);
  });

  /* ========== 3. 前面板（前壳） ========== */
  register('frontCover', (g) => {
    const geo = frameGeometry(W, H, 1.45, 0.30, [
      circlePath(0, 0.72, 0.62),
      roundedRectPath(2.25, 1.55, 0.18, 0, -0.70)
    ]);
    const shell = new THREE.Mesh(geo, MAT.shell());
    shell.userData.xray = true;
    g.add(shell);

    // 镜头内筒
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.68, 0.60, 1.15, 36, 1, true), MAT.lensBarrel());
    barrel.rotation.x = Math.PI / 2; barrel.position.set(0, 0.72, 0.42); g.add(barrel);
    // 镜头外圈装饰环
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.70, 0.045, 12, 44),
      std({ color: 0x767f8b, metalness: 0.95, roughness: 0.22 }));
    ring.position.set(0, 0.72, 0.99); g.add(ring);
    // 前屏窗口内的遮光板（归属前屏部件，随屏一起拆解）
    const back = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.9),
      std({ color: 0x05070b, roughness: 0.9, metalness: 0.1 }));
    back.position.set(0, 0, -0.10); back.rotation.y = Math.PI; g.add(back);

    // 品牌标识（略微前移避免与壳面共面闪烁）
    const logo = new THREE.Mesh(new THREE.PlaneGeometry(1.85, 0.58),
      std({ map: logoTexture(), transparent: true, roughness: 0.65, metalness: 0.15 }));
    logo.position.set(1.66, 0.72, 0.742); g.add(logo);

    // 侧面散热/防滑纹理
    [-1, 1].forEach(s => {
      for (let i = 0; i < 5; i++) {
        const t = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.05, 0.05),
          std({ color: 0x14171d, roughness: 0.85, metalness: 0.2 }));
        t.position.set(s * 2.55, -0.85 + i * 0.14, 0.72);
        g.add(t);
      }
    });
  });

  /* ========== 4. 前置触控屏 ========== */
  register('frontScreen', (g) => {
    const bezel = new THREE.Mesh(roundedBox(2.55, 1.85, 0.16, 0.06, 0.03), std({ color: 0x05070b, roughness: 0.7 }));
    g.add(bezel);
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(2.35, 1.62),
      new THREE.MeshBasicMaterial({ map: frontScreenTexture(), toneMapped: false }));
    scr.position.z = 0.085; g.add(scr);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(2.7, 2.0),
      new THREE.MeshBasicMaterial({ color: 0x0d3a4a, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.position.z = 0.07; g.add(glow);
    g.userData.xray = true;
  });

  /* ========== 5. 影像传感器 ========== */
  register('sensor', (g) => {
    const board = new THREE.Mesh(roundedBox(1.15, 0.92, 0.10, 0.04, 0.02), std({ color: 0x0d2a1c, roughness: 0.75, metalness: 0.2 }));
    g.add(board);
    const die = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.78),
      std({ map: sensorTexture(), metalness: 0.6, roughness: 0.3 }));
    die.position.z = 0.055; g.add(die);
    const frame = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.022, 8, 36),
      std({ color: 0xc9a227, metalness: 0.95, roughness: 0.25 }));
    frame.position.z = 0.056; g.add(frame);
    // FPC 软排线连至主板
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, -0.30, 0.02),
      new THREE.Vector3(0.25, -0.55, -0.35),
      new THREE.Vector3(0.95, -0.62, -0.95),
      new THREE.Vector3(1.55, -0.28, -1.05)
    ]);
    const flex = new THREE.Mesh(new THREE.TubeGeometry(curve, 28, 0.045, 8, false), MAT.flex());
    g.add(flex);
  });

  /* ========== 6. 机身中框（金属，含录制键） ========== */
  register('chassis', (g) => {
    const mk = (w, h, d, x, y, z) => {
      const m = new THREE.Mesh(roundedBox(w, h, d, 0.06, 0.03), MAT.frameMetal());
      m.position.set(x, y, z); g.add(m);
    };
    mk(6.9, 0.15, 1.65, 0, 1.565, 0);     // 顶
    mk(6.9, 0.15, 1.65, 0, -1.565, 0);    // 底
    mk(0.15, 3.0, 1.65, -3.45, 0, 0);     // 左
    mk(0.15, 3.0, 1.65, 3.45, 0, 0);      // 右
    // 中框内部散热格栅
    [-1, 1].forEach(s => {
      for (let i = 0; i < 7; i++) {
        const v = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.035, 0.035),
          std({ color: 0x5a636e, metalness: 0.9, roughness: 0.35 }));
        v.position.set(s * 2.5, -0.9 + i * 0.13, 0.83);
        g.add(v);
      }
    });
    // 顶部录制键（不随侧键拆解）
    const rec = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.15, 28), MAT.buttonRed());
    rec.position.set(0, 1.685, 0); g.add(rec);
    const recRing = new THREE.Mesh(new THREE.TorusGeometry(0.20, 0.028, 10, 32),
      std({ color: 0x2a2f36, metalness: 0.85, roughness: 0.3 }));
    recRing.rotation.x = Math.PI / 2; recRing.position.set(0, 1.66, 0); g.add(recRing);
    const recLed = new THREE.Mesh(new THREE.CircleGeometry(0.05, 20),
      std({ color: 0xff4d4f, emissive: 0xff4d4f, emissiveIntensity: 0.9, roughness: 0.4 }));
    recLed.position.set(0, 1.762, 0); recLed.rotation.x = -Math.PI / 2; g.add(recLed);
  });

  /* ========== 7. 主板 ========== */
  register('pcb', (g) => {
    const board = new THREE.Mesh(roundedBox(6.4, 2.0, 0.16, 0.05, 0.02), MAT.pcb());
    g.add(board);
    // SoC
    const soc = new THREE.Mesh(roundedBox(1.05, 1.05, 0.16, 0.04, 0.02), MAT.chip());
    soc.position.set(1.55, 0.42, 0.15); g.add(soc);
    const socTop = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8),
      std({ color: 0x1d232b, metalness: 0.9, roughness: 0.25 }));
    socTop.position.set(1.55, 0.42, 0.235); socTop.rotation.x = -Math.PI / 2; g.add(socTop);
    const socMark = new THREE.Mesh(new THREE.CircleGeometry(0.09, 20), MAT.chipGold());
    socMark.position.set(1.30, 0.60, 0.238); socMark.rotation.x = -Math.PI / 2; g.add(socMark);
    // 无线模组屏蔽罩
    const shield = new THREE.Mesh(roundedBox(1.5, 1.1, 0.2, 0.04, 0.02),
      std({ color: 0x9aa3ad, metalness: 0.95, roughness: 0.24 }));
    shield.position.set(-1.85, 0.30, 0.14); g.add(shield);
    // 存储卡插槽金手指
    const sd = new THREE.Mesh(roundedBox(1.35, 0.13, 0.14, 0.03, 0.02), MAT.chipGold());
    sd.position.set(-2.6, -0.62, 0.13); g.add(sd);
    // 电容 / 电阻
    const caps = [[-0.6, 0.62], [0.35, -0.62], [2.75, -0.55], [2.85, 0.55], [-0.2, -0.6]];
    caps.forEach(([x, y]) => {
      const c = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.2, 14),
        std({ color: 0x2a2f38, metalness: 0.5, roughness: 0.55 }));
      c.rotation.x = Math.PI / 2; c.position.set(x, y, 0.14); g.add(c);
      const t = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.012, 14), MAT.chipGold());
      t.rotation.x = Math.PI / 2; t.position.set(x, y, 0.245); g.add(t);
    });
    // 电池触点
    [-1.2, 1.2].forEach(x => {
      const p = new THREE.Mesh(roundedBox(0.5, 0.16, 0.1, 0.03, 0.02), MAT.chipGold());
      p.position.set(x, -0.95, 0.12); g.add(p);
    });
  });

  /* ========== 8. 石墨烯散热层 ========== */
  register('heatsink', (g) => {
    const sheet = new THREE.Mesh(roundedBox(6.0, 0.17, 1.75, 0.05, 0.02), MAT.graphene());
    g.add(sheet);
    for (let i = 0; i < 5; i++) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.03, 0.03),
        std({ color: 0xf472b6, emissive: 0xf472b6, emissiveIntensity: 0.25, roughness: 0.6 }));
      line.position.set(0, 0.06, -0.7 + i * 0.35); g.add(line);
    }
  });

  /* ========== 9. 内置锂电池 ========== */
  register('battery', (g) => {
    const cell = new THREE.Mesh(roundedBox(6.4, 1.1, 2.0, 0.12, 0.05), MAT.battery());
    g.add(cell);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2), MAT.battLabel());
    label.position.set(0, 0, 1.005); g.add(label);
    const labelBack = new THREE.Mesh(new THREE.PlaneGeometry(4.4, 2.2),
      std({ map: batteryLabelTexture(), color: 0x8a8f99, roughness: 0.8 }));
    labelBack.position.set(0, 0, -1.005); labelBack.rotation.y = Math.PI; g.add(labelBack);
    // 极耳
    [-1.9, 1.9].forEach(x => {
      const tab = new THREE.Mesh(roundedBox(0.35, 0.3, 0.12, 0.04, 0.02), MAT.chipGold());
      tab.position.set(x, 0.6, 0); g.add(tab);
    });
  });

  /* ========== 10. 后置触控主屏 ========== */
  register('screen', (g) => {
    const bezel = new THREE.Mesh(roundedBox(4.1, 2.65, 0.14, 0.07, 0.03), std({ color: 0x05070b, roughness: 0.7 }));
    g.add(bezel);
    // 屏幕发光面朝 -Z（从机身后方观看），置于组件最外侧
    const scr = new THREE.Mesh(new THREE.PlaneGeometry(3.9, 2.45),
      new THREE.MeshBasicMaterial({ map: rearScreenTexture(), toneMapped: false }));
    scr.position.z = -0.078; scr.rotation.y = Math.PI; g.add(scr);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(4.25, 2.8),
      new THREE.MeshBasicMaterial({ color: 0x2ad0ee, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
    glow.position.z = -0.088; glow.rotation.y = Math.PI; g.add(glow);
    g.userData.xray = true;
  });

  /* ========== 11. 扬声器 ========== */
  register('speaker', (g) => {
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.24, 32), MAT.speaker());
    body.rotation.x = Math.PI / 2; g.add(body);
    const meshMat = std({ color: 0xffffff, map: meshTexture(), transparent: true, alphaMap: meshTexture(), roughness: 0.8, metalness: 0.2 });
    const grille = new THREE.Mesh(new THREE.CircleGeometry(0.36, 32), meshMat);
    grille.position.z = 0.125; g.add(grille);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.022, 10, 36),
      std({ color: 0x767f8b, metalness: 0.9, roughness: 0.3 }));
    rim.position.z = 0.12; g.add(rim);
  });

  /* ========== 12. 麦克风阵列 ========== */
  register('micArray', (g) => {
    const pos = [[-2.2, 0.39, 0.2], [2.2, 0.39, 0.2], [0, 0.39, -1.8]];
    pos.forEach(([x, y, z], i) => {
      const hole = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.09, 0.16, 18), MAT.mic());
      hole.position.set(x, y, z); g.add(hole);
      const mesh2 = new THREE.Mesh(new THREE.CircleGeometry(0.085, 18),
        std({ color: 0x1a3a3a, map: meshTexture(), roughness: 0.7, metalness: 0.3 }));
      mesh2.position.set(x, y + 0.085, z); mesh2.rotation.x = -Math.PI / 2; g.add(mesh2);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.014, 8, 20),
        std({ color: 0x2dd4bf, emissive: 0x2dd4bf, emissiveIntensity: 0.35, roughness: 0.5 }));
      ring.rotation.x = Math.PI / 2; ring.position.set(x, y + 0.09, z); g.add(ring);
    });
  });

  /* ========== 13. 后盖 ========== */
  register('rearCover', (g) => {
    const geo = frameGeometry(W, H, 0.9, 0.30, [
      roundedRectPath(4.1, 2.6, 0.16, 0, 0.45),
      circlePath(0, -1.22, 0.38)
    ]);
    const shell = new THREE.Mesh(geo, MAT.shellDark());
    shell.userData.xray = true;
    g.add(shell);
    // 屏幕后遮光板（位于屏幕之后，兼作屏幕边框）
    const back = new THREE.Mesh(new THREE.PlaneGeometry(4.35, 2.85), std({ color: 0x05070b, roughness: 0.9 }));
    back.position.set(0, 0.45, 0.60); back.rotation.y = Math.PI; g.add(back);
    // 硅胶密封圈（矩形胶圈）
    const sealShape = roundedRectShape(6.86, 3.09, 0.28);
    sealShape.holes.push(roundedRectPath(6.52, 2.75, 0.24));
    const sealGeo = new THREE.ExtrudeGeometry(sealShape, {
      depth: 0.05, bevelEnabled: false, curveSegments: 7
    });
    sealGeo.translate(0, 0, -0.025);
    const seal = new THREE.Mesh(sealGeo, std({ color: 0x0a0d12, roughness: 0.95, metalness: 0.05 }));
    seal.position.z = 0.44; g.add(seal);
    // 卡扣
    [-1.6, 1.6].forEach(x => {
      const c = new THREE.Mesh(roundedBox(0.35, 0.2, 0.12, 0.04, 0.02),
        std({ color: 0x1b2027, metalness: 0.5, roughness: 0.6 }));
      c.position.set(x, 1.5, 0.48); g.add(c);
    });
  });

  /* ========== 14. 接口板 ========== */
  register('ioBoard', (g) => {
    const plate = new THREE.Mesh(roundedBox(0.2, 1.85, 2.5, 0.06, 0.02), std({ color: 0x141922, metalness: 0.5, roughness: 0.55 }));
    g.add(plate);
    // USB-C
    const usbBody = new THREE.Mesh(roundedBox(0.24, 0.46, 0.78, 0.06, 0.02), std({ color: 0x0a0d12, metalness: 0.4, roughness: 0.7 }));
    usbBody.position.set(0.09, 0.35, -0.45); g.add(usbBody);
    const usbTongue = new THREE.Mesh(roundedBox(0.16, 0.3, 0.6, 0.03, 0.01), MAT.chipGold());
    usbTongue.position.set(0.12, 0.35, -0.45); g.add(usbTongue);
    // microSD 卡槽
    const sd = new THREE.Mesh(roundedBox(0.22, 0.34, 1.0, 0.05, 0.02), std({ color: 0x0a0d12, metalness: 0.4, roughness: 0.7 }));
    sd.position.set(0.09, -0.5, 0.25); g.add(sd);
    const sdLip = new THREE.Mesh(roundedBox(0.2, 0.1, 0.9, 0.03, 0.01), std({ color: 0x3a4149, metalness: 0.8, roughness: 0.4 }));
    sdLip.position.set(0.13, -0.5, 0.25); g.add(sdLip);
    // 接口保护盖（翻开示意）
    const flap = new THREE.Mesh(roundedBox(0.06, 0.9, 2.2, 0.05, 0.02), std({ color: 0x1b2027, metalness: 0.3, roughness: 0.75 }));
    flap.position.set(-0.12, 0, 0); g.add(flap);
  });

  /* ========== 15. 按键组 ========== */
  register('buttons', (g) => {
    const mk = (y, z, r, h, mat) => {
      const b = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, 24), mat);
      b.rotation.z = Math.PI / 2; b.position.set(0.07, y, z); g.add(b);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(r + 0.03, 0.022, 8, 24),
        std({ color: 0x767f8b, metalness: 0.9, roughness: 0.3 }));
      ring.rotation.y = Math.PI / 2; ring.position.set(0.03, y, z); g.add(ring);
    };
    mk(0.62, 0.55, 0.17, 0.12, MAT.button());      // 电源键
    mk(0.62, -0.45, 0.17, 0.12, MAT.button());     // QS 键
    // 侧面防滑纹
    for (let i = 0; i < 4; i++) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.05, 1.4, 0.04),
        std({ color: 0x14171d, roughness: 0.9, metalness: 0.2 }));
      t.position.set(0.02, -0.55, -1.1 + i * 0.22); g.add(t);
    }
  });

  /* ========== 16. 磁吸快拆底座 ========== */
  register('magneticBase', (g) => {
    const puck = new THREE.Mesh(roundedBox(3.4, 0.62, 2.4, 0.14, 0.05), std({ color: 0x22262e, metalness: 0.6, roughness: 0.45 }));
    puck.position.y = -0.31; g.add(puck);
    const plate = new THREE.Mesh(roundedBox(3.1, 0.12, 2.1, 0.06, 0.03), MAT.magnet());
    plate.position.y = -0.60; g.add(plate);
    // 磁吸点
    [[-0.85, 0.6], [0.85, 0.6], [0, -0.6]].forEach(([x, z]) => {
      const m = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.08, 22),
        std({ color: 0xb9c2cc, metalness: 0.98, roughness: 0.18 }));
      m.position.set(x, -0.65, z); g.add(m);
    });
    // 对准限位耳
    [-1, 1].forEach(s => {
      const tab = new THREE.Mesh(roundedBox(0.28, 0.3, 0.7, 0.05, 0.02),
        std({ color: 0x8a939e, metalness: 0.9, roughness: 0.3 }));
      tab.position.set(s * 1.5, -0.05, 0.95); g.add(tab);
    });
    // 1/4" 螺孔
    const thread = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.2, 20),
      std({ color: 0x05070b, metalness: 0.5, roughness: 0.8 }));
    thread.position.y = -0.72; g.add(thread);
  });

  return { root, parts };
}

/** 环境反射（程序化生成，金属材质必需） */
export function buildEnvironment(renderer) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromEquirectangular(envTexture()).texture;
  pmrem.dispose();
  return tex;
}
