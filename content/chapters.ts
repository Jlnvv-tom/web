import type { Stage } from '@/engine/spec';

/**
 * 教材章节树
 *
 * 口径：人教版（2019 高中 / 2013 初中），并标注新课标要求的必做实验。
 * 这是产品的"骨架资产"——先有体系，再有场景；散点资源无法替代。
 */

export type KnowledgePoint = {
  id: string;
  title: string;
  /** 对应 content/scenes 里的场景 id；缺省表示规划中 */
  sceneId?: string;
  /** 是否需要真 3D */
  needs3d?: boolean;
};

export type Chapter = {
  id: string;
  no: string;
  title: string;
  points: KnowledgePoint[];
};

export type Book = {
  id: string;
  title: string;
  stage: Stage;
  subtitle: string;
  chapters: Chapter[];
};

export const BOOKS: Book[] = [
  /* ================= 初中 ================= */
  {
    id: 'j8a',
    title: '八年级上册',
    stage: 'junior',
    subtitle: '人教版 · 声光热与测量',
    chapters: [
      {
        id: 'j8a-1',
        no: '第一章',
        title: '机械运动',
        points: [
          { id: 'j8a-1-1', title: '长度和时间的测量' },
          { id: 'j8a-1-2', title: '运动的描述 · 参照物' },
          { id: 'j8a-1-3', title: '运动的快慢 · v=s/t' },
          { id: 'j8a-1-4', title: '测量平均速度' },
        ],
      },
      {
        id: 'j8a-2',
        no: '第二章',
        title: '声现象',
        points: [
          { id: 'j8a-2-1', title: '声音的产生与传播' },
          { id: 'j8a-2-2', title: '声音的特性 · 音调响度音色' },
          { id: 'j8a-2-3', title: '声的利用与噪声控制' },
        ],
      },
      {
        id: 'j8a-3',
        no: '第三章',
        title: '物态变化',
        points: [
          { id: 'j8a-3-1', title: '温度与温度计' },
          { id: 'j8a-3-2', title: '熔化和凝固' },
          { id: 'j8a-3-3', title: '汽化和液化 · 沸腾' },
          { id: 'j8a-3-4', title: '升华和凝华' },
        ],
      },
      {
        id: 'j8a-4',
        no: '第四章',
        title: '光现象',
        points: [
          { id: 'j8a-4-1', title: '光的直线传播' },
          { id: 'j8a-4-2', title: '光的反射 · 平面镜成像', sceneId: 'reflection', needs3d: true },
          { id: 'j8a-4-3', title: '光的折射' },
          { id: 'j8a-4-4', title: '光的色散' },
        ],
      },
      {
        id: 'j8a-5',
        no: '第五章',
        title: '透镜及其应用',
        points: [
          { id: 'j8a-5-1', title: '透镜 · 凸透镜与凹透镜' },
          { id: 'j8a-5-2', title: '凸透镜成像的规律', sceneId: 'thin-lens', needs3d: true },
          { id: 'j8a-5-3', title: '眼睛和眼镜' },
          { id: 'j8a-5-4', title: '显微镜和望远镜' },
        ],
      },
      {
        id: 'j8a-6',
        no: '第六章',
        title: '质量与密度',
        points: [
          { id: 'j8a-6-1', title: '质量 · 天平的使用' },
          { id: 'j8a-6-2', title: '密度 · ρ=m/V' },
          { id: 'j8a-6-3', title: '测量物质的密度' },
        ],
      },
    ],
  },
  {
    id: 'j8b',
    title: '八年级下册',
    stage: 'junior',
    subtitle: '人教版 · 力与运动',
    chapters: [
      {
        id: 'j8b-1',
        no: '第七章',
        title: '力',
        points: [
          { id: 'j8b-1-1', title: '力 · 力的作用效果' },
          { id: 'j8b-1-2', title: '弹力 · 弹簧测力计' },
          { id: 'j8b-1-3', title: '重力' },
          { id: 'j8b-1-4', title: '摩擦力' },
        ],
      },
      {
        id: 'j8b-2',
        no: '第八章',
        title: '运动和力',
        points: [
          { id: 'j8b-2-1', title: '牛顿第一定律 · 惯性' },
          { id: 'j8b-2-2', title: '二力平衡' },
          { id: 'j8b-2-3', title: '摩擦力与运动的关系' },
        ],
      },
      {
        id: 'j8b-3',
        no: '第九章',
        title: '压强',
        points: [
          { id: 'j8b-3-1', title: '压强 · p=F/S' },
          { id: 'j8b-3-2', title: '液体的压强' },
          { id: 'j8b-3-3', title: '大气压强' },
          { id: 'j8b-3-4', title: '流体压强与流速的关系' },
        ],
      },
      {
        id: 'j8b-4',
        no: '第十章',
        title: '浮力',
        points: [
          { id: 'j8b-4-1', title: '浮力 · 称重法' },
          { id: 'j8b-4-2', title: '阿基米德原理', sceneId: 'buoyancy', needs3d: true },
          { id: 'j8b-4-3', title: '物体的浮沉条件' },
        ],
      },
      {
        id: 'j8b-5',
        no: '第十一章',
        title: '功和机械能',
        points: [
          { id: 'j8b-5-1', title: '功 · W=Fs' },
          { id: 'j8b-5-2', title: '功率' },
          { id: 'j8b-5-3', title: '动能和势能' },
          { id: 'j8b-5-4', title: '机械能及其转化' },
        ],
      },
      {
        id: 'j8b-6',
        no: '第十二章',
        title: '简单机械',
        points: [
          { id: 'j8b-6-1', title: '杠杆 · 平衡条件', sceneId: 'lever', needs3d: true },
          { id: 'j8b-6-2', title: '滑轮 · 定滑轮与动滑轮' },
          { id: 'j8b-6-3', title: '机械效率' },
        ],
      },
    ],
  },
  {
    id: 'j9',
    title: '九年级全一册',
    stage: 'junior',
    subtitle: '人教版 · 电与磁',
    chapters: [
      {
        id: 'j9-1',
        no: '第十三章',
        title: '内能',
        points: [
          { id: 'j9-1-1', title: '分子热运动' },
          { id: 'j9-1-2', title: '内能 · 改变内能的方式' },
          { id: 'j9-1-3', title: '比热容' },
        ],
      },
      {
        id: 'j9-2',
        no: '第十五章',
        title: '电流和电路',
        points: [
          { id: 'j9-2-1', title: '两种电荷' },
          { id: 'j9-2-2', title: '电流和电路 · 串联与并联', needs3d: true },
          { id: 'j9-2-3', title: '电流的测量' },
        ],
      },
      {
        id: 'j9-3',
        no: '第十七章',
        title: '欧姆定律',
        points: [
          { id: 'j9-3-1', title: '电阻' },
          { id: 'j9-3-2', title: '欧姆定律 · I=U/R' },
          { id: 'j9-3-3', title: '伏安法测电阻' },
        ],
      },
      {
        id: 'j9-4',
        no: '第二十章',
        title: '电与磁',
        points: [
          { id: 'j9-4-1', title: '磁现象 · 磁场', needs3d: true },
          { id: 'j9-4-2', title: '电生磁 · 通电螺线管', needs3d: true },
          { id: 'j9-4-3', title: '电磁铁 · 电磁继电器' },
          { id: 'j9-4-4', title: '磁生电 · 发电机', needs3d: true },
        ],
      },
    ],
  },

  /* ================= 高中 ================= */
  {
    id: 'g1',
    title: '必修 第一册',
    stage: 'senior',
    subtitle: '人教版 2019 · 运动与力',
    chapters: [
      {
        id: 'g1-1',
        no: '第一章',
        title: '运动的描述',
        points: [
          { id: 'g1-1-1', title: '质点 · 参考系' },
          { id: 'g1-1-2', title: '时间 · 位移' },
          { id: 'g1-1-3', title: '速度 · 平均速度与瞬时速度' },
          { id: 'g1-1-4', title: '加速度' },
        ],
      },
      {
        id: 'g1-2',
        no: '第二章',
        title: '匀变速直线运动的研究',
        points: [
          { id: 'g1-2-1', title: '速度与时间的关系' },
          { id: 'g1-2-2', title: '位移与时间的关系' },
          { id: 'g1-2-3', title: '自由落体运动' },
          { id: 'g1-2-4', title: 'v-t 图像与追及相遇' },
        ],
      },
      {
        id: 'g1-3',
        no: '第三章',
        title: '相互作用——力',
        points: [
          { id: 'g1-3-1', title: '重力与弹力' },
          { id: 'g1-3-2', title: '摩擦力' },
          { id: 'g1-3-3', title: '力的合成与分解', needs3d: true },
          { id: 'g1-3-4', title: '共点力的平衡' },
        ],
      },
      {
        id: 'g1-4',
        no: '第四章',
        title: '运动和力的关系',
        points: [
          { id: 'g1-4-1', title: '牛顿第二定律 · F=ma' },
          { id: 'g1-4-2', title: '超重与失重' },
          { id: 'g1-4-3', title: '连接体问题' },
        ],
      },
    ],
  },
  {
    id: 'g2',
    title: '必修 第二册',
    stage: 'senior',
    subtitle: '人教版 2019 · 曲线运动与能量',
    chapters: [
      {
        id: 'g2-1',
        no: '第五章',
        title: '抛体运动',
        points: [
          { id: 'g2-1-1', title: '曲线运动 · 运动合成与分解' },
          { id: 'g2-1-2', title: '平抛运动', sceneId: 'projectile-motion', needs3d: true },
          { id: 'g2-1-3', title: '斜抛运动与射程', sceneId: 'projectile-motion', needs3d: true },
          { id: 'g2-1-4', title: '实验：探究平抛运动的特点' },
        ],
      },
      {
        id: 'g2-2',
        no: '第六章',
        title: '圆周运动',
        points: [
          { id: 'g2-2-1', title: '圆周运动 · 线速度与角速度' },
          { id: 'g2-2-2', title: '向心力 · F=mv²/r', needs3d: true },
          { id: 'g2-2-3', title: '向心加速度' },
          { id: 'g2-2-4', title: '生活中的圆周运动' },
        ],
      },
      {
        id: 'g2-3',
        no: '第七章',
        title: '万有引力与宇宙航行',
        points: [
          { id: 'g2-3-1', title: '行星的运动 · 开普勒定律', sceneId: 'orbit', needs3d: true },
          { id: 'g2-3-2', title: '万有引力定律' },
          { id: 'g2-3-3', title: '宇宙速度 · 卫星变轨', needs3d: true },
        ],
      },
      {
        id: 'g2-4',
        no: '第八章',
        title: '机械能守恒定律',
        points: [
          { id: 'g2-4-1', title: '功与功率' },
          { id: 'g2-4-2', title: '动能定理' },
          { id: 'g2-4-3', title: '机械能守恒' },
        ],
      },
    ],
  },
  {
    id: 'g3',
    title: '必修 第三册',
    stage: 'senior',
    subtitle: '人教版 2019 · 电场与电路',
    chapters: [
      {
        id: 'g3-1',
        no: '第九章',
        title: '静电场及其应用',
        points: [
          { id: 'g3-1-1', title: '电荷 · 库仑定律' },
          { id: 'g3-1-2', title: '电场 · 电场强度', needs3d: true },
          { id: 'g3-1-3', title: '电场线 · 匀强电场', sceneId: 'electric-field', needs3d: true },
          { id: 'g3-1-4', title: '静电的防止与利用' },
        ],
      },
      {
        id: 'g3-2',
        no: '第十章',
        title: '静电场中的能量',
        points: [
          { id: 'g3-2-1', title: '电势能与电势', needs3d: true },
          { id: 'g3-2-2', title: '等势面 · 电势差', needs3d: true },
          { id: 'g3-2-3', title: '电容器的电容', sceneId: 'capacitor', needs3d: true },
          { id: 'g3-2-4', title: '带电粒子在电场中的运动', needs3d: true },
        ],
      },
      {
        id: 'g3-3',
        no: '第十二章',
        title: '电能 能量守恒定律',
        points: [
          { id: 'g3-3-1', title: '电路中的能量转化' },
          { id: 'g3-3-2', title: '闭合电路欧姆定律' },
          { id: 'g3-3-3', title: '实验：测电源电动势和内阻' },
        ],
      },
    ],
  },
  {
    id: 'gx1',
    title: '选择性必修 第一册',
    stage: 'senior',
    subtitle: '人教版 2019 · 动量、振动与波、光学',
    chapters: [
      {
        id: 'gx1-1',
        no: '第一章',
        title: '动量守恒定律',
        points: [
          { id: 'gx1-1-1', title: '动量 · 冲量' },
          { id: 'gx1-1-2', title: '动量定理' },
          { id: 'gx1-1-3', title: '动量守恒定律' },
          { id: 'gx1-1-4', title: '弹性碰撞与非弹性碰撞' },
        ],
      },
      {
        id: 'gx1-2',
        no: '第二章',
        title: '机械振动与机械波',
        points: [
          { id: 'gx1-2-1', title: '简谐运动' },
          { id: 'gx1-2-2', title: '简谐运动的描述 · 振幅周期频率', sceneId: 'shm', needs3d: true },
          { id: 'gx1-2-3', title: '单摆 · 实验：测重力加速度', needs3d: true },
          { id: 'gx1-2-4', title: '受迫振动与共振' },
          { id: 'gx1-2-5', title: '机械波 · 横波与纵波', sceneId: 'wave', needs3d: true },
          { id: 'gx1-2-6', title: '波的反射 · 折射 · 衍射' },
          { id: 'gx1-2-7', title: '波的干涉 · 多普勒效应' },
        ],
      },
      {
        id: 'gx1-3',
        no: '第四章',
        title: '光',
        points: [
          { id: 'gx1-3-1', title: '光的折射 · 折射定律' },
          { id: 'gx1-3-2', title: '全反射 · 光导纤维' },
          { id: 'gx1-3-3', title: '光的干涉 · 衍射 · 偏振' },
        ],
      },
      {
        id: 'gx1-4',
        no: '第五章',
        title: '电磁振荡与电磁波',
        points: [
          { id: 'gx1-4-1', title: '电磁振荡' },
          { id: 'gx1-4-2', title: '电磁波谱' },
        ],
      },
    ],
  },
  {
    id: 'gx2',
    title: '选择性必修 第二册',
    stage: 'senior',
    subtitle: '人教版 2019 · 磁场与电磁感应',
    chapters: [
      {
        id: 'gx2-1',
        no: '第一章',
        title: '安培力与洛伦兹力',
        points: [
          { id: 'gx2-1-1', title: '磁场 · 磁感线', needs3d: true },
          { id: 'gx2-1-2', title: '安培力 · F=BIL', needs3d: true },
          { id: 'gx2-1-3', title: '洛伦兹力 · 带电粒子在磁场中的运动', sceneId: 'lorentz-force', needs3d: true },
          { id: 'gx2-1-4', title: '质谱仪与回旋加速器', needs3d: true },
        ],
      },
      {
        id: 'gx2-2',
        no: '第二章',
        title: '电磁感应',
        points: [
          { id: 'gx2-2-1', title: '楞次定律', sceneId: 'induction', needs3d: true },
          { id: 'gx2-2-2', title: '法拉第电磁感应定律' },
          { id: 'gx2-2-3', title: '自感与互感' },
        ],
      },
      {
        id: 'gx2-3',
        no: '第三章',
        title: '交变电流',
        points: [
          { id: 'gx2-3-1', title: '交变电流的产生' },
          { id: 'gx2-3-2', title: '变压器 · 远距离输电', needs3d: true },
        ],
      },
    ],
  },
];

/* ============================================================
   查询工具
   ============================================================ */

export const ALL_CHAPTERS = BOOKS.flatMap((b) =>
  b.chapters.map((c) => ({ ...c, bookId: b.id, bookTitle: b.title, stage: b.stage }))
);

export function findBook(id: string) {
  return BOOKS.find((b) => b.id === id);
}

export function findChapter(chapterId: string) {
  return ALL_CHAPTERS.find((c) => c.id === chapterId);
}

export function chapterOfChapterId(id: string) {
  return ALL_CHAPTERS.find((c) => c.id === id);
}

/** 有场景的知识点 */
export const READY_POINTS = ALL_CHAPTERS.flatMap((c) =>
  c.points
    .filter((p) => p.sceneId)
    .map((p) => ({ ...p, chapterId: c.id, chapterTitle: c.title, bookId: c.bookId, stage: c.stage }))
);

export const STATS = {
  books: BOOKS.length,
  chapters: ALL_CHAPTERS.length,
  points: ALL_CHAPTERS.reduce((n, c) => n + c.points.length, 0),
  ready: READY_POINTS.length,
  juniorPoints: ALL_CHAPTERS.filter((c) => c.stage === 'junior').reduce((n, c) => n + c.points.length, 0),
  seniorPoints: ALL_CHAPTERS.filter((c) => c.stage === 'senior').reduce((n, c) => n + c.points.length, 0),
};
