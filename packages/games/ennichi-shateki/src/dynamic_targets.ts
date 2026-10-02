import * as THREE from 'three';
import { createDuckTexture } from './textures';
import { sounds } from './audio';

// Flying Balloon Entity
// アケコン(スティック)での照準は、マウスより狙いがブレやすい。風船・アヒル・UFOは見た目を少し大きくし、
// 当たり判定にも少し余裕(HIT_MARGIN)を持たせる。棚の景品は prizes.ts の判定余裕だけで調整する
export const TARGET_SCALE = 1.3;
export const HIT_MARGIN = 0.02;

export class FloatingBalloon {
  public mesh: THREE.Group;
  public pos: THREE.Vector3;
  public basePos: THREE.Vector3;
  public colorHex: number;
  public points: number = 300;
  public isPopped: boolean = false;
  public respawnTimer: number = 0;
  private floatSeed: number;

  constructor(initialPos: THREE.Vector3, colorHex: number, seed: number) {
    this.pos = initialPos.clone();
    this.basePos = initialPos.clone();
    this.colorHex = colorHex;
    this.floatSeed = seed;
    this.mesh = this.buildMesh();
    this.mesh.scale.setScalar(TARGET_SCALE);
    this.mesh.position.copy(this.pos);
  }

  private buildMesh(): THREE.Group {
    const group = new THREE.Group();

    // Glossy rubber balloon
    const balloonGeo = new THREE.SphereGeometry(0.12, 16, 16);
    const balloonMat = new THREE.MeshStandardMaterial({
      color: this.colorHex,
      roughness: 0.15,
      metalness: 0.1,
    });
    const balloon = new THREE.Mesh(balloonGeo, balloonMat);
    balloon.scale.set(1.0, 1.25, 1.0);
    balloon.position.y = 0.12;
    balloon.castShadow = true;
    group.add(balloon);

    // Balloon knot
    const knotGeo = new THREE.ConeGeometry(0.02, 0.03, 8);
    const knotMat = new THREE.MeshStandardMaterial({ color: this.colorHex });
    const knot = new THREE.Mesh(knotGeo, knotMat);
    knot.rotation.x = Math.PI;
    knot.position.y = -0.04;
    group.add(knot);

    // Hanging string
    const stringGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.28, 4);
    const stringMat = new THREE.MeshBasicMaterial({ color: 0xcccccc });
    const stringMesh = new THREE.Mesh(stringGeo, stringMat);
    stringMesh.position.y = -0.18;
    group.add(stringMesh);

    return group;
  }

  public update(dt: number, elapsed: number) {
    if (this.isPopped) {
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        // Respawn balloon
        this.isPopped = false;
        this.mesh.visible = true;
        this.mesh.scale.setScalar(TARGET_SCALE);
        sounds.playRestock();
      }
      return;
    }

    // Bobbing and drifting in air
    const swayX = Math.sin(elapsed * 1.2 + this.floatSeed) * 0.35;
    const swayY = Math.cos(elapsed * 1.6 + this.floatSeed) * 0.08;
    this.pos.x = this.basePos.x + swayX;
    this.pos.y = this.basePos.y + swayY;
    this.mesh.position.copy(this.pos);

    // Gentle string tilt
    this.mesh.rotation.z = Math.sin(elapsed * 2.0 + this.floatSeed) * 0.12;
  }

  public pop(): THREE.Vector3 {
    this.isPopped = true;
    this.mesh.visible = false;
    this.respawnTimer = 3.5;
    sounds.playBalloonPop();
    return this.pos.clone();
  }

  public getBoundingBox(): THREE.Box3 {
    const box = new THREE.Box3();
    if (!this.isPopped) {
      box.setFromObject(this.mesh);
      box.expandByScalar(HIT_MARGIN);
    }
    return box;
  }
}

// Moving Carnival Target Duck
export class MovingDuck {
  public mesh: THREE.Group;
  public pos: THREE.Vector3;
  public speed: number = 0.55;
  public minX: number = -1.9;
  public maxX: number = 1.9;
  public direction: number = -1; // Moving right to left
  public points: number = 250;
  public isDown: boolean = false;
  public flipAngle: number = 0;
  public respawnTimer: number = 0;

  constructor(startX: number, y: number, z: number, speed: number) {
    this.pos = new THREE.Vector3(startX, y, z);
    this.speed = speed;
    this.mesh = this.buildMesh();
    this.mesh.scale.setScalar(TARGET_SCALE);
    this.mesh.position.copy(this.pos);
  }

  private buildMesh(): THREE.Group {
    const group = new THREE.Group();
    const duckTex = createDuckTexture();
    const duckMat = new THREE.MeshStandardMaterial({
      map: duckTex,
      roughness: 0.4,
    });
    const orangeMat = new THREE.MeshStandardMaterial({ color: 0xff7700, roughness: 0.3 });

    // Duck body (rounded disk)
    const bodyGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.03, 16);
    const body = new THREE.Mesh(bodyGeo, duckMat);
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.08;
    group.add(body);

    // Head
    const headGeo = new THREE.SphereGeometry(0.05, 12, 12);
    const headMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.4 });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(-0.06, 0.14, 0);
    group.add(head);

    // Bill / Beak
    const beakGeo = new THREE.ConeGeometry(0.02, 0.04, 8);
    const beak = new THREE.Mesh(beakGeo, orangeMat);
    beak.rotation.z = Math.PI / 2;
    beak.position.set(-0.11, 0.14, 0);
    group.add(beak);

    // Stand base plate
    const standGeo = new THREE.BoxGeometry(0.12, 0.02, 0.06);
    const standMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const stand = new THREE.Mesh(standGeo, standMat);
    stand.position.y = 0.01;
    group.add(stand);

    return group;
  }

  public update(dt: number) {
    if (this.isDown) {
      this.flipAngle = Math.min(Math.PI / 2, this.flipAngle + 8.0 * dt);
      this.mesh.rotation.x = -this.flipAngle;
      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        this.isDown = false;
        this.flipAngle = 0;
        this.mesh.rotation.x = 0;
        sounds.playRestock();
      }
      return;
    }

    // Move along conveyor track
    this.pos.x += this.direction * this.speed * dt;
    if (this.direction < 0 && this.pos.x < this.minX) {
      this.pos.x = this.maxX;
    } else if (this.direction > 0 && this.pos.x > this.maxX) {
      this.pos.x = this.minX;
    }

    this.mesh.position.copy(this.pos);
  }

  public hit(): THREE.Vector3 {
    this.isDown = true;
    this.respawnTimer = 3.0;
    sounds.playDuckQuack();
    return this.pos.clone();
  }

  public getBoundingBox(): THREE.Box3 {
    const box = new THREE.Box3();
    if (!this.isDown) {
      box.setFromObject(this.mesh);
      box.expandByScalar(HIT_MARGIN);
    }
    return box;
  }
}

// Flying Golden UFO
export class FlyingUFO {
  public mesh: THREE.Group;
  public pos: THREE.Vector3;
  public points: number = 1500; // Special rare target!
  public isHit: boolean = false;
  public fallVelocity: THREE.Vector3 = new THREE.Vector3();
  public respawnTimer: number = 0;
  /**
   * オンライン対戦の共有の的として使う時(外部制御): 位置・出現は外(online/SharedUfo)が決める。ここでは動かさず、
   * 命中しても自分では墜ちない(当たりはサーバーが決める。命中の通知だけ出る)。
   */
  public external: boolean = false;
  /** 外部制御中に、いま出現していて当たり判定があるか */
  public externalActive: boolean = false;
  // 縁の電飾。点光源にすると画面全体の全画素で光源計算が増えるため、光る小球(ライティング不要のMeshBasicMaterial)で表現する
  private lights: { mat: THREE.MeshBasicMaterial; base: THREE.Color }[] = [];

  constructor() {
    this.pos = new THREE.Vector3(0, 2.35, -0.6);
    this.mesh = this.buildMesh();
    this.mesh.scale.setScalar(TARGET_SCALE);
    this.mesh.position.copy(this.pos);
  }

  private buildMesh(): THREE.Group {
    const group = new THREE.Group();

    // Golden saucer disc
    const discGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.05, 24);
    const goldMat = new THREE.MeshStandardMaterial({
      color: 0xffd700,
      metalness: 0.9,
      roughness: 0.15,
    });
    const disc = new THREE.Mesh(discGeo, goldMat);
    disc.castShadow = true;
    group.add(disc);

    // Glass cockpit dome
    const domeGeo = new THREE.SphereGeometry(0.09, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const domeMat = new THREE.MeshStandardMaterial({
      color: 0x00ffff,
      roughness: 0.1,
      metalness: 0.2,
      transparent: true,
      opacity: 0.85,
    });
    const dome = new THREE.Mesh(domeGeo, domeMat);
    dome.position.y = 0.025;
    group.add(dome);

    // Blinking lights around rim
    const lightColors = [0xd91414, 0xffcc00, 0x00ff00, 0x00ffff];
    const bulbGeo = new THREE.SphereGeometry(0.018, 8, 6);
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI * 2) / 4;
      const base = new THREE.Color(lightColors[i]);
      const mat = new THREE.MeshBasicMaterial({ color: base.clone() });
      const bulb = new THREE.Mesh(bulbGeo, mat);
      bulb.position.set(Math.cos(angle) * 0.2, 0, Math.sin(angle) * 0.2);
      group.add(bulb);
      this.lights.push({ mat, base });
    }

    return group;
  }

  public update(dt: number, elapsed: number) {
    if (this.external) {
      // 位置は外が決める。縁の電飾だけ点滅させる
      this.lights.forEach((l, idx) => {
        l.mat.color.copy(l.base).multiplyScalar(0.55 + Math.sin(elapsed * 10.0 + idx * 1.5) * 0.45);
      });
      return;
    }
    if (this.isHit) {
      // Crash downward
      this.fallVelocity.y -= 9.8 * dt;
      this.pos.addScaledVector(this.fallVelocity, dt);
      this.mesh.position.copy(this.pos);
      this.mesh.rotation.x += 12 * dt;
      this.mesh.rotation.z += 16 * dt;

      if (this.pos.y < 0.2) {
        this.mesh.visible = false;
      }

      this.respawnTimer -= dt;
      if (this.respawnTimer <= 0) {
        // Respawn UFO
        this.isHit = false;
        this.pos.set(0, 2.35, -0.6);
        this.mesh.position.copy(this.pos);
        this.mesh.rotation.set(0, 0, 0);
        this.mesh.visible = true;
        sounds.playRestock();
      }
      return;
    }

    // Gentle, relaxed Lissajous flight in canopy space (slowed down for comfortable tracking)
    this.pos.x = Math.sin(elapsed * 0.65) * 1.7;
    this.pos.y = 2.32 + Math.cos(elapsed * 0.95) * 0.08;
    this.pos.z = -0.6 + Math.sin(elapsed * 0.4) * 0.12;
    this.mesh.position.copy(this.pos);

    // Saucer tilt
    this.mesh.rotation.z = -Math.cos(elapsed * 0.65) * 0.14;
    this.mesh.rotation.y += 1.3 * dt;

    // Pulse rim lights
    this.lights.forEach((l, idx) => {
      const level = 0.55 + Math.sin(elapsed * 10.0 + idx * 1.5) * 0.45;
      l.mat.color.copy(l.base).multiplyScalar(level);
    });
  }

  public hit(): THREE.Vector3 {
    if (this.external) {
      sounds.playHit(true, 0.9);                              // 命中の手応えだけ(墜ちるかはサーバーの判定を待つ)
      return this.pos.clone();
    }
    this.isHit = true;
    this.respawnTimer = 6.0;
    this.fallVelocity.set((Math.random() - 0.5) * 2.0, 1.5, -0.8);
    sounds.playUFOHit();
    return this.pos.clone();
  }

  public getBoundingBox(): THREE.Box3 {
    const box = new THREE.Box3();
    if (this.external ? this.externalActive : !this.isHit) {
      box.setFromObject(this.mesh);
      box.expandByScalar(HIT_MARGIN);
    }
    return box;
  }
}

// Manager holding all moving and flying targets
export class DynamicTargetsManager {
  public group: THREE.Group;
  public balloons: FloatingBalloon[] = [];
  public ducks: MovingDuck[] = [];
  public ufo: FlyingUFO;

  // Confetti particles on pop/hit
  private confetti: { mesh: THREE.Mesh; vel: THREE.Vector3; life: number; maxLife: number }[] = [];
  private confettiGeo: THREE.BoxGeometry;

  constructor() {
    this.group = new THREE.Group();
    this.confettiGeo = new THREE.BoxGeometry(0.025, 0.025, 0.005);

    // 1. Floating Balloons (4 balloons floating at different heights)
    const balloonConfigs = [
      { pos: new THREE.Vector3(-1.4, 2.15, -0.2), color: 0xd91414, seed: 0 },
      { pos: new THREE.Vector3(-0.5, 2.25, -0.4), color: 0xffcc00, seed: 1.8 },
      { pos: new THREE.Vector3(0.5, 2.20, -0.3), color: 0x0984e3, seed: 3.2 },
      { pos: new THREE.Vector3(1.4, 2.18, -0.2), color: 0x9b59b6, seed: 4.5 },
    ];

    balloonConfigs.forEach((c) => {
      const b = new FloatingBalloon(c.pos, c.color, c.seed);
      this.balloons.push(b);
      this.group.add(b.mesh);
    });

    // 2. Moving Ducks (3 ducks marching along middle track)
    const duckConfigs = [
      { x: -1.0, y: 1.02, z: 0.05, speed: 0.55 },
      { x: 0.2, y: 1.02, z: 0.05, speed: 0.55 },
      { x: 1.4, y: 1.02, z: 0.05, speed: 0.55 },
    ];

    duckConfigs.forEach((c) => {
      const d = new MovingDuck(c.x, c.y, c.z, c.speed);
      this.ducks.push(d);
      this.group.add(d.mesh);
    });

    // 3. Flying Golden UFO
    this.ufo = new FlyingUFO();
    this.group.add(this.ufo.mesh);
  }

  // Spawn confetti shower when target is defeated
  public spawnConfetti(center: THREE.Vector3) {
    const colors = [0xffcc00, 0xd91414, 0x0984e3, 0x00b894, 0xffffff, 0xfd79a8];
    for (let i = 0; i < 24; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
        side: THREE.DoubleSide,
      });
      const cMesh = new THREE.Mesh(this.confettiGeo, mat);
      cMesh.position.copy(center);

      const vel = new THREE.Vector3(
        (Math.random() - 0.5) * 4.0,
        Math.random() * 3.5 + 1.0,
        (Math.random() - 0.5) * 3.0
      );

      this.group.add(cMesh);
      this.confetti.push({
        mesh: cMesh,
        vel,
        life: 0,
        maxLife: 0.6 + Math.random() * 0.4,
      });
    }
  }

  public update(dt: number, elapsed: number) {
    this.balloons.forEach((b) => b.update(dt, elapsed));
    this.ducks.forEach((d) => d.update(dt));
    this.ufo.update(dt, elapsed);

    // Update confetti
    for (let i = this.confetti.length - 1; i >= 0; i--) {
      const c = this.confetti[i];
      c.life += dt;
      if (c.life >= c.maxLife) {
        this.group.remove(c.mesh);
        (c.mesh.material as THREE.Material).dispose();
        this.confetti.splice(i, 1);
      } else {
        c.vel.y -= 7.0 * dt;
        c.mesh.position.addScaledVector(c.vel, dt);
        c.mesh.rotation.x += 14 * dt;
        c.mesh.rotation.y += 10 * dt;
      }
    }
  }

  public reset() {
    this.balloons.forEach((b) => {
      b.isPopped = false;
      b.mesh.visible = true;
    });
    this.ducks.forEach((d) => {
      d.isDown = false;
      d.flipAngle = 0;
      d.mesh.rotation.x = 0;
    });
    this.ufo.isHit = false;
    this.ufo.pos.set(0, 2.35, -0.6);
    this.ufo.mesh.position.copy(this.ufo.pos);
    this.ufo.mesh.rotation.set(0, 0, 0);
    this.ufo.mesh.visible = true;

    for (const c of this.confetti) {
      this.group.remove(c.mesh);
      (c.mesh.material as THREE.Material).dispose();
    }
    this.confetti = [];
  }
}
