// シェーダを、最初の描画より前に、メインスレッドを止めずに作り終えておく(midnight-skyway・ennichi-shateki)。
// 作ってあるシェーダを、初めて使う時の確認まで済ませておく(falldown・tower-stack・school-corridor-runner)。
// ベンチで、ページの立ち上がりが済むのを待ってから着いたと知らせる(ennichi-shateki・falldown・tower-stack・school-corridor-runner)
import type { Camera, Material, Object3D, WebGLRenderer, WebGLRenderTarget } from 'three';
import { realNow, replayBarrier, untrackedFrame, untrackedTimeout } from './arcadeReplay';

/**
 * scene のシェーダを、描画先 target を設定した状態で、並列にコンパイルさせる(KHR_parallel_shader_compile)。
 * 終わるまで待つあいだ、メインスレッドは止まらない。そのあとの描画は、リンクの完了を待たずに済む。
 * 描画先によってシェーダが変わる(トーンマップ・色空間)ので、実際に描く描画先を渡す(画面に直接描くなら null)。
 * 計測(Windows, Chrome, ANGLE D3D11): 1 つのプログラムのリンクに GPU プロセスで 86〜92ms かかり、最初の描画がその完了待ちで
 * 0.4〜1 秒止まっていた(midnight-skyway のタイトル、ennichi-shateki のタイトル)。
 * 待ち方は three.js の compileAsync と同じ。ただし compileAsync は setTimeout で何度も確かめに行き、その回数は端末次第なので、
 * 操作のリプレイに記録しないタイマーで確かめ、終わった所を記録と揃える(replayBarrier)。
 * 影の深度のシェーダ(MeshDepthMaterial)は renderer.compile の対象外なので、最初の描画で作られる。
 */
export function compileInParallel(renderer: WebGLRenderer, scene: Object3D, camera: Camera, target: WebGLRenderTarget | null): Promise<void> {
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  let materials: Set<Material>;
  try {
    materials = renderer.compile(scene, camera);   // シェーダを作るところまでは、ここで(描画先の設定が効くうちに)済む
  } finally {
    renderer.setRenderTarget(prev);
  }
  return replayBarrier('shader-compile', new Promise<void>((resolve) => {
    const check = (): void => {
      for (const m of materials) {
        const program = (renderer.properties.get(m) as { currentProgram?: { isReady(): boolean } }).currentProgram;
        if (!program || program.isReady()) materials.delete(m);
      }
      if (materials.size === 0) resolve();
      else untrackedTimeout(check, 10);
    };
    // 拡張が無いと isReady() はリンクの完了まで止まるので、three.js と同じく少し待ってから確かめる
    if (renderer.extensions.has('KHR_parallel_shader_compile')) check();
    else untrackedTimeout(check, 10);
  }));
}

/**
 * 作ってあるシェーダ(renderer.info.programs)を、リンクが終わったものから「使える」状態にしておく。
 * three.js は、シェーダを初めて描画に使う時に、エラーの記録(getProgramInfoLog・getShaderInfoLog)と uniform の一覧を GPU に同期で問い合わせる。
 * 起動時に作るだけで描かれない所に置いたシェーダ(爆発・ラベルなど)は、その問い合わせが、プレイ中に初めて出てきた時まで残る。
 * 計測(Windows, Chrome, tower-stack のひとり用): プレイ中のその問い合わせで、1 回 14〜18ms 止まり、33〜67ms のフレームになっていた。
 * 描画には関係しない(見た目は変わらない)。確かめるのは記録しないタイマーなので、操作のリプレイにも関係しない。
 */
export function finishPrograms(renderer: WebGLRenderer): Promise<void> {
  // 返す Promise は、その時点で作ってあるシェーダが全部済んだら終わる(読み込み画面の間に待ち切りたいとき用。待たずに呼んでもよい)
  return new Promise<void>((resolve) => {
    const check = (): void => {
      let pending = false;
      for (const p of renderer.info.programs ?? []) {
        const program = p as unknown as { isReady(): boolean; getUniforms(): unknown };
        if (program.isReady()) program.getUniforms();   // 2 回目からは、three.js が覚えている一覧を返すだけ
        else pending = true;
      }
      if (pending) untrackedTimeout(check, 50);
      else resolve();
    };
    untrackedTimeout(check, 0);
  });
}

/**
 * ページの立ち上がりの一度きりの作業が済み、描いたフレームが画面に出そろうまで待つ。
 * ページの読み込みから notBeforeMs 経ったあとで、続けて frames 回、間隔が 1 フレーム分に収まったら終わり(待ち始めてから長くても maxMs まで。
 * ページの読み込みから数えると、読み込みが maxMs より長いゲーム(Firefox の falldown は 3.4 秒)では、最初のフレームですぐ終わってしまう)。
 * 計測(Windows, Chrome, ANGLE D3D11、ennichi-shateki のタイトル):
 * - 最初の描画のあと 0.2 秒ほど、Chrome がページ(文字・CSS)を描くための自分のシェーダを作り(リンク待ち 1 回 5〜42ms)、
 *   フレームが 33〜65ms に延びていた。
 * - ページの読み込みから約 1 秒後に、Chrome が前の画面の描画の仕組みを片付け(Blink の 1 秒遅らせたタスク → compositor の Stop)、
 *   そのとき GPU の完了を待って 8〜43ms 止まる。ゲームの処理とは関係なく、毎回ほぼ同じ時刻に起きる。
 * ベンチで「場面に着いた」と知らせる前に使う(着いたあとの計測に、ページの立ち上がりの一度きりの作業を混ぜない)。
 */
export function waitFramesSettled(frames = 10, notBeforeMs = 1300, maxMs = 3000): Promise<void> {
  return replayBarrier('frames-settled', new Promise<void>((resolve) => {
    let last = -1;
    let steady = 0;
    const started = realNow();
    const tick = (now: number): void => {
      const sincePageStart = realNow();
      if (last >= 0) steady = now - last < 20 && sincePageStart >= notBeforeMs ? steady + 1 : 0;
      last = now;
      if (steady >= frames || sincePageStart - started >= maxMs) resolve();
      else untrackedFrame(tick);
    };
    untrackedFrame(tick);
  }));
}
