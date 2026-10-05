import { InputState, UpgradeCard, WeaponType } from '../types';
import { Player } from '../entities/Player';
import { WEAPON_REGISTRY } from '../weapons/WeaponDefinitions';
import { SoundManager } from '../audio/SoundManager';

export class LevelUpScreen {
  public cards: UpgradeCard[] = [];
  public selectedIndex: number = 0;
  private animTimer: number = 0;

  public generateOptions(player: Player): UpgradeCard[] {
    this.selectedIndex = 0;
    this.animTimer = 0;
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
        title: `${meta.icon} ${meta.name} LV.${nextLvl}`,
        description: lvlConfig.description,
        icon: meta.icon,
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
        title: `【NEW】${meta.icon} ${meta.name}`,
        description: meta.levels[0].description,
        icon: meta.icon,
        rarity: 'EPIC',
      });
    }

    // Sword upgrades pool
    const swordCards: UpgradeCard[] = [
      {
        id: 'stat_sword_count',
        category: 'STAT_BOOST',
        statType: 'SWORD_COUNT',
        title: '🗡️ SWORD +1',
        description: `回転する剣を1本追加！ (現在: ${player.swordSystem.swordCount}本)`,
        icon: '🗡️',
        rarity: 'EPIC',
      },
      {
        id: 'stat_sword_damage',
        category: 'STAT_BOOST',
        statType: 'SWORD_DAMAGE',
        title: '💥 剣の威力強化',
        description: '回転剣の攻撃力 +30%',
        icon: '⚔️',
        rarity: 'RARE',
      },
      {
        id: 'stat_sword_speed',
        category: 'STAT_BOOST',
        statType: 'SWORD_SPEED',
        title: '⚡ 剣の回転速度UP',
        description: '剣の旋回スピード +25%',
        icon: '🌀',
        rarity: 'RARE',
      },
      {
        id: 'stat_sword_size',
        category: 'STAT_BOOST',
        statType: 'SWORD_SIZE',
        title: '📐 巨大回転刃',
        description: '剣のサイズと当たり判定 +25%',
        icon: '✨',
        rarity: 'RARE',
      },
      {
        id: 'stat_sword_radius',
        category: 'STAT_BOOST',
        statType: 'SWORD_RADIUS',
        title: '💫 旋回半径拡大',
        description: '剣の回転軌道範囲 +25%',
        icon: '💫',
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
        title: '⚔ POWER',
        description: '全武器の攻撃力 +25%',
        icon: '⚔️',
        rarity: 'COMMON',
      },
      {
        id: 'stat_rapid',
        category: 'STAT_BOOST',
        statType: 'ATTACK_SPEED',
        title: '⚡ RAPID',
        description: '全武器の攻撃速度 +20%',
        icon: '⚡',
        rarity: 'COMMON',
      },
      {
        id: 'stat_speed',
        category: 'STAT_BOOST',
        statType: 'MOVE_SPEED',
        title: '💨 SPEED',
        description: '移動速度 +15%',
        icon: '💨',
        rarity: 'COMMON',
      },
      {
        id: 'stat_vital',
        category: 'STAT_BOOST',
        statType: 'MAX_HP',
        title: '❤️ VITAL',
        description: '最大HP +30 & 全回復',
        icon: '❤️',
        rarity: 'COMMON',
      },
      {
        id: 'stat_magnet',
        category: 'STAT_BOOST',
        statType: 'MAGNET_RADIUS',
        title: '🧲 MAGNET',
        description: 'アイテム回収範囲 +40%',
        icon: '🧲',
        rarity: 'COMMON',
      },
      {
        id: 'stat_crit',
        category: 'STAT_BOOST',
        statType: 'CRIT_CHANCE',
        title: '🎯 CRITICAL',
        description: '会心の一撃確率 +12%',
        icon: '🎯',
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

  public update(input: InputState, soundManager: SoundManager): UpgradeCard | null {
    this.animTimer += 0.016;

    if (input.leftTap) {
      this.selectedIndex = (this.selectedIndex - 1 + this.cards.length) % this.cards.length;
      soundManager.sfx.playMenuSelect();
    }
    if (input.rightTap) {
      this.selectedIndex = (this.selectedIndex + 1) % this.cards.length;
      soundManager.sfx.playMenuSelect();
    }

    if (input.confirm && this.cards.length > 0) {
      soundManager.sfx.playMenuConfirm();
      return this.cards[this.selectedIndex];
    }

    return null;
  }

  public render(ctx: CanvasRenderingContext2D, width: number, height: number, playerLevel: number) {
    ctx.save();

    // Semi-transparent dark overlay
    ctx.fillStyle = 'rgba(4, 7, 16, 0.88)';
    ctx.fillRect(0, 0, width, height);

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Banner: LEVEL UP!
    const bannerY = height * 0.18;
    ctx.font = '900 64px Impact, sans-serif';
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = '#ffd700';
    ctx.shadowBlur = 25;
    ctx.fillText('⚡ LEVEL UP! ⚡', width / 2, bannerY);
    ctx.shadowBlur = 0;

    ctx.font = '900 24px Impact, sans-serif';
    ctx.fillStyle = '#00f0ff';
    ctx.fillText(`PLAYER REACHED LEVEL ${playerLevel}`, width / 2, bannerY + 50);

    // Cards layout
    const numCards = this.cards.length;
    const cardW = 320;
    const cardH = 460;
    const cardSpacing = 40;
    const totalW = numCards * cardW + (numCards - 1) * cardSpacing;
    const startX = (width - totalW) / 2 + cardW / 2;
    const cardY = height * 0.58;

    for (let i = 0; i < numCards; i++) {
      const card = this.cards[i];
      const isSelected = i === this.selectedIndex;
      const cx = startX + i * (cardW + cardSpacing);

      ctx.save();
      ctx.translate(cx, cardY);

      if (isSelected) {
        const floatY = Math.sin(this.animTimer * 5) * 8 - 8;
        ctx.translate(0, floatY);
      }

      // Card Background & Border
      let borderColor = '#445566';
      if (card.rarity === 'LEGENDARY') borderColor = '#ffd700';
      else if (card.rarity === 'EPIC') borderColor = '#bb44ff';
      else if (card.rarity === 'RARE') borderColor = '#00f0ff';

      if (isSelected) {
        borderColor = '#ffffff';
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 30;
      }

      ctx.fillStyle = isSelected ? 'rgba(10, 24, 45, 0.95)' : 'rgba(8, 14, 25, 0.9)';
      ctx.strokeStyle = borderColor;
      ctx.lineWidth = isSelected ? 5 : 2.5;

      ctx.fillRect(-cardW / 2, -cardH / 2, cardW, cardH);
      ctx.strokeRect(-cardW / 2, -cardH / 2, cardW, cardH);
      ctx.shadowBlur = 0;

      // Card Header Tag
      ctx.font = '900 16px Impact, sans-serif';
      ctx.fillStyle = borderColor;
      ctx.fillText(card.rarity, 0, -cardH / 2 + 30);

      // Card Big Icon
      ctx.font = '80px sans-serif';
      ctx.fillText(card.icon, 0, -cardH / 2 + 110);

      // Card Title
      ctx.font = '900 24px Impact, sans-serif';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(card.title, 0, -cardH / 2 + 200);

      // Card Description
      ctx.font = '700 18px sans-serif';
      ctx.fillStyle = '#aaccdd';
      this.wrapText(ctx, card.description, 0, -cardH / 2 + 270, cardW - 40, 26);

      // Selection Marker
      if (isSelected) {
        ctx.fillStyle = '#ffd700';
        ctx.font = '900 22px Impact, sans-serif';
        ctx.fillText('▼ CHOOSE [ENTER / A] ▼', 0, cardH / 2 - 35);
      }

      ctx.restore();
    }

    // Helper text
    ctx.font = '700 18px sans-serif';
    ctx.fillStyle = '#8899aa';
    ctx.fillText('レバー左右で選択 / 決定ボタンで強化取得', width / 2, height - 45);

    ctx.restore();
  }

  private wrapText(
    ctx: CanvasRenderingContext2D,
    text: string,
    x: number,
    y: number,
    maxWidth: number,
    lineHeight: number
  ) {
    const words = text.split('');
    let line = '';
    let curY = y;

    for (let n = 0; n < words.length; n++) {
      const testLine = line + words[n];
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && n > 0) {
        ctx.fillText(line, x, curY);
        line = words[n];
        curY += lineHeight;
      } else {
        line = testLine;
      }
    }
    ctx.fillText(line, x, curY);
  }
}
