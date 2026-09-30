export type GameScreen = 'TITLE' | 'CAR_SELECT' | 'MAP_SELECT' | 'TIME_SELECT' | 'RACE';

export interface GameFlowCallbacks {
  onEnterTitle: () => void;
  onEnterCarSelect: () => void;
  onEnterMapSelect: () => void;
  onEnterTimeSelect: () => void;
  onStartRace: () => void;
  onRetryRace: () => void;
  onTogglePause?: () => void;
}

export class GameFlowManager {
  public currentScreen: GameScreen = 'TITLE';
  private callbacks: GameFlowCallbacks;
  private keyListener: ((e: KeyboardEvent) => void) | null = null;

  constructor(callbacks: GameFlowCallbacks) {
    this.callbacks = callbacks;
    this.initKeyboard();
  }

  private initKeyboard(): void {
    this.keyListener = (e: KeyboardEvent) => {
      // Global hotkeys depending on screen
      if (this.currentScreen === 'RACE') {
        if (e.code === 'Escape') {
          e.preventDefault();
          this.callbacks.onTogglePause?.();
        }
      }
    };
    window.addEventListener('keydown', this.keyListener);
  }

  public goToTitle(): void {
    this.currentScreen = 'TITLE';
    this.callbacks.onEnterTitle();
  }

  public goToCarSelect(): void {
    this.currentScreen = 'CAR_SELECT';
    this.callbacks.onEnterCarSelect();
  }

  public goToMapSelect(): void {
    this.currentScreen = 'MAP_SELECT';
    this.callbacks.onEnterMapSelect();
  }

  public goToTimeSelect(): void {
    this.currentScreen = 'TIME_SELECT';
    this.callbacks.onEnterTimeSelect();
  }

  public startRace(): void {
    this.currentScreen = 'RACE';
    this.callbacks.onStartRace();
  }

  public retryRace(): void {
    this.callbacks.onRetryRace();
  }
}
