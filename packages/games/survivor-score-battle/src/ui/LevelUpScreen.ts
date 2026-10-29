import { InputState, UpgradeCard, WeaponType } from '../types';
import { Player } from '../entities/Player';
import { WEAPON_REGISTRY } from '../weapons/WeaponDefinitions';
import { SoundManager } from '../audio/SoundManager';
import { drawIcon } from './Icons';

export class LevelUpScreen {
  private static readonly AUTO_SELECT_SEC = 15;
  public cards: UpgradeCard[] = [];
  public selectedIndex: number = 0;
  private animTimer: number = 0;
  private idleTimer: number = 0;

  public generateOptions(player: Player): UpgradeCard[] {
    this.selectedIndex = 0;
    this.animTimer = 0;
    this.idleTimer = 0;
    const cards: UpgradeCard[] = [];

    // 1. Check existing weapons that can level up
    const existingWeapons: WeaponType[] = [];
    const unmaxedWeapons: WeaponType[] = [];

    for (const [type, w] of player.weaponSystem.activeWeapons) {
      existingWeapons.push(type);
      if (w.level < WEAPON_REGISTRY[type].maxLevel) {
        unmaxedWeapons.push(type);
      }
    }

    // 2. Check unacquired weapons
    const allWeapons: WeaponType[] = [
      'ENERGY_BLASTER',
      'HOMING_MISSILE',
      'PLASMA_LASER',
      'ORBIT_BLADE',
      'THUNDER_BOLT',
      'PULSE_RING',
      'DRONE_SQUAD',
      'NOVA_BOMB',
    ];
    const newWeapons = allWeapons.filter((w) => !existingWeapons.includes(w));

    // Offer weapon upgrade if available
    if (unmaxedWeapons.length > 0) {
      const pick = unmaxedWeapons[Math.floor(Math.random() * unmaxedWeapons.length)];
      const meta = WEAPON_REGISTRY[pick];
      const nextLvl = player.weaponSystem.getWeaponLevel(pick) + 1;
      const lvlConfig = meta.levels[nextLvl - 1];

      cards.push({
        id: `weapon_up_${pick}`,
        category: 'WEAPON_UPGRADE',
        weaponType: pick,
        title: meta.name,
        level: nextLvl,
        description: lvlConfig.description,
        rarity: nextLvl === 8 ? 'LEGENDARY' : 'RARE',
      });
    }

    // Offer new weapon if player has fewer than 5 weapons
    if (newWeapons.length > 0 && existingWeapons.length < 5) {
      const pick = newWeapons[Math.floor(Math.random() * newWeapons.length)];
      const meta = WEAPON_REGISTRY[pick];
      cards.push({
        id: `weapon_new_${pick}`,
        category: 'WEAPON_NEW',
        weaponType: pick,
        title: meta.name,
        description: meta.levels[0].description,
        rarity: 'EPIC',
      });
    }

    // Sword upgrades pool
    const swordCards: UpgradeCard[] = [
      {
        id: 'stat_sword_count',
        category: 'STAT_BOOST',
        statType: 'SWORD_COUNT',
        title: '回転剣 +1',
        description: `回転する剣を1本追加 (現在: ${player.swordSystem.swordCount}本)`,
        rarity: 'EPIC',
      },
      {
        id: 'stat_sword_damage',
        category: 'STAT_BOOST',
        statType: 'SWORD_DAMAGE',
        title: '剣の威力強化',
        description: '回転剣の攻撃力 +30%',
        rarity: 'RARE',
      },
      {
        id: 'stat_sword_speed',
        category: 'STAT_BOOST',
        statType: 'SWORD_SPEED',
        title: '剣の回転速度UP',
        description: '剣の旋回スピード +25%',
        rarity: 'RARE',
      },
      {
        id: 'stat_sword_size',
        category: 'STAT_BOOST',
        statType: 'SWORD_SIZE',
        title: '巨大回転刃',
        description: '剣のサイズと当たり判定 +25%',
        rarity: 'RARE',
      },
      {
        id: 'stat_sword_radius',
        category: 'STAT_BOOST',
        statType: 'SWORD_RADIUS',
        title: '旋回半径拡大',
        description: '剣の回転軌道範囲 +25%',
        rarity: 'COMMON',
      },
    ];

    // Prioritize sword upgrades: 85% chance to include a sword card
    if (Math.random() < 0.85) {
      const pickSword = swordCards[Math.floor(Math.random() * swordCards.length)];
      cards.push(pickSword);
    }

    // General Stat boosts
    const statPool: UpgradeCard[] = [
      ...swordCards,
      {
        id: 'stat_power',
        category: 'STAT_BOOST',
        statType: 'ATTACK_POWER',
        title: '攻撃力UP',
        description: '全武器の攻撃力 +25%',
        rarity: 'COMMON',
      },
      {
        id: 'stat_rapid',
        category: 'STAT_BOOST',
        statType: 'ATTACK_SPEED',
        title: '連射速度UP',
        description: '全武器の攻撃速度 +20%',
        rarity: 'COMMON',
      },
      {
        id: 'stat_speed',
        category: 'STAT_BOOST',
        statType: 'MOVE_SPEED',
        title: '移動速度UP',
        description: '移動速度 +15%',
        rarity: 'COMMON',
      },
      {
        id: 'stat_vital',
        category: 'STAT_BOOST',
        statType: 'MAX_HP',
        title: '最大HP UP',
        description: '最大HP +25 & HP+25回復',
        rarity: 'COMMON',
      },
      {
        id: 'stat_magnet',
        category: 'STAT_BOOST',
        statType: 'MAGNET_RADIUS',
        title: '回収範囲UP',
        description: 'アイテム回収範囲 +40%',
        rarity: 'COMMON',
      },
      {
        id: 'stat_crit',
        category: 'STAT_BOOST',
        statType: 'CRIT_CHANCE',
        title: 'クリティカル率UP',
        description: '会心の一撃確率 +12%',
        rarity: 'RARE',
      },
    ];

    // Shuffle and fill until we have 3 or 4 cards without duplicates
    const shuffledStats = [...statPool].sort(() => Math.random() - 0.5);
    for (const stat of shuffledStats) {
      if (cards.length >= 3) break;
      if (!cards.some((c) => c.id === stat.id)) {
        cards.push(stat);
      }
    }

    this.cards = cards;
    return cards;
  }

  public update(input: InputState, soundManager: SoundManager, dt: number = 0.016): UpgradeCard | null {
    this.animTimer += dt;

    if (input.leftTap) {
      this.selectedIndex = (this.selectedIndex - 1 + this.cards.length) % this.cards.length;
      this.idleTimer = 0;
      soundManager.sfx.playMenuSelect();
    }
    if (input.rightTap) {
      this.selectedIndex = (this.selectedIndex + 1) % this.cards.length;
      this.idleTimer = 0;
      soundManager.sfx.playMenuSelect();
    }

    this.idleTimer += dt;
    if ((input.confirm || this.idleTimer >= LevelUpScreen.AUTO_SELECT_SEC) && this.cards.length > 0) {
      soundManager.sfx.playMenuConfirm();
      return this.cards[this.selectedIndex];
    }

    return null;
  }

  public render(ctx: CanvasRenderingContext2D, width: number, height: number, playerLevel: number) {
    ctx.save();

    // HUDが透けて見えないよう、濃いオーバーレイで覆う
    ctx.fillStyle = 'rgba(4, 7, 16, 0.97)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // 縦方向は「見出し / カード」を1つの塊として画面中央に置く
    const titleH = 72;
    const subH = 34;
    const gapTitleCards = 56;
    const cardH = 400;
    const totalH = titleH + subH + gapTitleCards + cardH;
    const top = (height - totalH) / 2;

    const titleY = top + titleH / 2;
    const subY = top + titleH + subH / 2;
    const cardsCY = top + titleH + subH + gapTitleCards + cardH / 2;

    ctx.font = "900 72px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 25;
    ctx.fillText('LEVEL UP', width / 2, titleY);
    ctx.shadowBlur = 0;

    ctx.font = "900 28px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
    ctx.fillStyle = '#00f0ff';
    ctx.fillText(`LV ${playerLevel}`, width / 2, subY);

    // カードは横中央に等間隔で並べる
    const numCards = this.cards.length;
    const cardW = 320;
    const cardSpacing = 40;
    const totalW = numCards * cardW + (numCards - 1) * cardSpacing;
    const startX = (width - totalW) / 2 + cardW / 2;

    for (let i = 0; i < numCards; i++) {
      const card = this.cards[i];
      const isSelected = i === this.selectedIndex;
      const cx = startX + i * (cardW + cardSpacing);

      ctx.save();
      ctx.translate(cx, cardsCY);

      if (isSelected) {
        ctx.translate(0, Math.sin(this.animTimer * 5) * 6 - 10);
      }

      let accent = '#445566';
      if (card.rarity === 'LEGENDARY') accent = '#ffd700';
      else if (card.rarity === 'EPIC') accent = '#bb44ff';
      else if (card.rarity === 'RARE') accent = '#00f0ff';

      if (isSelected) {
        ctx.shadowColor = accent;
        ctx.shadowBlur = 30;
      }

      ctx.fillStyle = isSelected ? 'rgba(12, 28, 50, 0.98)' : 'rgba(8, 14, 25, 0.92)';
      ctx.strokeStyle = isSelected ? '#ffffff' : accent;
      ctx.lineWidth = isSelected ? 5 : 2.5;
      ctx.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);
      ctx.strokeRect(-cardW / 2, -cardH / 2, cardW, cardH);
      ctx.shadowBlur = 0;

      // カード内は上から アイコン / タイトル / 説明(レア度は文字では出さず、枠とアイコンの色で示す)
      const y0 = -cardH / 2;
      // ブロックを置く分、NEW / LV のカードはアイコンを少し上げる
      // NEW と LV(強化)は、同じ形のブロックで技名の上に出す(色だけ変える)
      const badge = card.category === 'WEAPON_NEW'
        ? { text: 'NEW', color: '#ffe600' }
        : card.level !== undefined
          ? { text: `LV${card.level}`, color: '#00f0ff' }
          : null;
      const hasBadge = badge !== null;
      drawIcon(ctx, card.weaponType ?? card.statType, 0, y0 + (hasBadge ? 104 : 120), 96, accent);

      // 新しい武器は、技名の上に、NEW / LV を塗りつぶしのブロックで囲んで出す
      ctx.font = "900 26px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
      ctx.fillStyle = '#ffffff';
      this.wrapText(ctx, card.title, 0, y0 + (hasBadge ? 224 : 216), cardW - 40, 34);
      if (badge) {
        ctx.font = "900 19px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
        const textW = ctx.measureText(badge.text).width;
        const bw = Math.max(76, Math.ceil(textW + 24));
        const bh = 30;
        const bx = -bw / 2;
        const by = y0 + 165;
        ctx.fillStyle = badge.color;
        ctx.fillRect(bx, by, bw, bh);
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 3;
        ctx.strokeRect(bx, by, bw, bh);
        ctx.fillStyle = '#000000';
        ctx.fillText(badge.text, 0, by + bh / 2);
      }

      ctx.font = "700 20px 'Hiragino Kaku Gothic StdN', 'Hiragino Sans', 'Hiragino Kaku Gothic ProN', 'Yu Gothic UI', 'Meiryo', system-ui, sans-serif";
      ctx.fillStyle = '#aaccdd';
      this.wrapText(ctx, card.description, 0, y0 + 292, cardW - 56, 30);

      ctx.restore();
    }

    ctx.restore();
  }

  // 文字単位で折り返す。最終行が1〜2文字だけ孤立しないよう、前の行から文字を送って均す。
  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ): string[] {
    const chars = text.split('');
    const lines: string[] = [];
    let line = '';
    for (const ch of chars) {
      if (line && ctx.measureText(line + ch).width > maxWidth) {
        lines.push(line);
        line = ch;
      } else {
        line += ch;
      }
    }
    lines.push(line);

    if (lines.length > 1) {
      const last = lines.length - 1;
      while (lines[last].length < 3 && lines[last - 1].length > 3) {
        lines[last] = lines[last - 1].slice(-1) + lines[last];
        lines[last - 1] = lines[last - 1].slice(0, -1);
      }
    }

    lines.forEach((l, i) => ctx.fillText(l, x, y + i * lineHeight));
    return lines;
  }
}
