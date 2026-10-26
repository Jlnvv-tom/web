/**
 * 3D → 2D 部件标注（HTML 标签 + SVG 引线）
 */
import * as THREE from 'three';

export class LabelLayer {
  constructor(labelHost, svg) {
    this.host = labelHost;
    this.svg = svg;
    this.items = [];      // { id, el, dot, line, circle, anchor }
    this.visible = true;
    this._v = new THREE.Vector3();
  }

  register(id, anchor, text, param, color) {
    const el = document.createElement('div');
    el.className = 'lbl';
    el.innerHTML = `<i class="d" style="background:${color};box-shadow:0 0 8px ${color}"></i>` +
      `<span class="t">${text}</span>${param ? `<span class="p">${param}</span>` : ''}`;
    this.host.appendChild(el);

    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    line.setAttribute('stroke', 'rgba(34,211,238,0.55)');
    line.setAttribute('stroke-width', '1');
    line.setAttribute('stroke-dasharray', '3 3');
    circle.setAttribute('r', '2.6');
    circle.setAttribute('fill', color);
    this.svg.appendChild(line);
    this.svg.appendChild(circle);

    this.items.push({ id, el, line, circle, anchor, text, param, color });
  }

  setSelected(id) { this.selected = id; }

  /** mode: 'exploded' 显示全部；'assembled' 仅显示选中 */
  update(camera, mode, w, h) {
    this.svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    this.svg.setAttribute('width', w);
    this.svg.setAttribute('height', h);
    const rect = this.host.getBoundingClientRect();

    for (const it of this.items) {
      const show = this.visible && (mode === 'exploded' || it.id === this.selected);
      if (!show) { it.el.style.display = 'none'; it.line.style.display = 'none'; it.circle.style.display = 'none'; continue; }

      it.anchor.getWorldPosition(this._v);
      const dist = this._v.distanceTo(camera.position);
      this._v.project(camera);

      const behind = this._v.z > 1;
      if (behind) {
        it.el.style.display = 'none'; it.line.style.display = 'none'; it.circle.style.display = 'none';
        continue;
      }
      const x = (this._v.x * 0.5 + 0.5) * w;
      const y = (-this._v.y * 0.5 + 0.5) * h;

      const flip = x > w * 0.60;
      const lx = flip ? x - 18 : x + 18;
      const ly = THREE.MathUtils.clamp(y, 46, h - 30);

      it.el.style.display = 'flex';
      it.el.style.left = lx + 'px';
      it.el.style.top = ly + 'px';
      it.el.classList.toggle('flip', flip);
      it.el.classList.toggle('sel', it.id === this.selected);
      it.el.classList.toggle('dim', mode === 'exploded' && it.id !== this.selected);

      const ex = flip ? lx - it.el.offsetWidth : lx + it.el.offsetWidth;
      const ey = ly;
      it.line.style.display = 'block';
      it.line.setAttribute('x1', x); it.line.setAttribute('y1', y);
      it.line.setAttribute('x2', ex); it.line.setAttribute('y2', ey);
      it.circle.style.display = 'block';
      it.circle.setAttribute('cx', x); it.circle.setAttribute('cy', y);
    }
  }
}
