import * as THREE from 'three';
import type { BoundingBox2D } from './player';

export type EnemyType = 'security_bot' | 'skater_dog' | 'surveillance_drone';

// 0. ENEMY PLASMA PROJECTILE
export class EnemyProjectile {
  public mesh: THREE.Mesh;
  public x: number;
  public y: number;
  public vx: number;
  public vy: number;
  public radius: number = 0.25;
  public isDeflected: boolean = false;
  public isDead: boolean = false;
  public life: number = 3.5;
  public isVertical: boolean = false;

  constructor(x: number, y: number, vx: number, vy: number = 0, isVertical: boolean = false) {
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.isVertical = isVertical;

    if (isVertical) {
      this.radius = 0.35;
      const geo = new THREE.CylinderGeometry(0.12, 0.12, 1.8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
      this.mesh = new THREE.Mesh(geo, mat);
    } else {
      const geo = new THREE.SphereGeometry(0.2, 8, 8);
      const mat = new THREE.MeshBasicMaterial({ color: 0xff1a1a });
      this.mesh = new THREE.Mesh(geo, mat);
    }
    this.mesh.position.set(x, y, 0);
  }

  public update(dt: number): void {
    this.life -= dt;
    if (this.life <= 0) {
      this.isDead = true;
      return;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.mesh.position.set(this.x, this.y, 0);
  }

  public deflect(): void {
    if (this.isDeflected) return;
    this.isDeflected = true;
    this.vx = -this.vx * 1.5;
    this.vy = -this.vy * 1.5;
    (this.mesh.material as THREE.MeshBasicMaterial).color.setHex(0x00f0ff);
  }

  public getAABB(): BoundingBox2D {
    if (this.isVertical) {
      return {
        x: this.x - 0.25,
        y: this.y - 0.9,
        w: 0.5,
        h: 1.8
      };
    }
    return {
      x: this.x - this.radius,
      y: this.y - this.radius,
      w: this.radius * 2,
      h: this.radius * 2
    };
  }
}

export abstract class BaseEnemy {
  public mesh: THREE.Group;
  public x: number;
  public y: number;
  public prevX: number;
  public prevY: number;
  public baseY: number;
  public vx: number = 0;
  public vy: number = 0;
  public width: number = 1.0;
  public height: number = 1.0;
  public isDead: boolean = false;
  public deathTimer: number = 0;
  public scoreValue: number = 200;
  public turnCooldown: number = 0;

  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
    this.prevX = x;
    this.prevY = y;
    this.baseY = y;
    this.mesh = new THREE.Group();
    this.mesh.position.set(x, y, 0);
  }

  public getAABB(): BoundingBox2D {
    return {
      x: this.x - this.width / 2,
      y: this.y,
      w: this.width,
      h: this.height
    };
  }

  public abstract update(dt: number, playerX: number, onShoot?: (proj: EnemyProjectile) => void, playerY?: number): void;
  public abstract reverseDirection(): void;

  public defeat(launchVx: number = 4, launchVy: number = 8): void {
    if (this.isDead) return;
    this.isDead = true;
    this.vx = launchVx;
    this.vy = launchVy;
  }
}

// 1. Security Patrol Bot (Fires plasma laser bolts when facing player)
export class SecurityBot extends BaseEnemy {
  private minX: number;
  private maxX: number;
  private patrolDir: number = 1;
  private sirenMesh: THREE.Mesh;
  private eyeMesh: THREE.Mesh;
  private animTimer: number = 0;
  private shootTimer: number = Math.random() * 2.0;

  constructor(x: number, y: number, patrolRange: number = 5) {
    super(x, y);
    this.minX = x - patrolRange;
    this.maxX = x + patrolRange;
    this.width = 1.1;
    this.height = 1.2;
    this.scoreValue = 300;

    // Body (dark steel box)
    const bodyGeo = new THREE.BoxGeometry(1.0, 0.8, 0.7);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x22262c, metalness: 0.7, roughness: 0.3 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.55;
    this.mesh.add(body);

    // Tread Base
    const treadGeo = new THREE.BoxGeometry(1.1, 0.22, 0.8);
    const treadMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    const tread = new THREE.Mesh(treadGeo, treadMat);
    tread.position.y = 0.11;
    this.mesh.add(tread);

    // Neon Scanner Eye
    const eyeGeo = new THREE.BoxGeometry(0.7, 0.12, 0.1);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0xff1a1a });
    this.eyeMesh = new THREE.Mesh(eyeGeo, eyeMat);
    this.eyeMesh.position.set(0, 0.65, 0.36);
    this.mesh.add(this.eyeMesh);

    // Red Siren on Top
    const sirenGeo = new THREE.CylinderGeometry(0.12, 0.16, 0.2, 12);
    const sirenMat = new THREE.MeshStandardMaterial({ color: 0xff1a1a, emissive: 0xff0000, emissiveIntensity: 0.8 });
    this.sirenMesh = new THREE.Mesh(sirenGeo, sirenMat);
    this.sirenMesh.position.set(0, 1.05, 0);
    this.mesh.add(this.sirenMesh);
  }

  public reverseDirection(): void {
    this.patrolDir = -this.patrolDir;
    this.turnCooldown = 0.8;
  }

  public update(dt: number, playerX: number, onShoot?: (proj: EnemyProjectile) => void): void {
    this.animTimer += dt;
    this.prevX = this.x;
    this.prevY = this.y;

    if (this.isDead) {
      this.deathTimer += dt;
      this.vy -= 30 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.mesh.rotation.z += 10 * dt;
      this.mesh.position.set(this.x, this.y, 0);
      return;
    }

    if (this.turnCooldown > 0) {
      this.turnCooldown -= dt;
    }

    const distToPlayer = Math.abs(this.x - playerX);
    let patrolSpeed = 2.8;

    // Player alert & shooting AI
    if (distToPlayer < 14) {
      patrolSpeed = 4.0;
      if (this.turnCooldown <= 0) {
        this.patrolDir = playerX < this.x ? -1 : 1;
      }

      this.shootTimer += dt;
      if (this.shootTimer >= 2.6) {
        this.shootTimer = 0;
        if (onShoot) {
          const dir = this.patrolDir;
          onShoot(new EnemyProjectile(this.x + dir * 0.7, this.y + 0.65, dir * 8.0, 0));
        }
      }
    }

    this.x += this.patrolDir * patrolSpeed * dt;
    if (this.x > this.maxX) {
      this.x = this.maxX;
      this.patrolDir = -1;
    } else if (this.x < this.minX) {
      this.x = this.minX;
      this.patrolDir = 1;
    }

    this.mesh.position.set(this.x, this.y, 0);
    this.mesh.rotation.y = this.patrolDir > 0 ? 0 : Math.PI;

    // Siren pulse (faster when player nearby)
    const freq = distToPlayer < 14 ? 24 : 12;
    const pulse = (Math.sin(this.animTimer * freq) > 0) ? 1.2 : 0.2;
    (this.sirenMesh.material as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
  }
}

// 2. Skateboard Dog (High-speed pursuit & bunny-hop tricks)

/** 犬が足場や壁を知るための地形。Stage が実装する。 */
export interface DogTerrain {
  /** x の位置で、高さ maxY 以下にある最も高い足場の上面。無ければ null */
  supportTop(x: number, maxY: number): number | null;
  /** x の位置で、高さ fromY〜toY にある最も低い足場の下面(頭上の天井)。無ければ null。一方通行の薄い板も天井として扱う */
  ceilingBottom?(x: number, fromY: number, toY: number): number | null;
}

/** 犬の強さの設定。ステージごと・犬ごとに変えられる */
export interface DogTuning {
  /** 巡回中の速さ(m/s) */
  patrolSpeed: number;
  /** 追尾中の速さ(m/s)。プレイヤーの走る速さは 9.8 */
  chaseSpeed: number;
  /** この距離(m)以内にプレイヤーがいると追いかける */
  chaseRange: number;
  /** ジャンプの初速(m/s)。高さは初速² ÷ (2×重力26) */
  jumpSpeed: number;
  /** 追尾中に、巡回範囲の外へ出てよい距離(m)。Infinity で無制限 */
  leash: number;
  /** true: 段差・壁・穴を判断して跳ぶ。プレイヤーが上にいれば跳んで追う */
  smartJump: boolean;
  /** true: 追尾中でも、跳び越えられない足場の縁では落ちずに引き返す */
  edgeSafe: boolean;
}

/** ステージ1〜4の犬(従来より少しだけ強い) */
export const DOG_NORMAL: DogTuning = {
  patrolSpeed: 4.2, chaseSpeed: 8.4, chaseRange: 18, jumpSpeed: 10.5, leash: 6, smartJump: true, edgeSafe: true,
};

/** ファイナルの大群の犬。プレイヤーより速く、どこまでも追い、高く跳ぶ */
export const DOG_HORDE: DogTuning = {
  patrolSpeed: 11, chaseSpeed: 12, chaseRange: Infinity, jumpSpeed: 14, leash: Infinity, smartJump: true, edgeSafe: false,
};

/** ドローンの射撃: 間隔(秒) / 認識から初弾までの遅延(秒) / 撃つ前の予告の長さ(秒) / 射程(m) / 弾の速さ(m/s) */
const DRONE_FIRE_INTERVAL = 1.4;
const DRONE_LOCKON_DELAY = 0.6;
const DRONE_TELEGRAPH = 0.35;
const DRONE_FIRE_RANGE = 12;
const DRONE_SHOT_SPEED = 8.0;

const DOG_GRAVITY = 26;
/** 足場の上面がこれ以下の段差なら、跳ばずに乗り越える(歩いて上がる扱い) */
const DOG_STEP_UP = 0.3;
/** 跳んで足場の縁に届いたとき、足場の上面がこれ(m)以内の下なら、よじ登って乗る */
const DOG_LEDGE_GRAB = 0.6;

/** 犬の見た目は全員同じなので、ジオメトリと素材は共有する(大群でも軽くする) */
let dogShared: {
  deck: THREE.BoxGeometry; deckMat: THREE.Material;
  wheel: THREE.CylinderGeometry; wheelMat: THREE.Material;
  torso: THREE.BoxGeometry; head: THREE.BoxGeometry; glasses: THREE.BoxGeometry; bandana: THREE.BoxGeometry;
  dogMat: THREE.Material; glassesMat: THREE.Material; bandanaMat: THREE.Material;
} | null = null;

function getDogShared() {
  dogShared ??= {
    deck: new THREE.BoxGeometry(1.4, 0.08, 0.4),
    deckMat: new THREE.MeshStandardMaterial({ color: 0xffe600, roughness: 0.4 }),
    wheel: new THREE.CylinderGeometry(0.09, 0.09, 0.08, 12),
    wheelMat: new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.3 }),
    torso: new THREE.BoxGeometry(0.7, 0.4, 0.35),
    head: new THREE.BoxGeometry(0.4, 0.35, 0.35),
    glasses: new THREE.BoxGeometry(0.12, 0.1, 0.36),
    bandana: new THREE.BoxGeometry(0.2, 0.12, 0.36),
    dogMat: new THREE.MeshStandardMaterial({ color: 0xb57845, roughness: 0.6 }),
    glassesMat: new THREE.MeshBasicMaterial({ color: 0x111111 }),
    bandanaMat: new THREE.MeshStandardMaterial({ color: 0xff1a1a }),
  };
  return dogShared;
}

export class SkaterDog extends BaseEnemy {
  /** 地形。設定されていれば足場の上を歩き、段差・穴を判断する(Stage.addEnemy が渡す) */
  public terrain: DogTerrain | null = null;
  public readonly tuning: DogTuning;

  private minX: number;
  private maxX: number;
  private dir: number = -1;
  private wheels: THREE.Mesh[] = [];
  private dogGroup: THREE.Group;
  private animTimer: number = Math.random() * 10;
  private grounded: boolean = true;
  /** 跳べない縁の手前で足を止めている */
  private holdAtEdge: boolean = false;
  /** 画面外へ落ちたか(落下死。スコアは入らない) */
  public fell: boolean = false;

  constructor(x: number, y: number, patrolRange: number = 8, tuning: DogTuning = DOG_NORMAL) {
    super(x, y);
    this.tuning = tuning;
    this.minX = x - patrolRange;
    this.maxX = x + patrolRange;
    this.width = 1.3;
    this.height = 1.0;
    this.scoreValue = 400;

    const sh = getDogShared();

    // Skateboard Deck
    const deck = new THREE.Mesh(sh.deck, sh.deckMat);
    deck.position.y = 0.18;
    this.mesh.add(deck);

    // Skateboard Wheels (4 cylinders)
    const wheelPositions = [
      [-0.45, 0.09, 0.2], [0.45, 0.09, 0.2],
      [-0.45, 0.09, -0.2], [0.45, 0.09, -0.2]
    ];
    wheelPositions.forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(sh.wheel, sh.wheelMat);
      wheel.rotation.x = Math.PI / 2;
      wheel.position.set(wx, wy, wz);
      this.mesh.add(wheel);
      this.wheels.push(wheel);
    });

    // Dog Body
    this.dogGroup = new THREE.Group();
    this.dogGroup.position.y = 0.22;
    this.mesh.add(this.dogGroup);

    const body = new THREE.Mesh(sh.torso, sh.dogMat);
    body.position.set(0, 0.25, 0);
    this.dogGroup.add(body);

    const head = new THREE.Mesh(sh.head, sh.dogMat);
    head.position.set(0.35, 0.45, 0);
    this.dogGroup.add(head);

    const glasses = new THREE.Mesh(sh.glasses, sh.glassesMat);
    glasses.position.set(0.5, 0.48, 0);
    this.dogGroup.add(glasses);

    const bandana = new THREE.Mesh(sh.bandana, sh.bandanaMat);
    bandana.position.set(0.2, 0.35, 0);
    this.dogGroup.add(bandana);
  }

  /** 進む向きを決める(1=右、-1=左) */
  public setDirection(dir: number): void {
    this.dir = dir >= 0 ? 1 : -1;
  }

  public reverseDirection(): void {
    this.dir = -this.dir;
    // 地形を見て自分で判断する犬は、すぐにまた振り向いて追い直せるようにする
    this.turnCooldown = this.terrain && this.tuning.smartJump ? 0.15 : 0.8;
  }

  public update(dt: number, playerX: number, _onShoot?: (proj: EnemyProjectile) => void, playerY: number = this.y): void {
    this.animTimer += dt;
    this.prevX = this.x;
    this.prevY = this.y;

    if (this.isDead) {
      this.deathTimer += dt;
      this.vy -= 30 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.mesh.rotation.z += 12 * dt;
      this.mesh.position.set(this.x, this.y, 0);
      return;
    }

    if (this.turnCooldown > 0) {
      this.turnCooldown -= dt;
    }

    const t = this.tuning;
    const dx = playerX - this.x;
    const distToPlayer = Math.abs(dx);
    const chasing = distToPlayer < t.chaseRange && Math.abs(playerY - this.y) < 12;
    const speed = chasing ? t.chaseSpeed : t.patrolSpeed;

    // 向き: 追尾中はプレイヤーの方へ
    if (chasing && this.turnCooldown <= 0) {
      if (dx > 1.2) this.dir = 1;
      else if (dx < -1.2) this.dir = -1;
    }

    if (this.grounded) {
      this.holdAtEdge = false;
      this.updateGround(speed, chasing, playerX, playerY);
    }
    if (!this.grounded) {
      this.vy -= DOG_GRAVITY * dt;
      this.y += this.vy * dt;
      this.bonkOnCeiling();
      this.updateLanding(this.x + (this.holdAtEdge ? 0 : this.dir * speed * dt));
    }

    if (!this.holdAtEdge) this.x += this.dir * speed * dt;
    // 巡回範囲: 追尾中は leash の分だけ外へ出てよい
    const reach = chasing ? t.leash : 0;
    if (this.x < this.minX - reach) {
      this.x = this.minX - reach;
      this.dir = 1;
    } else if (this.x > this.maxX + reach) {
      this.x = this.maxX + reach;
      this.dir = -1;
    }

    // 落ちきった犬は、倒されたのと同じように退場させる
    if (this.y < -14 && !this.isDead) {
      this.fell = true;
      this.defeat(0, 0);
    }

    this.mesh.position.set(this.x, this.y, 0);
    this.mesh.rotation.y = this.dir > 0 ? 0 : Math.PI;

    // Roll wheels
    this.wheels.forEach((w) => {
      w.rotation.z += ((this.holdAtEdge ? 0 : this.dir) * speed * dt) / 0.09;
    });

    // Dog leaning with inertia
    this.dogGroup.rotation.z = Math.sin(this.animTimer * 10) * 0.08;
  }

  /** 地面の上: 足場の高さに合わせ、段差・壁・穴・上にいるプレイヤーを見て跳ぶか判断する */
  private updateGround(speed: number, chasing: boolean, playerX: number, playerY: number): void {
    const t = this.tuning;
    const terr = this.terrain;

    if (!terr) {
      // 地形を知らない犬: 出現した高さの上を走り、ときどき小さく跳ぶ(従来の動き)
      this.y = this.baseY;
      if (chasing && Math.sin(this.animTimer * 5) > 0.85) this.jump(Math.min(7.0, t.jumpSpeed));
      return;
    }

    const floor = terr.supportTop(this.x, this.y + DOG_STEP_UP);
    if (floor === null || floor < this.y - 0.05) {
      // 足場が無い・低くなった: 落ちる
      this.grounded = false;
      return;
    }
    this.y = floor;

    // ときどき跳ねる(追尾中の演出)。ただし判断を持つ犬は、必要なときに跳ぶので控えめにする
    if (chasing && !t.smartJump && Math.sin(this.animTimer * 5) > 0.85) {
      this.jump(Math.min(7.0, t.jumpSpeed));
      return;
    }
    if (!t.smartJump) return;

    const maxRise = (t.jumpSpeed * t.jumpSpeed) / (2 * DOG_GRAVITY) - 0.15;
    const lookAhead = 0.9 + speed * 0.12;
    const ahead = this.x + this.dir * lookAhead;
    // プレイヤーの方へ進んでいるときだけ、壁や穴を跳んで追う(巡回中や逆向きのときは跳ばない)
    const toward = chasing && (playerX > this.x) === (this.dir > 0);

    // 1. 前に壁・段差があれば、登れる高さのものは跳び乗る
    const wallTop = terr.supportTop(ahead, this.y + maxRise);
    if (toward && wallTop !== null && wallTop > this.y + DOG_STEP_UP) {
      this.jump(Math.min(t.jumpSpeed, Math.sqrt(2 * DOG_GRAVITY * (wallTop - this.y + 0.5))));
      return;
    }

    // 2. 縁のすぐ手前まで来て前が穴なら、向こう側に足場があれば跳び越える。無ければ(縁を守る犬は)足を止める
    const edgeProbe = this.x + this.dir * (0.5 + speed * 0.05);
    if (terr.supportTop(edgeProbe, this.y + DOG_STEP_UP) === null) {
      if (!toward) {
        // 追っていない・プレイヤーと逆向き: 穴には近づかず、縁を守る犬は引き返す
        if (t.edgeSafe) {
          this.dir = -this.dir;
          this.turnCooldown = 0.4;
        }
        return;
      }
      // 向こう側の足場までの距離 d(2〜14m)を近い順に調べ、高さの差も含めて、その足場に届く初速を求める。
      // 到着までの時間 T = (d + 余裕) / 速さ。高さ dh へ T 秒で届く初速は vy = dh / T + g × T / 2。
      for (let d = 2; d <= 14; d += 1) {
        const landTop = terr.supportTop(this.x + this.dir * d, this.y + maxRise);
        if (landTop === null || landTop < this.y - 6) continue;
        const T = (d + 0.5) / speed;
        const need = (landTop - this.y) / T + (DOG_GRAVITY * T) / 2 + 0.3;
        if (need > t.jumpSpeed) continue;   // 届かない: もっと遠い足場を探す(それも届かなければ待つ)
        this.jump(Math.max(8, need));
        return;
      }
      // 跳び越えられない縁: 縁を守る犬は、落ちずにその場で足を止めて待つ
      if (t.edgeSafe) this.holdAtEdge = true;
      return;
    }

    // 3. プレイヤーが上にいれば、跳んで追う。ただし跳んだ先(滞空中に進む位置)に着地できる足場があるときだけ
    //    (縁の近くで跳んで、勢いで穴に落ちないように)
    const near = Math.abs(playerX - this.x) < 5 + (playerY - this.y) * 2;   // 水平に離れていれば、跳んでも届かない
    if (chasing && toward && near && playerY > this.y + 1.6 && Math.abs(playerY - this.y) < maxRise + 1.5) {
      const vy = Math.min(t.jumpSpeed, Math.sqrt(2 * DOG_GRAVITY * (playerY - this.y + 0.6)));
      if (!this.hasCeilingAbove(vy) && this.canLandAfterJump(vy, speed, maxRise)) this.jump(vy);
    }
  }

  /** 初速 vy で跳んだとき、滞空中に進む先(着地の手前〜行きすぎまで)のすべてに足場があるか。縁を踏み外さないための確認 */
  private canLandAfterJump(vy: number, speed: number, maxRise: number): boolean {
    const terr = this.terrain;
    if (!terr) return true;
    const reach = speed * ((2 * vy) / DOG_GRAVITY);
    for (const f of [0.75, 0.9, 1.05, 1.2]) {
      const top = terr.supportTop(this.x + this.dir * reach * f, this.y + maxRise);
      if (top === null || top < this.y - 0.5) return false;
    }
    return true;
  }

  /** 上昇中に頭が足場の下面に届いたら、そこで止まる(薄い足場を下から突き抜けて、上に飛び出さないように) */
  private bonkOnCeiling(): void {
    if (this.vy <= 0 || !this.terrain?.ceilingBottom) return;
    const ceiling = this.terrain.ceilingBottom(this.x, this.prevY + this.height - 0.05, this.y + this.height);
    if (ceiling !== null) {
      this.y = ceiling - this.height;
      this.vy = 0;
    }
  }

  /** 初速 vy で跳んだとき、頭上に足場の下面があって頭をぶつけるか */
  private hasCeilingAbove(vy: number): boolean {
    const rise = (vy * vy) / (2 * DOG_GRAVITY);
    return this.terrain?.ceilingBottom?.(this.x, this.y + this.height - 0.05, this.y + this.height + rise) != null;
  }

  private jump(vy: number): void {
    this.vy = vy;
    this.grounded = false;
  }

  /** 空中: 落ちている最中に足場の上面へ届いたら着地する */
  private updateLanding(nextX: number): void {
    if (this.vy > 0) return;
    const terr = this.terrain;
    if (!terr) {
      if (this.y <= this.baseY) {
        this.y = this.baseY;
        this.vy = 0;
        this.grounded = true;
      }
      return;
    }
    // 足場の縁の少し下(DOG_LEDGE_GRAB)に届いたら、よじ登って乗る。ほんの少し足りずに落ちることがないように
    const top = terr.supportTop(nextX, this.prevY + DOG_STEP_UP + DOG_LEDGE_GRAB);
    if (top !== null && this.y <= top) {
      this.y = top;
      this.vy = 0;
      this.grounded = true;
    }
  }
}

// 3. Surveillance Drone (Horizontal patrol, dive-bomb swoop & vertical plasma drops)
export class SurveillanceDrone extends BaseEnemy {
  private startY: number;
  private minX: number;
  private maxX: number;
  private patrolDir: number = 1;
  private animTimer: number = 0;
  /** 次の射撃までの経過(秒)。DRONE_FIRE_INTERVAL に達すると、プレイヤーの方へ撃つ */
  private fireTimer: number = DRONE_FIRE_INTERVAL - DRONE_LOCKON_DELAY;
  private propLeft: THREE.Mesh;
  private propRight: THREE.Mesh;
  private spotLightBeam: THREE.Mesh;

  constructor(x: number, y: number, patrolRange: number = 6, startDirection: number = 1) {
    super(x, y);
    this.patrolDir = startDirection >= 0 ? 1 : -1;
    this.startY = y;
    this.minX = x - patrolRange;
    this.maxX = x + patrolRange;
    this.width = 1.0;
    this.height = 1.0;
    this.scoreValue = 350;

    // Drone Orb Body
    const bodyGeo = new THREE.SphereGeometry(0.35, 16, 16);
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, metalness: 0.8, roughness: 0.2 });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.y = 0.5;
    this.mesh.add(body);

    // Glowing Cyan Core Ring
    const ringGeo = new THREE.TorusGeometry(0.36, 0.04, 8, 20);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.5;
    this.mesh.add(ring);

    // Twin Rotor Arms & Propellers
    const armGeo = new THREE.BoxGeometry(1.2, 0.06, 0.08);
    const armMat = new THREE.MeshStandardMaterial({ color: 0x4b5563 });
    const arm = new THREE.Mesh(armGeo, armMat);
    arm.position.y = 0.55;
    this.mesh.add(arm);

    const propGeo = new THREE.BoxGeometry(0.45, 0.02, 0.06);
    const propMat = new THREE.MeshBasicMaterial({ color: 0x94a3b8 });
    this.propLeft = new THREE.Mesh(propGeo, propMat);
    this.propLeft.position.set(-0.55, 0.6, 0);
    this.mesh.add(this.propLeft);

    this.propRight = new THREE.Mesh(propGeo, propMat);
    this.propRight.position.set(0.55, 0.6, 0);
    this.mesh.add(this.propRight);

    // Downward Spotlight Cone
    const coneGeo = new THREE.ConeGeometry(0.7, 1.4, 16, 1, true);
    const coneMat = new THREE.MeshBasicMaterial({
      color: 0xff1a1a,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide
    });
    this.spotLightBeam = new THREE.Mesh(coneGeo, coneMat);
    this.spotLightBeam.position.set(0, -0.2, 0);
    this.mesh.add(this.spotLightBeam);
  }

  public reverseDirection(): void {
    this.patrolDir = -this.patrolDir;
    this.turnCooldown = 0.8;
  }

  public update(dt: number, playerX: number, onShoot?: (proj: EnemyProjectile) => void, playerY: number = this.y - 3): void {
    this.animTimer += dt;
    this.prevX = this.x;
    this.prevY = this.y;

    if (this.isDead) {
      this.deathTimer += dt;
      this.vy -= 30 * dt;
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.mesh.rotation.x += 8 * dt;
      this.mesh.position.set(this.x, this.y, 0);
      return;
    }

    // Horizontal patrol
    this.x += this.patrolDir * 3.2 * dt;
    if (this.x > this.maxX) {
      this.x = this.maxX;
      this.patrolDir = -1;
    } else if (this.x < this.minX) {
      this.x = this.minX;
      this.patrolDir = 1;
    }

    // Swoop down when player is nearby
    const distToPlayer = Math.abs(this.x - playerX);
    if (distToPlayer < 10) {
      const targetY = this.startY - 1.4;
      this.y = THREE.MathUtils.lerp(this.y, targetY + Math.sin(this.animTimer * 4) * 0.4, 3.2 * dt);
    } else {
      this.y = THREE.MathUtils.lerp(this.y, this.startY + Math.sin(this.animTimer * 3.5) * 0.6, 2.5 * dt);
    }

    // プレイヤーが射程にいれば、どの角度からでも本人に向けて撃つ(真下だけでなく、横・斜め・下からも)。
    // 撃つ直前は照射コーンが明るく光って予告する。
    const aimX = playerX - this.x;
    const aimY = playerY + 0.9 - this.y;
    const aimDist = Math.hypot(aimX, aimY);
    const inRange = aimDist > 1.0 && aimDist < DRONE_FIRE_RANGE;
    if (inRange) {
      this.fireTimer += dt;
    } else {
      this.fireTimer = Math.min(this.fireTimer, DRONE_FIRE_INTERVAL - DRONE_LOCKON_DELAY);
    }
    const warning = inRange && this.fireTimer > DRONE_FIRE_INTERVAL - DRONE_TELEGRAPH;
    const beamMat = this.spotLightBeam.material as THREE.MeshBasicMaterial;
    beamMat.opacity = warning ? 0.75 : 0.35;
    beamMat.color.setHex(warning ? 0xffea00 : 0xff1a1a);
    if (inRange && this.fireTimer >= DRONE_FIRE_INTERVAL) {
      this.fireTimer = 0;
      onShoot?.(new EnemyProjectile(this.x, this.y, (aimX / aimDist) * DRONE_SHOT_SPEED, (aimY / aimDist) * DRONE_SHOT_SPEED));
    }

    this.mesh.position.set(this.x, this.y, 0);

    // Spin propellers fast
    this.propLeft.rotation.y += 35 * dt;
    this.propRight.rotation.y += 35 * dt;
  }
}
