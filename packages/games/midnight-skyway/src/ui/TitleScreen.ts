import { ArcadeTitleScreen } from '../../../../shared/arcadeTitleScreen';

export interface TitleScreenEvents {
  onStart: () => void;
}

export class TitleScreen {
  private titleScreen: ArcadeTitleScreen;

  constructor(container: HTMLElement, events: TitleScreenEvents) {
    container.style.display = 'none';
    this.titleScreen = new ArcadeTitleScreen({
      slug: 'midnight-skyway',
      accentColor: '#00e5ff',
      tagline: '夜の峠と都市を爆走レース！',
      startButtonLabel: 'スタート',
      promptLabel: 'PRESS START / ENTER / 画面クリック',
      startKeys: ['Enter'],
      startKeyLabel: 'Enter',
      onStart: () => {
        events.onStart();
      },
    });
  }

  public show(): void {
    this.titleScreen.show();
  }

  public hide(): void {
    this.titleScreen.hide();
  }
}
