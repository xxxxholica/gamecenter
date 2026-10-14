import * as THREE from 'three';
import { Stage, StageResult, StageBriefing } from '../types';
import { InputManager } from '../input';
import { EffectsManager } from '../effects';
import { sound } from '../audio';

export class Stage1Drink implements Stage {
  id = 1;
  numberText = 'STAGE 1';
  title = 'ドリンクバー';
  mission = 'こぼれる寸前の極限で注ぎを止めろ！';
  instruction = 'ドリンクが勝手に注がれる・Enter / A で止める';
  briefing: StageBriefing = {
    headline: '溢れる前に止めろ',
  };
  limitLabel = '液面限界';

  private scene!: THREE.Scene;
  private effects!: EffectsManager;
  private stageGroup = new THREE.Group();

  // Glass dimensions
  private readonly glassHeight = 3.0;
  private readonly glassRadius = 0.9;
  private readonly maxSafeHeight = this.glassHeight; // グラスの上端(フチ)。これを超えるとこぼれる

  // State
  private liquidHeight = 0.2; // starts slightly filled
  private completed = false;
  private failed = false;
  private timeLeft = 8.0;
  private active = false;
  // 開始直後は、直前の説明を閉じた操作が「止める」と誤認されないように少し待つ
  private stopGrace = 0.3;
  // 毎回わずかに違う(±10%程度)。同じタイミングの暗記だけでは通らないようにする
  private readonly pourSpeed = 0.55 * (0.9 + Math.random() * 0.2);

  // あふれた時の演出
  private spillTime = -1; // あふれてからの経過(秒)。未発生は負
  private spillRivulets: { group: THREE.Group; mesh: THREE.Mesh; delay: number; reach: number }[] = [];
  private puddleMesh!: THREE.Mesh;

  // Meshes
  private glassMesh!: THREE.Mesh;
  private liquidMesh!: THREE.Mesh;
  private liquidBasePos!: Float32Array; // 半径1・高さ1の円柱の頂点(液面に合わせて毎回作り直す元)
  private streamMesh!: THREE.Mesh;
  private nozzleGroup!: THREE.Group;
  private bubbleParticles!: THREE.Points;

  constructor(effects: EffectsManager) {
    this.effects = effects;
  }

  init(scene: THREE.Scene, _camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.stageGroup = new THREE.Group();
    this.scene.add(this.stageGroup);

    // Optimized camera: eye-level with the glass rim for precise edge judgment
    this.effects.setCameraBase(
      new THREE.Vector3(0, 2.7, 3.2),
      new THREE.Vector3(0, 2.1, 0)
    );

    // Lighting
    const amb = new THREE.AmbientLight(0xffffff, 0.8);
    const dir = new THREE.DirectionalLight(0xffffff, 1.4);
    dir.position.set(3, 8, 5);
    this.stageGroup.add(amb, dir);

    // Table / Counter
    const tableGeom = new THREE.BoxGeometry(10, 1, 6);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x181a1f,
      roughness: 0.3,
      metalness: 0.8,
    });
    const table = new THREE.Mesh(tableGeom, tableMat);
    table.position.set(0, -0.5, 0);
    this.stageGroup.add(table);

    // Dispenser machine nozzle at top
    this.nozzleGroup = new THREE.Group();
    const nozzleHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.4, 0.8, 16),
      new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.95, roughness: 0.15 })
    );
    nozzleHead.position.set(0, 4.2, 0);
    const nozzleTip = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.14, 0.3, 16),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.5 })
    );
    nozzleTip.position.set(0, 3.7, 0);
    this.nozzleGroup.add(nozzleHead, nozzleTip);
    this.stageGroup.add(this.nozzleGroup);

    // Stream from nozzle to glass
    // ノズルの先(y=3.7)からコップの底(y=0.1)まで届く長さ
    const streamGeom = new THREE.CylinderGeometry(0.1, 0.1, 3.6, 8);
    const streamMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      transparent: true,
      opacity: 0.9,
    });
    this.streamMesh = new THREE.Mesh(streamGeom, streamMat);
    this.streamMesh.position.set(0, 1.9, 0);
    this.streamMesh.visible = false;
    this.stageGroup.add(this.streamMesh);

    // Transparent Glass
    const glassGeom = new THREE.CylinderGeometry(
      this.glassRadius,
      this.glassRadius * 0.8,
      this.glassHeight,
      32,
      1,
      true
    );
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0xeef8ff,
      transparent: true,
      opacity: 0.32,
      roughness: 0.08,
      metalness: 0.2,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.glassMesh = new THREE.Mesh(glassGeom, glassMat);
    this.glassMesh.position.set(0, this.glassHeight / 2, 0);
    this.stageGroup.add(this.glassMesh);

    // Glass Base Bottom
    const baseGeom = new THREE.CylinderGeometry(this.glassRadius * 0.8, this.glassRadius * 0.82, 0.1, 32);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.2 });
    const glassBase = new THREE.Mesh(baseGeom, baseMat);
    glassBase.position.set(0, 0.05, 0);
    this.stageGroup.add(glassBase);

    this.buildStraw();
    this.buildSpill();

    // Liquid Mesh (melon soda bright green)
    const liquidGeom = new THREE.CylinderGeometry(1, 1, 1, 32);
    const liquidMat = new THREE.MeshStandardMaterial({
      color: 0x11ff60,
      roughness: 0.15,
      metalness: 0.2,
      emissive: 0x00aa33,
      emissiveIntensity: 0.2,
      transparent: true,
      opacity: 0.88, // ストローが液の中でも見えるように
    });
    this.liquidBasePos = Float32Array.from(liquidGeom.attributes.position.array as ArrayLike<number>);
    this.liquidMesh = new THREE.Mesh(liquidGeom, liquidMat);
    this.liquidMesh.position.set(0, 0, 0);
    this.stageGroup.add(this.liquidMesh);

    // Internal soda bubbles
    const bubbleCount = 40;
    const bubblePos = new Float32Array(bubbleCount * 3);
    for (let i = 0; i < bubbleCount; i++) {
      bubblePos[i * 3 + 0] = (Math.random() - 0.5) * (this.glassRadius * 1.4);
      bubblePos[i * 3 + 1] = Math.random() * this.glassHeight;
      bubblePos[i * 3 + 2] = (Math.random() - 0.5) * (this.glassRadius * 1.4);
    }
    const bubbleGeom = new THREE.BufferGeometry();
    bubbleGeom.setAttribute('position', new THREE.BufferAttribute(bubblePos, 3));
    const bubbleMat = new THREE.PointsMaterial({
      color: 0xaaffaa,
      size: 0.06,
      transparent: true,
      opacity: 0.8,
    });
    this.bubbleParticles = new THREE.Points(bubbleGeom, bubbleMat);
    this.stageGroup.add(this.bubbleParticles);

    this.updateVisuals();
  }

  /** 2点を結ぶ円柱(ストロー用) */
  private makeSegment(from: THREE.Vector3, to: THREE.Vector3, radius: number, mat: THREE.Material): THREE.Mesh {
    const dir = new THREE.Vector3().subVectors(to, from);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, dir.length(), 10), mat);
    mesh.position.copy(from).add(to).multiplyScalar(0.5);
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    return mesh;
  }

  /** 飲み口が折れ曲がったストロー。ノズルと重ならないよう、コップの奥側・右寄りに挿す */
  private buildStraw() {
    const white = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const red = new THREE.MeshStandardMaterial({ color: 0xff3b5c, roughness: 0.4 });
    const bottom = new THREE.Vector3(0.3, 0.12, -0.25);
    const bend = new THREE.Vector3(0.6, 3.25, -0.25);
    const mouth = new THREE.Vector3(1.1, 3.5, -0.25);

    // まっすぐな部分は赤白の縞
    const stripes = 12;
    for (let i = 0; i < stripes; i++) {
      const a = bottom.clone().lerp(bend, i / stripes);
      const b = bottom.clone().lerp(bend, (i + 1) / stripes);
      this.stageGroup.add(this.makeSegment(a, b, 0.06, i % 2 === 0 ? white : red));
    }
    // 折れ曲がり(蛇腹)と、外へ向く飲み口
    const joint = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 10), white);
    joint.position.copy(bend);
    this.stageGroup.add(joint);
    for (let i = 0; i < 4; i++) {
      const a = bend.clone().lerp(mouth, i / 4);
      const b = bend.clone().lerp(mouth, (i + 1) / 4);
      this.stageGroup.add(this.makeSegment(a, b, 0.06, i % 2 === 0 ? white : red));
    }
  }

  /** あふれた時の演出(コップの外側を伝う液と、テーブルに広がる水たまり)を、見えない状態で用意する */
  private buildSpill() {
    const mat = new THREE.MeshBasicMaterial({ color: 0x86ffa8, transparent: true, opacity: 0.95 });
    const topR = this.glassRadius + 0.03;
    const botR = this.glassRadius * 0.8 + 0.03;
    const len = this.maxSafeHeight - 0.05;
    const tilt = Math.atan((topR - botR) / len);
    // 手前側(カメラ側)に数本、時間差で流れ落ちる
    const angles = [-0.9, -0.45, 0, 0.45, 0.9, 1.4, -1.4];
    angles.forEach((ang, i) => {
      const group = new THREE.Group();
      group.position.set(0, this.maxSafeHeight, 0);
      group.rotation.y = ang - Math.PI / 2; // +z(手前=カメラ側)を中心に振り分ける
      const width = 0.07 + Math.random() * 0.06;
      const geom = new THREE.CylinderGeometry(width, width * 0.7, len, 8);
      geom.translate(0, -len / 2, 0);
      const mesh = new THREE.Mesh(geom, mat);
      mesh.position.x = topR;
      mesh.rotation.z = -tilt; // 下へ行くほどグラスの細さに合わせて内側へ傾ける
      mesh.scale.y = 0.001;
      group.add(mesh);
      group.visible = false;
      this.stageGroup.add(group);
      this.spillRivulets.push({ group, mesh, delay: (i % 4) * 0.08 + Math.random() * 0.08, reach: 0.55 + Math.random() * 0.45 });
    });

    this.puddleMesh = new THREE.Mesh(new THREE.CircleGeometry(1, 40), new THREE.MeshBasicMaterial({
      color: 0x11ff60,
      transparent: true,
      opacity: 0.8,
    }));
    this.puddleMesh.rotation.x = -Math.PI / 2;
    this.puddleMesh.position.set(0, 0.015, 0);
    this.puddleMesh.visible = false;
    this.stageGroup.add(this.puddleMesh);
  }

  start() {
    this.active = true;
    // ドリンクは開始と同時に、勝手にゆっくり注がれる。プレイヤーは止めるタイミングだけを狙う
    this.streamMesh.visible = true;
    sound.startPourSound();
  }

  /** 高さ y でのグラスの内側の半径(グラスは下ほど細い) */
  private glassRadiusAt(y: number): number {
    const bottom = this.glassRadius * 0.8;
    return bottom + (this.glassRadius - bottom) * (y / this.glassHeight) - 0.03;
  }

  /** 液体をグラスの内側にぴったり沿う形にする(液面が上がるほど上の方が太くなる) */
  private updateVisuals() {
    const h = Math.max(0.01, Math.min(this.liquidHeight, this.maxSafeHeight));
    const rTop = this.glassRadiusAt(h);
    const rBottom = this.glassRadiusAt(0);
    const pos = this.liquidMesh.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const bx = this.liquidBasePos[i * 3];
      const by = this.liquidBasePos[i * 3 + 1];
      const bz = this.liquidBasePos[i * 3 + 2];
      const r = by > 0 ? rTop : rBottom; // 円柱は y = ±0.5 の2段。側面と上下の蓋で共通
      pos.setXYZ(i, bx * r, (by + 0.5) * h, bz * r);
    }
    pos.needsUpdate = true;
    this.liquidMesh.geometry.computeVertexNormals();
  }

  private updateSpill(dt: number) {
    this.spillTime += dt;
    const t = this.spillTime;
    for (const r of this.spillRivulets) {
      const k = Math.min(1, Math.max(0, (t - r.delay) / 0.45));
      r.group.visible = k > 0;
      r.mesh.scale.y = Math.max(0.001, k * r.reach);   // 伝う長さは1本ずつ違う(途中で止まるものもある)
    }
    // 液が根元まで届いたころから、テーブルに広がる
    const p = Math.min(1, Math.max(0, (t - 0.4) / 0.7));
    this.puddleMesh.visible = p > 0;
    const eased = 1 - Math.pow(1 - p, 3);
    const radius = this.glassRadius * 0.8 + eased * 1.9;
    this.puddleMesh.scale.set(radius, radius, 1);
    // しばらく縁からも溢れ続ける
    if (t < 1.0 && Math.random() < 0.6) {
      this.effects.spawnLiquidSplash(new THREE.Vector3(0, this.maxSafeHeight, 0.7), 0x11ff60, 2);
    }
  }

  update(dt: number, input: InputManager): StageResult | null {
    if (this.spillTime >= 0) this.updateSpill(dt);
    if (!this.active || this.completed || this.failed) return null;

    this.timeLeft -= dt;
    this.stopGrace = Math.max(0, this.stopGrace - dt);

    // 内部の泡粒を揺らす
    const posAttr = this.bubbleParticles.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < posAttr.count; i++) {
      let y = posAttr.getY(i) + dt * 0.8;
      if (y > this.liquidHeight) y = 0.05;
      posAttr.setY(i, y);
    }
    posAttr.needsUpdate = true;

    // 止める操作: Enter / A ボタンを押した瞬間(押しっぱなしでは反応しない)
    const stopPressed = input.wasButton0Pressed();

    // 液面は一定の速さで勝手に上がる
    this.liquidHeight += this.pourSpeed * dt;
    this.nozzleGroup.position.x = (Math.random() - 0.5) * 0.02;

    // フチに近づくほど緊張感のある音を鳴らす
    const proximity = this.liquidHeight / this.maxSafeHeight;
    if (proximity > 0.9) {
      if (Math.random() < 0.25) sound.playTick(1800 + Math.random() * 400);
    } else if (proximity > 0.75) {
      if (Math.random() < 0.1) sound.playTick(1200);
    }
    if (Math.random() < 0.3) {
      this.effects.spawnLiquidSplash(new THREE.Vector3(0, Math.min(this.liquidHeight, this.maxSafeHeight), 0), 0x11ff60, 2);
    }

    // 1. あふれた(止めるのが遅すぎた・時間切れ)
    if (this.liquidHeight > this.maxSafeHeight || this.timeLeft <= 0) {
      this.failed = true;
      this.stopPouring();
      this.updateVisuals();
      this.spillTime = 0;
      this.triggerFailureEffects();
      return { completed: true, success: false, scorePercent: 0, judgmentText: '大惨事' };
    }

    // 2. 止めた: その時点の液面で確定
    if (stopPressed && this.stopGrace <= 0) {
      this.completed = true;
      this.stopPouring();
      this.updateVisuals();

      const scoreRatio = Math.min(0.999, this.liquidHeight / this.maxSafeHeight);
      const scorePercent = Number((scoreRatio * 100).toFixed(1));

      if (scorePercent >= 35) {
        sound.playSuccessChime(scorePercent);
        return { completed: true, success: true, scorePercent, judgmentText: '成功' };
      }
      // 早すぎる(足りない)
      sound.playFailBuzzer();
      return { completed: true, success: false, scorePercent, judgmentText: '大惨事' };
    }

    this.updateVisuals();
    return null;
  }

  private stopPouring() {
    sound.stopPourSound();
    this.streamMesh.visible = false;
    this.nozzleGroup.position.set(0, 0, 0);
  }

  triggerFailureEffects() {
    sound.playFailBuzzer();
    sound.playExplosion();
    this.effects.addTrauma(0.85);
    // Green soda overflow cascade
    this.effects.spawnLiquidSplash(
      new THREE.Vector3(0, this.maxSafeHeight, 0),
      0x11ff60,
      40
    );
    this.effects.spawnLiquidSplash(
      new THREE.Vector3(0.5, this.maxSafeHeight, 0.5),
      0xffffff,
      20
    );
    this.spillTime = Math.max(0, this.spillTime);
    // あふれた様子(コップを伝う液・テーブルの水たまり)が見えるよう、全体が映る引きの画に切り替える
    this.effects.setCameraBase(new THREE.Vector3(0, 2.4, 6.2), new THREE.Vector3(0, 1.4, 0));
  }

  getLimitValue(): number {
    return Math.min(100, Math.max(0, (this.liquidHeight / this.maxSafeHeight) * 100));
  }

  getRemainingTime(): number {
    return Math.max(0, this.timeLeft);
  }

  cleanup(scene: THREE.Scene) {
    sound.stopPourSound();
    scene.remove(this.stageGroup);
  }
}
