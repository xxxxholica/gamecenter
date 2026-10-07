import { ContenderState, GameState, InputState, UpgradeCard } from '../types';
import { InputManager } from '../input/InputManager';
import { SoundManager } from '../audio/SoundManager';
import { Field } from '../world/Field';
import { SpatialGrid } from '../world/SpatialGrid';
import { WaveDirector } from '../world/WaveDirector';
import { BulletPool } from '../weapons/BulletPool';
import { PickupPool } from '../items/ExpGem';
import { ParticleSystem } from '../effects/ParticleSystem';
import { DamageNumbers } from '../effects/DamageNumbers';
import { ScreenEffects } from '../effects/ScreenEffects';
import { Player } from '../entities/Player';
import { CpuPlayer, CPU_PROFILES } from '../entities/CpuPlayer';
import { Enemy } from '../entities/Enemy';
import { Boss } from '../entities/Boss';
import { HudRenderer } from '../ui/HudRenderer';
import { ControllerTestScreen } from '../ui/ControllerTestScreen';
import { LevelUpScreen } from '../ui/LevelUpScreen';
import { OptionsScreen } from '../ui/OptionsScreen';
import { HowToPlayScreen } from '../ui/HowToPlayScreen';
import { ResultScreen } from '../ui/ResultScreen';
import { mountArcadeGuide, ArcadeGuideOptions } from '../../../../shared/arcadeGuide';
import { ArcadeTitleScreen } from '../../../../shared/arcadeTitleScreen';
import { startArcadeCountdown, type ArcadeCountdownHandle } from '../../../../shared/arcadeCountdown';
import { returnToHub } from '../../../../shared/homeReturn';
import logoUrl from '../../../../shared/logos/survivor-score-battle.webp';

export class GameEngine {
  public state: GameState = 'TITLE';

  // Subsystems
  public input: InputManager;
  public sound: SoundManager;
  public field: Field;
  public enemyGrid: SpatialGrid<Enemy>;
  public waveDirector: WaveDirector;
  public bulletPool: BulletPool;
  public pickupPool: PickupPool;
  public particleSystem: ParticleSystem;
  public damageNumbers: DamageNumbers;
  public screenEffects: ScreenEffects;

  // Entities
  public player!: Player;
  public cpus: CpuPlayer[] = [];
  public enemies: Enemy[] = [];

  // Camera
  public cameraX: number = 0;
  public cameraY: number = 0;

  // UI Screens
  public hud: HudRenderer;
  public controllerTestScreen: ControllerTestScreen;
  public levelUpScreen: LevelUpScreen;
  public optionsScreen: OptionsScreen;
  public howToPlayScreen: HowToPlayScreen;
  public resultScreen: ResultScreen;

  // Cached standings
  public standings: ContenderState[] = [];

  // Sword Field Spawner
  private swordSpawnTimer: number = 4.0;
  private playerCleared5Min: boolean = false;

  constructor() {
    this.input = InputManager.getInstance();
    this.sound = SoundManager.getInstance();
    this.field = new Field();
    this.enemyGrid = new SpatialGrid<Enemy>(120);
    this.waveDirector = new WaveDirector();
    this.bulletPool = new BulletPool();
    this.pickupPool = new PickupPool();
    this.particleSystem = new ParticleSystem();
    this.damageNumbers = new DamageNumbers();
    this.screenEffects = new ScreenEffects();

    this.hud = new HudRenderer();
    this.controllerTestScreen = new ControllerTestScreen();
    this.levelUpScreen = new LevelUpScreen();
    this.optionsScreen = new OptionsScreen();
    this.howToPlayScreen = new HowToPlayScreen();
    this.resultScreen = new ResultScreen();

    this.initMatch();
  }

  public initMatch() {
    this.dyingTimer = 0;
    // 1. Create Player at arena center
    this.player = new Player(0, 0);

    // 2. Create 7 CPUs positioned around arena (well-spaced in 3600x3600 arena)
    this.cpus = [];
    for (let i = 0; i < CPU_PROFILES.length; i++) {
      const angle = (i * Math.PI * 2) / CPU_PROFILES.length;
      const dist = 680;
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;
      this.cpus.push(new CpuPlayer(CPU_PROFILES[i], x, y));
    }

    // 3. Clear World & Pools
    this.enemies = [];
    this.enemyGrid.clear();
    this.bulletPool.clear();
    this.pickupPool.clear();
    this.particleSystem.clear();
    this.damageNumbers.clear();
    this.waveDirector.reset();
    this.playerCleared5Min = false;
    this.cameraX = 0;
    this.cameraY = 0;

    // 4. Initial Field Swords
    this.swordSpawnTimer = 3.5;
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI * 2) / 4 + Math.PI / 4;
      const dist = 140;
      this.pickupPool.spawn(this.player.x + Math.cos(angle) * dist, this.player.y + Math.sin(angle) * dist, 'SWORD_ITEM');
    }
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI * 2) / 10;
      const dist = 280 + (i % 2) * 120;
      this.pickupPool.spawn(Math.cos(angle) * dist, Math.sin(angle) * dist, 'SWORD_ITEM');
    }

    this.updateLeaderboard();
  }

  public update(dt: number) {
    const inputState = this.input.update();

    switch (this.state) {
      case 'TITLE': {
        // ロゴとスタート操作は arcadeTitleScreen(DOM)側。背面ではデモの試合を自動で進める。
        this.updateDemo(dt);
        break;
      }

      case 'HOW_TO_PLAY': {
        if (this.howToPlayScreen.update(inputState, this.sound)) {
          this.state = 'TITLE';
        }
        break;
      }

      case 'CONTROLLER_TEST': {
        if (inputState.cancel || inputState.pause) {
          this.sound.sfx.playMenuConfirm();
          this.state = 'TITLE';
        }
        break;
      }

      case 'OPTIONS': {
        if (this.optionsScreen.update(inputState, this.sound)) {
          this.state = 'TITLE';
        }
        break;
      }

      case 'PAUSED': {
        if (inputState.pause || inputState.confirm) {
          this.sound.sfx.playMenuConfirm();
          this.state = 'PLAYING';
        }
        break;
      }

      case 'LEVEL_UP': {
        const chosenCard = this.levelUpScreen.update(inputState, this.sound);
        if (chosenCard) {
          this.applyUpgrade(chosenCard);
          this.state = 'PLAYING';
        }
        break;
      }

      case 'PLAYING': {
        if (this.countingDown) break;

        if (inputState.pause && this.dyingTimer <= 0) {
          this.sound.sfx.playMenuConfirm();
          this.state = 'PAUSED';
          return;
        }

        // Special Attack Trigger
        if (inputState.special && this.player.isSpecialReady && this.player.alive) {
          this.player.activateSpecial(
            this.enemyGrid,
            this.sound,
            this.particleSystem,
            this.screenEffects,
            this.damageNumbers
          );
        }

        this.updatePlaying(dt, inputState);
        break;
      }

      case 'RESULT': {
        const action = this.resultScreen.update(inputState, this.sound);
        if (action === 'PLAY_AGAIN') {
          this.beginMatch();
        } else if (action === 'TITLE') {
          this.sound.stopBgm();
          this.state = 'TITLE';
        } else if (action === 'EXIT') {
          this.sound.stopBgm();
          returnToHub();
        }
        break;
      }
    }
  }

  // 負けたときの演出の残り時間(秒)。0より大きい間は、リザルトに進まず弾け飛ぶ演出を見せる。
  private dyingTimer: number = 0;
  private static readonly DEATH_SEQUENCE_SEC = 1.8;
  private static readonly DEATH_SLOW_MOTION = 0.35;

  private updatePlaying(dt: number, inputState: InputState) {
    if (this.dyingTimer > 0) {
      this.dyingTimer -= dt;
      if (this.dyingTimer <= 0) {
        this.dyingTimer = 0;
        this.showResult();
        return;
      }
      // 演出中は、世界をスローモーションで動かし続ける。弾け飛ぶ粒子だけは通常の速さで進める
      this.updatePlayingWorld(dt * GameEngine.DEATH_SLOW_MOTION, inputState);
      this.particleSystem.update(dt * (1 - GameEngine.DEATH_SLOW_MOTION));
      this.screenEffects.update(dt * (1 - GameEngine.DEATH_SLOW_MOTION));
      return;
    }
    this.updatePlayingWorld(dt, inputState);
  }

  private updatePlayingWorld(dt: number, inputState: InputState) {
    // Screen Effects (Shake & Freeze frame)
    this.screenEffects.update(dt);
    if (this.screenEffects.freezeTimer > 0) return;

    // 1. Build Spatial Grid for active enemies
    this.enemyGrid.clear();
    for (let i = 0; i < this.enemies.length; i++) {
      if (this.enemies[i].alive) {
        this.enemyGrid.insert(this.enemies[i]);
      }
    }

    // 2. Update Contenders list
    const allContenders = [
      this.player,
      ...this.cpus,
    ];

    // 3. Update Player
    const playerLeveled = this.player.updatePlayer(
      dt,
      inputState.moveX,
      inputState.moveY,
      this.field,
      this.enemyGrid,
      this.bulletPool,
      this.pickupPool,
      this.sound,
      this.particleSystem,
      this.damageNumbers,
      this.screenEffects
    );

    if (playerLeveled) {
      this.levelUpScreen.generateOptions(this.player);
      this.state = 'LEVEL_UP';
      return;
    }

    // 4. Update CPUs
    for (const cpu of this.cpus) {
      cpu.updateAI(
        dt,
        this.field,
        this.enemyGrid,
        this.waveDirector.activeBoss,
        allContenders,
        this.bulletPool,
        this.pickupPool,
        this.sound,
        this.particleSystem,
        this.player.score,
        this.waveDirector.gameTime
      );
    }

    // 4.5 Periodic Field Sword Spawner (tight arena competition)
    this.swordSpawnTimer -= dt;
    if (this.swordSpawnTimer <= 0) {
      this.swordSpawnTimer = 3.5 + Math.random() * 2.5;
      const count = Math.random() < 0.6 ? 2 : 1;
      for (let s = 0; s < count; s++) {
        const ref = Math.random() < 0.6 ? this.player : (this.cpus.find((c) => c.alive) || this.player);
        const spawnAngle = Math.random() * Math.PI * 2;
        const spawnDist = 120 + Math.random() * 280;
        const clamped = this.field.clamp(ref.x + Math.cos(spawnAngle) * spawnDist, ref.y + Math.sin(spawnAngle) * spawnDist, 20);
        this.pickupPool.spawn(clamped.x, clamped.y, 'SWORD_ITEM');
      }
    }

    // 5. Update Wave Director (Spawns swarms and scheduled bosses)
    const waveResult = this.waveDirector.update(
      dt,
      this.enemies,
      allContenders,
      this.sound,
      this.screenEffects,
      this.damageNumbers
    );

    if (waveResult.spawnBoss) {
      this.enemies.push(waveResult.spawnBoss);
    }

    // Endless mode check: Game continues infinitely until player dies!
    if (!this.player.alive) {
      // 倒された直後は、弾け飛ぶ演出を始める。演出中は世界を動かし続ける
      if (this.dyingTimer <= 0) {
        this.endGame();
        if (this.state === 'TITLE') return;
      }
    }

    // 5.5 Check 5-Minute Survival Milestone Clear
    if (this.waveDirector.gameTime >= 300 && !this.playerCleared5Min && this.player.alive) {
      this.playerCleared5Min = true;
      this.player.addScore(50000, true, this.sound, this.damageNumbers);
      this.damageNumbers.addPopup(this.player.x, this.player.y - 110, '5-MINUTE SURVIVAL CLEARED! +50,000 PTS!', '#ffd700', 36);
      this.sound.sfx.playSpecialReady();
      this.screenEffects.flash('#00f0ff', 0.8);
      this.screenEffects.shake(20);
    }

    // 6. Update Active Bosses and Enemies
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];
      if (!enemy.alive) {
        this.enemies.splice(i, 1);
        continue;
      }

      // Find closest contender to chase
      let closestContender: any = this.player;
      let minDistSq = Infinity;
      for (const c of allContenders) {
        if (!c.alive) continue;
        const dx = c.x - enemy.x;
        const dy = c.y - enemy.y;
        const dSq = dx * dx + dy * dy;
        if (dSq < minDistSq) {
          minDistSq = dSq;
          closestContender = c;
        }
      }

      if (enemy instanceof Boss) {
        enemy.updateBoss(
          dt,
          closestContender,
          this.bulletPool,
          this.particleSystem,
          this.screenEffects
        );
      } else {
        enemy.updateAI(dt, closestContender, this.bulletPool);
      }

      // Contender Contact Damage from Enemies
      for (const c of allContenders) {
        if (!c.alive) continue;
        const dx = c.x - enemy.x;
        const dy = c.y - enemy.y;
        const combinedR = c.radius + enemy.radius;
        if (dx * dx + dy * dy <= combinedR * combinedR) {
          if (c.isPlayer) {
            if (c.invulnerableTimer > 0) continue;
            const timeScaling = this.waveDirector.gameTime < 60
              ? 0.75
              : 1.0 + Math.min(0.5, ((this.waveDirector.gameTime - 60) / 180) * 0.5);
            const mobDmg = Math.max(2, Math.round(enemy.attackDamage * timeScaling));
            const dead = c.takeDamage(mobDmg);
            c.invulnerableTimer = 0.40;
            this.sound.sfx.playPlayerHurt();
            this.screenEffects.shake(12);
            if (dead) {
              this.endGame();
              return;
            }
          } else {
            // CPU contender: has invulnerability frame & takes real damage from swarms
            const cpu = c as CpuPlayer;
            if (cpu.invulnerableTimer > 0) continue;
            const mobDmg = Math.max(1, Math.round(enemy.attackDamage * 0.65));
            const dead = cpu.takeDamage(mobDmg);
            cpu.invulnerableTimer = 0.25;
            if (dead) {
              this.handleCpuEliminated(cpu, null);
            }
          }
        }
      }
    }

    // 6.5 Swords Collisions with Enemies & Other Contenders (PvPvE)
    // A. Swords vs Enemies
    for (const c of allContenders) {
      if (!c.alive || !c.swordSystem) continue;
      const hitboxes = c.swordSystem.getBladeHitboxes(c.x, c.y);

      for (const hb of hitboxes) {
        const queryRadius = hb.radius + 45;
        const targets = this.enemyGrid.query(hb.x, hb.y, queryRadius);

        for (const enemy of targets) {
          if (!enemy.alive || !c.swordSystem.canHitTarget(enemy)) continue;
          const dx = enemy.x - hb.x;
          const dy = enemy.y - hb.y;
          const combinedR = enemy.radius + hb.radius;

          if (dx * dx + dy * dy <= combinedR * combinedR) {
            c.swordSystem.registerHit(enemy);

            const isCrit = Math.random() < 0.15;
            const finalDamage = isCrit ? hb.damage * 2.2 : hb.damage;
            const isKilled = enemy.takeDamage(finalDamage);

            this.damageNumbers.addDamage(enemy.x, enemy.y, finalDamage, isCrit);
            this.particleSystem.emitBurst(enemy.x, enemy.y, '#ffd700', 4, 120, 3, 0.25);

            if (c.isPlayer) {
              this.sound.sfx.playSwordSlice();
              this.screenEffects.shake(2);
            }

            if (isKilled) {
              if (c.isPlayer) {
                this.player.addScore(enemy.scoreValue, true, this.sound, this.damageNumbers);
              } else {
                (c as CpuPlayer).addScore(enemy.scoreValue, true);
              }

              this.handleEnemyKilledDrops(enemy, c.isPlayer);
            }
          }
        }
      }
    }

    // B. Player's Swords vs CPUs (PvPvE)
    if (this.player.alive && this.player.swordSystem) {
      const playerBlades = this.player.swordSystem.getBladeHitboxes(this.player.x, this.player.y);
      for (const cpu of this.cpus) {
        if (!cpu.alive || cpu.invulnerableTimer > 0) continue;
        for (const hb of playerBlades) {
          if (!this.player.swordSystem.canHitTarget(cpu)) continue;
          const dx = cpu.x - hb.x;
          const dy = cpu.y - hb.y;
          const combinedR = cpu.radius + hb.radius;
          if (dx * dx + dy * dy <= combinedR * combinedR) {
            this.player.swordSystem.registerHit(cpu);
            const dmg = Math.round(hb.damage * 0.85);
            const dead = cpu.takeDamage(dmg);
            cpu.invulnerableTimer = 0.15;
            this.damageNumbers.addDamage(cpu.x, cpu.y, dmg, false);
            this.particleSystem.emitBurst(cpu.x, cpu.y, '#ff3366', 8, 150, 3, 0.3);
            this.sound.sfx.playSwordSlice();
            this.screenEffects.shake(4);
            if (dead) {
              this.handleCpuEliminated(cpu, this.player);
            }
          }
        }
      }
    }

    // C. CPUs' Swords vs Player (PvPvE)
    if (this.player.alive && this.player.invulnerableTimer <= 0) {
      for (const cpu of this.cpus) {
        if (!cpu.alive || !cpu.swordSystem) continue;
        const cpuBlades = cpu.swordSystem.getBladeHitboxes(cpu.x, cpu.y);
        for (const hb of cpuBlades) {
          if (!cpu.swordSystem.canHitTarget(this.player)) continue;
          const dx = this.player.x - hb.x;
          const dy = this.player.y - hb.y;
          const combinedR = this.player.radius + hb.radius;
          if (dx * dx + dy * dy <= combinedR * combinedR) {
            cpu.swordSystem.registerHit(this.player);
            const earlyMult = this.waveDirector.gameTime < 60 ? 0.25 : this.waveDirector.gameTime < 120 ? 0.45 : 0.65;
            const dmg = Math.max(1, Math.round(hb.damage * earlyMult));
            const dead = this.player.takeDamage(dmg);
            this.player.invulnerableTimer = 0.75;
            this.sound.sfx.playPlayerHurt();
            this.screenEffects.shake(10);
            this.damageNumbers.addDamage(this.player.x, this.player.y, dmg, false);
            this.particleSystem.emitBurst(this.player.x, this.player.y, cpu.color, 8, 140, 3, 0.3);
            if (dead) {
              this.endGame();
              return;
            }
          }
        }
      }
    }

    // D. CPUs' Swords vs other CPUs (PvPvE)
    for (let i = 0; i < this.cpus.length; i++) {
      const cpuA = this.cpus[i];
      if (!cpuA.alive || !cpuA.swordSystem) continue;
      const bladesA = cpuA.swordSystem.getBladeHitboxes(cpuA.x, cpuA.y);

      for (let j = 0; j < this.cpus.length; j++) {
        if (i === j) continue;
        const cpuB = this.cpus[j];
        if (!cpuB.alive || cpuB.invulnerableTimer > 0) continue;

        for (const hb of bladesA) {
          if (!cpuA.swordSystem.canHitTarget(cpuB)) continue;
          const dx = cpuB.x - hb.x;
          const dy = cpuB.y - hb.y;
          const combinedR = cpuB.radius + hb.radius;
          if (dx * dx + dy * dy <= combinedR * combinedR) {
            cpuA.swordSystem.registerHit(cpuB);
            const dmg = Math.round(hb.damage * 0.65);
            const dead = cpuB.takeDamage(dmg);
            cpuB.invulnerableTimer = 0.15;
            this.damageNumbers.addDamage(cpuB.x, cpuB.y, dmg, false);
            this.particleSystem.emitBurst(cpuB.x, cpuB.y, cpuA.color, 4, 100, 2, 0.2);
            if (dead) {
              this.handleCpuEliminated(cpuB, cpuA);
            }
          }
        }
      }
    }

    // 7. Update Bullets & Collisions
    this.bulletPool.update(dt);
    const activeBullets = this.bulletPool.getActiveBullets();

    for (const b of activeBullets) {
      if (!b.active) continue;

      if (b.isEnemy) {
        // Enemy bullet hits player or CPUs
        for (const c of allContenders) {
          if (!c.alive) continue;
          const dx = c.x - b.x;
          const dy = c.y - b.y;
          const combinedR = c.radius + b.radius;
          if (dx * dx + dy * dy <= combinedR * combinedR) {
            b.active = false;
            const dead = c.takeDamage(b.damage);
            if (c.isPlayer) {
              this.sound.sfx.playPlayerHurt();
              this.screenEffects.shake(10);
              if (dead) {
                this.endGame();
                return;
              }
            } else if (dead) {
              this.handleCpuEliminated(c as CpuPlayer, null);
            }
            break;
          }
        }
      } else {
        // Contender bullets hitting rival contenders (PvPvE)
        for (const c of allContenders) {
          if (!c.alive || c.id === b.ownerId || c.invulnerableTimer > 0) continue;
          if (b.hitEntities.has(c)) continue;
          const dx = c.x - b.x;
          const dy = c.y - b.y;
          const combinedR = c.radius + b.radius;
          if (dx * dx + dy * dy <= combinedR * combinedR) {
            b.hitEntities.add(c);
            const earlyMult = c.isPlayer
              ? (this.waveDirector.gameTime < 60 ? 0.25 : this.waveDirector.gameTime < 120 ? 0.45 : 0.65)
              : 0.7;
            const dmg = Math.max(1, Math.round(b.damage * earlyMult));
            const dead = c.takeDamage(dmg);
            this.damageNumbers.addDamage(c.x, c.y, dmg, false);
            this.particleSystem.emitBurst(c.x, c.y, b.color, 4, 100, 2, 0.2);
            if (c.isPlayer) {
              c.invulnerableTimer = 0.75;
              this.sound.sfx.playPlayerHurt();
              this.screenEffects.shake(8);
              if (dead) {
                this.endGame();
                return;
              }
            } else {
              c.invulnerableTimer = 0.2;
              if (dead) {
                const killer = allContenders.find((k) => k.id === b.ownerId) || null;
                this.handleCpuEliminated(c as CpuPlayer, killer as any);
              }
            }
            b.hitsLeft -= 1;
            if (b.hitsLeft <= 0) {
              b.active = false;
              break;
            }
          }
        }
        if (!b.active) continue;

        // Contender bullets hitting enemies
        const targets = this.enemyGrid.query(b.x, b.y, b.radius + 45);
        for (const enemy of targets) {
          if (!enemy.alive || b.hitEntities.has(enemy)) continue;

          const dx = enemy.x - b.x;
          const dy = enemy.y - b.y;
          const combinedR = enemy.radius + b.radius;

          if (dx * dx + dy * dy <= combinedR * combinedR) {
            b.hitEntities.add(enemy);

            // Critical hit calculation
            const isCrit = Math.random() < 0.1;
            const finalDamage = isCrit ? b.damage * 2.2 : b.damage;

            const isKilled = enemy.takeDamage(finalDamage);

            // Visual effects
            this.damageNumbers.addDamage(enemy.x, enemy.y, finalDamage, isCrit);
            this.particleSystem.emitBurst(enemy.x, enemy.y, b.color, 5, 120, 3, 0.3);

            // Scoring and drops
            const owner = allContenders.find((c) => c.id === b.ownerId);
            if (isKilled) {
              if (owner) {
                if (owner.isPlayer) {
                  this.player.addScore(enemy.scoreValue, true, this.sound, this.damageNumbers);
                } else {
                  (owner as CpuPlayer).addScore(enemy.scoreValue, true);
                }
              }

              this.handleEnemyKilledDrops(enemy, owner?.isPlayer === true);
            }

            // Bullet pierce check
            b.hitsLeft -= 1;
            if (b.hitsLeft <= 0) {
              b.active = false;
              break;
            }
          }
        }
      }
    }

    // 8. Update Pickups & Particles
    this.pickupPool.update(dt);
    this.particleSystem.update(dt);
    this.damageNumbers.update(dt);

    // 9. Update Camera (Smoothly follows player)
    this.cameraX += (this.player.x - this.cameraX) * dt * 8;
    this.cameraY += (this.player.y - this.cameraY) * dt * 8;

    // 10. Update Leaderboard & Rank changes
    this.updateLeaderboard();
    this.hud.update(dt, this.player.isSpecialReady && this.player.alive);
  }

  /** 敵撃破時のドロップ・ボス撃破演出（プレイヤー弾/剣・CPU 共通） */
  private handleEnemyKilledDrops(enemy: Enemy, byPlayer: boolean) {
    this.pickupPool.spawn(enemy.x, enemy.y, enemy.expType);

    // Generous sword drops & special items
    if (enemy.type === 'BERSERKER') {
      if (byPlayer) {
        this.damageNumbers.addPopup(enemy.x, enemy.y - 40, '突撃兵撃破! +120', '#ff0033', 24);
      }
      if (Math.random() < 0.6) {
        this.pickupPool.spawn(enemy.x, enemy.y, 'SWORD_ITEM');
      }
    } else if (enemy.type === 'WEAPON_MASTER') {
      if (byPlayer) {
        this.damageNumbers.addPopup(enemy.x, enemy.y - 45, '重火器兵粉砕! +250', '#e000ff', 26);
      }
      this.pickupPool.spawnSwordBurst(enemy.x, enemy.y, 2);
    } else if (enemy.type === 'ELITE') {
      this.pickupPool.spawnSwordBurst(enemy.x, enemy.y, 2);
    } else if (enemy.type === 'TANK') {
      if (Math.random() < 0.5) {
        this.pickupPool.spawn(enemy.x, enemy.y, 'SWORD_ITEM');
      }
    } else {
      const roll = Math.random();
      if (roll < 0.12) {
        this.pickupPool.spawn(enemy.x, enemy.y, 'SWORD_ITEM');
      } else if (roll < 0.19) {
        const itemTypes: any[] = ['HEAL', 'MAGNET', 'SPECIAL_ORB'];
        this.pickupPool.spawn(
          enemy.x,
          enemy.y,
          itemTypes[Math.floor(Math.random() * itemTypes.length)]
        );
      }
    }

    if (enemy instanceof Boss) {
      this.sound.sfx.playBossDefeated();
      this.sound.playTrack('NORMAL');
      this.screenEffects.shake(25);
      this.screenEffects.flash('#ffd700', 0.8);
      this.particleSystem.emitRing(enemy.x, enemy.y, '#ffd700', 500, 1.0);
      this.damageNumbers.addPopup(enemy.x, enemy.y - 60, 'BOSS DEFEATED!! +5000', '#ffd700', 36);
      this.pickupPool.spawnSwordBurst(enemy.x, enemy.y, 6);
      this.waveDirector.activeBoss = null;
    }
  }

  private updateLeaderboard() {
    const contenders: ContenderState[] = [
      this.player.toContenderState(),
      ...this.cpus.map((c) => c.toContenderState()),
    ];

    // Sort descending by score
    contenders.sort((a, b) => b.score - a.score);

    for (let i = 0; i < contenders.length; i++) {
      const c = contenders[i];
      const newRank = i + 1;

      if (c.isPlayer) {
        if (this.player.rank !== newRank) {
          this.hud.notifyRankChange(newRank, this.player.rank);
          if (newRank < this.player.rank) {
            this.sound.sfx.playRankUp();
          } else {
            this.sound.sfx.playRankDown();
          }
        }
        this.player.prevRank = this.player.rank;
        this.player.rank = newRank;
      } else {
        const cpu = this.cpus.find((cpu) => cpu.id === c.id);
        if (cpu) {
          cpu.prevRank = cpu.rank;
          cpu.rank = newRank;
        }
      }

      c.rank = newRank;
    }

    this.standings = contenders;
  }

  private handleCpuEliminated(cpu: CpuPlayer, killer: Player | CpuPlayer | null) {
    if (cpu.swordsDropped) return;
    cpu.swordsDropped = true;
    cpu.alive = false;
    cpu.respawnTimer = 3.5; // 3.5s respawn timer (returns to fight quickly!)

    // Burst drop swords on the field (plunder mechanic!)
    const dropCount = cpu.getDroppedSwordsCount();
    this.pickupPool.spawnSwordBurst(cpu.x, cpu.y, dropCount);

    // Burst drop exp
    this.pickupPool.spawn(cpu.x, cpu.y, 'EXP_LARGE');
    this.pickupPool.spawn(cpu.x + 20, cpu.y - 15, 'EXP_LARGE');

    this.sound.sfx.playCpuDefeated();
    this.screenEffects.shake(18);
    this.screenEffects.flash(cpu.color, 0.4);
    this.damageNumbers.addPopup(cpu.x, cpu.y - 40, `${cpu.name} ELIMINATED!`, '#ff2255', 28);

    if (killer) {
      if (killer.isPlayer) {
        this.player.addScore(3000, true, this.sound, this.damageNumbers);
        this.damageNumbers.addPopup(this.player.x, this.player.y - 70, 'RIVAL TAKEDOWN! +3,000', '#ffd700', 32);
      } else if (killer instanceof CpuPlayer) {
        killer.addScore(3000, true);
      }
    }

    // Check if all CPUs are down at this moment (Domination bonus, game continues!)
    const aliveCpus = this.cpus.filter((c) => c.alive);
    if (aliveCpus.length === 0 && this.player.alive) {
      this.damageNumbers.addPopup(this.player.x, this.player.y - 90, 'TOTAL DOMINATION! ALL RIVALS DOWN! +10,000', '#ffd700', 38);
      this.player.addScore(10000, true, this.sound, this.damageNumbers);
      this.sound.sfx.playSpecialReady();
    }
  }

  private applyUpgrade(card: UpgradeCard) {
    if (card.category === 'WEAPON_NEW' || card.category === 'WEAPON_UPGRADE') {
      if (card.weaponType) {
        this.player.weaponSystem.addOrUpgradeWeapon(card.weaponType);
      }
    } else if (card.category === 'STAT_BOOST') {
      switch (card.statType) {
        case 'ATTACK_POWER':
          this.player.weaponSystem.attackPowerMult += 0.15;
          break;
        case 'ATTACK_SPEED':
          this.player.weaponSystem.attackSpeedMult += 0.12;
          break;
        case 'MOVE_SPEED':
          this.player.speed += 20;
          break;
        case 'MAX_HP':
          this.player.maxHp += 25;
          this.player.hp = Math.min(this.player.maxHp, this.player.hp + 25);
          break;
        case 'MAGNET_RADIUS':
          this.player.magnetRadius += 35;
          break;
        case 'CRIT_CHANCE':
          this.player.weaponSystem.critChance += 0.08;
          break;
        case 'SWORD_COUNT':
          this.player.swordSystem.addSword(1);
          this.sound.sfx.playSwordPickup();
          break;
        case 'SWORD_DAMAGE':
          this.player.swordSystem.damageMult += 0.15;
          break;
        case 'SWORD_SPEED':
          this.player.swordSystem.speedMult += 0.15;
          break;
        case 'SWORD_SIZE':
          this.player.swordSystem.sizeMult += 0.15;
          break;
        case 'SWORD_RADIUS':
          this.player.swordSystem.radiusMult += 0.15;
          break;
      }
    }
  }

  /** 倒されたとき。いきなりリザルトに移らず、弾け飛ぶ演出を見せてから showResult に進む */
  private endGame() {
    // タイトルのデモ中は試合を終わらせない
    if (this.state === 'TITLE') return;
    if (this.dyingTimer > 0) return;
    this.dyingTimer = GameEngine.DEATH_SEQUENCE_SEC;

    const { x, y, color } = this.player;
    this.sound.stopBgm();
    this.sound.sfx.playSwordStorm();
    this.sound.sfx.playPlayerHurt();

    // 体と剣が四方に弾け飛ぶ
    this.particleSystem.emitBurst(x, y, color, 90, 1100, 9, 1.2);
    this.particleSystem.emitBurst(x, y, '#ffffff', 60, 820, 6, 0.9);
    this.particleSystem.emitBurst(x, y, '#ffd700', 50, 640, 8, 1.1);
    this.particleSystem.emitRing(x, y, '#ffffff', 420, 0.5);
    this.particleSystem.emitRing(x, y, color, 700, 0.8);
    this.particleSystem.emitRing(x, y, '#ffd700', 1000, 1.1);
    this.screenEffects.flash('#ffffff', 0.8);
    this.screenEffects.shake(48, 0.93);
    this.screenEffects.freeze(0.14);
  }

  /** 演出が終わったあと、リザルトを出す */
  private showResult() {
    this.updateLeaderboard();
    this.sound.stopBgm();
    if (this.player.rank === 1) {
      this.sound.playTrack('VICTORY');
    }
    this.resultScreen.show(this.player, this.standings, this.waveDirector.gameTime);
    this.state = 'RESULT';
  }

  // 画面左下のボタンガイド。状態が変わったときだけ差し替える。
  private guideState: GameState | null = null;

  private arcadeTitle: ArcadeTitleScreen | null = null;

  // タイトル背面のデモ。プレイヤーを自動で動かし、倒されず、強化は自動で選ぶ。HUDは出さない。
  private demoTime = 0;

  private updateDemo(dt: number) {
    this.demoTime += dt;
    if (this.demoTime > 90) {
      this.demoTime = 0;
      this.initMatch();
    }

    const t = this.demoTime;
    const demoInput: InputState = {
      moveX: Math.cos(t * 0.55),
      moveY: Math.sin(t * 0.8),
    } as InputState;

    this.player.hp = this.player.maxHp;
    if (this.player.isSpecialReady) {
      this.player.activateSpecial(
        this.enemyGrid,
        this.sound,
        this.particleSystem,
        this.screenEffects,
        this.damageNumbers
      );
    }

    this.updatePlaying(dt, demoInput);

    if (this.state === 'LEVEL_UP') {
      const cards = this.levelUpScreen.cards;
      if (cards.length > 0) this.applyUpgrade(cards[Math.floor(Math.random() * cards.length)]);
      this.state = 'TITLE';
    }
  }

  // 試合開始前の 3・2・1・GO!。終わるまで世界は止まり、操作も受け付けない。
  private countingDown = false;
  private countdown: ArcadeCountdownHandle | null = null;

  private beginMatch() {
    this.initMatch();
    this.state = 'PLAYING';
    this.countingDown = true;
    this.countdown?.cancel();
    this.countdown = startArcadeCountdown({
      accentColor: '#00e5ff',
      onGo: () => {
        this.countingDown = false;
        this.sound.playTrack('NORMAL');
      },
    });
  }

  private startFromTitle() {
    this.sound.setSilent(false);
    this.sound.init();
    this.beginMatch();
  }

  private syncGuide() {
    if (this.guideState === this.state) return;
    const prev = this.guideState;
    this.guideState = this.state;
    this.sound.setSilent(this.state === 'TITLE');

    if (this.state === 'TITLE') {
      // 試合から戻ってきたときは、デモ用に新しい試合を用意し直す
      if (prev !== null) {
        this.demoTime = 0;
        this.initMatch();
      }
      if (!this.arcadeTitle) {
        this.arcadeTitle = new ArcadeTitleScreen({
          slug: 'survivor-score-battle',
          logoUrl,
          accentColor: '#00e5ff',
          tagline: '剣を奪い合う生き残りバトル  1人 vs CPU 7人',
          startButtonLabel: 'スタート',
          onStart: () => this.startFromTitle(),
        });
      }
      this.arcadeTitle.show();
    } else {
      this.arcadeTitle?.hide();
    }

    const confirm = { indices: [0, 2], label: '決定' };
    const back = { indices: [1], label: '戻る' };
    const guides: Record<GameState, ArcadeGuideOptions> = {
      TITLE: { buttons: [{ indices: [0, 1, 2, 3, 9], label: 'スタート' }] },
      HOW_TO_PLAY: { buttons: [{ indices: [0, 1], label: '戻る' }] },
      CONTROLLER_TEST: { buttons: [back] },
      OPTIONS: { moveLabel: '項目選択 / 音量', buttons: [{ indices: [0, 2], label: '切替' }, back] },
      PLAYING: {
        moveLabel: '移動',
        buttons: [
          { indices: [3, 4, 5, 7], label: '必殺技', keyLabel: 'Shift / Space' },
          { indices: [9], label: 'ポーズ', keyLabel: 'P' },
        ],
      },
      PAUSED: { buttons: [{ indices: [0, 2, 9], label: '再開', keyLabel: 'Enter / Space' }] },
      LEVEL_UP: { moveLabel: '選択', buttons: [confirm] },
      RESULT: { moveLabel: '選択', buttons: [confirm] },
    };
    mountArcadeGuide({ ...guides[this.state], showHomeHint: true });
  }

  private renderWorld(ctx: CanvasRenderingContext2D, width: number, height: number) {
    ctx.save();

    // Camera transform with Screen Shake offset
    const camX = this.cameraX + this.screenEffects.shakeOffsetX;
    const camY = this.cameraY + this.screenEffects.shakeOffsetY;

    ctx.translate(width / 2 - camX, height / 2 - camY);

    // 1. Cyber Arena Field
    this.field.render(ctx, camX, camY, width, height);

    // 2. Pickups
    this.pickupPool.render(ctx, camX, camY, width, height);

    // 3. Enemies & Bosses
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
      if (
        e.x < camX - width / 2 - 100 ||
        e.x > camX + width / 2 + 100 ||
        e.y < camY - height / 2 - 100 ||
        e.y > camY + height / 2 + 100
      ) {
        continue;
      }
      e.render(ctx);
    }

    // 4. CPUs
    for (let i = 0; i < this.cpus.length; i++) {
      this.cpus[i].render(ctx);
    }

    // 5. Player
    this.player.render(ctx);

    // 6. Bullets
    this.bulletPool.render(ctx, camX, camY, width, height);

    // 7. Particles
    this.particleSystem.render(ctx);

    // 8. Damage Numbers
    this.damageNumbers.render(ctx);

    ctx.restore();
  }

  public render(ctx: CanvasRenderingContext2D, width: number, height: number) {
    this.syncGuide();
    ctx.clearRect(0, 0, width, height);


    if (this.state === 'HOW_TO_PLAY') {
      this.howToPlayScreen.render(ctx, width, height);
      return;
    }

    if (this.state === 'CONTROLLER_TEST') {
      const input = this.input.update();
      this.controllerTestScreen.render(ctx, width, height, input);
      return;
    }

    if (this.state === 'OPTIONS') {
      this.optionsScreen.render(ctx, width, height, this.sound);
      return;
    }

    // --- In-Game World Rendering ---
    this.renderWorld(ctx, width, height);

    // タイトルでは背面のデモとして世界だけを描く(HUD・演出オーバーレイは出さない)
    if (this.state === 'TITLE') {
      return;
    }


    // --- Screen Overlays (Flash, HUD, Modals) ---
    this.screenEffects.renderOverlay(ctx, width, height);

    // In-game HUD
    this.hud.render(
      ctx,
      width,
      height,
      this.player,
      this.standings,
      this.waveDirector.gameTime,
      this.waveDirector.activeBoss,
      this.waveDirector.warningBannerText,
      this.pickupPool.getActiveItems(),
      this.cameraX,
      this.cameraY
    );

    // Level Up Modal
    if (this.state === 'LEVEL_UP') {
      this.levelUpScreen.render(ctx, width, height, this.player.level);
    }

    // Paused Overlay
    if (this.state === 'PAUSED') {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.fillRect(0, 0, width, height);
      ctx.font = '900 64px Impact, sans-serif';
      ctx.fillStyle = '#00f0ff';
      ctx.textAlign = 'center';
      ctx.fillText('ポーズ中', width / 2, height / 2 - 20);
    }
  }
}
