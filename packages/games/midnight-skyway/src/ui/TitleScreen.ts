import { PadEdge, startPadLoop } from '../input/arcadePad';
import { buttonIconHtml } from '../../../../shared/arcadeGuide';

export interface TitleScreenEvents {
  onStart: () => void;
}

export class TitleScreen {
  private container: HTMLElement;
  private events: TitleScreenEvents;
  private keyHandler: ((e: KeyboardEvent) => void) | null = null;
  private isVisible: boolean = false;
  private padEdge = new PadEdge();
  private stopPad: (() => void) | null = null;

  constructor(container: HTMLElement, events: TitleScreenEvents) {
    this.container = container;
    this.events = events;
    this.render();
  }

  private render(): void {
    this.container.innerHTML = `
      <div class="title-screen-wrap">
        <div class="title-logo-container">
          <h1 class="title-main-logo">MIDNIGHT SKYWAY</h1>
          <div class="title-sub-logo">タイムアタック</div>
        </div>
        <div class="title-prompt">
          <div class="prompt-text">${buttonIconHtml([0, 1, 2, 3, 9])} ボタン / 画面クリック / スペースキーでスタート</div>
        </div>
      </div>
    `;

    this.container.addEventListener('click', (e) => {
      if (!this.isVisible) return;
      e.stopPropagation();
      this.events.onStart();
    });
  }

  public show(): void {
    this.isVisible = true;
    this.container.style.display = 'flex';

    this.stopPad?.();
    // どのボタンでもスタート(レバーは使わない)
    this.stopPad = startPadLoop(this.padEdge, (p) => {
      if (this.isVisible && p.buttons.size > 0) this.events.onStart();
    });

    if (!this.keyHandler) {
      this.keyHandler = (e: KeyboardEvent) => {
        if (!this.isVisible) return;
        if (e.code === 'Space' || e.code === 'Enter') {
          e.preventDefault();
          this.events.onStart();
        }
      };
      window.addEventListener('keydown', this.keyHandler);
    }
  }

  public hide(): void {
    this.isVisible = false;
    this.container.style.display = 'none';
    this.stopPad?.();
    this.stopPad = null;
    if (this.keyHandler) {
      window.removeEventListener('keydown', this.keyHandler);
      this.keyHandler = null;
    }
  }
}
