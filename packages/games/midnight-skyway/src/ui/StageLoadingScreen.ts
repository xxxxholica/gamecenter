export class StageLoadingScreen {
  private container: HTMLElement;
  private isVisible: boolean = false;
  private stageTitleEl!: HTMLElement;
  private progressFillEl!: HTMLElement;
  private creditEl!: HTMLElement;

  constructor(container: HTMLElement) {
    this.container = container;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="stage-loading-wrap">
        <h2 class="stage-loading-title" id="stage-loading-title">
          <span class="stage-num-block">STAGE 1:</span>
          <span class="stage-name-block">東京 丸の内スカイウェイ</span>
        </h2>
        <div class="stage-loading-bar-wrap">
          <div class="stage-loading-bar">
            <div class="stage-loading-fill" id="stage-loading-fill"></div>
          </div>
        </div>
        <div class="stage-loading-credit" id="stage-loading-credit"></div>
      </div>
    `;

    this.stageTitleEl = this.container.querySelector('#stage-loading-title')!;
    this.progressFillEl = this.container.querySelector('#stage-loading-fill')!;
    this.creditEl = this.container.querySelector('#stage-loading-credit')!;
  }

  public show(stageNumOrName: string, courseName?: string, attribution?: string): void {
    let stageNum = stageNumOrName;
    let name = courseName;
    if (!name) {
      const match = stageNumOrName.match(/^(STAGE\s*:?\s*\d+:?)\s*(.*)$/i);
      if (match) {
        let numMatch = match[1].replace(':', '').trim();
        numMatch = numMatch.replace(/STAGE\s*0?(\d+)/i, 'STAGE $1:');
        stageNum = numMatch;
        name = match[2];
      } else if (stageNumOrName.includes(':')) {
        const parts = stageNumOrName.split(':');
        stageNum = parts[0].trim() + ':';
        name = parts.slice(1).join(':').trim();
      }
    }
    if (/^STAGE\s*\d+$/i.test(stageNum.trim())) {
      stageNum = stageNum.trim() + ':';
    }
    this.stageTitleEl.innerHTML = `
      <span class="stage-num-block">${stageNum}</span>
      <span class="stage-name-block">${name || ''}</span>
    `;
    this.creditEl.textContent = attribution || '';
    this.creditEl.style.display = attribution ? 'block' : 'none';
    this.progressFillEl.style.width = '0%';
    this.container.style.display = 'flex';
    this.isVisible = true;
  }

  public updateProgress(loaded: number, total: number): void {
    const pct = total > 0 ? Math.min(100, Math.round((loaded / total) * 100)) : 100;
    this.progressFillEl.style.width = `${pct}%`;
  }

  public async finish(): Promise<void> {
    this.progressFillEl.style.width = '100%';
    await new Promise((resolve) => setTimeout(resolve, 400));
    this.hide();
  }

  public hide(): void {
    this.container.style.display = 'none';
    this.isVisible = false;
  }

  public isOpen(): boolean {
    return this.isVisible;
  }
}
