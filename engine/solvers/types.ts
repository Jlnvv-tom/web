import type { ParamValues, SceneState, SolverKind } from '../spec';

export type SolverCtx = {
  params: ParamValues;
  options: Record<string, unknown>;
};

/**
 * 求解器契约
 *
 * - `sample(t)` 必须是**纯函数**：给同一个 t 永远返回同一个 state。
 *   这是讲解脚本能"跳到最高点那一帧"、时间轴能任意拖拽的前提。
 * - `invariants(t)` 返回守恒量，供 Vitest 断言；任何物理错误先在这里暴露。
 */
export interface SolverModule {
  kind: SolverKind;
  /** 场景的物理时长（秒） */
  duration(ctx: SolverCtx): number;
  /** 解析解 / 定步长重放 */
  sample(t: number, ctx: SolverCtx): SceneState;
  /** 守恒量与关键量（用于单元测试与 HUD 校验） */
  invariants?(t: number, ctx: SolverCtx): Record<string, number>;
  /** 参数合法域建议（越界时裁剪） */
  clampParams?(ctx: SolverCtx): ParamValues;
}

export function num(params: ParamValues, key: string, fallback = 0): number {
  const v = params[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function bool(params: ParamValues, key: string, fallback = false): boolean {
  const v = params[key];
  return typeof v === 'boolean' ? v : fallback;
}

export function str(params: ParamValues, key: string, fallback = ''): string {
  const v = params[key];
  return typeof v === 'string' ? v : fallback;
}

/** 以固定步数采样一条曲线，返回折线点集 */
export function samplePath(
  t: number,
  count: number,
  fn: (s: number) => [number, number, number]
): [number, number, number][] {
  const n = Math.max(2, count);
  const out: [number, number, number][] = [];
  const span = Math.max(t, 1e-6);
  for (let i = 0; i <= n; i++) out.push(fn((i / n) * span));
  return out;
}
