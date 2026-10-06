import { StatBoostType, WeaponType } from '../types';

export type IconKey = WeaponType | StatBoostType;

type Draw = (ctx: CanvasRenderingContext2D) => void;

// 単位サイズ(-1 から 1)の座標系で描くアイコン。呼び出し側で位置と拡大率を決める。
const path = (ctx: CanvasRenderingContext2D, pts: number[][], close = true) => {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  if (close) ctx.closePath();
};

const circle = (ctx: CanvasRenderingContext2D, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
};

const sword: Draw = (ctx) => {
  path(ctx, [[0, -1], [0.18, -0.2], [0.18, 0.35], [-0.18, 0.35], [-0.18, -0.2]]);
  ctx.fill();
  path(ctx, [[-0.5, 0.35], [0.5, 0.35]], false);
  ctx.stroke();
  path(ctx, [[0, 0.35], [0, 0.85]], false);
  ctx.stroke();
};

const arrowUp: Draw = (ctx) => {
  path(ctx, [[0, -0.9], [0.7, 0], [0.25, 0], [0.25, 0.8], [-0.25, 0.8], [-0.25, 0], [-0.7, 0]]);
  ctx.fill();
};

const ICONS: Record<IconKey, Draw> = {
  ENERGY_BLASTER: (ctx) => {
    circle(ctx, 0, 0, 0.35);
    ctx.fill();
    for (let i = 0; i < 3; i++) {
      path(ctx, [[0.5, -0.5 + i * 0.5], [1, -0.5 + i * 0.5]], false);
      ctx.stroke();
    }
  },
  HOMING_MISSILE: (ctx) => {
    path(ctx, [[-0.9, -0.2], [0.3, -0.2], [0.9, 0], [0.3, 0.2], [-0.9, 0.2]]);
    ctx.fill();
    path(ctx, [[-0.9, -0.2], [-1, -0.6], [-0.5, -0.2]]);
    ctx.fill();
    path(ctx, [[-0.9, 0.2], [-1, 0.6], [-0.5, 0.2]]);
    ctx.fill();
  },
  PLASMA_LASER: (ctx) => {
    path(ctx, [[-1, 0], [1, 0]], false);
    ctx.lineWidth *= 2.2;
    ctx.stroke();
    circle(ctx, -0.8, 0, 0.2);
    ctx.fill();
  },
  ORBIT_BLADE: (ctx) => {
    ctx.beginPath();
    ctx.arc(0, 0, 0.7, 0.4, Math.PI * 1.6);
    ctx.stroke();
    path(ctx, [[0.65, 0.3], [0.95, 0.75], [0.35, 0.65]]);
    ctx.fill();
    circle(ctx, 0, 0, 0.18);
    ctx.fill();
  },
  THUNDER_BOLT: (ctx) => {
    path(ctx, [[0.2, -1], [-0.55, 0.15], [-0.05, 0.15], [-0.25, 1], [0.6, -0.2], [0.1, -0.2]]);
    ctx.fill();
  },
  PULSE_RING: (ctx) => {
    [0.3, 0.62, 0.95].forEach((r) => {
      circle(ctx, 0, 0, r);
      ctx.stroke();
    });
  },
  DRONE_SQUAD: (ctx) => {
    circle(ctx, 0, 0, 0.28);
    ctx.fill();
    [[-0.7, -0.6], [0.7, -0.6], [-0.7, 0.6], [0.7, 0.6]].forEach(([x, y]) => {
      path(ctx, [[0, 0], [x, y]], false);
      ctx.stroke();
      circle(ctx, x, y, 0.2);
      ctx.fill();
    });
  },
  NOVA_BOMB: (ctx) => {
    ctx.beginPath();
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      const r = i % 2 === 0 ? 1 : 0.5;
      ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
  },
  ATTACK_POWER: (ctx) => {
    sword(ctx);
  },
  ATTACK_SPEED: (ctx) => {
    path(ctx, [[-0.9, -0.6], [0, 0], [-0.9, 0.6]], false);
    ctx.stroke();
    path(ctx, [[0, -0.6], [0.9, 0], [0, 0.6]], false);
    ctx.stroke();
  },
  MOVE_SPEED: (ctx) => {
    [-0.55, 0, 0.55].forEach((y, i) => {
      path(ctx, [[-0.9 + i * 0.2, y], [0.5, y]], false);
      ctx.stroke();
    });
    path(ctx, [[0.3, -0.7], [1, 0], [0.3, 0.7]], false);
    ctx.stroke();
  },
  MAX_HP: (ctx) => {
    path(ctx, [[-0.3, -0.9], [0.3, -0.9], [0.3, -0.3], [0.9, -0.3], [0.9, 0.3], [0.3, 0.3], [0.3, 0.9], [-0.3, 0.9], [-0.3, 0.3], [-0.9, 0.3], [-0.9, -0.3], [-0.3, -0.3]]);
    ctx.fill();
  },
  MAGNET_RADIUS: (ctx) => {
    ctx.beginPath();
    ctx.arc(0, 0.1, 0.65, Math.PI, 0);
    ctx.lineTo(0.65, 0.85);
    ctx.lineTo(0.25, 0.85);
    ctx.lineTo(0.25, 0.1);
    ctx.arc(0, 0.1, 0.25, 0, Math.PI, true);
    ctx.lineTo(-0.25, 0.85);
    ctx.lineTo(-0.65, 0.85);
    ctx.closePath();
    ctx.fill();
  },
  CRIT_CHANCE: (ctx) => {
    circle(ctx, 0, 0, 0.7);
    ctx.stroke();
    circle(ctx, 0, 0, 0.2);
    ctx.fill();
    [[-1, 0, -0.45, 0], [0.45, 0, 1, 0], [0, -1, 0, -0.45], [0, 0.45, 0, 1]].forEach(([a, b, c, d]) => {
      path(ctx, [[a, b], [c, d]], false);
      ctx.stroke();
    });
  },
  SWORD_COUNT: (ctx) => {
    ctx.save();
    ctx.translate(-0.35, 0);
    ctx.scale(0.75, 0.75);
    sword(ctx);
    ctx.restore();
    ctx.save();
    ctx.translate(0.45, 0.1);
    ctx.scale(0.75, 0.75);
    sword(ctx);
    ctx.restore();
  },
  SWORD_DAMAGE: (ctx) => {
    ctx.save();
    ctx.translate(0, 0.25);
    ctx.scale(0.8, 0.8);
    sword(ctx);
    ctx.restore();
    ctx.save();
    ctx.translate(0.7, -0.65);
    ctx.scale(0.3, 0.3);
    arrowUp(ctx);
    ctx.restore();
  },
  SWORD_SPEED: (ctx) => {
    ctx.beginPath();
    ctx.arc(0, 0, 0.75, -Math.PI * 0.8, Math.PI * 0.5);
    ctx.stroke();
    path(ctx, [[0.1, 0.55], [-0.1, 1], [-0.5, 0.65]]);
    ctx.fill();
    ctx.save();
    ctx.scale(0.5, 0.5);
    sword(ctx);
    ctx.restore();
  },
  SWORD_SIZE: (ctx) => {
    path(ctx, [[0, -1], [0.35, -0.1], [0.35, 0.5], [-0.35, 0.5], [-0.35, -0.1]]);
    ctx.fill();
    path(ctx, [[-0.8, 0.5], [0.8, 0.5]], false);
    ctx.stroke();
    path(ctx, [[0, 0.5], [0, 0.95]], false);
    ctx.stroke();
  },
  SWORD_RADIUS: (ctx) => {
    circle(ctx, 0, 0, 0.85);
    ctx.setLineDash([0.15, 0.15]);
    ctx.stroke();
    ctx.setLineDash([]);
    circle(ctx, 0.85, 0, 0.2);
    ctx.fill();
    circle(ctx, 0, 0, 0.15);
    ctx.fill();
  },
};

export function drawIcon(
  ctx: CanvasRenderingContext2D,
  key: IconKey | undefined,
  cx: number,
  cy: number,
  size: number,
  color: string
) {
  if (!key || !ICONS[key]) return;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(size / 2, size / 2);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.14;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ICONS[key](ctx);
  ctx.restore();
}
