import { Player } from '../entities/Player';
import { Boss } from '../entities/Boss';
import { PickupItem } from '../items/ExpGem';
import { getInputMode } from '../../../../shared/arcadeGuide';
import { currentScale, drawChevron, drawShadowedLabel, LOCATOR_FONT } from './locatorSprites';

/** SPECIAL を発動するボタン名(コントローラー / キーボード) */
const SPECIAL_BUTTONS_PAD = ['Y', 'LB', 'RB', 'RT'];
const SPECIAL_BUTTONS_KBD = ['Space'];

/** スペシャルの名前。ためている間は左から色で埋まり、満タンで虹色になる */
const SPECIAL_NAME = 'SWORD STORM';
/** スペシャル表示の文字 */
const SPECIAL_TEXT_FONT = "900 38px Impact, 'Arial Black', sans-serif";
const SPECIAL_TEXT_SPACING = '4px';

/** HPバーの真上に置くスペシャル表示(準備中 / 発動)の高さ */
const SPECIAL_GAUGE_H = 40;

export class HudRenderer {
  /** SPECIAL が使える状態になってからの経過時間(秒)。使えない間は 0 */
  private specialReadyClock: number = 0;
  /** スペシャルの行の文字幅(入力モード・文言ごと) */
  private readonly specialRowMetrics = new Map<string, { badgeW: number[]; labelW: number }>();
  /** ボタンバッジの幅(キー表示か・文字ごと) */
  private readonly badgeWidths = new Map<string, number>();
  private rankChangeText: string | null = null;
  private rankChangeTimer: number = 0;
  private rankChangeIsUp: boolean = true;

  public notifyRankChange(newRank: number, prevRank: number) {
    if (newRank < prevRank) {
      // Rank Up (1 is best)
      this.rankChangeText = newRank === 1 ? 'YOU ARE #1' : `RANK UP #${newRank}`;
      this.rankChangeIsUp = true;
      this.rankChangeTimer = 2.5;
    } else if (newRank > prevRank) {
      // Rank Down
      this.rankChangeText = `RANK DOWN #${newRank}`;
      this.rankChangeIsUp = false;
      this.rankChangeTimer = 2.0;
    }
  }

  /** specialReady: SPECIAL を今すぐ発動できる状態か。使える間はゲージを点滅させる */
  public update(dt: number, specialReady: boolean = false) {
    this.specialReadyClock = specialReady ? this.specialReadyClock + dt : 0;
    if (this.rankChangeTimer > 0) {
      this.rankChangeTimer -= dt;
      if (this.rankChangeTimer <= 0) {
        this.rankChangeText = null;
      }
    }
  }

  /** ボタンガイドと同じ見た目のバッジを描く。pad時は丸、key時はキートップ調。描いた幅を返す */
  private drawButtonBadge(ctx: CanvasRenderingContext2D, label: string, left: number, cy: number, isKey: boolean = false, tint?: string | CanvasGradient): number {
    ctx.save();
    ctx.font = isKey
      ? "800 16px system-ui, 'Hiragino Kaku Gothic ProN', sans-serif"
      : "900 17px system-ui, 'Hiragino Kaku Gothic ProN', sans-serif";
    const widthKey = `${isKey}|${label}`;
    let w = this.badgeWidths.get(widthKey);
    if (w === undefined) {
      w = Math.max(30, ctx.measureText(label).width + (isKey ? 22 : 18));
      this.badgeWidths.set(widthKey, w);
    }
    const h = 30;
    const r = isKey ? 6 : h / 2; // 角の丸み(キーは四角、パッドは丸)
    const hh = h / 2;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(left + r, cy - hh);
    ctx.arcTo(left + w, cy - hh, left + w, cy + hh, r);
    ctx.arcTo(left + w, cy + hh, left, cy + hh, r);
    ctx.arcTo(left, cy + hh, left, cy - hh, r);
    ctx.arcTo(left, cy - hh, left + w, cy - hh, r);
    ctx.closePath();
    // tint を指定すると、その色(黄色など)のボタンにする
    ctx.fillStyle = typeof tint === 'string' ? 'rgba(255, 215, 0, 0.22)' : tint ? 'rgba(255, 255, 255, 0.2)' : isKey ? 'rgba(255, 255, 255, 0.18)' : 'rgba(255, 255, 255, 0.14)';
    ctx.fill();
    ctx.strokeStyle = tint ?? (isKey ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.35)');
    ctx.lineWidth = 2;
    ctx.stroke();

    if (isKey) {
      // キートップの下部ハイライト線
      ctx.strokeStyle = tint ?? 'rgba(255, 255, 255, 0.75)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(left + r, cy + hh - 1);
      ctx.lineTo(left + w - r, cy + hh - 1);
      ctx.stroke();
    }

    ctx.fillStyle = tint ?? '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, left + w / 2, cy + (isKey ? 0 : 1));
    ctx.restore();
    return w;
  }

  /**
   * 「[ボタン]SWORD STORM」の1行を cx を中心に出す。入力モードに応じてキーボード用キーに自動切替。
   * progress が数値(0〜1)の間は、この1行そのものがゲージになり、左から色で埋まる。null なら満タン(虹色)
   */
  private renderSpecialRow(ctx: CanvasRenderingContext2D, cx: number, cy: number, label: string, progress: number | null) {
    const isPad = getInputMode() === 'gamepad';
    const buttons = isPad ? SPECIAL_BUTTONS_PAD : SPECIAL_BUTTONS_KBD;
    ctx.save();
    ctx.font = SPECIAL_TEXT_FONT;
    ctx.letterSpacing = SPECIAL_TEXT_SPACING;
    // 文字の幅は、入力モードと文言が同じなら変わらないので、最初の1回だけ測る(毎フレーム measureText しない)
    const metricsKey = `${isPad}|${label}`;
    let metrics = this.specialRowMetrics.get(metricsKey);
    if (!metrics) {
      ctx.font = isPad
        ? "900 17px system-ui, 'Hiragino Kaku Gothic ProN', sans-serif"
        : "800 16px system-ui, 'Hiragino Kaku Gothic ProN', sans-serif";
      const widths = buttons.map((b) => Math.max(30, ctx.measureText(b).width + (isPad ? 18 : 22)));
      ctx.font = SPECIAL_TEXT_FONT;
      ctx.letterSpacing = SPECIAL_TEXT_SPACING;
      metrics = { badgeW: widths, labelW: ctx.measureText(label).width };
      this.specialRowMetrics.set(metricsKey, metrics);
    }
    const { badgeW, labelW } = metrics;
    const badgeGap = 6;
    const badgesW = badgeW.reduce((a, b) => a + b, 0) + badgeGap * (buttons.length - 1);
    const contentW = badgesW + 14 + labelW;
    const left = cx - contentW / 2;
    const textX = left + badgesW + 14;

    // 文字の色(満タンは時間とともに流れる虹色)
    let fill: string | CanvasGradient = '#ffd700';
    if (progress === null) {
      const hue = (this.specialReadyClock * 120) % 360;
      const grad = ctx.createLinearGradient(left, 0, textX + labelW, 0); // ボタンから文字まで、1行ぜんたいで流れる虹色
      for (let i = 0; i <= 6; i++) grad.addColorStop(i / 6, `hsl(${(hue + i * 60) % 360}, 100%, 60%)`);
      fill = grad;
    }

    const drawRow = (textFill: string | CanvasGradient, alpha: number, badgeTint?: string | CanvasGradient) => {
      ctx.globalAlpha = alpha;
      let x = left;
      ctx.letterSpacing = '0px'; // ボタンの文字には字間を付けない
      buttons.forEach((b, i) => {
        this.drawButtonBadge(ctx, b, x, cy, !isPad, badgeTint);
        x += badgeW[i] + badgeGap;
      });
      ctx.font = SPECIAL_TEXT_FONT;
      ctx.letterSpacing = SPECIAL_TEXT_SPACING;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 6;
      ctx.lineJoin = 'round';
      ctx.strokeStyle = '#000000';
      ctx.strokeText(label, textX, cy);
      ctx.fillStyle = textFill;
      ctx.fillText(label, textX, cy);
    };

    if (progress === null) {
      drawRow(fill, 1, fill);
    } else {
      // 下地(まだ埋まっていない部分)を暗く出し、その上に、左から progress の分だけ明るい1行を重ねる
      drawRow('#4a5566', 0.45);
      ctx.save();
      ctx.beginPath();
      ctx.rect(left - 4, cy - SPECIAL_GAUGE_H / 2, (contentW + 8) * progress, SPECIAL_GAUGE_H);
      ctx.clip();
      drawRow(fill, 1, '#ffd700');
      ctx.restore();
    }
    ctx.restore();
  }

  public render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: Player,
    gameTime: number,
    activeBoss: Boss | null,
    warningBanner: string | null,
    activeItems?: PickupItem[],
    cameraX?: number,
    cameraY?: number
  ) {
    if (typeof location !== 'undefined' && location.search.includes('noHud')) return;
    ctx.save();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';


    // 2. Boss Health Bar (Bottom Center, above time/score row)
    if (activeBoss && activeBoss.alive) {
      const barW = 550;
      const barH = 26;
      const barX = (width - barW) / 2;
      const barY = height - 58 - SPECIAL_GAUGE_H - 12 - 14 - barH; // HPバーとスペシャルゲージの上
      const hpPct = Math.max(0, activeBoss.hp / activeBoss.maxHp);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.strokeStyle = activeBoss.color;
      ctx.lineWidth = 3;
      ctx.shadowColor = activeBoss.color;
      ctx.shadowBlur = 15;
      ctx.fillRect(barX, barY, barW, barH);
      ctx.strokeRect(barX, barY, barW, barH);

      // Gradient HP fill
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, '#ff0033');
      grad.addColorStop(1, '#ff8800');
      ctx.fillStyle = grad;
      ctx.fillRect(barX + 3, barY + 3, (barW - 6) * hpPct, barH - 6);

      // Boss Name
      ctx.shadowBlur = 0;
      ctx.font = '900 18px Impact, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.fillText(`${activeBoss.bossName}  ${Math.round(hpPct * 100)}%`, width / 2, barY + 4);
    }

    // 4. Center: Rank Up / Rank Down / #1 Cut-in Banner
    if (this.rankChangeText) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const isTop = this.rankChangeText.includes('#1');
      const boxW = 500;
      const boxH = 75;
      const boxY = height * 0.28;

      ctx.fillStyle = 'rgba(5, 10, 25, 0.92)';
      ctx.strokeStyle = isTop ? '#ffd700' : this.rankChangeIsUp ? '#00ffaa' : '#ff2255';
      ctx.lineWidth = 4;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 25;

      ctx.fillRect((width - boxW) / 2, boxY - boxH / 2, boxW, boxH);
      ctx.strokeRect((width - boxW) / 2, boxY - boxH / 2, boxW, boxH);

      ctx.font = '900 36px Impact, sans-serif';
      ctx.fillStyle = ctx.strokeStyle;
      ctx.fillText(this.rankChangeText, width / 2, boxY);
      ctx.restore();
    }

    // 5. Warning Alert Banner (Boss approach or Climax)
    if (warningBanner) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const boxW = 750;
      const boxH = 65;
      const boxY = height * 0.2;

      ctx.fillStyle = 'rgba(40, 0, 10, 0.92)';
      ctx.strokeStyle = '#ff0033';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#ff0033';
      ctx.shadowBlur = 25;
      ctx.fillRect((width - boxW) / 2, boxY - boxH / 2, boxW, boxH);
      ctx.strokeRect((width - boxW) / 2, boxY - boxH / 2, boxW, boxH);

      ctx.font = '900 32px Impact, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(warningBanner, width / 2, boxY);
      ctx.restore();
    }

    // 7. Bottom Center: Special Gauge & HP Bar
    this.renderPlayerStatus(ctx, width, height, player, gameTime);

    // 8. Bottom Edge: EXP Bar
    this.renderExpBar(ctx, width, height, player);

    // 10. Screen Edge Sword Locator Arrows
    if (activeItems && cameraX !== undefined && cameraY !== undefined) {
      this.renderSwordLocators(ctx, width, height, player, activeItems, cameraX, cameraY);
    }

    ctx.restore();
  }

  // HP/XPバーと、その上のTIME/SCORE/SPECIAL段の配置。他の要素(ボスHP)の基準にもなる。
  private statusLayoutCache: { width: number; height: number; value: ReturnType<HudRenderer['computeStatusLayout']> } | null = null;

  /** 配置は画面の大きさだけで決まるので、大きさが変わらない限り測り直さない(毎フレーム measureText を5回呼んでいた) */
  private statusLayout(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const c = this.statusLayoutCache;
    if (c && c.width === width && c.height === height) return c.value;
    const value = this.computeStatusLayout(ctx, width, height);
    this.statusLayoutCache = { width, height, value };
    return value;
  }

  private computeStatusLayout(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const barW = 440;
    const barX = (width - barW) / 2;
    const barY = height - 58;
    // 左端はHPラベル、右端はHP数値(3桁想定)の端に合わせ、その幅を3等分して列にする
    ctx.save();
    ctx.font = '900 20px Impact, sans-serif';
    const spanL = barX - 12 - ctx.measureText('HP').width;
    const spanR = barX + barW + 12 + ctx.measureText('000').width;
    // 最も幅を取る値(6桁スコア、時刻、READY)が列に収まる最大サイズを求める
    ctx.font = '900 60px Impact, sans-serif';
    const refW = Math.max(...['999,999', '00:00', 'READY'].map((t) => ctx.measureText(t).width));
    ctx.restore();
    const colW = (spanR - spanL) / 3;
    const valueSize = Math.max(28, Math.min(80, Math.floor((60 * (colW - 8)) / refW)));
    const labelSize = Math.round(valueSize * 0.4);
    const valueY = barY - 12;
    const labelY = valueY - valueSize - 4;
    const topY = labelY - labelSize;
    return { colW, spanL, valueSize, labelSize, valueY, labelY, topY };
  }

  private renderPlayerStatus(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: Player,
    gameTime: number
  ) {
    // 1. Health Bar (Bottom Center)
    const barW = 440;
    const barH = 22;
    const barX = (width - barW) / 2;
    const barY = height - 58;
    const hpPct = Math.max(0, player.hp / player.maxHp);

    // 割合に応じて緑(100%)から黄、赤(0%)へ連続的に変化させる
    const hpColor = `hsl(${Math.round(hpPct * 120)}, 100%, 55%)`;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.strokeStyle = hpColor;
    ctx.lineWidth = 2;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.fillStyle = hpColor;
    ctx.fillRect(barX + 2, barY + 2, (barW - 4) * hpPct, barH - 4);

    this.drawBarLabel(ctx, 'HP', barX - 12, barY + barH / 2, 'right', hpColor);
    this.drawBarLabel(
      ctx,
      `${Math.ceil(player.hp)}`,
      barX + barW + 12,
      barY + barH / 2,
      'left',
      hpColor
    );

    // 2. TIME は左上、SCORE は右上、SPECIAL は HP バーの真上(ラベルが上、値が下)
    const mins = Math.floor(gameTime / 60);
    const secs = Math.floor(gameTime % 60);
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    const specPct = Math.min(1.0, player.specialGauge / 100);
    const { valueSize, labelSize } = this.statusLayout(ctx, width, height);
    const margin = 24;
    const topLabelY = margin + labelSize;
    const topValueY = topLabelY + valueSize + 4;
    const cols = [
      { x: margin, align: 'left' as CanvasTextAlign, label: 'TIME', value: timeStr, color: '#00f0ff' },
      { x: width - margin, align: 'right' as CanvasTextAlign, label: 'SCORE', value: player.score.toLocaleString(), color: '#ffffff' },
    ];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    for (const col of cols) {
      ctx.textAlign = col.align;
      ctx.font = `900 ${labelSize}px Impact, sans-serif`;
      ctx.fillStyle = '#8899aa';
      ctx.strokeText(col.label, col.x, topLabelY);
      ctx.fillText(col.label, col.x, topLabelY);
      ctx.font = `900 ${valueSize}px Impact, sans-serif`;
      ctx.fillStyle = col.color;
      ctx.strokeText(col.value, col.x, topValueY);
      ctx.fillText(col.value, col.x, topValueY);
    }
    ctx.restore();

    // 3. SPECIAL: HP バーの真上。ボタン表示も最初から出し、ためている間は1行ぜんたいが左から色で埋まるゲージになる。満タンで虹色
    const cy = barY - 12 - SPECIAL_GAUGE_H / 2;
    if (player.isSpecialReady) this.renderSpecialRow(ctx, width / 2, cy, SPECIAL_NAME, null);
    else this.renderSpecialRow(ctx, width / 2, cy, SPECIAL_NAME, specPct);
  }

  private renderExpBar(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: Player
  ) {
    const barW = 440;
    const barH = 22;
    const barX = (width - barW) / 2;
    const barY = height - 30;
    const expPct = Math.min(1.0, player.exp / player.nextExp);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeRect(barX, barY, barW, barH);

    const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
    grad.addColorStop(0, '#00aaff');
    grad.addColorStop(0.5, '#00f0ff');
    grad.addColorStop(1, '#ffd700');
    ctx.fillStyle = grad;
    ctx.fillRect(barX + 2, barY + 2, (barW - 4) * expPct, barH - 4);

    this.drawBarLabel(ctx, 'XP', barX - 12, barY + barH / 2, 'right', '#00f0ff');
    this.drawBarLabel(ctx, `LV ${player.level}`, barX + barW + 12, barY + barH / 2, 'left', '#ffd700');
  }

  private drawBarLabel(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    align: CanvasTextAlign,
    color: string
  ) {
    ctx.save();
    ctx.font = '900 20px Impact, sans-serif';
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#000000';
    ctx.fillStyle = color;
    ctx.strokeText(text, x, y + 1);
    ctx.fillText(text, x, y + 1);
    ctx.restore();
  }

  private renderSwordLocators(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: Player,
    items: PickupItem[],
    cameraX: number,
    cameraY: number
  ) {
    const swordItems = items.filter((it) => it.type === 'SWORD_ITEM' && it.active);
    if (swordItems.length === 0) return;

    ctx.save();
    ctx.font = LOCATOR_FONT;
    const scale = currentScale(ctx);
    const margin = 55;
    for (const item of swordItems) {
      const sx = item.x - cameraX + width / 2;
      const sy = item.y - cameraY + height / 2;

      // Skip if comfortably inside on-screen area
      if (sx >= margin && sx <= width - margin && sy >= margin && sy <= height - margin) {
        continue;
      }

      const dx = sx - width / 2;
      const dy = sy - height / 2;
      const angle = Math.atan2(dy, dx);
      const dist = Math.hypot(item.x - player.x, item.y - player.y);

      // Clamp pointer to screen perimeter
      const hw = width / 2 - margin;
      const hh = height / 2 - margin;

      let px = 0;
      let py = 0;
      if (Math.abs(dx * hh) > Math.abs(dy * hw)) {
        px = Math.sign(dx) * hw;
        py = px * Math.tan(angle);
      } else {
        py = Math.sign(dy) * hh;
        px = py / Math.tan(angle);
      }

      const screenX = width / 2 + px;
      const screenY = height / 2 + py;

      // 金色に光る矢印と、距離の文字(影つき)。ぼかしは描いておいた絵を貼る(locatorSprites.ts)
      ctx.save();
      ctx.translate(screenX, screenY);
      drawChevron(ctx, angle, scale);
      drawShadowedLabel(ctx, `${Math.round(dist)}m`, 0, -18, scale);
      ctx.restore();
    }
    ctx.restore();
  }
}
