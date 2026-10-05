import { ContenderState } from '../types';
import { Player } from '../entities/Player';
import { Boss } from '../entities/Boss';
import { PickupItem } from '../items/ExpGem';

export class HudRenderer {
  private rankChangeText: string | null = null;
  private rankChangeTimer: number = 0;
  private rankChangeIsUp: boolean = true;

  public notifyRankChange(newRank: number, prevRank: number) {
    if (newRank < prevRank) {
      // Rank Up (1 is best)
      this.rankChangeText = newRank === 1 ? '👑 YOU ARE #1! 👑' : `▲ RANK UP! #${newRank}`;
      this.rankChangeIsUp = true;
      this.rankChangeTimer = 2.5;
    } else if (newRank > prevRank) {
      // Rank Down
      this.rankChangeText = `▼ RANK DOWN! #${newRank}`;
      this.rankChangeIsUp = false;
      this.rankChangeTimer = 2.0;
    }
  }

  public update(dt: number) {
    if (this.rankChangeTimer > 0) {
      this.rankChangeTimer -= dt;
      if (this.rankChangeTimer <= 0) {
        this.rankChangeText = null;
      }
    }
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

    // 1. Top Center: Endless Survival Stopwatch
    const mins = Math.floor(gameTime / 60);
    const secs = Math.floor(gameTime % 60);
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';

    // Timer background badge
    const badgeW = 240;
    const badgeH = 50;
    ctx.fillStyle = 'rgba(4, 10, 20, 0.88)';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 10;
    ctx.fillRect(width / 2 - badgeW / 2, 16, badgeW, badgeH);
    ctx.strokeRect(width / 2 - badgeW / 2, 16, badgeW, badgeH);
    ctx.shadowBlur = 0;

    // Small header label
    ctx.font = '900 11px Impact, sans-serif';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('⚡ SURVIVAL TIME ⚡', width / 2, 20);

    ctx.font = '900 28px Impact, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(timeStr, width / 2, 33);

    // 2. Boss Health Bar (Top Center below timer)
    if (activeBoss && activeBoss.alive) {
      const barW = 550;
      const barH = 26;
      const barX = (width - barW) / 2;
      const barY = 76;
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
      ctx.fillText(`⚔ ${activeBoss.bossName} ⚔  ${Math.round(hpPct * 100)}%`, width / 2, barY + 4);
    }

    // 3. Top-Right: Real-Time Ranking Leaderboard (Spectator Friendly!)
    this.renderLeaderboard(ctx, width, contenders);

    // 4. Center: Rank Up / Rank Down / #1 Cut-in Banner
    if (this.rankChangeText) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      const isTop = this.rankChangeText.includes('#1');
      const boxW = isTop ? 620 : 500;
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

    // 6. Mid-Right: Combo Meter
    if (player.comboCount > 0) {
      this.renderComboMeter(ctx, width, height, player);
    }

    // 7. Bottom Center: Special Gauge & HP Bar
    this.renderPlayerStatus(ctx, width, height, player);

    // 8. Bottom Edge: EXP Bar
    this.renderExpBar(ctx, width, height, player);

    // 9. Top-Left: Player Stats & Kills
    this.renderPlayerStats(ctx, player);

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
    const boardW = 390;
    const rowH = 34;
    const boardX = width - boardW - 24;
    const boardY = 20;

    // Header
    ctx.fillStyle = 'rgba(5, 12, 24, 0.88)';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 2;
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 12;

    const totalH = 44 + contenders.length * rowH + 8;
    ctx.fillRect(boardX, boardY, boardW, totalH);
    ctx.strokeRect(boardX, boardY, boardW, totalH);
    ctx.shadowBlur = 0;

    // Header title
    ctx.font = '900 18px Impact, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('🏆 LIVE RANKING', boardX + 16, boardY + 28);

    ctx.textAlign = 'center';
    ctx.font = '900 14px Impact, sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.fillText('SWORDS', boardX + boardW - 150, boardY + 28);

    ctx.textAlign = 'right';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('SCORE', boardX + boardW - 16, boardY + 28);

    // Rows
    for (let i = 0; i < contenders.length; i++) {
      const c = contenders[i];
      const y = boardY + 48 + i * rowH;
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
      ctx.fillText(`${i + 1}`, boardX + 24, y + 20);

      // Name
      ctx.textAlign = 'left';
      ctx.fillStyle = !isAlive ? '#884455' : isYou ? '#ffd700' : c.color;
      ctx.font = isYou ? '900 18px Impact, sans-serif' : '700 16px Impact, sans-serif';
      const isRespawning = !isAlive && c.respawnTimer && c.respawnTimer > 0;
      const displayName = !isAlive ? (isRespawning ? `⏳ ${c.name}` : `💀 ${c.name}`) : c.name;
      ctx.fillText(displayName, boardX + 46, y + 20);

      // Swords or Respawn Countdown
      ctx.textAlign = 'center';
      if (isRespawning) {
        ctx.font = '900 13px Impact, sans-serif';
        ctx.fillStyle = '#ffaa00';
        ctx.fillText(`REVIVE ${Math.ceil(c.respawnTimer!)}s`, boardX + boardW - 150, y + 20);
      } else {
        ctx.font = '900 16px Impact, sans-serif';
        ctx.fillStyle = !isAlive ? '#555566' : '#ffd700';
        ctx.fillText(`🗡️${c.swordCount || 0}`, boardX + boardW - 150, y + 20);
      }

      // Score
      ctx.textAlign = 'right';
      ctx.fillStyle = !isAlive ? '#778899' : '#ffffff';
      ctx.font = '900 18px Impact, sans-serif';
      ctx.fillText(c.score.toLocaleString(), boardX + boardW - 16, y + 20);
    }
  }

  private renderComboMeter(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: Player
  ) {
    const x = width - 260;
    const y = height * 0.58;

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

    const countText = `🔥 COMBO ×${player.comboCount}`;
    ctx.strokeText(countText, x, y);
    ctx.fillText(countText, x, y);

    // Multiplier text
    let multText = 'x1.0';
    if (player.comboCount >= 100) multText = 'x3.0 MAX MULTIPLIER!';
    else if (player.comboCount >= 50) multText = 'x2.0 MULTIPLIER!';
    else if (player.comboCount >= 25) multText = 'x1.5 MULTIPLIER';
    else if (player.comboCount >= 10) multText = 'x1.2 MULTIPLIER';

    ctx.font = '900 16px Impact, sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.strokeText(multText, x, y + 32);
    ctx.fillText(multText, x, y + 32);

    // Combo decay bar
    const barW = 180;
    const barH = 6;
    const pct = Math.max(0, player.comboTimer / player.comboDuration);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
    ctx.fillRect(x - barW / 2, y + 46, barW, barH);
    ctx.fillStyle = '#ffaa00';
    ctx.fillRect(x - barW / 2, y + 46, barW * pct, barH);

    ctx.restore();
  }

  private renderPlayerStatus(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: Player
  ) {
    // 1. Health Bar (Bottom Center)
    const barW = 440;
    const barH = 22;
    const barX = (width - barW) / 2;
    const barY = height - 86;
    const hpPct = Math.max(0, player.hp / player.maxHp);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 2;
    ctx.fillRect(barX, barY, barW, barH);
    ctx.strokeRect(barX, barY, barW, barH);

    ctx.fillStyle = hpPct < 0.3 ? '#ff2255' : '#00ff88';
    ctx.fillRect(barX + 2, barY + 2, (barW - 4) * hpPct, barH - 4);

    ctx.font = '900 15px Impact, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.fillText(`HP  ${Math.round(player.hp)} / ${player.maxHp}`, width / 2, barY + 16);

    // 2. Special Attack Ready / Charge Bar
    const specW = 440;
    const specH = 18;
    const specX = barX;
    const specY = barY - 26;
    const specPct = Math.min(1.0, player.specialGauge / 100);

    ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.strokeStyle = player.isSpecialReady ? '#ff0055' : '#00f0ff';
    ctx.lineWidth = 2;
    if (player.isSpecialReady) {
      ctx.shadowColor = '#ff0055';
      ctx.shadowBlur = 18;
    }
    ctx.fillRect(specX, specY, specW, specH);
    ctx.strokeRect(specX, specY, specW, specH);

    const specGrad = ctx.createLinearGradient(specX, 0, specX + specW, 0);
    specGrad.addColorStop(0, '#00f0ff');
    specGrad.addColorStop(1, '#ff0055');
    ctx.fillStyle = specGrad;
    ctx.fillRect(specX + 2, specY + 2, (specW - 4) * specPct, specH - 4);
    ctx.shadowBlur = 0;

    // Special Ready Text
    ctx.font = '900 16px Impact, sans-serif';
    ctx.textAlign = 'center';
    if (player.isSpecialReady) {
      const flash = Math.sin(Date.now() * 0.015) > 0;
      ctx.fillStyle = flash ? '#ffffff' : '#ffd700';
      ctx.fillText('⚔️ SWORD STORM READY! [PRESS SPECIAL BUTTON] ⚔️', width / 2, specY + 14);
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.fillText(`⚡ SWORD STORM GAUGE  ${Math.round(specPct * 100)}%`, width / 2, specY + 14);
    }
  }

  private renderExpBar(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    player: Player
  ) {
    const barH = 12;
    const barY = height - barH;
    const expPct = Math.min(1.0, player.exp / player.nextExp);

    ctx.fillStyle = 'rgba(0, 20, 30, 0.9)';
    ctx.fillRect(0, barY, width, barH);

    const grad = ctx.createLinearGradient(0, 0, width, 0);
    grad.addColorStop(0, '#00aaff');
    grad.addColorStop(0.5, '#00f0ff');
    grad.addColorStop(1, '#ffd700');
    ctx.fillStyle = grad;
    ctx.fillRect(0, barY, width * expPct, barH);

    // Top border line
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, barY);
    ctx.lineTo(width, barY);
    ctx.stroke();
  }

  private renderPlayerStats(ctx: CanvasRenderingContext2D, player: Player) {
    const x = 28;
    const y = 24;

    ctx.textAlign = 'left';
    ctx.font = '900 32px Impact, sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 10;
    ctx.fillText(`LV. ${player.level}`, x, y + 26);
    ctx.shadowBlur = 0;

    ctx.font = '900 20px Impact, sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(`SCORE: ${player.score.toLocaleString()}`, x, y + 62);
    ctx.fillStyle = '#ffaa00';
    ctx.fillText(`KILLS: ${player.kills.toLocaleString()}`, x, y + 92);
    ctx.fillStyle = '#ffd700';
    ctx.fillText(`SWORDS: 🗡️ ${player.swordSystem.swordCount}`, x, y + 122);
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
      ctx.fillText(`🗡️ ${Math.round(dist)}m`, 0, -18);

      ctx.restore();
    }
    ctx.restore();
  }
}
