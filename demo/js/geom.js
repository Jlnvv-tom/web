/**
 * 程序化几何 / 贴图工具
 * 全部由代码生成，不加载任何外部 3D 模型或图片资源
 */
import * as THREE from 'three';

/* ---------- 圆角盒体（Z 轴挤出） ---------- */
export function roundedBox(w, h, d, r = 0.1, bevel = 0.05) {
  r = Math.min(r, w / 2 - 0.001, h / 2 - 0.001);
  bevel = Math.min(bevel, r * 0.8);
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y);
  s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r);
  s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h);
  s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r);
  s.quadraticCurveTo(x, y, x + r, y);
  const depth = Math.max(0.001, d - bevel * 2);
  const geo = new THREE.ExtrudeGeometry(s, {
    depth, bevelEnabled: true, bevelThickness: bevel,
    bevelSize: bevel, bevelSegments: 2, curveSegments: 6
  });
  geo.translate(0, 0, -depth / 2);
  geo.computeVertexNormals();
  return geo;
}

/* ---------- 圆角圆柱 ---------- */
export function roundedCyl(rTop, rBottom, h, seg = 32) {
  const g = new THREE.CylinderGeometry(rTop, rBottom, h, seg, 1, false);
  return g;
}

/* ---------- Canvas 贴图工厂 ---------- */
function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return { c, ctx: c.getContext('2d') };
}
function finish(c, { srgb = true, repeat = null } = {}) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}

/** 环境反射贴图（等距柱状，用于金属反射） */
export function envTexture() {
  const { c, ctx } = canvas(1024, 512);
  const g = ctx.createLinearGradient(0, 0, 0, 512);
  g.addColorStop(0.00, '#0b1a2b');
  g.addColorStop(0.42, '#164a63');
  g.addColorStop(0.50, '#1e7a8c');
  g.addColorStop(0.58, '#0d2436');
  g.addColorStop(1.00, '#02060c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 1024, 512);
  // 光源亮斑，让金属有方向感
  const blobs = [
    [170, 150, 210, 'rgba(120,235,255,0.95)'],
    [620, 110, 260, 'rgba(255,190,120,0.75)'],
    [880, 330, 190, 'rgba(120,170,255,0.55)'],
    [380, 400, 150, 'rgba(255,120,90,0.35)']
  ];
  blobs.forEach(([x, y, r, col]) => {
    const rg = ctx.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, col); rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  });
  // 顶部冷光带
  const rg2 = ctx.createLinearGradient(0, 0, 0, 90);
  rg2.addColorStop(0, 'rgba(150,220,255,0.35)'); rg2.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = rg2; ctx.fillRect(0, 0, 1024, 90);
  const t = finish(c);
  t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

/** DJI 品牌标识（前壳贴花） */
export function logoTexture() {
  const { c, ctx } = canvas(512, 160);
  ctx.clearRect(0, 0, 512, 160);
  ctx.fillStyle = 'rgba(226,238,248,0.92)';
  ctx.font = '700 62px -apple-system, "PingFang SC", sans-serif';
  ctx.textBaseline = 'middle';
  ctx.letterSpacing = '6px';
  ctx.fillText('DJI', 8, 52);
  ctx.letterSpacing = '0px';
  ctx.fillStyle = 'rgba(160,185,210,0.85)';
  ctx.font = '500 26px -apple-system, "PingFang SC", sans-serif';
  ctx.fillText('Osmo Action 4', 8, 108);
  return finish(c);
}

/** 后置主屏 UI（竖屏 9:16） */
export function rearScreenTexture(rec = true) {
  const { c, ctx } = canvas(360, 640);
  // 取景器背景（提亮，模拟点亮的屏幕）
  const g = ctx.createLinearGradient(0, 0, 0, 640);
  g.addColorStop(0, '#1d5f7a'); g.addColorStop(0.42, '#2a8098');
  g.addColorStop(0.55, '#4aa8b4'); g.addColorStop(1, '#0f2c3a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 360, 640);

  // 天空/地面分层，模拟超广视角
  ctx.fillStyle = 'rgba(255,205,140,0.42)';
  ctx.beginPath(); ctx.arc(180, 400, 150, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(12,34,46,0.62)';
  ctx.fillRect(0, 470, 360, 170);

  // 顶部状态栏
  ctx.fillStyle = 'rgba(0,0,0,0.42)'; ctx.fillRect(0, 0, 360, 46);
  ctx.font = '600 17px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = '#eafaff'; ctx.textBaseline = 'middle';
  ctx.fillText('4K · 60', 14, 24);
  // 电池图标
  ctx.strokeStyle = '#eafaff'; ctx.lineWidth = 1.6;
  ctx.strokeRect(300, 14, 26, 13); ctx.fillStyle = '#5ef08a'; ctx.fillRect(303, 17, 16, 7);
  ctx.fillStyle = '#eafaff'; ctx.fillRect(327, 17, 2.5, 7);
  // Wi-Fi 弧线
  ctx.strokeStyle = '#eafaff'; ctx.lineWidth = 2.2;
  for (let i = 1; i <= 3; i++) {
    ctx.beginPath(); ctx.arc(268, 30, i * 4.5, -Math.PI * 0.32, -Math.PI * 0.68); ctx.stroke();
  }
  // SD 卡
  ctx.font = '500 12px -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(234,250,255,0.85)';
  ctx.fillText('SD 128G', 200, 24);

  // 中央 REC 指示
  if (rec) {
    ctx.fillStyle = '#ff4d4f';
    ctx.beginPath(); ctx.arc(50, 88, 9, 0, Math.PI * 2); ctx.fill();
    ctx.font = '700 22px -apple-system, sans-serif';
    ctx.fillStyle = '#ff7b7c';
    ctx.fillText('REC', 66, 89);
    ctx.font = '500 15px ui-monospace, monospace';
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    ctx.fillText('00:12:07', 66, 114);
  }

  // 地平线增稳参考线
  ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 1.2;
  ctx.setLineDash([7, 6]);
  ctx.beginPath(); ctx.moveTo(0, 452); ctx.lineTo(360, 452); ctx.stroke();
  ctx.setLineDash([]);

  // 底部模式条
  ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 560, 360, 80);
  const modes = ['录像', '拍照', '慢动作', '延时'];
  ctx.font = '500 14px -apple-system, "PingFang SC", sans-serif';
  modes.forEach((m, i) => {
    const x = 30 + i * 88;
    if (i === 0) {
      ctx.fillStyle = 'rgba(34,211,238,0.32)';
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(x - 12, 578, 70, 26, 13); else ctx.rect(x - 12, 578, 70, 26);
      ctx.fill();
      ctx.fillStyle = '#5eead4';
    } else {
      ctx.fillStyle = 'rgba(234,250,255,0.62)';
    }
    ctx.textAlign = 'center';
    ctx.fillText(m, x + 23, 591);
    ctx.textAlign = 'left';
  });
  return finish(c);
}

/** 前置小屏 UI（方形 1:1） */
export function frontScreenTexture() {
  const { c, ctx } = canvas(320, 320);
  const g = ctx.createLinearGradient(0, 0, 0, 320);
  g.addColorStop(0, '#1a5568'); g.addColorStop(1, '#0c2a38');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 320, 320);
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  ctx.beginPath(); ctx.arc(160, 150, 74, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(94,234,212,0.75)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(160, 150, 74, 0, Math.PI * 2); ctx.stroke();

  ctx.fillStyle = '#ff4d4f';
  ctx.beginPath(); ctx.arc(106, 82, 8, 0, Math.PI * 2); ctx.fill();
  ctx.font = '700 20px -apple-system, sans-serif';
  ctx.fillStyle = '#ff8b8c';
  ctx.fillText('REC', 122, 83);

  ctx.font = '600 16px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = 'rgba(234,250,255,0.92)';
  ctx.textAlign = 'center';
  ctx.fillText('4K · 60fps', 160, 256);
  ctx.fillText('155° 超广角', 160, 282);
  ctx.textAlign = 'left';

  ctx.strokeStyle = 'rgba(234,250,255,0.65)'; ctx.lineWidth = 1.8;
  ctx.strokeRect(266, 16, 24, 12); ctx.fillStyle = '#5ef08a'; ctx.fillRect(269, 19, 14, 6);
  return finish(c);
}

/** 电池标签 */
export function batteryLabelTexture() {
  const { c, ctx } = canvas(512, 256);
  ctx.fillStyle = '#0b0f14'; ctx.fillRect(0, 0, 512, 256);
  ctx.fillStyle = '#f97316'; ctx.fillRect(0, 0, 512, 8);
  ctx.font = '700 40px -apple-system, "PingFang SC", sans-serif';
  ctx.fillStyle = '#ffd7a8'; ctx.textBaseline = 'middle';
  ctx.fillText('Li-Po  1770 mAh', 26, 62);
  ctx.font = '500 26px -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,215,168,0.8)';
  ctx.fillText('3.85 V  ·  6.8 Wh  ·  1S', 26, 118);
  ctx.font = '500 20px -apple-system, sans-serif';
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillText('WARNING · DO NOT DISASSEMBLE', 26, 176);
  ctx.strokeStyle = 'rgba(249,115,22,0.5)'; ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, 488, 232);
  return finish(c);
}

/** PCB 走线纹理 */
export function pcbTexture() {
  const { c, ctx } = canvas(512, 512);
  ctx.fillStyle = '#0c2a1e'; ctx.fillRect(0, 0, 512, 512);
  // 焊盘
  for (let i = 0; i < 240; i++) {
    ctx.fillStyle = 'rgba(190,220,180,0.5)';
    ctx.beginPath();
    ctx.arc(Math.random() * 512, Math.random() * 512, 2 + Math.random() * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }
  // 走线
  ctx.strokeStyle = 'rgba(120,200,140,0.42)';
  ctx.lineWidth = 1.4;
  for (let i = 0; i < 46; i++) {
    ctx.beginPath();
    let x = Math.random() * 512, y = Math.random() * 512;
    ctx.moveTo(x, y);
    for (let s = 0; s < 5; s++) {
      if (Math.random() > 0.5) x += (Math.random() - 0.5) * 190;
      else y += (Math.random() - 0.5) * 190;
      if (Math.random() > 0.6) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; }
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  return finish(c);
}

/** CMOS 光电二极管阵列 */
export function sensorTexture() {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = '#0a0f18'; ctx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    for (let x = 0; x < 256; x += 16) {
      const t = (x / 256) * 0.5 + Math.random() * 0.25;
      ctx.fillStyle = `rgba(${60 + t * 120},${90 + t * 110},${130 + t * 90},0.85)`;
      ctx.fillRect(x + 2, y + 2, 12, 12);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.fillRect(x + 4, y + 4, 4, 4);
    }
  }
  return finish(c);
}

/** 石墨烯层纹 */
export function grapheneTexture() {
  const { c, ctx } = canvas(256, 256);
  ctx.fillStyle = '#12161c'; ctx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 220; i++) {
    ctx.strokeStyle = `rgba(244,114,182,${0.05 + Math.random() * 0.12})`;
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    const y = Math.random() * 256;
    ctx.moveTo(0, y);
    for (let x = 0; x <= 256; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.05 + i) * 5);
    ctx.stroke();
  }
  return finish(c);
}

/** 扬声器网孔 */
export function meshTexture() {
  const { c, ctx } = canvas(128, 128);
  for (let y = 0; y < 128; y += 8) {
    for (let x = 0; x < 128; x += 8) {
      const off = (y / 8) % 2 ? 4 : 0;
      ctx.fillStyle = 'rgba(10,14,20,0.85)';
      ctx.beginPath(); ctx.arc(x + off, y, 2.4, 0, Math.PI * 2); ctx.fill();
    }
  }
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

/** 径向光晕贴图（选中高亮） */
export function glowTexture() {
  const { c, ctx } = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0.00, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.22, 'rgba(160,240,255,0.55)');
  g.addColorStop(0.55, 'rgba(60,190,235,0.16)');
  g.addColorStop(1.00, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  const t = finish(c);
  return t;
}

/** 星点贴图 */
export function dotTexture() {
  const { c, ctx } = canvas(64, 64);
  const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.4, 'rgba(180,225,255,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
  return finish(c);
}

/** 地面接触阴影 */
export function shadowTexture() {
  const { c, ctx } = canvas(256, 256);
  const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.5, 'rgba(0,0,0,0.22)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
  return finish(c);
}
