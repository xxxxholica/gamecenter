export class ScreenEffects {
  private shakeIntensity: number = 0;
  private shakeDecay: number = 0.9;
  public shakeOffsetX: number = 0;
  public shakeOffsetY: number = 0;

  private flashAlpha: number = 0;
  private flashColor: string = '#ffffff';

  public freezeTimer: number = 0;

  public shake(intensity: number = 15, decay: number = 0.88) {
    this.shakeIntensity = Math.max(this.shakeIntensity, intensity);
    this.shakeDecay = decay;
  }

  public flash(color: string = '#ffffff', alpha: number = 0.8) {
    this.flashColor = color;
    this.flashAlpha = alpha;
  }

  public freeze(durationSeconds: number = 0.04) {
    this.freezeTimer = durationSeconds;
  }

  public update(dt: number) {
    if (this.freezeTimer > 0) {
      this.freezeTimer -= dt;
      return; // Skip shake decay while frozen
    }

    if (this.shakeIntensity > 0.5) {
      this.shakeOffsetX = (Math.random() * 2 - 1) * this.shakeIntensity;
      this.shakeOffsetY = (Math.random() * 2 - 1) * this.shakeIntensity;
      this.shakeIntensity *= Math.pow(this.shakeDecay, dt * 60);
    } else {
      this.shakeIntensity = 0;
      this.shakeOffsetX = 0;
      this.shakeOffsetY = 0;
    }

    if (this.flashAlpha > 0) {
      this.flashAlpha = Math.max(0, this.flashAlpha - dt * 3.5);
    }
  }

  public renderOverlay(ctx: CanvasRenderingContext2D, width: number, height: number) {
    if (this.flashAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.flashAlpha;
      ctx.fillStyle = this.flashColor;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    }
  }
}
