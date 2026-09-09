// ============================================================================
// speedlines.js - Dynamic 2D Radial Speed Lines for Jet Boost
// ============================================================================

export class SpeedLines {
  constructor(canvasId = 'speedlines-canvas') {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.intensity = 0; // 0.0 to 1.0
    this.lines = [];
    this.numLines = 45;

    this._resize();
    window.addEventListener('resize', () => this._resize());
    this._initLines();
  }

  _resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.centerX = this.width / 2;
    this.centerY = this.height / 2;
  }

  _initLines() {
    this.lines = [];
    for (let i = 0; i < this.numLines; i++) {
      this.lines.push({
        angle: Math.random() * Math.PI * 2,
        speed: 0.02 + Math.random() * 0.05,
        distRatio: 0.35 + Math.random() * 0.4, // distance from center
        lenRatio: 0.2 + Math.random() * 0.3,
        width: 1.5 + Math.random() * 3.5,
        alpha: 0.3 + Math.random() * 0.7
      });
    }
  }

  update(isJetting, speedKmH) {
    // Target intensity rises sharply during Jet or 120km/h+
    let targetIntensity = 0;
    if (isJetting) {
      targetIntensity = 1.0;
    } else if (speedKmH > 100) {
      targetIntensity = Math.min(0.6, (speedKmH - 100) / 100);
    }

    // Smooth transition
    this.intensity += (targetIntensity - this.intensity) * 0.15;

    if (this.intensity < 0.01) {
      this.ctx.clearRect(0, 0, this.width, this.height);
      return;
    }

    this.render();
  }

  render() {
    this.ctx.clearRect(0, 0, this.width, this.height);

    const maxRadius = Math.hypot(this.centerX, this.centerY);
    const innerRadius = Math.min(this.width, this.height) * 0.28; // safe viewing bubble for chair

    this.ctx.save();
    this.ctx.lineWidth = 3;

    for (let i = 0; i < this.lines.length; i++) {
      const line = this.lines[i];

      // Random jitter during high boost
      line.angle += (Math.random() - 0.5) * 0.03;
      line.distRatio += (Math.random() - 0.5) * 0.05;

      const r1 = innerRadius + (maxRadius - innerRadius) * Math.max(0.1, line.distRatio);
      const r2 = r1 + (maxRadius - innerRadius) * line.lenRatio;

      const cos = Math.cos(line.angle);
      const sin = Math.sin(line.angle);

      const x1 = this.centerX + cos * r1;
      const y1 = this.centerY + sin * r1;
      const x2 = this.centerX + cos * r2;
      const y2 = this.centerY + sin * r2;

      this.ctx.beginPath();
      this.ctx.moveTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.strokeStyle = `rgba(255, 255, 255, ${(line.alpha * this.intensity).toFixed(2)})`;
      this.ctx.lineWidth = line.width * this.intensity;
      this.ctx.stroke();
    }

    this.ctx.restore();
  }
}
