import { InputState } from '../types';
import { SoundManager } from '../audio/SoundManager';
import { toggleFullscreen } from '../../../../shared/fullscreenKey';

export class OptionsScreen {
  public selectedIndex: number = 0;
  private readonly items = ['BGM VOLUME', 'SFX VOLUME', 'MUTE AUDIO', 'FULLSCREEN TOGGLE', 'BACK TO MENU'];

  public update(input: InputState, soundManager: SoundManager): boolean {
    if (input.upTap) {
      this.selectedIndex = (this.selectedIndex - 1 + this.items.length) % this.items.length;
      soundManager.sfx.playMenuSelect();
    }
    if (input.downTap) {
      this.selectedIndex = (this.selectedIndex + 1) % this.items.length;
      soundManager.sfx.playMenuSelect();
    }

    const settings = soundManager.getSettings();

    // Left/Right adjustment
    if (input.leftTap) {
      if (this.selectedIndex === 0) {
        soundManager.setBgmVolume(Math.max(0, settings.bgmVolume - 0.1));
        soundManager.sfx.playMenuSelect();
      } else if (this.selectedIndex === 1) {
        soundManager.setSfxVolume(Math.max(0, settings.sfxVolume - 0.1));
        soundManager.sfx.playMenuSelect();
      }
    }

    if (input.rightTap) {
      if (this.selectedIndex === 0) {
        soundManager.setBgmVolume(Math.min(1.0, settings.bgmVolume + 0.1));
        soundManager.sfx.playMenuSelect();
      } else if (this.selectedIndex === 1) {
        soundManager.setSfxVolume(Math.min(1.0, settings.sfxVolume + 0.1));
        soundManager.sfx.playMenuSelect();
      }
    }

    // Confirm action
    if (input.confirm) {
      soundManager.sfx.playMenuConfirm();
      if (this.selectedIndex === 2) {
        soundManager.toggleMute();
      } else if (this.selectedIndex === 3) {
        toggleFullscreen();
      } else if (this.selectedIndex === 4) {
        return true; // Back
      }
    }

    if (input.cancel) {
      soundManager.sfx.playMenuConfirm();
      return true;
    }

    return false;
  }

  public render(ctx: CanvasRenderingContext2D, width: number, height: number, soundManager: SoundManager) {
    ctx.save();
    ctx.fillStyle = '#050811';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Title
    ctx.font = '900 48px Impact, sans-serif';
    ctx.fillStyle = '#00f0ff';
    ctx.shadowColor = '#00f0ff';
    ctx.shadowBlur = 15;
    ctx.fillText('OPTIONS & AUDIO SETTINGS', width / 2, 90);
    ctx.shadowBlur = 0;

    const settings = soundManager.getSettings();
    const startY = 220;
    const spacing = 75;

    for (let i = 0; i < this.items.length; i++) {
      const isSelected = i === this.selectedIndex;
      const y = startY + i * spacing;

      if (isSelected) {
        const barW = 600;
        const barH = 55;
        ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2;
        ctx.fillRect((width - barW) / 2, y - barH / 2, barW, barH);
        ctx.strokeRect((width - barW) / 2, y - barH / 2, barW, barH);
      }

      ctx.font = isSelected ? '900 28px Impact, sans-serif' : '700 24px Impact, sans-serif';
      ctx.fillStyle = isSelected ? '#ffffff' : '#778899';

      let valueText = '';
      if (i === 0) valueText = `< ${Math.round(settings.bgmVolume * 100)}% >`;
      else if (i === 1) valueText = `< ${Math.round(settings.sfxVolume * 100)}% >`;
      else if (i === 2) valueText = settings.isMuted ? 'MUTED' : 'SOUND ON';
      else if (i === 3) valueText = document.fullscreenElement ? 'ON' : 'OFF';

      const label = this.items[i];
      if (valueText) {
        ctx.textAlign = 'left';
        ctx.fillText(label, width / 2 - 250, y);
        ctx.textAlign = 'right';
        ctx.fillStyle = isSelected ? '#ffd700' : '#00f0ff';
        ctx.fillText(valueText, width / 2 + 250, y);
      } else {
        ctx.textAlign = 'center';
        ctx.fillText(label, width / 2, y);
      }
    }

    ctx.restore();
  }
}
