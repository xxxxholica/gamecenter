import * as THREE from 'three';
import { CharacterModel, CharacterColors } from './CharacterModel';
import { SoundManager } from '../audio/SoundManager';
import { ParticleManager } from '../effects/ParticleManager';
import type { FighterSnap } from '../../../../shared/sumoProtocol';
import { STATE_NAMES } from '../../../../shared/sumoProtocol';
import type { FighterActionState } from '../../../../shared/sumoSim/SimFighter';
import {
  BUCHIKAMASHI_MAX_COOLDOWN,
  GRAB_HOLD_TIME,
  GRAB_MAX_COOLDOWN,
  MAX_CHARGE_TIME,
  rushDurationFor,
} from '../../../../shared/sumoSim/SimFighter';

/** 頭上マーカーの文字。「あなた」を出すので、日本語の太字が使えるフォントにする */
const MARKER_FONT = '900 72px "Hiragino Sans", "Yu Gothic", "Noto Sans JP", "Impact", sans-serif';

/** 頭上マーカーの配色(1P=青・2P=赤・3P=緑・4P=金) */
const MARKER_PALETTE = [
  { primary: '#0077ff', secondary: '#00d4ff', glow: 'rgba(0, 180, 255, 0.8)' },
  { primary: '#ff2244', secondary: '#ff7700', glow: 'rgba(255, 60, 60, 0.8)' },
  { primary: '#12a150', secondary: '#6be08f', glow: 'rgba(60, 220, 120, 0.8)' },
  { primary: '#c98f00', secondary: '#ffe066', glow: 'rgba(255, 205, 60, 0.8)' },
];

/**
 * 力士1人分の「見た目」(3Dモデル・頭上マーカー・アニメーション)。物理や判定は持たず、
 * シミュレーション(shared/sumoSim。サーバー、またはCPU対戦ではブラウザ内)から届いた状態(FighterSnap)を画面に反映するだけ。
 */
export class FighterView {
  public readonly name: string;
  public readonly slot: number;
  public readonly model: CharacterModel;
  public readonly mesh: THREE.Group;
  public readonly overheadMarker: THREE.Sprite;

  // 最後に反映した状態(HUD・演出判定が読む)
  public readonly position = new THREE.Vector3();
  public state: FighterActionState = 'idle';
  public damagePercent = 0;
  public hasSuperArmor = false;
  public chargeRatio = 0; // タメている間だけ 0〜1
  public buchikamashiCooldownRatio = 0; // 残り/最大
  public grabCooldownRatio = 0;
  public hariteGauge = 0; // 0〜1
  /** 試合から外れた(退出) */
  public gone = false;

  private stateTimer = 0;
  private chargeTimer = 0;
  private grabHoldTimer = 0;
  private hariteArm: 'left' | 'right' = 'right';
  private readonly soundManager: SoundManager;
  private readonly particleManager: ParticleManager;
  private markerBaseY = 2.8;
  private markerAnimTimer = 0;

  constructor(slot: number, name: string, colors: CharacterColors, soundManager: SoundManager, particleManager: ParticleManager, label: string) {
    this.slot = slot;
    this.name = name;
    this.soundManager = soundManager;
    this.particleManager = particleManager;
    this.model = new CharacterModel(colors);
    this.mesh = this.model.root;
    this.overheadMarker = this.createOverheadMarker(label, slot);
    this.mesh.add(this.overheadMarker);
  }

  /**
   * 状態を反映する。ホストでは毎フレーム出る「タメ中の粒子」「突進中の砂ぼこり」は、通信量を抑えるため演出イベントには載らないので、
   * 状態を見てここで出す。
   */
  public applyState(s: FighterSnap, dt: number): void {
    this.gone = s[16] === 1;
    this.mesh.visible = !this.gone;
    this.position.set(s[0], s[1], s[2]);
    this.state = (STATE_NAMES[s[7]] ?? 'idle') as FighterActionState;
    this.stateTimer = s[8];
    this.chargeTimer = s[9];
    this.damagePercent = s[10];
    this.buchikamashiCooldownRatio = s[11] / BUCHIKAMASHI_MAX_COOLDOWN;
    this.grabCooldownRatio = s[12] / GRAB_MAX_COOLDOWN;
    this.hariteGauge = s[13] / 100;
    this.hariteArm = s[14] === 1 ? 'left' : 'right';
    this.grabHoldTimer = s[15];
    this.hasSuperArmor = this.state === 'buchikamashi_rush';
    this.chargeRatio = this.state === 'buchikamashi_charge' ? Math.min(1, this.chargeTimer / MAX_CHARGE_TIME) : 0;

    if (this.gone) return;

    if (this.state === 'buchikamashi_charge') {
      if (Math.random() < 0.4) this.soundManager.playBuchikamashiCharge(this.chargeRatio);
      this.particleManager.spawnChargeParticle(new THREE.Vector3(s[0], s[1], s[2]), this.chargeRatio);
    } else if (this.state === 'buchikamashi_rush' && Math.random() < 0.6) {
      const speed = Math.hypot(s[3], s[5]) || 1;
      this.particleManager.spawnDust(new THREE.Vector3(s[0], 0.2, s[2]), new THREE.Vector3(-s[3] / speed, 0, -s[5] / speed));
    }

    // Three.jsメッシュの同期(剛体の中心から、足元の高さへ)
    this.mesh.position.set(s[0], s[1] - 0.9, s[2]);
    this.mesh.rotation.y = s[6];
    this.updateModelAnimation(dt);
    this.updateMarkerAnimation(dt);
  }

  /** 初期位置に立たせる(状態が届く前・タイトル画面)。 */
  public placeAt(x: number, z: number, angle: number): void {
    this.gone = false;
    this.mesh.visible = true;
    this.state = 'idle';
    this.damagePercent = 0;
    this.hasSuperArmor = false;
    this.chargeRatio = this.buchikamashiCooldownRatio = this.grabCooldownRatio = this.hariteGauge = 0;
    this.position.set(x, 1.2, z);
    this.mesh.position.set(x, 1.2 - 0.9, z);
    this.mesh.rotation.y = angle;
  }

  /** 構えのまま待つ(状態が届く前・タイトル画面)。 */
  public idle(dt: number): void {
    this.model.updateAnimation(dt, 'idle', 0, 0);
    this.updateMarkerAnimation(dt);
  }

  /** キャラクターモデルのアニメーション更新 */
  private updateModelAnimation(dt: number): void {
    let animProgress = 0;
    let chargeProgress = 0;
    let animState: 'idle' | 'walk' | 'harite' | 'buchikamashi_charge' | 'buchikamashi_rush' | 'grab_attempt' | 'grab_holding' | 'throw' | 'grabbed' | 'hit' = 'idle';

    switch (this.state) {
      case 'walk':
        animState = 'walk';
        break;
      case 'harite':
        animState = 'harite';
        animProgress = Math.min(1.0, this.stateTimer / 0.22);
        break;
      case 'buchikamashi_charge':
        animState = 'buchikamashi_charge';
        chargeProgress = Math.min(1.0, this.chargeTimer / MAX_CHARGE_TIME);
        break;
      case 'buchikamashi_rush':
        animState = 'buchikamashi_rush';
        animProgress = Math.min(1.0, this.stateTimer / Math.max(0.01, rushDurationFor(Math.min(1, this.chargeTimer / MAX_CHARGE_TIME))));
        break;
      case 'grab_attempt':
        animState = 'grab_attempt';
        animProgress = Math.min(1.0, this.stateTimer / 0.26);
        break;
      case 'grab_holding':
        animState = 'grab_holding';
        animProgress = Math.min(1.0, this.grabHoldTimer / GRAB_HOLD_TIME);
        break;
      case 'throw':
        animState = 'throw';
        animProgress = Math.min(1.0, this.stateTimer / 0.38);
        break;
      case 'grabbed':
        animState = 'grabbed';
        animProgress = Math.min(1.0, this.stateTimer / 1.0);
        break;
      case 'hit':
        animState = 'hit';
        animProgress = Math.min(1.0, this.stateTimer / 0.25);
        break;
      default:
        break;
    }

    this.model.updateAnimation(dt, animState, animProgress, chargeProgress, this.hariteArm);
  }

  /**
   * 頭上マーカーの浮遊アニメーション
   */
  public updateMarkerAnimation(dt: number) {
    this.markerAnimTimer += dt;
    this.overheadMarker.position.y = this.markerBaseY + Math.sin(this.markerAnimTimer * 4.2) * 0.06;
  }

  /**
   * 頭上マーカー（1P / 2P / CPU）のスプライト生成
   */
  private createOverheadMarker(label: string, slot: number): THREE.Sprite {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 256;
    const ctx = canvas.getContext('2d')!;

    this.drawMarkerCanvas(ctx, label, slot);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;

    const material = new THREE.SpriteMaterial({
      map: texture,
      depthTest: false,
      depthWrite: false,
      transparent: true,
    });

    const sprite = new THREE.Sprite(material);
    sprite.scale.set(2.4, 1.2, 1.0);
    sprite.position.set(0, this.markerBaseY, 0);
    sprite.renderOrder = 999;
    const isPreview = typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview'));
    if (isPreview) sprite.visible = false;
    return sprite;
  }

  /**
   * マーカーのキャンバス描画（スタイリッシュな角丸バッジ＋下向き矢印）
   */
  private drawMarkerCanvas(ctx: CanvasRenderingContext2D, label: string, slot: number) {
    const w = 512;
    const h = 256;
    ctx.clearRect(0, 0, w, h);

    const { primary: primaryColor, secondary: secondaryColor, glow: glowColor } = MARKER_PALETTE[slot % MARKER_PALETTE.length];

    // バッジの外枠と影
    // 文字の幅に合わせて、バッジの横幅を広げる(「あなた」など日本語にも対応)
    ctx.font = MARKER_FONT;
    const bw = Math.max(240, ctx.measureText(label).width + 80);
    const bh = 100;
    const bx = (w - bw) / 2;
    const by = 45;
    const r = 24;

    // ドロップシャドウ
    ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;

    // 角丸バッジ背景グラデーション
    const grad = ctx.createLinearGradient(bx, by, bx, by + bh);
    grad.addColorStop(0, secondaryColor);
    grad.addColorStop(1, primaryColor);
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, r);
    ctx.fill();

    // 下向きの三角形インジケーター（▼）
    const tw = 44;
    const th = 32;
    const tx = w / 2;
    const ty = by + bh + 4;

    ctx.beginPath();
    ctx.moveTo(tx - tw / 2, ty);
    ctx.lineTo(tx + tw / 2, ty);
    ctx.lineTo(tx, ty + th);
    ctx.closePath();
    ctx.fillStyle = primaryColor;
    ctx.fill();

    // 白色の太い光沢枠線
    ctx.shadowColor = 'transparent';
    ctx.lineWidth = 8;
    ctx.strokeStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, r);
    ctx.stroke();

    // 三角形枠線
    ctx.beginPath();
    ctx.moveTo(tx - tw / 2, ty);
    ctx.lineTo(tx + tw / 2, ty);
    ctx.lineTo(tx, ty + th);
    ctx.closePath();
    ctx.stroke();

    // 光彩グロー
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 14;

    // ラベルテキスト（「1P」「2P」「CPU」）
    ctx.font = MARKER_FONT;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // テキスト黒縁取り
    ctx.lineWidth = 10;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(label, w / 2, by + bh / 2);

    // テキスト本体（白）
    ctx.fillStyle = '#ffffff';
    ctx.fillText(label, w / 2, by + bh / 2);
  }

  /**
   * マーカーのラベル変更。null なら、この力士には何も出さない(自分以外の力士・CPU)
   */
  public setMarkerLabel(label: string | null) {
    if (label === null) {
      this.overheadMarker.visible = false;
      return;
    }
    this.overheadMarker.visible = !(typeof location !== 'undefined' && (location.search.includes('noHud') || location.search.includes('preview')));
    const canvas = (this.overheadMarker.material.map as THREE.CanvasTexture).image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d')!;
    this.drawMarkerCanvas(ctx, label, this.slot);
    this.overheadMarker.material.map!.needsUpdate = true;
  }

}
