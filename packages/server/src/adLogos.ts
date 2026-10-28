// ローディング画面に表示する広告ロゴ(/api/ads, /api/ads/:name)の検証・配信。
// リポジトリにはコミットせず、packages/server/data/logos/ (または環境変数 AD_LOGOS_DIR) に置いたファイルを読み込む。
// 任意のファイルが配信されないよう、以下の5段階で厳格に検査を通過したものだけを許可する:
//   1. lstatSync による通常ファイル判定(シンボリックリンク・ディレクトリ・特殊ファイルを拒否)
//   2. ファイル名ホワイトリスト(logo-01.webp 形式の英小文字・数字・ハイフンのみ、パストラバーサル拒否)
//   3. ファイルサイズ上限(30B〜256KB)
//   4. WebP(RIFF/WEBP)バイナリ構造・チャンク整合性・ビットストリームヘッダ検証(拡張子偽装やポリグロットを拒否)
//   5. 画像解像度範囲(16x16〜2048x2048、アニメーション・メタデータチャンクを拒否)

import fs from 'node:fs';
import type http from 'node:http';
import path from 'node:path';
import { safeUrl } from './control.ts';
import { RateWindow, ipKey, num } from './limits.ts';
import { log } from './log.ts';

export const MIN_LOGO_BYTES = 30;
export const MAX_LOGO_BYTES = 256 * 1024;
export const MIN_LOGO_DIM = 16;
export const MAX_LOGO_DIM = 2048;
export const MAX_LOGO_COUNT = 50;

/** 許可するファイル名: logo-01.webp や logo-01-sample.webp のみ */
const ALLOWED_FILENAME_RE = /^logo-[0-9]{2,3}(?:-[a-z0-9]+)*\.webp$/;

/** 許可する RIFF チャンク(静止画 WebP の構成要素のみ。EXIF/XMP/ANIM 等の不要データは拒否) */
const ALLOWED_CHUNKS = new Set(['VP8 ', 'VP8L', 'VP8X', 'ALPH', 'ICCP']);

const adRate = new RateWindow(num('AD_LOGOS_REQ_PER_MIN', 600), 60_000);
setInterval(() => adRate.sweep(), 30_000).unref();

export function isValidAdLogoFilename(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0 || name.length > 64) return false;
  if (name.includes('/') || name.includes('\\') || name.includes('..') || name.includes('\0')) return false;
  if (path.basename(name) !== name) return false;
  return ALLOWED_FILENAME_RE.test(name);
}

export type WebpValidationResult =
  | { ok: true; width: number; height: number }
  | { ok: false; reason: string };

/**
 * バッファが正規の静止画 WebP ファイルであるかをバイナリ構造から検証する。
 * 拡張子だけ .webp に変えた別形式ファイルや、末尾に余分なデータを結合したファイルを拒否する。
 */
export function validateWebpBuffer(buf: Buffer): WebpValidationResult {
  if (!Buffer.isBuffer(buf)) return { ok: false, reason: 'not_buffer' };
  if (buf.length < MIN_LOGO_BYTES) return { ok: false, reason: 'too_small' };
  if (buf.length > MAX_LOGO_BYTES) return { ok: false, reason: 'too_large' };

  if (buf.toString('ascii', 0, 4) !== 'RIFF') return { ok: false, reason: 'invalid_riff_magic' };
  const riffSize = buf.readUInt32LE(4);
  if (riffSize + 8 !== buf.length) return { ok: false, reason: 'riff_size_mismatch' };
  if (buf.toString('ascii', 8, 12) !== 'WEBP') return { ok: false, reason: 'invalid_webp_magic' };

  const firstFourCC = buf.toString('ascii', 12, 16);
  if (firstFourCC !== 'VP8 ' && firstFourCC !== 'VP8L' && firstFourCC !== 'VP8X') {
    return { ok: false, reason: 'invalid_first_chunk' };
  }

  let offset = 12;
  let canvasWidth = 0;
  let canvasHeight = 0;
  let bitstreamWidth = 0;
  let bitstreamHeight = 0;
  let hasBitstream = false;
  const seenChunks = new Set<string>();

  while (offset < buf.length) {
    if (offset + 8 > buf.length) return { ok: false, reason: 'truncated_chunk_header' };
    const fourCC = buf.toString('ascii', offset, offset + 4);
    if (!ALLOWED_CHUNKS.has(fourCC)) {
      return { ok: false, reason: `disallowed_chunk:${fourCC}` };
    }
    if (seenChunks.has(fourCC)) {
      return { ok: false, reason: `duplicate_chunk:${fourCC}` };
    }
    seenChunks.add(fourCC);

    const chunkSize = buf.readUInt32LE(offset + 4);
    if (chunkSize === 0) return { ok: false, reason: 'empty_chunk' };
    const paddedSize = chunkSize + (chunkSize & 1);
    const payloadStart = offset + 8;
    const nextOffset = payloadStart + paddedSize;
    if (nextOffset > buf.length) return { ok: false, reason: 'chunk_out_of_bounds' };
    // 奇数長のチャンクは RIFF 仕様により末尾に 0x00 パディングが1バイト入る
    if ((chunkSize & 1) === 1 && buf[payloadStart + chunkSize] !== 0x00) {
      return { ok: false, reason: 'nonzero_riff_padding' };
    }

    if (fourCC === 'VP8X') {
      if (offset !== 12 || chunkSize !== 10) return { ok: false, reason: 'invalid_vp8x_header' };
      const flags = buf[payloadStart];
      // bit 1 (0x02) = Animation, bit 0/6/7 は予約(0必須)
      if ((flags & 0x02) !== 0) return { ok: false, reason: 'animated_webp_disallowed' };
      if ((flags & 0xc1) !== 0) return { ok: false, reason: 'invalid_vp8x_flags' };
      if (buf[payloadStart + 1] !== 0 || buf[payloadStart + 2] !== 0 || buf[payloadStart + 3] !== 0) {
        return { ok: false, reason: 'invalid_vp8x_reserved' };
      }
      canvasWidth = (buf[payloadStart + 4] | (buf[payloadStart + 5] << 8) | (buf[payloadStart + 6] << 16)) + 1;
      canvasHeight = (buf[payloadStart + 7] | (buf[payloadStart + 8] << 8) | (buf[payloadStart + 9] << 16)) + 1;
    } else if (fourCC === 'VP8 ') {
      if (hasBitstream) return { ok: false, reason: 'multiple_bitstreams' };
      if (chunkSize < 10) return { ok: false, reason: 'vp8_chunk_too_short' };
      // bit 0 が 0 ならキーフレーム
      if ((buf[payloadStart] & 1) !== 0) return { ok: false, reason: 'vp8_not_keyframe' };
      if (buf[payloadStart + 3] !== 0x9d || buf[payloadStart + 4] !== 0x01 || buf[payloadStart + 5] !== 0x2a) {
        return { ok: false, reason: 'invalid_vp8_start_code' };
      }
      bitstreamWidth = buf.readUInt16LE(payloadStart + 6) & 0x3fff;
      bitstreamHeight = buf.readUInt16LE(payloadStart + 8) & 0x3fff;
      hasBitstream = true;
    } else if (fourCC === 'VP8L') {
      if (hasBitstream) return { ok: false, reason: 'multiple_bitstreams' };
      if (chunkSize < 5) return { ok: false, reason: 'vp8l_chunk_too_short' };
      if (buf[payloadStart] !== 0x2f) return { ok: false, reason: 'invalid_vp8l_signature' };
      const bits = buf.readUInt32LE(payloadStart + 1);
      // 上位3ビットの version_number は 0 必須
      if ((bits >>> 29) !== 0) return { ok: false, reason: 'invalid_vp8l_version' };
      bitstreamWidth = (bits & 0x3fff) + 1;
      bitstreamHeight = ((bits >>> 14) & 0x3fff) + 1;
      hasBitstream = true;
    }

    offset = nextOffset;
  }

  if (!hasBitstream) return { ok: false, reason: 'missing_bitstream' };
  if (canvasWidth > 0 && (canvasWidth !== bitstreamWidth || canvasHeight !== bitstreamHeight)) {
    return { ok: false, reason: 'vp8x_dimension_mismatch' };
  }

  const width = bitstreamWidth;
  const height = bitstreamHeight;
  if (width < MIN_LOGO_DIM || width > MAX_LOGO_DIM || height < MIN_LOGO_DIM || height > MAX_LOGO_DIM) {
    return { ok: false, reason: `dimensions_out_of_range:${width}x${height}` };
  }

  return { ok: true, width, height };
}

export interface AdLogosStatus {
  enabled: boolean;
  count: number;
  logos: string[];
}

export class AdLogoStore {
  private readonly dir: string;
  private readonly scanTtlMs: number;
  private enabledState: boolean;
  private lastScanAt = 0;
  private lastDirMtimeMs = -1;
  private files = new Map<string, Buffer>();
  private names: string[] = [];
  private warnedFiles = new Set<string>();

  constructor(dir: string, scanTtlMs = 2000, initialEnabled = false) {
    this.dir = dir;
    this.scanTtlMs = scanTtlMs;
    this.enabledState = initialEnabled;
  }

  get enabled(): boolean {
    return this.enabledState;
  }

  setEnabled(on: boolean): void {
    this.enabledState = Boolean(on);
  }

  status(): AdLogosStatus {
    this.refreshIfNeeded();
    return {
      enabled: this.enabledState,
      count: this.names.length,
      logos: this.names.slice(),
    };
  }

  private refreshIfNeeded(now = Date.now()): void {
    if (this.lastScanAt > 0 && now - this.lastScanAt < this.scanTtlMs) return;
    this.lastScanAt = now;

    let dirStat: fs.Stats;
    try {
      dirStat = fs.lstatSync(this.dir);
    } catch {
      this.files.clear();
      this.names = [];
      this.lastDirMtimeMs = -1;
      return;
    }

    if (!dirStat.isDirectory() || dirStat.isSymbolicLink()) {
      this.files.clear();
      this.names = [];
      this.lastDirMtimeMs = -1;
      return;
    }

    if (dirStat.mtimeMs === this.lastDirMtimeMs && this.names.length > 0) {
      return;
    }

    let rawEntries: string[];
    try {
      rawEntries = fs.readdirSync(this.dir);
    } catch {
      this.files.clear();
      this.names = [];
      return;
    }

    const sorted = rawEntries.slice().sort();
    const nextFiles = new Map<string, Buffer>();
    const nextNames: string[] = [];

    for (const name of sorted) {
      if (nextNames.length >= MAX_LOGO_COUNT) break;
      if (name === '.DS_Store') continue;

      if (!isValidAdLogoFilename(name)) {
        this.warnOnce(name, 'invalid_filename');
        continue;
      }

      const fullPath = path.join(this.dir, name);
      let st: fs.Stats;
      try {
        st = fs.lstatSync(fullPath);
      } catch {
        continue;
      }

      if (!st.isFile() || st.isSymbolicLink()) {
        this.warnOnce(name, 'not_regular_file');
        continue;
      }

      if (st.size < MIN_LOGO_BYTES || st.size > MAX_LOGO_BYTES) {
        this.warnOnce(name, `invalid_size:${st.size}`);
        continue;
      }

      let buf: Buffer;
      let fd = -1;
      try {
        const flags = fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW ?? 0);
        fd = fs.openSync(fullPath, flags);
        const fst = fs.fstatSync(fd);
        if (!fst.isFile() || fst.size !== st.size || fst.ino !== st.ino) {
          this.warnOnce(name, 'not_regular_file');
          continue;
        }
        buf = Buffer.allocUnsafe(fst.size);
        const bytesRead = fs.readSync(fd, buf, 0, fst.size, 0);
        if (bytesRead !== fst.size) continue;
      } catch {
        this.warnOnce(name, 'not_regular_file');
        continue;
      } finally {
        if (fd >= 0) {
          try {
            fs.closeSync(fd);
          } catch {
            /* ignore */
          }
        }
      }

      const check = validateWebpBuffer(buf);
      if (!check.ok) {
        this.warnOnce(name, check.reason);
        continue;
      }

      nextFiles.set(name, buf);
      nextNames.push(name);
    }

    this.files = nextFiles;
    this.names = nextNames;
    this.lastDirMtimeMs = dirStat.mtimeMs;
  }

  private warnOnce(name: string, reason: string): void {
    const safeName = String(name).slice(0, 64).replace(/[\r\n\t\x00-\x1f\x7f]/g, '?');
    const key = `${safeName}:${reason}`;
    if (this.warnedFiles.has(key)) return;
    if (this.warnedFiles.size < 200) {
      this.warnedFiles.add(key);
    }
    log(`[ads] rejected file "${safeName}" (${reason})`);
  }

  list(): string[] {
    this.refreshIfNeeded();
    return this.names.slice();
  }

  get(name: string): Buffer | undefined {
    if (!isValidAdLogoFilename(name)) return undefined;
    this.refreshIfNeeded();
    return this.files.get(name);
  }
}

export function handleAdLogosRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  ip: string,
  store: AdLogoStore,
): boolean {
  const url = safeUrl(req.url);
  if (!url) return false;
  const pathname = url.pathname;
  if (pathname !== '/api/ads' && !pathname.startsWith('/api/ads/')) return false;

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    }).end(JSON.stringify({ error: 'method_not_allowed' }));
    return true;
  }

  if (!adRate.hit(ipKey(ip))) {
    res.writeHead(429, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    }).end(JSON.stringify({ error: 'rate' }));
    return true;
  }

  if (pathname === '/api/ads' || pathname === '/api/ads/') {
    const logos = store.enabled ? store.list() : [];
    const body = JSON.stringify({ enabled: store.enabled, logos });
    res.writeHead(200, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    });
    res.end(req.method === 'HEAD' ? undefined : body);
    return true;
  }

  // 許可するファイル名は ASCII(logo-XX.webp)のみなので decodeURIComponent は使わない(不正な % エンコードによる URIError 例外を防ぐ)
  const name = pathname.slice('/api/ads/'.length);
  const buf = store.enabled ? store.get(name) : undefined;
  if (!buf) {
    res.writeHead(404, {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    }).end(JSON.stringify({ error: 'not_found' }));
    return true;
  }

  res.writeHead(200, {
    'content-type': 'image/webp',
    'content-length': String(buf.length),
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff',
    'content-security-policy': "default-src 'none'",
  });
  res.end(req.method === 'HEAD' ? undefined : buf);
  return true;
}
