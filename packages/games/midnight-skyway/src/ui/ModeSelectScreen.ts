import { ModeSelect } from '../../../../shared/online/ModeSelect';
import { CAR, VS } from './modeArt';
import { GHOST_SOLID_SVG, PEOPLE_SOLID_SVG, PIN_SOLID_SVG, TIMER_SOLID_SVG } from './icons';
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

  private items(online: PublicStatus | null) {
    const full = online !== null && online.players >= online.max;
    const sub = !online ? '現在は開催されていません' : online.phase !== 'lobby' ? 'レース中' : full ? '満員' : `参加中 ${online.players}/${online.max}`;
    return [
      { id: 'offline', art: CAR, title: 'オフライン走行', sub: 'ひとりでタイムアタック', points: [
        { icon: PIN_SOLID_SVG, text: '峠のコースを走る' },
        { icon: TIMER_SOLID_SVG, text: 'ベストタイムを記録できる' },
        { icon: GHOST_SOLID_SVG, text: '1位のゴーストと勝負' },
      ] },
      { id: 'online', art: VS, title: 'オンライン対戦', sub, points: [
        { icon: PEOPLE_SOLID_SVG, text: '最大4人で同時にスタート' },
        { icon: PIN_SOLID_SVG, text: '待機中に\u200bマシンを選べる' },   // 狭い画面では「に」で折る
      ], disabled: !online },
    ];
  }

  /** online: 開催中ならその状況(null=開催されていない。オンライン対戦のカードは出るが選べない)。 */
  public show(online: PublicStatus | null): void {
    this.select.show(this.items(online));
  }

  public update(online: PublicStatus | null): void {
    this.select.update(this.items(online));
  }

  public hide(): void {
    this.select.hide();
  }
}
