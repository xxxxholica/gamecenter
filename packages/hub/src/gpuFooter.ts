// ハブのページの最下部に、WebGL が使っている GPU の名前を常に出す(筐体の実機で、内蔵 GPU やソフトウェア描画に落ちていないかを確かめるため)。
// ゲームと同じ powerPreference で捨てのキャンバスを作って調べ、すぐ捨てる。

import { classifyGpu } from '../../shared/arcadeBenchCore';

function probeGpuRenderer(): string | undefined {
  try {
    const canvas = document.createElement('canvas');
    const attrs: WebGLContextAttributes = { powerPreference: 'high-performance' };
    const gl = (canvas.getContext('webgl2', attrs) ?? canvas.getContext('webgl', attrs)) as WebGLRenderingContext | null;
    if (!gl) return undefined;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return renderer;
  } catch {
    return undefined;
  }
}

export function mountGpuFooter(): void {
  const renderer = probeGpuRenderer();
  const gpu = classifyGpu(renderer);
  const warn = gpu === 'integrated' ? '  ⚠内蔵GPU' : gpu === 'software' ? '  ⚠ソフトウェア描画' : '';
  const el = document.createElement('div');
  el.className = 'hub-gpu';
  el.textContent = `GPU: ${renderer ?? 'WebGL なし'}${warn}`;
  if (warn || !renderer) el.classList.add('warn');
  document.body.appendChild(el);
}
