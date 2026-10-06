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
    const spawnDist = 650;
    const boss = new Boss(
      targetPos.x + Math.cos(angle) * spawnDist,
      targetPos.y + Math.sin(angle) * spawnDist,
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

    // 2. Continuous Enemy Swarm Spawning (Tight pacing, high excitement, smooth 60FPS)
    const maxEnemies = Math.min(200, Math.floor(35 + (this.gameTime / 60) * 35 + (this.gameTime / 300) * 90));
    const difficultyMult = 1.0 + Math.min(2.0, (this.gameTime / 150) * 1.0);

    this.spawnTimer += dt;
    // Spawn rate: start at 0.50s, accelerates down to 0.08s for a thrilling swarm
    const spawnInterval = Math.max(
      0.08,
      0.50 - Math.min(0.35, (this.gameTime / 100) * 0.35) - (this.gameTime / 300) * 0.08
    );

    if (this.spawnTimer >= spawnInterval && enemies.length < maxEnemies) {
      this.spawnTimer = 0;
      this.spawnWaveBatch(enemies, contenders, difficultyMult);
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
      const dist = 750 + Math.random() * 120;
      enemies.push(new Enemy(target.x + Math.cos(angle) * dist, target.y + Math.sin(angle) * dist, type, 1.25));
    }
  }

  private spawnWaveBatch(
    enemies: Enemy[],
    contenders: { x: number; y: number; alive: boolean }[],
    difficultyMult: number
  ) {
    const liveContenders = contenders.filter((c) => c.alive);
    if (liveContenders.length === 0) return;

    // Pick a random contender to spawn enemies around
    const target = liveContenders[Math.floor(Math.random() * liveContenders.length)];

    // Determine enemy types based on game time (5-minute match progression)
    const t = this.gameTime;
    let type: EnemyType = 'NORMAL';
    const roll = Math.random();

    if (t < 30) {
      // 0-30s: NORMAL + FAST (俊足タイプが早くも疾走)
      type = roll < 0.65 ? 'NORMAL' : 'FAST';
    } else if (t < 75) {
      // 30s-1m15s: 突撃兵が早くも突撃開始！
      if (roll < 0.40) type = 'NORMAL';
      else if (roll < 0.72) type = 'FAST';
      else type = 'BERSERKER'; // 28% 突撃兵！
    } else if (t < 150) {
      // 1m15s-2m30s: 重火器兵と突撃兵が参入！
      if (roll < 0.25) type = 'NORMAL';
      else if (roll < 0.50) type = 'FAST';
      else if (roll < 0.72) type = 'BERSERKER'; // 突撃兵
      else if (roll < 0.88) type = 'WEAPON_MASTER'; // 重火器兵
      else type = 'TANK';
    } else if (t < 240) {
      // 2m30s-4m00s: 激戦フェーズ (エリート混成)
      if (roll < 0.15) type = 'NORMAL';
      else if (roll < 0.35) type = 'FAST';
      else if (roll < 0.62) type = 'BERSERKER'; // 突撃兵
      else if (roll < 0.84) type = 'WEAPON_MASTER'; // 重火器兵
      else if (roll < 0.92) type = 'TANK';
      else type = 'ELITE';
    } else {
      // 4m00s〜5m+ (クライマックス & エンドレス): 猛烈な突撃兵・重火器兵・エリートの嵐
      if (roll < 0.10) type = 'NORMAL';
      else if (roll < 0.25) type = 'FAST';
      else if (roll < 0.58) type = 'BERSERKER';
      else if (roll < 0.82) type = 'WEAPON_MASTER';
      else type = 'ELITE';
    }

    // Spawn mini clusters for immersive horde feel
    const clusterCount = type === 'ELITE'
      ? 1
      : type === 'WEAPON_MASTER'
      ? (Math.random() < 0.5 ? 2 : 1)
      : type === 'TANK'
      ? 2
      : Math.floor(2 + Math.random() * 2); // 2~3体同時スポーン
    const baseAngle = Math.random() * Math.PI * 2;
    const dist = 800 + Math.random() * 150;

    for (let i = 0; i < clusterCount; i++) {
      const angle = baseAngle + (i - (clusterCount - 1) / 2) * 0.15;
      const x = target.x + Math.cos(angle) * dist;
      const y = target.y + Math.sin(angle) * dist;
      enemies.push(new Enemy(x, y, type, difficultyMult));
    }
  }
}
