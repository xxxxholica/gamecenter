import { ContenderState } from '../types';
import { Player } from '../entities/Player';
import { Boss } from '../entities/Boss';
import { PickupItem } from '../items/ExpGem';

/** SPECIAL が使える間、ランキング変動のバーと同じ場所に出すお知らせの周期(秒)と、1回に出しておく長さ(秒) */
const SPECIAL_NOTICE_PERIOD = 12;
const SPECIAL_NOTICE_SHOW = 3.5;
/** SPECIAL を発動するアケコンのボタン名(ボタンガイドと同じ表記: Y / LB / RB / RT のどれでもよい) */
const SPECIAL_BUTTONS = ['Y', 'LB', 'RB', 'RT'];

export class HudRenderer {
  /** SPECIAL が使える状態になってからの経過時間(秒)。使えない間は 0 */
  private specialReadyClock: number = 0;
  private specialReady: boolean = false;
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

  /** specialReady: SPECIAL を今すぐ発動できる状態か。使える間だけ周期的にお知らせを出す */
  public update(dt: number, specialReady: boolean = false) {
    this.specialReady = specialReady;
    this.specialReadyClock = specialReady ? this.specialReadyClock + dt : 0;
    if (this.rankChangeTimer > 0) {
      this.rankChangeTimer -= dt;
      if (this.rankChangeTimer <= 0) {
        this.rankChangeText = null;
      }
    }
  }

  /** 周期の最初の SPECIAL_NOTICE_SHOW 秒だけ出す(使えるようになった直後から。使うまで繰り返す) */
  private isSpecialNoticeVisible(): boolean {
    return this.specialReady && this.specialReadyClock % SPECIAL_NOTICE_PERIOD < SPECIAL_NOTICE_SHOW;
  }

  /** ボタンガイドと同じ見た目の丸いバッジ(暗い塗り+白縁+白文字)を描く。描いた幅を返す */
  private drawButtonBadge(ctx: CanvasRenderingContext2D, label: string, left: number, cy: number): number {
    ctx.save();
    ctx.font = "900 17px system-ui, 'Hiragino Kaku Gothic ProN', sans-serif";
    const w = Math.max(30, ctx.measureText(label).width + 18);
    const h = 30;
    const r = h / 2;
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.moveTo(left + r, cy - r);
    ctx.arcTo(left + w, cy - r, left + w, cy + r, r);
    ctx.arcTo(left + w, cy + r, left, cy + r, r);
    ctx.arcTo(left, cy + r, left, cy - r, r);
    ctx.arcTo(left, cy - r, left + w, cy - r, r);
    ctx.closePath();
    ctx.fillStyle = '#10131a';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, left + w / 2, cy + 1);
    ctx.restore();
    return w;
  }

  /** 「(Y)(LB)(RB)(RT) で必殺技を発動」を1行で出す。ランキング変動のバーと同じ位置・同じ高さ */
  private renderSpecialNotice(ctx: CanvasRenderingContext2D, width: number, height: number) {
    const boxH = 75;
    const boxY = height * 0.28;
    const pulse = 0.65 + 0.35 * Math.sin(this.specialReadyClock * 6);

    // 1行ぶんの幅を測る: ボタンのバッジ + 説明
    const label = 'で必殺技を発動';
    const badgeFont = "900 17px system-ui, 'Hiragino Kaku Gothic ProN', sans-serif";
    const labelFont = "700 24px system-ui, 'Hiragino Kaku Gothic ProN', sans-serif";
    ctx.save();
    ctx.font = badgeFont;
    const badgeW = SPECIAL_BUTTONS.map((b) => Math.max(30, ctx.measureText(b).width + 18));
    ctx.font = labelFont;
    const labelW = ctx.measureText(label).width;
    ctx.restore();
    const badgeGap = 8;
    const badgesW = badgeW.reduce((a, b) => a + b, 0) + badgeGap * (SPECIAL_BUTTONS.length - 1);
    const contentW = badgesW + 14 + labelW;
    // 順位の上下のウィンドウ(RANK UP / RANK DOWN)と同じ大きさ。中身はこの幅に収まる
    const boxW = Math.max(500, contentW + 64);

    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(5, 10, 25, 0.92)';
    ctx.strokeStyle = '#ff1133';
    ctx.lineWidth = 4;
    ctx.shadowColor = '#ff1133';
    ctx.shadowBlur = 18 + 14 * pulse;
    ctx.fillRect((width - boxW) / 2, boxY - boxH / 2, boxW, boxH);
    ctx.strokeRect((width - boxW) / 2, boxY - boxH / 2, boxW, boxH);
    ctx.shadowBlur = 0;

    let x = (width - contentW) / 2;
    ctx.textAlign = 'left';
    SPECIAL_BUTTONS.forEach((b, i) => {
      this.drawButtonBadge(ctx, b, x, boxY);
      x += badgeW[i] + badgeGap;
    });
    x += 14 - badgeGap;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.font = "700 24px system-ui, 'Hiragino Kaku Gothic ProN', sans-serif";
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, x, boxY + 1);
    ctx.restore();
  }

  public render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: Player,
    contenders: ContenderState[],
    gameTime: number,
    activeBoss: Boss | null,
    warningBanner: string | null,
    activeItems?: PickupItem[],
    cameraX?: number,
    cameraY?: number
  ) {
    ctx.save();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    const layout = this.statusLayout(ctx, width, height);
    const comboBottom = layout.topY - 40;
    const comboH = 56;

    // 2. Boss Health Bar (Bottom Center, above time/score row)
    if (activeBoss && activeBoss.alive) {
      const barW = 550;
      const barH = 26;
      const barX = (width - barW) / 2;
      const barY = comboBottom - comboH - 10 - barH;
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

    // 3. Top-Right: Real-Time Ranking Leaderboard (Spectator Friendly!)
    this.renderLeaderboard(ctx, width, contenders);

    // 4. Center: Rank Up / Rank Down / #1 Cut-in Banner。ランキング変動が無いときは、SPECIAL のお知らせを同じ場所に出す
    // SPECIAL が使える間は、順位の変動(RANK UP / DOWN / #1)は出さない。お知らせだけを周期的に出す
    if (this.specialReady) {
      if (this.isSpecialNoticeVisible()) this.renderSpecialNotice(ctx, width, height);
    } else if (this.rankChangeText) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const isTop = this.rankChangeText.includes('#1');
      const boxW = 500;   // RANK UP / RANK DOWN / YOU ARE #1 / SPECIAL のお知らせは、すべて同じ大きさ
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

    // 6. Combo Meter (above the score column)
    if (player.comboCount > 0) {
      this.renderComboMeter(
        ctx,
        layout.spanL + layout.colW * 1.5,
        comboBottom - comboH + 19,
        player
      );
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

  private renderLeaderboard(
    ctx: CanvasRenderingContext2D,
    width: number,
    contenders: ContenderState[]
  ) {
    const boardW = 300;
    const rowH = 34;
    const boardX = width - boardW - 24;
    const boardY = 20;

    // Header
    ctx.fillStyle = 'rgba(5, 12, 24, 0.88)';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;

    const totalH = contenders.length * rowH + 16;
    ctx.fillRect(boardX, boardY, boardW, totalH);
    ctx.strokeRect(boardX, boardY, boardW, totalH);
    ctx.shadowBlur = 0;

    // 文字は各行の枠の縦中央に揃える
    ctx.save();
    ctx.textBaseline = 'middle';
    for (let i = 0; i < contenders.length; i++) {
      const c = contenders[i];
      const y = boardY + 10 + i * rowH;
      const isYou = c.isPlayer;
      const isAlive = c.alive;

      if (isYou) {
        // Glowing highlight for player row
        ctx.fillStyle = 'rgba(0, 240, 255, 0.22)';
        ctx.fillRect(boardX + 6, y - 2, boardW - 12, rowH - 4);
        ctx.strokeStyle = '#ffd700';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(boardX + 6, y - 2, boardW - 12, rowH - 4);
      } else if (!isAlive) {
        ctx.fillStyle = 'rgba(255, 34, 85, 0.12)';
        ctx.fillRect(boardX + 6, y - 2, boardW - 12, rowH - 4);
      }

      // Rank number
      ctx.font = '900 18px Impact, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = !isAlive ? '#666677' : i === 0 ? '#ffd700' : i === 1 ? '#c0c0c0' : i === 2 ? '#cd7f32' : '#8899aa';
      ctx.fillText(`${i + 1}`, boardX + 24, y + rowH / 2 - 4);

      // Name
      ctx.textAlign = 'left';
      ctx.fillStyle = !isAlive ? '#884455' : isYou ? '#ffd700' : c.color;
      ctx.font = isYou ? '900 18px Impact, sans-serif' : '700 16px Impact, sans-serif';
      const isRespawning = !isAlive && c.respawnTimer && c.respawnTimer > 0;
      const displayName = !isAlive ? (isRespawning ? `${c.name} ${Math.ceil(c.respawnTimer!)}s` : `${c.name} 脱落`) : c.name;
      ctx.fillText(displayName, boardX + 46, y + rowH / 2 - 4);

      // Score
      ctx.textAlign = 'right';
      ctx.fillStyle = !isAlive ? '#778899' : '#ffffff';
      ctx.font = '900 18px Impact, sans-serif';
      ctx.fillText(c.score.toLocaleString(), boardX + boardW - 16, y + rowH / 2 - 4);
    }
    ctx.restore();
  }

  // x, y はコンボ文字の中心。下にゲージが続く(全体の高さは約56px)
  private renderComboMeter(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    player: Player
  ) {
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Combo text
    ctx.font = '900 38px Impact, sans-serif';
    ctx.fillStyle = '#ff9900';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 5;
    ctx.shadowColor = '#ff5500';
    ctx.shadowBlur = 18;

    const countText = `COMBO ×${player.comboCount}`;
    ctx.strokeText(countText, x, y);
    ctx.fillText(countText, x, y);

    // Combo decay bar
    const barW = 180;
    const barH = 6;
    const pct = Math.max(0, player.comboTimer / player.comboDuration);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x - barW / 2, y + 30, barW, barH);
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(x - barW / 2, y + 30, barW * pct, barH);

    ctx.restore();
  }

  // HP/XPバーと、その上のTIME/SCORE/SPECIAL段の配置。他の要素(コンボ、ボスHP)の基準にもなる。
  private statusLayout(ctx: CanvasRenderingContext2D, width: number, height: number) {
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

    // 2. Time / Score / Special, above the HP bar (label over value, each centered)
    const mins = Math.floor(gameTime / 60);
    const secs = Math.floor(gameTime % 60);
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    const specPct = Math.min(1.0, player.specialGauge / 100);
    const { colW, spanL, valueSize, labelSize, valueY, labelY } = this.statusLayout(ctx, width, height);
    const colX = (i: number) => spanL + colW * (i + 0.5);
    const cols = [
      { x: colX(0), label: 'TIME', value: timeStr, color: '#00f0ff', glow: false },
      { x: colX(1), label: 'SCORE', value: player.score.toLocaleString(), color: '#ffffff', glow: false },
      player.isSpecialReady
        ? { x: colX(2), label: 'SPECIAL', value: 'READY', color: '#ff1133', glow: true }
        : { x: colX(2), label: 'SPECIAL', value: `${Math.floor(specPct * 100)}%`, color: '#ffd700', glow: false },
    ];
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    for (const col of cols) {
      ctx.font = `900 ${labelSize}px Impact, sans-serif`;
      ctx.fillStyle = '#8899aa';
      ctx.strokeText(col.label, col.x, labelY);
      ctx.fillText(col.label, col.x, labelY);
      ctx.font = `900 ${valueSize}px Impact, sans-serif`;
      ctx.fillStyle = col.color;
      if (col.glow) {
        ctx.shadowColor = '#ff1133';
        ctx.shadowBlur = 18;
      }
      ctx.strokeText(col.value, col.x, valueY);
      ctx.fillText(col.value, col.x, valueY);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
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

      ctx.save();
      ctx.translate(screenX, screenY);

      // Draw glowing golden locator beacon pointer
      ctx.rotate(angle);
      ctx.fillStyle = '#ffd700';
      ctx.shadowColor = '#ffd700';
      ctx.shadowBlur = 12;

      // Pointer chevron
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-8, -9);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-8, 9);
      ctx.closePath();
      ctx.fill();

      // Mini sword icon & distance label
      ctx.rotate(-angle);
      ctx.font = '900 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = '#000000';
      ctx.shadowBlur = 4;
      ctx.fillText(`${Math.round(dist)}m`, 0, -18);

      ctx.restore();
    }
    ctx.restore();
  }
}
