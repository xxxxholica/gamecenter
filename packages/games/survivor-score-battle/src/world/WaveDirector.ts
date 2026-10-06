import { Enemy } from '../entities/Enemy';
import { Boss } from '../entities/Boss';
import { BossType, EnemyType } from '../types';
import { SoundManager } from '../audio/SoundManager';
import { ScreenEffects } from '../effects/ScreenEffects';
import { DamageNumbers } from '../effects/DamageNumbers';

export interface WaveEvent {
  timeSeconds: number;
  type: 'BOSS_SPAWN' | 'ELITE_SWARM' | 'LAST_MINUTE' | 'BERSERKER_HORDE' | 'ARMED_ASSAULT' | 'SURVIVAL_CLEARED';
  bossType?: BossType;
  executed: boolean;
}

export class WaveDirector {
  public gameTime: number = 0;

  private spawnTimer: number = 0;
  private nextPeriodicBossTime: number = 660; // 11:00 for first post-10m boss
  public activeBoss: Boss | null = null;
  public warningBannerText: string | null = null;
  public warningBannerTimer: number = 0;

  private scheduledEvents: WaveEvent[] = [
    { timeSeconds: 50, type: 'BERSERKER_HORDE', executed: false },
    { timeSeconds: 95, type: 'ARMED_ASSAULT', executed: false },
    { timeSeconds: 135, type: 'BOSS_SPAWN', bossType: 'TITAN_MECH', executed: false },
    { timeSeconds: 185, type: 'BERSERKER_HORDE', executed: false },
    { timeSeconds: 220, type: 'BOSS_SPAWN', bossType: 'VOID_WYRM', executed: false },
    { timeSeconds: 255, type: 'LAST_MINUTE', executed: false },
    { timeSeconds: 265, type: 'BOSS_SPAWN', bossType: 'OMEGA_OVERLORD', executed: false },
    { timeSeconds: 300, type: 'SURVIVAL_CLEARED', executed: false },
  ];

  public reset() {
    this.gameTime = 0;
    this.spawnTimer = 0;
    this.nextPeriodicBossTime = 380;
    this.activeBoss = null;
    this.warningBannerText = null;
    this.warningBannerTimer = 0;
    for (const ev of this.scheduledEvents) {
      ev.executed = false;
    }
  }

  private createBoss(
    bossType: BossType,
    contenders: { x: number; y: number; alive: boolean }[],
    soundManager: SoundManager,
    screenEffects: ScreenEffects
  ): Boss {
    soundManager.sfx.playBossWarning();
    soundManager.playTrack('BOSS');
    screenEffects.shake(18);
    screenEffects.flash('#ff0033', 0.6);

    this.warningBannerText = `WARNING ${bossType.replace(/_/g, ' ')} APPROACHING`;
    this.warningBannerTimer = 4.0;

    const liveContenders = contenders.filter((c) => c.alive);
    const targetPos = liveContenders[0] || { x: 0, y: 0 };
    const angle = Math.random() * Math.PI * 2;
    const spawnDist = 520;
    const rawX = targetPos.x + Math.cos(angle) * spawnDist;
    const rawY = targetPos.y + Math.sin(angle) * spawnDist;
    const boss = new Boss(
      Math.max(-1700, Math.min(1700, rawX)),
      Math.max(-1700, Math.min(1700, rawY)),
      bossType
    );
    this.activeBoss = boss;
    return boss;
  }

  public update(
    dt: number,
    enemies: Enemy[],
    contenders: { x: number; y: number; alive: boolean }[],
    soundManager: SoundManager,
    screenEffects: ScreenEffects,
    damageNumbers: DamageNumbers
  ): { spawnBoss: Boss | null; isGameOver: boolean } {
    this.gameTime += dt;
    if (this.warningBannerTimer > 0) {
      this.warningBannerTimer -= dt;
      if (this.warningBannerTimer <= 0) {
        this.warningBannerText = null;
      }
    }

    // 1. Check Scheduled Events (within first 10 minutes)
    let bossToSpawn: Boss | null = null;

    for (const ev of this.scheduledEvents) {
      if (!ev.executed && this.gameTime >= ev.timeSeconds) {
        ev.executed = true;

        if (ev.type === 'BOSS_SPAWN' && ev.bossType) {
          bossToSpawn = this.createBoss(ev.bossType, contenders, soundManager, screenEffects);
        } else if (ev.type === 'BERSERKER_HORDE') {
          soundManager.sfx.playBossWarning();
          screenEffects.flash('#ff0033', 0.5);
          screenEffects.shake(12);
          this.warningBannerText = '突撃兵部隊 襲来';
          this.warningBannerTimer = 4.0;
          this.spawnSpecialCluster(enemies, contenders, 'BERSERKER', 3);
        } else if (ev.type === 'ARMED_ASSAULT') {
          soundManager.sfx.playBossWarning();
          screenEffects.flash('#e000ff', 0.5);
          screenEffects.shake(12);
          this.warningBannerText = '重火器兵 接近';
          this.warningBannerTimer = 4.0;
          this.spawnSpecialCluster(enemies, contenders, 'WEAPON_MASTER', 2);
        } else if (ev.type === 'LAST_MINUTE') {
          soundManager.playTrack('CLIMAX');
          screenEffects.flash('#ffdd00', 0.7);
          screenEffects.shake(15);
          this.warningBannerText = '残り45秒 ファイナルオーバードライブ';
          this.warningBannerTimer = 4.0;
          this.spawnSpecialCluster(enemies, contenders, 'BERSERKER', 3);
          this.spawnSpecialCluster(enemies, contenders, 'WEAPON_MASTER', 2);
        } else if (ev.type === 'SURVIVAL_CLEARED') {
          soundManager.sfx.playSpecialReady();
          soundManager.sfx.playRankUp();
          screenEffects.flash('#00f0ff', 0.8);
          screenEffects.shake(20);
          this.warningBannerText = '5分間生存 クリア';
          this.warningBannerTimer = 6.0;
        }
      }
    }

    // 1.5 Endless Periodic Boss Spawner (After 5 mins, a new boss arrives every 1.5 minutes)
    if (this.gameTime >= this.nextPeriodicBossTime && (!this.activeBoss || !this.activeBoss.alive)) {
      this.nextPeriodicBossTime = this.gameTime + 90;
      const bossTypes: BossType[] = ['TITAN_MECH', 'VOID_WYRM', 'APEX_BEHEMOTH', 'OMEGA_OVERLORD'];
      const chosenBoss = bossTypes[Math.floor(Math.random() * bossTypes.length)];
      bossToSpawn = this.createBoss(chosenBoss, contenders, soundManager, screenEffects);
    }

    // 2. Continuous Enemy Swarm Spawning (Ultra-fast respawn, dense action, smooth 60FPS)
    const maxEnemies = Math.min(250, Math.floor(75 + (this.gameTime / 60) * 45 + (this.gameTime / 300) * 90));
    const difficultyMult = 1.05 + Math.min(2.2, (this.gameTime / 140) * 1.15);

    this.spawnTimer += dt;
    // Rapid spawn interval: start at 0.18s, accelerates down to 0.04s for constant intense swarms
    const spawnInterval = Math.max(
      0.04,
      0.18 - Math.min(0.12, (this.gameTime / 90) * 0.12) - (this.gameTime / 300) * 0.02
    );

    if (this.spawnTimer >= spawnInterval && enemies.length < maxEnemies) {
      this.spawnTimer = 0;
      // Spawn around player and contenders to immediately replenish fallen foes
      this.spawnWaveBatch(enemies, contenders, difficultyMult);

      // If enemy count dropped significantly below cap (e.g. after mass wipe), spawn an extra batch immediately
      if (enemies.length < maxEnemies - 12) {
        this.spawnWaveBatch(enemies, contenders, difficultyMult);
      }
    }

    return { spawnBoss: bossToSpawn, isGameOver: false };
  }

  private spawnSpecialCluster(
    enemies: Enemy[],
    contenders: { x: number; y: number; alive: boolean }[],
    type: EnemyType,
    count: number
  ) {
    const liveContenders = contenders.filter((c) => c.alive);
    if (liveContenders.length === 0) return;
    const target = liveContenders[0];
    const baseAngle = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const angle = baseAngle + (i * Math.PI * 2) / count;
      const dist = 500 + Math.random() * 90;
      const x = Math.max(-1740, Math.min(1740, target.x + Math.cos(angle) * dist));
      const y = Math.max(-1740, Math.min(1740, target.y + Math.sin(angle) * dist));
      enemies.push(new Enemy(x, y, type, 1.3));
    }
  }

  private spawnWaveBatch(
    enemies: Enemy[],
    contenders: { x: number; y: number; alive: boolean }[],
    difficultyMult: number
  ) {
    const liveContenders = contenders.filter((c) => c.alive);
    if (liveContenders.length === 0) return;

    // Pick a contender to spawn enemies around (biased towards player 60% of the time for maximum action)
    const playerContender = liveContenders.find((c) => (c as any).isPlayer);
    const target = (playerContender && Math.random() < 0.6)
      ? playerContender
      : liveContenders[Math.floor(Math.random() * liveContenders.length)];

    // Determine enemy types based on game time (5-minute match progression)
    const t = this.gameTime;
    let type: EnemyType = 'NORMAL';
    const roll = Math.random();

    if (t < 25) {
      // 0-25s: NORMAL + FAST (俊足タイプが早くも疾走)
      type = roll < 0.55 ? 'NORMAL' : 'FAST';
    } else if (t < 70) {
      // 25s-1m10s: 突撃兵が早くも突撃開始！
      if (roll < 0.35) type = 'NORMAL';
      else if (roll < 0.68) type = 'FAST';
      else type = 'BERSERKER'; // 32% 突撃兵！
    } else if (t < 140) {
      // 1m10s-2m20s: 重火器兵と突撃兵が参入！
      if (roll < 0.22) type = 'NORMAL';
      else if (roll < 0.45) type = 'FAST';
      else if (roll < 0.70) type = 'BERSERKER'; // 突撃兵
      else if (roll < 0.86) type = 'WEAPON_MASTER'; // 重火器兵
      else type = 'TANK';
    } else if (t < 230) {
      // 2m20s-3m50s: 激戦フェーズ (エリート混成)
      if (roll < 0.12) type = 'NORMAL';
      else if (roll < 0.30) type = 'FAST';
      else if (roll < 0.60) type = 'BERSERKER'; // 突撃兵
      else if (roll < 0.82) type = 'WEAPON_MASTER'; // 重火器兵
      else if (roll < 0.90) type = 'TANK';
      else type = 'ELITE';
    } else {
      // 3m50s〜5m+ (クライマックス & エンドレス): 猛烈な突撃兵・重火器兵・エリートの嵐
      if (roll < 0.08) type = 'NORMAL';
      else if (roll < 0.22) type = 'FAST';
      else if (roll < 0.55) type = 'BERSERKER';
      else if (roll < 0.80) type = 'WEAPON_MASTER';
      else type = 'ELITE';
    }

    // Spawn mini clusters for immersive horde feel (3~5 enemies simultaneously)
    const clusterCount = type === 'ELITE'
      ? 1
      : type === 'WEAPON_MASTER'
      ? (Math.random() < 0.6 ? 2 : 1)
      : type === 'TANK'
      ? (Math.random() < 0.5 ? 3 : 2)
      : Math.floor(3 + Math.random() * 3); // 3~5体同時スポーン
    const baseAngle = Math.random() * Math.PI * 2;
    // Spawn tightly around contenders so enemies engage quickly
    const dist = 520 + Math.random() * 90;

    for (let i = 0; i < clusterCount; i++) {
      const angle = baseAngle + (i - (clusterCount - 1) / 2) * 0.14;
      const rawX = target.x + Math.cos(angle) * dist;
      const rawY = target.y + Math.sin(angle) * dist;
      const x = Math.max(-1740, Math.min(1740, rawX));
      const y = Math.max(-1740, Math.min(1740, rawY));
      enemies.push(new Enemy(x, y, type, difficultyMult));
    }
  }
}
