import * as THREE from 'three';
import { InputManager } from './input';

export interface StageResult {
  completed: boolean;
  success: boolean;
  scorePercent: number; // 0 to 100
  judgmentText: string; // "大惨事" or "成功"
}

/** 種目の始まる前に見せる説明。見出し1行(何をする種目か)・してよいこと・してはいけないことを伝える */
export interface StageBriefing {
  headline: string; // 種目名と操作を1フレーズにまとめた見出し。例: 目覚まし時計を止める
  ok: string; // 何をすればよいか
  ng: string; // 何をすると駄目か(大惨事・失敗)
}

export interface Stage {
  id: number;
  numberText: string; // e.g. "第1戦 1/6"
  title: string;
  mission: string; // e.g. "泡を溢れさせずにフチ極限まで注げ！"
  instruction: string; // e.g. "ENTER長押しで注ぐ・離して停止"
  limitLabel: string; // e.g. "液面・泡限界"
  briefing: StageBriefing; // 開始前の説明カード
  init(scene: THREE.Scene, camera: THREE.PerspectiveCamera): void;
  start(): void;
  update(dt: number, input: InputManager): StageResult | null;
  cleanup(scene: THREE.Scene): void;
  getLimitValue(): number; // 0 to 100
  getRemainingTime(): number;
  getSubInfo?(): string | null;
  /** プレイ中、画面中央に出し続けたい一文(見逃されやすい重要な一言だけに使う) */
  getCenterHint?(): string | null;
  triggerFailureEffects(): void;
}
