/**
 * 轻量轨道相机控制器（仅依赖 Three.js 核心）
 * 支持：左键旋转 / 右键平移 / 滚轮缩放 / 单指旋转 / 双指缩放+平移 / 阻尼 / 自动旋转
 */
import * as THREE from 'three';

export class OrbitCam {
  constructor(camera, dom) {
    this.camera = camera;
    this.dom = dom;

    this.target = new THREE.Vector3(0, 0, 0);
    this.targetGoal = this.target.clone();

    this.radius = 24;
    this.radiusGoal = 24;
    this.minRadius = 7;
    this.maxRadius = 60;

    this.theta = Math.PI * 0.28;          // 方位角
    this.phi = Math.PI * 0.34;            // 极角
    this.thetaGoal = this.theta;
    this.phiGoal = this.phi;
    this.minPhi = 0.08;
    this.maxPhi = Math.PI - 0.08;

    this.damping = 0.11;
    this.autoRotate = false;
    this.autoRotateSpeed = 0.22;
    this.enabled = true;

    this._pointers = new Map();
    this._pinchDist = 0;
    this._moved = 0;
    this._downTime = 0;
    this.onUserInteract = null;

    this._bind();
    this.apply();
  }

  _bind() {
    const d = this.dom;
    d.style.touchAction = 'none';

    d.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      d.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, btn: e.button });
      this._moved = 0;
      this._downTime = performance.now();
      if (this._pointers.size === 2) this._pinchDist = this._twoDist();
      this._stopAuto();
    });

    d.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      const p = this._pointers.get(e.pointerId);
      if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      p.x = e.clientX; p.y = e.clientY;
      this._moved += Math.abs(dx) + Math.abs(dy);

      if (this._pointers.size === 1) {
        const pan = p.btn === 2 || p.btn === 1 || e.shiftKey;
        if (pan) this._pan(dx, dy);
        else this._orbit(dx, dy);
        this._stopAuto();
      } else if (this._pointers.size === 2) {
        const nd = this._twoDist();
        const delta = nd - this._pinchDist;
        this._pinchDist = nd;
        this.radiusGoal = THREE.MathUtils.clamp(
          this.radiusGoal * (1 - delta * 0.006), this.minRadius, this.maxRadius);
        this._stopAuto();
      }
    });

    const up = (e) => {
      this._pointers.delete(e.pointerId);
      if (d.hasPointerCapture?.(e.pointerId)) d.releasePointerCapture(e.pointerId);
    };
    d.addEventListener('pointerup', up);
    d.addEventListener('pointercancel', up);
    d.addEventListener('lostpointercapture', up);

    d.addEventListener('contextmenu', (e) => e.preventDefault());

    d.addEventListener('wheel', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const k = e.deltaY > 0 ? 1.09 : 0.92;
      this.radiusGoal = THREE.MathUtils.clamp(this.radiusGoal * k, this.minRadius, this.maxRadius);
      this._stopAuto();
    }, { passive: false });
  }

  _twoDist() {
    const a = [...this._pointers.values()];
    return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y);
  }

  _orbit(dx, dy) {
    const k = 0.0052;
    this.thetaGoal -= dx * k;
    this.phiGoal = THREE.MathUtils.clamp(this.phiGoal - dy * k, this.minPhi, this.maxPhi);
  }

  _pan(dx, dy) {
    const scale = this.radius * 0.0016;
    const right = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(this.camera.matrix, 1);
    this.targetGoal.addScaledVector(right, -dx * scale);
    this.targetGoal.addScaledVector(up, dy * scale);
  }

  _stopAuto() {
    if (this.onUserInteract) this.onUserInteract();
  }

  /** 是否算作"点击"（而非拖拽） */
  isClick() {
    return this._moved < 6 && performance.now() - this._downTime < 420;
  }

  /** 平滑聚焦到某点 */
  focusOn(point, radius = null, instant = false) {
    this.targetGoal.copy(point);
    if (radius != null) this.radiusGoal = THREE.MathUtils.clamp(radius, this.minRadius, this.maxRadius);
    if (instant) {
      this.target.copy(this.targetGoal);
      this.radius = this.radiusGoal;
      this.theta = this.thetaGoal;
      this.phi = this.phiGoal;
    }
  }

  setView(theta, phi, radius, target = null) {
    this.thetaGoal = theta; this.phiGoal = phi; this.radiusGoal = radius;
    if (target) this.targetGoal.copy(target);
  }

  reset() {
    this.setView(Math.PI * 0.28, Math.PI * 0.34, 24, new THREE.Vector3(0, 0, 0));
  }

  update(dt) {
    if (this.autoRotate) this.thetaGoal += this.autoRotateSpeed * dt;
    const d = 1 - Math.pow(1 - this.damping, dt * 60);
    this.theta += (this.thetaGoal - this.theta) * d;
    this.phi += (this.phiGoal - this.phi) * d;
    this.radius += (this.radiusGoal - this.radius) * d;
    this.target.lerp(this.targetGoal, d);
    this.apply();
  }

  apply() {
    const { radius, theta, phi, target, camera } = this;
    camera.position.set(
      target.x + radius * Math.sin(phi) * Math.sin(theta),
      target.y + radius * Math.cos(phi),
      target.z + radius * Math.sin(phi) * Math.cos(theta)
    );
    camera.lookAt(target);
  }
}
