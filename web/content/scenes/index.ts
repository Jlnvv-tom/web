import type { SceneSpec } from '@/engine/spec';
import { lorentzForceScene } from './lorentz-force.scene';
import { projectileMotionScene } from './projectile-motion.scene';
import { thinLensScene } from './thin-lens.scene';
import { electricFieldScene } from './electric-field.scene';
import { capacitorScene } from './capacitor.scene';
import { shmScene } from './shm.scene';
import { orbitScene } from './orbit.scene';
import { reflectionScene } from './reflection.scene';
import { waveScene } from './wave.scene';
import { inductionScene } from './induction.scene';
import { buoyancyScene } from './buoyancy.scene';
import { leverScene } from './lever.scene';

/**
 * 场景注册表
 *
 * 新增一个知识点 = 在这里加一行 + 写一份 *.scene.ts。
 * 页面路由、章节树、搜索都以这份表为准。
 */
export const SCENES: SceneSpec[] = [
  lorentzForceScene,
  projectileMotionScene,
  thinLensScene,
  electricFieldScene,
  capacitorScene,
  shmScene,
  orbitScene,
  reflectionScene,
  waveScene,
  inductionScene,
  buoyancyScene,
  leverScene,
];

export const SCENE_MAP = new Map(SCENES.map((s) => [s.meta.id, s]));

export function getScene(id: string): SceneSpec | undefined {
  return SCENE_MAP.get(id);
}

export function allScenes(): SceneSpec[] {
  return SCENES;
}

export type SceneSummary = {
  id: string;
  title: string;
  subtitle?: string;
  stage: SceneSpec['meta']['stage'];
  chapterId: string;
  difficulty: 1 | 2 | 3;
  dimension: SceneSpec['meta']['dimension'];
  minutes: number;
  tags: string[];
  pitch: string;
  demoCount: number;
};

export function sceneSummaries(): SceneSummary[] {
  return SCENES.map((s) => ({
    id: s.meta.id,
    title: s.meta.title,
    subtitle: s.meta.subtitle,
    stage: s.meta.stage,
    chapterId: s.meta.chapterId,
    difficulty: s.meta.difficulty,
    dimension: s.meta.dimension,
    minutes: s.meta.minutes,
    tags: s.meta.tags,
    pitch: s.meta.pitch,
    demoCount: s.script.length,
  }));
}
