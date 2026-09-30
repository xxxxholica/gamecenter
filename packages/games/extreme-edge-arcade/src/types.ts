import * as THREE from 'three';
import { InputManager } from './input';

export interface StageResult {
  completed: boolean;
  success: boolean;
  scorePercent: number; // 0 to 100
  judgmentText: string; // "大惨事" or "成功"
}

/** 種目の始まる前に見せる説明。「使うボタン」「してよいこと」「してはいけないこと」を1行ずつだけ伝える */
export interface StageBriefing {
  key: string; // 使うボタン
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
  triggerFailureEffects(): void;
}
