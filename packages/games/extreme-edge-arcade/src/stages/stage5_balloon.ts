import * as THREE from 'three';
import { Stage, StageResult, StageBriefing } from '../types';
import { InputManager } from '../input';
import { EffectsManager } from '../effects';
import { sound } from '../audio';

/** 勝手にふくらむ風船を、割れる寸前で止める */
export class Stage5Balloon implements Stage {
  id = 4;
  numberText = 'STAGE 4';
  title = '風船ふくらまし';
  mission = '割れる寸前の極限で空気を止めろ！';
  instruction = '風船が勝手にふくらむ・レバー上かボタンで止める';
  briefing: StageBriefing = {
    headline: '風船を止める',
    ok: 'ふくらむ風船を、割れる寸前で止める',
    ng: '割れる・止めるのが早すぎる',
  };
  limitLabel = '風船の限界';

  private scene!: THREE.Scene;
  private effects!: EffectsManager;
  private stageGroup = new THREE.Group();

  // 風船の大きさ(半径)。この大きさに達すると割れる
  private static readonly START_RADIUS = 0.3;
  private static readonly MAX_RADIUS = 1.7;
  // 成功とみなす最低ライン(限界に対する割合 %)
  private static readonly MIN_SCORE = 35;
  // 風船の底(口)の高さ。ここを固定して上へふくらむ
  private static readonly NECK_Y = 1.0;
  private static readonly STRETCH_Y = 1.15;

  private radius = Stage5Balloon.START_RADIUS;
  private completed = false;
  private failed = false;
  private timeLeft = 9.0;
  private active = false;
  // 開始直後は、直前の説明を閉じた操作が「止める」と誤認されないように少し待つ
  private stopGrace = 0.3;
  private prevLeverUp = false;
  private wobbleTime = 0;
  // ふくらむ速さは毎回 ±10%程度変わる。同じタイミングの暗記だけでは通らないようにする(割れる大きさは一定)
  private readonly growSpeed = 0.28 * (0.9 + Math.random() * 0.2);

  private balloonGroup = new THREE.Group();
  private balloonMesh!: THREE.Mesh;
  private balloonMat!: THREE.MeshStandardMaterial;
  private knotMesh!: THREE.Mesh;
  private readonly calmColor = new THREE.Color(0xe8213a);
  private readonly stretchedColor = new THREE.Color(0xffb3bd);

  constructor(effects: EffectsManager) {
    this.effects = effects;
  }

  init(scene: THREE.Scene, _camera: THREE.PerspectiveCamera) {
    this.scene = scene;
    this.stageGroup = new THREE.Group();
    this.scene.add(this.stageGroup);

    // 風船の全体(最大に膨らんだ時の頭まで)が画面に収まる位置から見る
    this.effects.setCameraBase(
      new THREE.Vector3(0, 2.7, 7.5),
      new THREE.Vector3(0, 2.6, 0)
    );

    const amb = new THREE.AmbientLight(0xffffff, 0.8);
    const dir = new THREE.DirectionalLight(0xffffff, 1.5);
    dir.position.set(3, 8, 5);
    this.stageGroup.add(amb, dir);

    // テーブル
    const table = new THREE.Mesh(
      new THREE.BoxGeometry(10, 1, 6),
      new THREE.MeshStandardMaterial({ color: 0x181a1f, roughness: 0.3, metalness: 0.8 })
    );
    table.position.set(0, -0.5, 0);
    this.stageGroup.add(table);

    // 空気入れ(台座と、風船の口をはめる細い筒)
    const metal = new THREE.MeshStandardMaterial({ color: 0xcfd4dc, metalness: 0.9, roughness: 0.25 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, 0.3, 24), metal);
    base.position.set(0, 0.15, 0);
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, Stage5Balloon.NECK_Y - 0.2, 16), metal);
    pipe.position.set(0, 0.3 + (Stage5Balloon.NECK_Y - 0.3) / 2 - 0.1, 0);
    const nozzle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.17, 0.12, 0.2, 16),
      new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.5, roughness: 0.5 })
    );
    nozzle.position.set(0, Stage5Balloon.NECK_Y - 0.1, 0);
    this.stageGroup.add(base, pipe, nozzle);

    // 風船(口を固定して上へふくらむ。縦に少し長い形)
    this.balloonGroup = new THREE.Group();
    this.balloonGroup.position.set(0, Stage5Balloon.NECK_Y, 0);
    this.balloonMat = new THREE.MeshStandardMaterial({
      color: this.calmColor,
      roughness: 0.25,
      metalness: 0.0,
      emissive: 0x440008,
      emissiveIntensity: 0.25,
    });
    const balloonGeom = new THREE.SphereGeometry(1, 40, 28);
    this.balloonMesh = new THREE.Mesh(balloonGeom, this.balloonMat);
    this.balloonGroup.add(this.balloonMesh);

    // 口の結び目
    this.knotMesh = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.18, 12), this.balloonMat);
    this.knotMesh.rotation.x = Math.PI; // 先を下(口の方)へ
    this.knotMesh.position.set(0, 0.04, 0);
    this.balloonGroup.add(this.knotMesh);

    this.stageGroup.add(this.balloonGroup);
    this.updateVisuals(0);
  }

  start() {
    this.active = true;
    // 風船は開始と同時に、勝手にふくらみ始める。プレイヤーは止めるタイミングだけを狙う
    sound.startPourSound();
  }

  /** 限界に対する大きさの割合(0〜1) */
  private ratio(): number {
    return this.radius / Stage5Balloon.MAX_RADIUS;
  }

  private updateVisuals(dt: number) {
    this.wobbleTime += dt;
    const ratio = this.ratio();
    // 限界が近いほど、風船が小刻みに震える
    const tension = Math.max(0, (ratio - 0.8) / 0.2);
    const wobble = tension * 0.025;
    const wx = 1 + Math.sin(this.wobbleTime * 45) * wobble;
    const wy = 1 + Math.cos(this.wobbleTime * 38) * wobble;

    const r = this.radius;
    const ry = r * Stage5Balloon.STRETCH_Y;
    this.balloonMesh.scale.set(r * wx, ry * wy, r * wx);
    // 口の位置に、風船の下端が来るようにする
    this.balloonMesh.position.y = ry * wy - ry * 0.02 + 0.12;
    this.knotMesh.scale.setScalar(Math.max(0.6, 1 - ratio * 0.3));

    // 伸びるほど、ゴムが薄く淡い色になる
    this.balloonMat.color.copy(this.calmColor).lerp(this.stretchedColor, Math.pow(ratio, 2.2));
    this.balloonMat.emissiveIntensity = 0.25 + tension * 0.3;
  }

  update(dt: number, input: InputManager): StageResult | null {
    if (!this.active || this.completed || this.failed) return null;

    this.timeLeft -= dt;
    this.stopGrace = Math.max(0, this.stopGrace - dt);

    // 止める操作: ボタン0の押した瞬間、またはレバー上に入れた瞬間(押しっぱなしでは反応しない)
    const leverUp = input.isLeverUp();
    const stopPressed = input.wasButton0Pressed() || (leverUp && !this.prevLeverUp);
    this.prevLeverUp = leverUp;

    // 風船は一定の速さで勝手にふくらむ
    this.radius += this.growSpeed * dt;

    // 限界が近づくほど、ゴムがきしむ音を鳴らす
    const ratio = this.ratio();
    if (ratio > 0.9) {
      if (Math.random() < 0.25) sound.playTick(1800 + Math.random() * 400);
    } else if (ratio > 0.75) {
      if (Math.random() < 0.1) sound.playTick(1200);
    }

    // 1. 割れた(止めるのが遅すぎた・時間切れ)
    if (this.radius >= Stage5Balloon.MAX_RADIUS || this.timeLeft <= 0) {
      this.failed = true;
      sound.stopPourSound();
      this.balloonGroup.visible = false;
      this.triggerFailureEffects();
      return { completed: true, success: false, scorePercent: 0, judgmentText: '大惨事' };
    }

    // 2. 止めた: その時点の大きさで確定
    if (stopPressed && this.stopGrace <= 0) {
      this.completed = true;
      sound.stopPourSound();
      this.updateVisuals(0);

      const scorePercent = Number(Math.min(99.9, ratio * 100).toFixed(1));
      if (scorePercent >= Stage5Balloon.MIN_SCORE) {
        sound.playSuccessChime(scorePercent);
        return { completed: true, success: true, scorePercent, judgmentText: '成功' };
      }
      // 早すぎる(小さすぎる)
      sound.playFailBuzzer();
      return { completed: true, success: false, scorePercent, judgmentText: '大惨事' };
    }

    this.updateVisuals(dt);
    return null;
  }

  triggerFailureEffects() {
    sound.playFailBuzzer();
    sound.playExplosion();
    this.effects.addTrauma(0.95);

    // 割れた風船のかけらが、風船のあった場所から四方へ飛び散る
    const center = new THREE.Vector3(0, Stage5Balloon.NECK_Y + this.radius * Stage5Balloon.STRETCH_Y, 0);
    this.effects.spawnExplosionChunks(center, 0xe8213a, 50, 0.12);
    this.effects.spawnExplosionChunks(center, 0xffb3bd, 25, 0.08);
    this.effects.spawnSmoke(center, 0xffffff, 6);
  }

  getLimitValue(): number {
    return Math.min(100, Math.max(0, this.ratio() * 100));
  }

  getRemainingTime(): number {
    return Math.max(0, this.timeLeft);
  }

  cleanup(scene: THREE.Scene) {
    sound.stopPourSound();
    scene.remove(this.stageGroup);
  }
}
