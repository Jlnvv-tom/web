'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { SceneSpec, SceneState, ScriptStep } from '@/engine/spec';
import { sceneDuration } from '@/engine/spec';
import { solveAt } from '@/engine/solvers';
import type { PlayerStoreApi } from '@/engine/store';
import type { StateRef } from './objects';
import { emptyState } from '@/engine/spec';

const UI_PUSH_INTERVAL = 0.055; // ≈18Hz：UI 数字够用，又不至于每帧重渲染

export function SceneRuntime({
  spec,
  store,
  stateRef,
}: {
  spec: SceneSpec;
  store: PlayerStoreApi;
  stateRef: StateRef;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as unknown as
    | { target: THREE.Vector3; update: () => void }
    | null;

  const tRef = useRef(0);
  const lastPush = useRef(0);
  const stepRef = useRef(-1);
  const seriesRef = useRef<Record<string, number[]>>({});
  const camGoal = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);
  const camLerp = useRef(0);
  const camFrom = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

  const duration = useMemo(() => sceneDuration(spec), [spec]);
  const seriesKeys = useMemo(
    () => (spec.hud.charts ?? []).flatMap((c) => c.series.map((s) => s.bind)),
    [spec]
  );

  // 初始化状态，避免首帧读取 undefined
  if (!stateRef.current) stateRef.current = emptyState();

  /* 相机初始位姿 */
  useEffect(() => {
    camera.position.set(...spec.camera.position);
    if (controls) {
      controls.target.set(...spec.camera.target);
      controls.update();
    }
    camera.lookAt(new THREE.Vector3(...spec.camera.target));
  }, [camera, controls, spec.camera]);

  const goCamera = (step: ScriptStep) => {
    if (!step.camera) return;
    const pos = new THREE.Vector3(...(step.camera.position ?? spec.camera.position));
    const target = new THREE.Vector3(...(step.camera.target ?? spec.camera.target));
    camFrom.current = {
      pos: camera.position.clone(),
      target: controls ? controls.target.clone() : new THREE.Vector3(...spec.camera.target),
    };
    camGoal.current = { pos, target };
    camLerp.current = 0;
  };

  useFrame((_, rawDelta) => {
    const st = store.getState();
    const dt = Math.min(rawDelta, 0.05);

    /* --- 跳转请求 --- */
    const seek = st.consumeSeek();
    if (seek !== null) {
      tRef.current = seek;
      seriesRef.current = {};
      stepRef.current = -1;
    }

    /* --- 推进时间 --- */
    if (st.playing) {
      tRef.current += dt * st.speed;
      if (tRef.current > duration) {
        tRef.current = duration;
        st.setPlaying(false);
      }
    }
    const t = tRef.current;

    /* --- 求解 --- */
    const state: SceneState = solveAt(spec, st.params, t);
    stateRef.current = state;

    /* --- 讲解脚本 --- */
    let idx = -1;
    for (let i = 0; i < spec.script.length; i++) {
      if (spec.script[i]!.at <= t + 1e-6) idx = i;
    }
    if (idx !== stepRef.current) {
      stepRef.current = idx;
      st.setStepIndex(idx);
      const step = spec.script[idx];
      if (step) {
        if (step.params) st.applyScriptParams(step.params);
        if (step.camera) goCamera(step);
        if (step.pause) {
          st.setPlaying(false);
          st.setWaiting(true);
        }
      }
    }

    /* --- 相机缓动 --- */
    if (camGoal.current && camLerp.current < 1) {
      camLerp.current = Math.min(1, camLerp.current + dt / 0.85);
      const e = 1 - Math.pow(1 - camLerp.current, 3);
      const from = camFrom.current!;
      camera.position.lerpVectors(from.pos, camGoal.current.pos, e);
      if (controls) {
        controls.target.lerpVectors(from.target, camGoal.current.target, e);
        controls.update();
      }
    }

    /* --- 图表序列 --- */
    for (const k of seriesKeys) {
      const arr = (seriesRef.current[k] ??= []);
      const v = state.scalars[k];
      if (typeof v === 'number' && Number.isFinite(v)) {
        arr.push(v);
        if (arr.length > 180) arr.shift();
      }
    }

    /* --- 限频推送 UI --- */
    if (t - lastPush.current > UI_PUSH_INTERVAL || Math.abs(t - lastPush.current) > 0.5 || !st.playing) {
      lastPush.current = t;
      st.pushTime(t);
      st.pushHud({
        scalars: { ...state.scalars },
        meta: { ...state.meta },
        series: Object.fromEntries(Object.entries(seriesRef.current).map(([k, v]) => [k, v.slice(-120)])),
      });
    }
  });

  return null;
}
