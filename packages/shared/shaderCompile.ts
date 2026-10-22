// シェーダを、最初の描画より前に、メインスレッドを止めずに作り終えておく(midnight-skyway・ennichi-shateki)。
// 作ってあるシェーダを、初めて使う時の確認まで済ませておく(falldown・tower-stack・school-corridor-runner)。
// ベンチで、ページの立ち上がりが済むのを待ってから着いたと知らせる(ennichi-shateki・falldown・tower-stack・school-corridor-runner)
// 物に使われているテクスチャを、最初の描画より前に GPU へ送っておく(school-corridor-runner)
import type { Camera, Material, Mesh, Object3D, Scene, Texture, WebGLRenderer, WebGLRenderTarget } from 'three';
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
 * during: シェーダを作る間だけ、物の見え方(ふだんは出していないライトなど)を変える関数。戻す関数を返す。
 * 作る時にだけ呼ぶ(拡張の無い Firefox では、作るフレームごとに呼ぶ。呼び出し元が作ったあとすぐ戻しても、作る時の状態がそろう)。
 */
export function compileInParallel(renderer: WebGLRenderer, scene: Object3D, camera: Camera, target: WebGLRenderTarget | null, during?: () => () => void): Promise<void> {
  if (!renderer.extensions.has('KHR_parallel_shader_compile')) return replayBarrier('shader-compile', compileOnePerFrame(renderer, scene, camera, target, during));
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(target);
  const restore = during?.();
  let materials: Set<Material>;
  try {
    materials = renderer.compile(scene, camera);   // シェーダを作るところまでは、ここで(描画先の設定が効くうちに)済む
  } finally {
    restore?.();
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
    check();
  }));
}

/**
 * KHR_parallel_shader_compile が無いブラウザ(Firefox)用。three.js は拡張が無いと isReady() をすぐ true にするので、
 * scene 全体を renderer.compile してから描くと、作ったシェーダ全部のリンクの完了を 1 フレームで待つことになる。
 * Firefox の GPU プロセスは頼まれた順に処理するので、全部を先に頼むと、どれか 1 つを待つだけでも、前に頼んだ全部を待つ。
 * そこで、物ごとに renderer.compile し、新しいシェーダができたら、そのフレームで初めて使う時の問い合わせ(getUniforms。リンクの完了を待つ)まで済ませて、
 * 次のフレームに回す。止まるのは 1 フレームにシェーダ 1 つ分になる。
 * 同じ材質・同じ種類の物は 1 回だけ試す(シェーダは材質と、物の種類・頂点色で決まる)。
 * 計測(Windows, Firefox 157, ANGLE D3D11、midnight-skyway の起動): 1 つのリンクに 0.3 秒前後かかり、まとめて待つと 1.2〜2.8 秒のフレームになっていた。
 */
function compileOnePerFrame(renderer: WebGLRenderer, scene: Object3D, camera: Camera, target: WebGLRenderTarget | null, during?: () => () => void): Promise<void> {
  const objects: Object3D[] = [];
  const seen = new Set<string>();
  scene.traverse((o) => {
    const mesh = o as Mesh & { isPoints?: boolean; isLine?: boolean; isSprite?: boolean; isInstancedMesh?: boolean; isSkinnedMesh?: boolean };
    if (!(mesh.isMesh || mesh.isPoints || mesh.isLine || mesh.isSprite) || !mesh.material) return;
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const kind = `${o.type}|${mesh.geometry?.attributes?.color ? 1 : 0}|${mesh.geometry?.morphAttributes?.position ? 1 : 0}`;
    const keys = mats.map((m) => `${m.uuid}|${kind}`);
    if (keys.every((k) => seen.has(k))) return;
    for (const k of keys) seen.add(k);
    objects.push(o);
  });
  const programs = renderer.info.programs as unknown as { getUniforms(): unknown }[] | null;
  return new Promise<void>((resolve) => {
    let i = 0;
    const step = (): void => {
      const before = programs?.length ?? 0;
      const prev = renderer.getRenderTarget();
      renderer.setRenderTarget(target);
      const restore = during?.();
      try {
        // 新しいシェーダが 1 つできるまで進める(作り済みのシェーダしか使わない物は、そのまま次へ)
        while (i < objects.length && (programs?.length ?? 0) === before) renderer.compile(objects[i++], camera, scene as Scene);
      } finally {
        restore?.();
        renderer.setRenderTarget(prev);
      }
      if (programs) for (let p = before; p < programs.length; p++) programs[p].getUniforms();
      if (i >= objects.length) resolve();
      else untrackedFrame(step);
    };
    untrackedFrame(step);
  });
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

/**
 * root の下の物の材質に使われているテクスチャ(map などと、ShaderMaterial の uniform)を、いまのうちに GPU へ送る。
 * renderer.compile はシェーダを作るだけで、テクスチャはその物を初めて描く瞬間に送る。プレイ中に初めて出てくる物(障害物など)のキャンバスのテクスチャは、
 * そのフレームで送られて遅れる(計測: Firefox・Mac、school-corridor-runner の play で texSubImage2D が 1 回 5ms、33ms のフレーム)。
 * 送り済みのテクスチャは、three.js が飛ばすので、何度呼んでもよい。
 */
export function uploadTextures(renderer: WebGLRenderer, root: Object3D): void {
  const seen = new Set<Texture>();
  const upload = (v: unknown): void => {
    const t = v as Texture | null;
    if (t?.isTexture && !seen.has(t)) { seen.add(t); renderer.initTexture(t); }
  };
  root.traverse((o) => {
    const mat = (o as Mesh).material as Material | Material[] | undefined;
    if (!mat) return;
    for (const m of Array.isArray(mat) ? mat : [mat]) {
      for (const v of Object.values(m)) upload(v);
      const uniforms = (m as Material & { uniforms?: Record<string, { value: unknown }> }).uniforms;
      if (uniforms) for (const u of Object.values(uniforms)) upload(u?.value);
    }
  });
}
