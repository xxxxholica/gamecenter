// ドリラー（プレイヤー）の 3D モデル（プリミティブの組み合わせ）
import * as THREE from 'three';
import type { Game } from '../game/game.ts';

export class PlayerModel {
  root = new THREE.Group();
  private body = new THREE.Group();
  private legL: THREE.Mesh;
  private legR: THREE.Mesh;
  private armPivot = new THREE.Group();
  private drill = new THREE.Group();
  private drillTip: THREE.Mesh;
  private headLamp: THREE.Mesh;
  private walkPhase = 0;
  private squash = 0;
  private spin = 0;
  private facingAngle = 0.9;
  private cheer = 0;

  constructor() {
    const suit = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.55 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.6 });
    const skin = new THREE.MeshStandardMaterial({ color: 0xffd2a8, roughness: 0.7 });
    const helmet = new THREE.MeshStandardMaterial({ color: 0xffe14a, roughness: 0.3, metalness: 0.1 });
    const metal = new THREE.MeshStandardMaterial({ color: 0xc8d0dc, roughness: 0.25, metalness: 0.85 });

    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.2, 0.2, 6, 14), suit);
    torso.position.y = 0.02;
    const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.06, 16), dark);
    belt.position.y = -0.08;
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 18, 14), skin);
    head.position.y = 0.36;
    const hat = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 12, 0, Math.PI * 2, 0, Math.PI / 2), helmet);
    hat.position.y = 0.39;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.035, 20), helmet);
    brim.position.y = 0.39;
    this.headLamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.06, 0.06, 12),
      new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2b0, emissiveIntensity: 1.6 }),
    );
    this.headLamp.rotation.x = Math.PI / 2;
    this.headLamp.position.set(0, 0.48, 0.17);
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), eyeMat);
      eye.position.set(s * 0.06, 0.37, 0.155);
      this.body.add(eye);
    }
    const tank = new THREE.Mesh(
      new THREE.CapsuleGeometry(0.07, 0.18, 4, 10),
      new THREE.MeshStandardMaterial({ color: 0x4fe0ff, roughness: 0.2, metalness: 0.4, emissive: 0x0a5a70, emissiveIntensity: 0.6 }),
    );
    tank.position.set(0, 0.06, -0.22);
    this.legL = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.2, 0.13), dark);
    this.legR = this.legL.clone();
    this.legL.position.set(-0.09, -0.32, 0);
    this.legR.position.set(0.09, -0.32, 0);
    this.legL.geometry.translate(0, -0.05, 0);
    this.body.add(torso, belt, head, hat, brim, this.headLamp, tank, this.legL, this.legR);
    this.body.position.y = -0.08;
    this.root.add(this.body);

    // ドリル（狙う方向へ回転）
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.16, 12), suit);
    housing.position.y = 0.18;
    this.drillTip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.3, 10, 1), metal);
    this.drillTip.position.y = 0.4;
    const spiral = new THREE.Mesh(new THREE.TorusGeometry(0.075, 0.018, 6, 16), metal);
    spiral.rotation.x = Math.PI / 2;
    spiral.position.y = 0.33;
    this.drill.add(housing, this.drillTip, spiral);
    this.armPivot.add(this.drill);
    this.armPivot.position.set(0, 0, 0.18);
    this.root.add(this.armPivot);
    this.root.scale.setScalar(1.15);
  }

  update(dt: number, game: Game, half: number) {
    const p = game.player;
    this.root.position.set(p.x - half, p.y + 0.12, 0.05);

    // 向き（カメラ側を少し向く）
    const target = p.facing > 0 ? 0.95 : -0.95;
    this.facingAngle += (target - this.facingAngle) * (1 - Math.exp(-dt * 16));
    this.body.rotation.y = this.facingAngle;

    // 歩き・落下アニメ
    const moving = p.state === 'walk' || p.state === 'climb';
    if (moving) this.walkPhase += dt * 16;
    const swing = moving ? Math.sin(this.walkPhase) * 0.6 : 0;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    if (p.state === 'fall') {
      this.legL.rotation.x = -0.5;
      this.legR.rotation.x = 0.4;
    }
    if (p.landedImpact > 6) this.squash = 1;
    this.squash = Math.max(0, this.squash - dt * 5);

    // ドリルの向き
    const aimAngle = Math.atan2(p.aimY, p.aimX) - Math.PI / 2;
    let cur = this.armPivot.rotation.z;
    let d = aimAngle - cur;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    cur += d * (1 - Math.exp(-dt * 22));
    this.armPivot.rotation.z = cur;
    this.spin += dt * (p.digAnim > 0 ? 50 : 4);
    this.drill.rotation.y = this.spin;
    this.drill.position.y = p.digAnim * 0.12;

    // 被弾・死亡演出
    let sy = 1 + this.squash * -0.25 + Math.sin(game.time * 3) * 0.015;
    let sxz = 1 + this.squash * 0.2;
    this.root.rotation.z = 0;
    if (game.phase === 'dying') {
      const t = 1 - game.dyingTimer / 1.6;
      if (game.lastDeath === 'crush') {
        sy = Math.max(0.2, 1 - t * 4);
        sxz = 1 + Math.min(t * 4, 0.8);
      } else {
        this.root.rotation.z = Math.sin(t * 30) * 0.3 * (1 - t);
        this.root.position.y += t * 0.5;
      }
    }
    // クリア時はぴょんぴょん跳ねて喜ぶ
    if (game.phase === 'clear') {
      this.cheer += dt;
      this.root.position.y += Math.abs(Math.sin(this.cheer * 7)) * 0.35;
      this.armPivot.rotation.z = Math.sin(this.cheer * 7) * 0.4;
    } else this.cheer = 0;
    this.body.scale.set(sxz, sy, sxz);
    this.armPivot.scale.setScalar(sy < 0.5 ? 0.6 : 1);
    this.root.visible = this.root.visible && !game.exploded && !(game.invuln > 0 && Math.floor(game.invuln * 12) % 2 === 0);
  }
}
