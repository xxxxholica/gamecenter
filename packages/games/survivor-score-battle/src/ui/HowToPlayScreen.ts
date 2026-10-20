import { InputState } from '../types';
import { SoundManager } from '../audio/SoundManager';
import { getInputMode } from '../../../../shared/arcadeGuide';

export class HowToPlayScreen {
  public update(input: InputState, soundManager: SoundManager): boolean {
    if (input.confirm || input.cancel) {
      soundManager.sfx.playMenuConfirm();
      return true; // Return to title
    }
    return false;
  }

  public render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.save();

    // Dark Background
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Title
    ctx.font = "900 48px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 15;
    ctx.fillText('遊び方', width / 2, 40);
    ctx.shadowBlur = 0;

    const isPad = getInputMode() === 'gamepad';
    const moveDesc = isPad
      ? 'レバーまたは十字キーで8方向移動。通常弾攻撃は完全自動！敵の位置を把握し、回避と位置取りに集中せよ。'
      : 'WASD または 矢印キーで8方向移動。通常弾攻撃は完全自動！敵の位置を把握し、回避と位置取りに集中せよ。';
    const specialDesc = isPad
      ? 'ゲージ100%で必殺技ボタン(Y/LB/RB/RT)！超巨大化した無数の剣が超高速回転し、周囲の敵群とライバルを一瞬で薙ぎ払う！'
      : 'ゲージ100%で必殺技キー(Space)！超巨大化した無数の剣が超高速回転し、周囲の敵群とライバルを一瞬で薙ぎ払う！';

    // 4 Explanation Cards
    const cardW = 380;
    const cardH = 340;
    const cards = [
      {
        title: '基本操作 & 自動攻撃',
        desc: moveDesc,
      },
      {
        title: 'エンドレス PvPvE 斬り合い',
        desc: '剣アイテムを拾うと回転光剣が増殖！敵だけでなく強豪CPUとも直接激突！撃破されたCPUは一定時間で復活＆パワーアップ！力尽きるまで生き残れ！',
      },
      {
        title: '強化 & レベルアップ',
        desc: '敵を倒して散らばる経験値ジェムを回収！レベルアップで新武器やステータスUP、回転剣の本数・威力・回転速度を強化！',
      },
      {
        title: '必殺技 SWORD STORM',
        desc: specialDesc,
      },
    ];

    const gap = 30;
    const startX = (width - (cardW * 2 + gap)) / 2;
    const startY = 130;

    for (let i = 0; i < cards.length; i++) {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = startX + col * (cardW + gap);
      const y = startY + row * (cardH + 25);
      const c = cards[i];

      ctx.fillStyle = 'rgba(8, 16, 32, 0.88)';
      ctx.strokeStyle = '#00f0ff';
      ctx.lineWidth = 2;
      ctx.fillRect(x, y, cardW, cardH);
      ctx.strokeRect(x, y, cardW, cardH);

      ctx.font = "900 22px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
      ctx.fillStyle = '#ffd700';
      ctx.fillText(c.title, x + cardW / 2, y + 40);

      ctx.font = "700 16px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
      ctx.fillStyle = '#ccddee';
      this.wrapText(ctx, c.desc, x + cardW / 2, y + 90, cardW - 40, 26);
    }

    ctx.restore();
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ) {
    const words = text.split('');
    let line = '';
    let curY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, x, curY);
        line = words[n];
        curY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, curY);
  }
}
