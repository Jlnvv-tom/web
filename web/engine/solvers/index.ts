import type { ParamValues, SceneSpec, SceneState, SolverKind } from '../spec';
import type { SolverModule, SolverCtx } from './types';
import { projectileSolver } from './projectile';
import { lorentzSolver } from './lorentz';
import { thinLensSolver } from './thinLens';
import { electricFieldSolver } from './electricField';
import { capacitorSolver } from './capacitor';
import { shmSolver } from './shm';
import { orbitSolver } from './orbit';
import { reflectionSolver } from './reflection';
import { waveSolver } from './wave';
import { inductionSolver } from './induction';
import { buoyancySolver } from './buoyancy';
import { leverSolver } from './lever';

const REGISTRY: Partial<Record<SolverKind, SolverModule>> = {
  projectile: projectileSolver,
  lorentz: lorentzSolver,
  thinLens: thinLensSolver,
  electricField: electricFieldSolver,
  capacitor: capacitorSolver,
  shm: shmSolver,
  orbit: orbitSolver,
  reflection: reflectionSolver,
  wave: waveSolver,
  induction: inductionSolver,
  buoyancy: buoyancySolver,
  lever: leverSolver,
};

export const SOLVER_KINDS = Object.keys(REGISTRY) as SolverKind[];

export function getSolver(kind: SolverKind): SolverModule {
  const s = REGISTRY[kind];
  if (!s) {
    throw new Error(
      `未注册的求解器 "${kind}"。已注册：${SOLVER_KINDS.join(', ')}。` +
        `新增求解器请实现 SolverModule 并在 engine/solvers/index.ts 注册。`
    );
  }
  return s;
}

export function makeCtx(spec: SceneSpec, params: ParamValues): SolverCtx {
  return { params, options: spec.solver.options ?? {} };
}

/** 一次求解：给时间点 → 场景状态。纯函数，可任意跳帧。 */
export function solveAt(spec: SceneSpec, params: ParamValues, t: number): SceneState {
  const solver = getSolver(spec.solver.kind);
  return solver.sample(t, makeCtx(spec, params));
}

export function specDuration(spec: SceneSpec, params: ParamValues): number {
  return getSolver(spec.solver.kind).duration(makeCtx(spec, params));
}

export {
  projectileSolver,
  lorentzSolver,
  thinLensSolver,
  electricFieldSolver,
  capacitorSolver,
  shmSolver,
  orbitSolver,
  reflectionSolver,
  waveSolver,
  inductionSolver,
  buoyancySolver,
  leverSolver,
};
export type { SolverModule, SolverCtx };
