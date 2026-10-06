export type GameState =
  | 'TITLE'
  | 'HOW_TO_PLAY'
  | 'CONTROLLER_TEST'
  | 'OPTIONS'
  | 'PLAYING'
  | 'LEVEL_UP'
  | 'PAUSED'
  | 'RESULT';

export type AiArchetype =
  | 'PLAYER'
  | 'ATTACKER'      // NOVA: 敵密集地帯へ積極的に突撃
  | 'HUNTER'        // REX: HP減少中の敵や弱ったCPUを優先追撃
  | 'COLLECTOR'     // LUNA: 剣アイテム・経験値回収最優先で急成長
  | 'DEFENDER'      // VOLT: 安全距離を保ち生存重視、低HPで離脱
  | 'BOSS_HUNTER'   // MINT: ボス出現時にボスへ集中砲火
  | 'PVP_AGGRESSOR' // BLAZE: 他のCPUやプレイヤーとの戦闘を最優先
  | 'BALANCED';     // SHADOW: 状況に応じたバランス型

export type WeaponType =
  | 'ENERGY_BLASTER'
  | 'HOMING_MISSILE'
  | 'PLASMA_LASER'
  | 'ORBIT_BLADE'
  | 'THUNDER_BOLT'
  | 'PULSE_RING'
  | 'DRONE_SQUAD'
  | 'NOVA_BOMB';

export interface WeaponLevelConfig {
  damage: number;
  cooldown: number; // in seconds
  count: number;
  speed: number;
  pierce: number;
  radius: number;
  description: string;
}

export interface WeaponMeta {
  type: WeaponType;
  name: string;
  color: string;
  maxLevel: number;
  levels: WeaponLevelConfig[];
}

export type StatBoostType =
  | 'ATTACK_POWER'
  | 'ATTACK_SPEED'
  | 'MOVE_SPEED'
  | 'MAX_HP'
  | 'MAGNET_RADIUS'
  | 'CRIT_CHANCE'
  | 'SWORD_COUNT'
  | 'SWORD_DAMAGE'
  | 'SWORD_SPEED'
  | 'SWORD_SIZE'
  | 'SWORD_RADIUS';

export interface UpgradeCard {
  id: string;
  category: 'WEAPON_NEW' | 'WEAPON_UPGRADE' | 'STAT_BOOST';
  weaponType?: WeaponType;
  statType?: StatBoostType;
  title: string;
  description: string;
  rarity: 'COMMON' | 'RARE' | 'EPIC' | 'LEGENDARY';
}

export type EnemyType =
  | 'NORMAL'
  | 'FAST'
  | 'TANK'
  | 'RANGED'
  | 'ELITE'
  | 'BOSS'
  | 'BERSERKER'
  | 'WEAPON_MASTER';

export type BossType =
  | 'TITAN_MECH'
  | 'VOID_WYRM'
  | 'APEX_BEHEMOTH'
  | 'OMEGA_OVERLORD';

export type PickupType =
  | 'EXP_SMALL'
  | 'EXP_MEDIUM'
  | 'EXP_LARGE'
  | 'SWORD_ITEM'
  | 'HEAL'
  | 'MAGNET'
  | 'SPECIAL_ORB';

export interface ContenderState {
  id: string;
  name: string;
  isPlayer: boolean;
  archetype: AiArchetype;
  color: string;
  accentColor: string;
  score: number;
  kills: number;
  level: number;
  swordCount: number;
  rank: number;
  prevRank: number;
  hp: number;
  maxHp: number;
  alive: boolean;
  respawnTimer?: number;
}


export interface GameSettings {
  masterVolume: number;
  bgmVolume: number;
  sfxVolume: number;
  isMuted: boolean;
  fullscreen: boolean;
}

export interface InputState {
  moveX: number; // -1 to 1
  moveY: number; // -1 to 1
  confirm: boolean;
  cancel: boolean;
  special: boolean;
  pause: boolean;
  leftTap: boolean;
  rightTap: boolean;
  upTap: boolean;
  downTap: boolean;
  // Raw gamepad state for Controller Test
  gamepadConnected: boolean;
  gamepadId: string;
  rawButtons: boolean[];
  rawAxes: number[];
}
