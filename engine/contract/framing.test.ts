/**
 * 构图契约（M3 · W5 · docs/m3-plan.md §4.5 规则 1–2）
 *
 * 把两条取景规则写成可执行断言：
 *   规则 1  主体充分填充画面（不浪费空间）
 *   规则 2  相机 target 在主体包围盒中心 ±15% 内
 *
 * **为什么解析计算而不比截图**：截图比对（L5 视觉回归）回答的是
 * "画面有没有变"，回答不了"构图一开始就是错的"。而构图是 spec 里的
 * `camera.position/target` 与求解器输出的空间关系——可以在 Node 里精确算。
 *
 * 四个实现要点：
 * 1. **主体 = SceneState 的全部几何**：points + lines + linesets 顶点，
 *    外加 vector 箭头的尖端（复刻 Arrow.tsx 的长度逻辑：scale 乘 →
 *    fixed 1.6 → maxLength 截断）。箭头不算进去，电场这类"箭头即主体"
 *    的场景会被严重低估。
 * 2. **相机跟随脚本**：`script[].camera` 会覆盖 position/target
 *    （与 SceneRuntime 的 goCamera 同语义）。只测 t=0 会漏掉
 *    "讲解飞着飞着把主体带出画面"这一类 bug。
 * 3. **张角按逐点计算**：`atan2(y_cam, z_cam)`。同样的世界尺寸，
 *    近处端点占的画面比远处大——用 extent/distance 会高估覆盖率。
 * 4. **填充率取两轴的最大值**（见下方规则说明），不用竖直-only。
 * 5. **溢出画面主体豁免居中**：体积型主体（电场/线圈特写/水槽）看到的
 *    是局部，要求整个包围盒居中会把两边一起推出画面（见 OVERFLOW_EXEMPT）。
 *
 * 规则 1 的形态经过一次修正（2026-10-24）：
 * 初版是"竖直占高 ≥62%"，实测对**宽扁型主体**根本不成立——
 * 凸透镜装置 7.8×1.68、机械波绳 4×1.2、抛体轨迹 40×10，
 * 它们天然受水平约束：要竖直填满 62%，水平必然溢出 130%。
 * D5 要治的是"画面一半是空的"，不是"某个轴没填满"。
 * 所以改为：max(竖直, 水平) ≥ 62% —— 至少一个轴充分填充；
 * 同时 min ≥ 15%，防止"一条细带糊在中间"。
 *
 * 同样删掉了初版的 150% 上限：体积型主体（电场充满空间、电感线圈特写）
 * 刻意大于画面是合法构图，上限会把它们误判成失败。
 *
 * 已知边界（诚实记录）：
 * - 声明式静态图元（lens / plane / box / disc / sector / arrowLine）的
 *   位置来自 def 而非 SceneState，不参与计算。它们是固定构图的一部分，
 *   由作者摆相机时人工对齐；会随参数动的是 points/lines/vectors。
 * - 水平宽高比取参考值 1.9（课堂投影 16:9 近似）。真实画布约 1.91，
 *   误差 <1%，对判据无实质影响。
 */
import { describe, expect, it } from 'vitest';
import { SCENES } from '@/content/scenes';
import { defaultParams, sceneDuration } from '@/engine/spec';
import type { ObjectDef, SceneSpec } from '@/engine/spec';
import type { Vec3 } from '@/engine/vec';
import { solveAt } from '@/engine/solvers';

/** 与 components/scene/SceneCanvas.tsx 的 `spec.camera.fov ?? 45` 保持一致 */
const VFOV_DEFAULT = 45;
const REF_ASPECT = 1.9; // 参考宽高比（16:9 投影近似）
const MIN_FILL = 0.62; // max(竖直,水平) 填充率下限
const MIN_OTHER_AXIS = 0.15; // 另一轴下限：防止细带构图
const MAX_OFFCENTER = 0.15; // 规则 2
const MIN_IN_FRONT = 0.95; // 主体顶点在相机前方的最低占比
/**
 * 居中判据的豁免线：主体最大轴填充率 ≤ 1.05 时才要求居中。
 *
 * 体积型主体（电场充满整个空间、电感线圈特写、水槽高于画面）刻意大于画面，
 * 观众看到的是主体的一个局部——此时要求"整个包围盒的中心落在光轴上"
 * 没有意义：相机本就瞄着该看的那个局部，硬居中的结果是两边一起出画。
 * 与 `world.stage.kind = 'none'` 同属"规范必须允许例外"。
 */
const OVERFLOW_EXEMPT = 1.05;

type Cam = { position: Vec3; target: Vec3; fov: number };

/** 相机在时刻 t 的位姿：脚本步骤的 camera 覆盖会累积生效 */
function cameraAt(spec: SceneSpec, t: number): Cam {
  let position = spec.camera.position;
  let target = spec.camera.target;
  for (const step of spec.script) {
    if (step.at > t + 1e-6) break;
    if (step.camera) {
      position = step.camera.position ?? position;
      target = step.camera.target ?? target;
    }
  }
  return { position, target, fov: spec.camera.fov ?? VFOV_DEFAULT };
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** vector 箭头的尖端（复刻 Arrow.tsx：scale 乘 → fixed 1.6 → maxLength 截断） */
function vectorTips(spec: SceneSpec, t: number, out: Vec3[]) {
  const state = solveAt(spec, defaultParams(spec.params), t);
  for (const def of spec.objects) {
    if (def.type !== 'vector') continue;
    const d = def as Extract<ObjectDef, { type: 'vector' }>;
    const v = state.vectors[d.bind];
    if (!v) continue;
    const origin = state.points[d.origin ?? 'pos'] ?? ([0, 0, 0] as Vec3);
    const k = d.scale ?? 1;
    const dir: Vec3 = [v[0] * k, v[1] * k, v[2] * k];
    let len = Math.hypot(dir[0], dir[1], dir[2]);
    if (len < 1e-6) continue;
    if (d.fixed) len = 1.6;
    else if (d.maxLength != null && len > d.maxLength) len = d.maxLength;
    const u = norm(dir);
    out.push([origin[0] + u[0] * len, origin[1] + u[1] * len, origin[2] + u[2] * len]);
    out.push(origin);
  }
}

/** 主体在时刻 t 的全部几何顶点 */
function subjectPoints(spec: SceneSpec, t: number): Vec3[] {
  const state = solveAt(spec, defaultParams(spec.params), t);
  const pts: Vec3[] = [...Object.values(state.points)];
  for (const line of Object.values(state.lines)) pts.push(...line);
  for (const set of Object.values(state.linesets ?? {})) {
    for (const line of set) pts.push(...line);
  }
  vectorTips(spec, t, pts);
  return pts.filter((p) => p.every((n) => Number.isFinite(n)));
}

type Frame = {
  covV: number; // 竖直填充率（相对 vfov）
  covH: number; // 水平填充率（相对 hfov）
  offX: number; // 主体中心相对光轴的水平偏移（比例）
  offY: number; // 垂直偏移
  inFront: number; // 在相机前方的顶点占比
  n: number;
};

function measure(spec: SceneSpec, t: number): Frame {
  const cam = cameraAt(spec, t);
  const fwd = norm(sub(cam.target, cam.position));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);

  const pts = subjectPoints(spec, t);
  let minAY = Infinity;
  let maxAY = -Infinity;
  let minAX = Infinity;
  let maxAX = -Infinity;
  let inFront = 0;
  // 世界包围盒（用于规则 2 的居中判据）
  const lo: Vec3 = [Infinity, Infinity, Infinity];
  const hi: Vec3 = [-Infinity, -Infinity, -Infinity];

  for (const p of pts) {
    const d = sub(p, cam.position);
    const z = dot(d, fwd);
    if (z <= 1e-6) continue; // 相机背后：不参与张角（由 inFront 单独看守）
    inFront += 1;
    const x = dot(d, right);
    const y = dot(d, up);
    minAY = Math.min(minAY, Math.atan2(y, z));
    maxAY = Math.max(maxAY, Math.atan2(y, z));
    minAX = Math.min(minAX, Math.atan2(x, z));
    maxAX = Math.max(maxAX, Math.atan2(x, z));
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], p[k]);
      hi[k] = Math.max(hi[k], p[k]);
    }
  }

  /**
   * 规则 2 的居中判据：**世界包围盒中心投影到屏幕上的偏移**。
   *
   * 不用"投影包围盒的中点"：主体有深度起伏时（平面镜场景的物体与虚像
   * 一前一后），远近端点在切线空间的拉伸不对称，投影包围盒的中点会被
   * 拖离世界中心的投影位置——实测 reflection 的世界中心投影只在轴心
   * 2.5%，投影包围盒中点却报 25%。规则原文是"target 在包围盒中心
   * ±15% 内"，就按字面实现：看世界中心落在屏幕哪个位置。
   */
  const center: Vec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const dc = sub(center, cam.position);
  const zc = dot(dc, fwd);
  const nxc = zc > 1e-6 ? dot(dc, right) / zc : 0;
  const nyc = zc > 1e-6 ? dot(dc, up) / zc : 0;

  const vfov = (cam.fov * Math.PI) / 180;
  const tanV = Math.tan(vfov / 2);
  const tanH = tanV * REF_ASPECT;
  const hfov = 2 * Math.atan(tanH);
  return {
    covV: (maxAY - minAY) / vfov,
    covH: (maxAX - minAX) / hfov,
    offX: Math.abs(nxc) / tanH,
    offY: Math.abs(nyc) / tanV,
    inFront: pts.length ? inFront / pts.length : 1,
    n: pts.length,
  };
}

const SAMPLE_TS = (spec: SceneSpec) => {
  const dur = sceneDuration(spec);
  return [0, dur * 0.25, dur * 0.5, dur * 0.83, dur];
};

const fmt = (v: number) => `${(v * 100).toFixed(0)}%`;

describe('构图契约 · 取景规则（REQ-W5-001 / 002）', () => {
  for (const spec of SCENES) {
    describe(spec.meta.id, () => {
      it('主体非空（没有几何的场景无法谈构图）', () => {
        expect(subjectPoints(spec, 0).length).toBeGreaterThan(0);
      });

      for (const t of SAMPLE_TS(spec)) {
        it(`t=${t.toFixed(2)}s 主体填充画面且 target 居中`, () => {
          const f = measure(spec, t);
          const cam = cameraAt(spec, t);
          const where = `camera=${JSON.stringify(cam.position)} target=${JSON.stringify(cam.target)}`;

          expect(
            f.inFront,
            `主体有 ${fmt(1 - f.inFront)} 的顶点在相机背后（${where}）`,
          ).toBeGreaterThanOrEqual(MIN_IN_FRONT);

          expect(
            Math.max(f.covV, f.covH),
            `填充率 竖${fmt(f.covV)}/横${fmt(f.covH)}，最大轴 < 62%——画面大量留空（${where}）`,
          ).toBeGreaterThanOrEqual(MIN_FILL);

          expect(
            Math.min(f.covV, f.covH),
            `填充率 竖${fmt(f.covV)}/横${fmt(f.covH)}，较小轴 < 15%——主体糊成一条细带（${where}）`,
          ).toBeGreaterThanOrEqual(MIN_OTHER_AXIS);

          // 溢出画面的主体豁免居中（见 OVERFLOW_EXEMPT 注释）
          if (Math.max(f.covV, f.covH) <= OVERFLOW_EXEMPT) {
            expect(
              f.offX,
              `水平偏心 ${fmt(f.offX)} > 15%（${where}）`,
            ).toBeLessThanOrEqual(MAX_OFFCENTER);

            expect(
              f.offY,
              `垂直偏心 ${fmt(f.offY)} > 15%（${where}）`,
            ).toBeLessThanOrEqual(MAX_OFFCENTER);
          }
        });
      }
    });
  }
});
