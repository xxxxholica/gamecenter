import { ModeSelect } from '../../../../shared/online/ModeSelect';
import { CAR, VS } from './modeArt';
import type { PublicStatus } from '../../../../shared/netProtocol';

export type PlayMode = 'offline' | 'online';

export interface ModeSelectEvents {
  onSelect: (mode: PlayMode) => void;
  onBack: () => void;
}


/** マシン選択の前に出る、遊び方の選択: オフライン走行 / オンライン対戦(開催されていなければ選べない)。共通のモード選択部品(arcade 版)を使う。 */
export class ModeSelectScreen {
  private readonly select: ModeSelect;

  constructor(_container: HTMLElement, events: ModeSelectEvents) {
    this.select = new ModeSelect(
      { title: 'モード選択', arcade: true, buttonGuide: true },
      (id) => events.onSelect(id as PlayMode),
      () => events.onBack(),
    );
  }

  /** online: 開催中ならその状況(null=開催されていない。オンライン対戦のカードは出るが選べない)。 */
  public show(online: PublicStatus | null): void {
    const full = online !== null && online.players >= online.max;
    const sub = !online ? '現在は開催されていません' : online.phase !== 'lobby' ? 'レース中' : full ? '満員' : `参加中 ${online.players}/${online.max}`;
    this.select.show([
      { id: 'offline', art: CAR, title: 'オフライン走行', sub: 'ひとりでタイムアタック', desc: '・好きなコースと時間帯を選ぶ\n・自己ベストを記録できる\n・1位のゴーストと勝負' },
      { id: 'online', art: VS, title: 'オンライン対戦', sub, desc: '・最大4人で同時にスタート\n・待機中にコースの希望を出せる', disabled: !online || full },
    ]);
  }

  public hide(): void {
    this.select.hide();
  }
}
