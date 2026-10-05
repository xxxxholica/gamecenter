import { InputState } from '../types';
import { SoundManager } from '../audio/SoundManager';

export class TitleScreen {
  public selectedIndex: number = 0;
  private readonly options = ['START GAME', 'HOW TO PLAY', 'CONTROLLER TEST', 'OPTIONS'];
  private animTimer: number = 0;

  public update(input: InputState, soundManager: SoundManager): string | null {
    this.animTimer += 0.016;

    if (input.upTap) {
      this.selectedIndex = (this.selectedIndex - 1 + this.options.length) % this.options.length;
      soundManager.sfx.playMenuSelect();
    }
    if (input.downTap) {
      this.selectedIndex = (this.selectedIndex + 1) % this.options.length;
      soundManager.sfx.playMenuSelect();
    }

    if (input.confirm) {
      soundManager.sfx.playMenuConfirm();
      return this.options[this.selectedIndex];
    }

    return null;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    gamepadConnected: boolean,
    gamepadId: string
  ) {
    ctx.save();

    // 1. Cyber Dark Background with animated grid
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, width, height);

    // Decorative grid
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.06)';
    ctx.lineWidth = 1;
    const offset = (this.animTimer * 40) % 80;
    for (let x = 0; x < width; x += 80) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.stroke();
    }
    for (let y = offset; y < height; y += 80) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // 2. Title Logo
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const titleY = height * 0.28;
    const pulse = 1 + Math.sin(this.animTimer * 4) * 0.02;

    ctx.save();
    ctx.translate(width / 2, titleY);
    ctx.scale(pulse, pulse);

    // Glow shadow
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 30;

    ctx.font = '900 84px Impact, sans-serif';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText('SURVIVOR', 0, -48);

    ctx.font = '900 68px Impact, sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 25;
    ctx.fillText('SCORE BATTLE', 0, 36);

    ctx.shadowBlur = 0;
    ctx.font = '700 20px sans-serif';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('1 PLAYER vs 7 CPUS ARCADE EDITION', 0, 96);
    ctx.restore();

    // 3. Menu Options
    const menuStartY = height * 0.58;
    const spacing = 64;

    for (let i = 0; i < this.options.length; i++) {
      const isSelected = i === this.selectedIndex;
      const y = menuStartY + i * spacing;

      if (isSelected) {
        // Selection highlight bar
        const barW = 440;
        const barH = 50;
        ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 15;
        ctx.fillRect((width - barW) / 2, y - barH / 2, barW, barH);
        ctx.strokeRect((width - barW) / 2, y - barH / 2, barW, barH);
        ctx.shadowBlur = 0;
      }

      ctx.font = isSelected ? '900 32px Impact, sans-serif' : '700 26px Impact, sans-serif';
      ctx.fillStyle = isSelected ? '#ffffff' : '#778899';
      const arrow = isSelected ? '▶ ' : '';
      ctx.fillText(`${arrow}${this.options[i]}`, width / 2, y);
    }

    // 4. Controller Detection Status Badge (Bottom)
    const badgeY = height - 60;
    ctx.fillStyle = gamepadConnected ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 170, 0, 0.15)';
    ctx.strokeStyle = gamepadConnected ? '#00ff88' : '#ffaa00';
    ctx.lineWidth = 2;
    const badgeW = 600;
    const badgeH = 38;
    ctx.fillRect((width - badgeW) / 2, badgeY - badgeH / 2, badgeW, badgeH);
    ctx.strokeRect((width - badgeW) / 2, badgeY - badgeH / 2, badgeW, badgeH);

    ctx.font = '900 16px sans-serif';
    ctx.fillStyle = gamepadConnected ? '#00ff88' : '#ffaa00';
    if (gamepadConnected) {
      ctx.fillText(`🎮 CONTROLLER CONNECTED: ${gamepadId.substring(0, 32)}`, width / 2, badgeY);
    } else {
      ctx.fillText('⌨ KEYBOARD MODE (WASD / Space / Shift) - CONNECT STICK ANYTIME', width / 2, badgeY);
    }

    ctx.restore();
  }
}
