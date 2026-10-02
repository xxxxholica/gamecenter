export type GameScreen = 'TITLE' | 'MODE_SELECT' | 'CAR_SELECT' | 'MAP_SELECT' | 'TIME_SELECT' | 'ONLINE_LOBBY' | 'ONLINE_COURSE' | 'ONLINE_WAIT' | 'RACE';

export interface GameFlowCallbacks {
  onEnterTitle: () => void;
  onEnterModeSelect: () => void;
  onEnterCarSelect: () => void;
  onEnterMapSelect: () => void;
  onEnterTimeSelect: () => void;
  onEnterOnlineLobby: () => void;
  onEnterOnlineCourse: () => void;
  onEnterOnlineWait: () => void;
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

  public goToModeSelect(): void {
    this.currentScreen = 'MODE_SELECT';
    this.callbacks.onEnterModeSelect();
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

  public goToOnlineLobby(): void {
    this.currentScreen = 'ONLINE_LOBBY';
    this.callbacks.onEnterOnlineLobby();
  }

  public goToOnlineCourse(): void {
    this.currentScreen = 'ONLINE_COURSE';
    this.callbacks.onEnterOnlineCourse();
  }

  public goToOnlineWait(): void {
    this.currentScreen = 'ONLINE_WAIT';
    this.callbacks.onEnterOnlineWait();
  }

  public startRace(): void {
    this.currentScreen = 'RACE';
    this.callbacks.onStartRace();
  }

  public retryRace(): void {
    this.callbacks.onRetryRace();
  }
}
