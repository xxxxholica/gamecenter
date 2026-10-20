import * as THREE from 'three';
import { CarBase, CarSpecs } from './CarBase';
import { getDragonCarScene, type DragonVariant } from './CarModelLoader';

// =============================================================================
// 多関節フォワードキネマティクス (FK) スパイン進行波ソルバー
// (尻尾32関節 / ツノ16関節 / 翼16関節。リファレンス: dragon_car/index.html の buildSpineChainForGroup)
// =============================================================================

/** 翼の羽ばたきの速さと大きさの倍率(FK の基準値に掛ける) */
const WING_TEMPO = 1.35;
/** 角・翼・尻尾の更新の最短間隔(秒)。60Hz の画面で毎フレーム更新になるよう、1/60 より少し短く。 */
const RIG_STEP_SEC = 1 / 62;
const WING_AMP = 1.75;

export type DragonPartType = 'horn' | 'wing' | 'tail';

export interface ArticulatedChainRig {
  /** t: 秒, presetKey: 'a'|'b'|'c', ampScale: 振幅の倍率。頂点バッファ(position/normal)を直接書き換える。 */
  update(t: number, presetKey: DragonVariant, ampScale?: number): void;
}

interface Chain {
  restJoints: THREE.Vector3[];
  boneDeltas: THREE.Vector3[];
  curJoints: THREE.Vector3[];
  curQuats: THREE.Quaternion[];
}

interface PrimData {
  pos: THREE.BufferAttribute;
  norm: THREE.BufferAttribute | null;
  count: number;
  restPos: Float32Array;
  restNorm: Float32Array | null;
  uArr: Float32Array;
  coreArr: Uint8Array;
  chainIdxArr: Uint8Array;
  k0Arr: Uint8Array;
  alphaArr: Float32Array;
  localOffsets: Float32Array;
}

/**
 * partObj 配下の全メッシュ頂点を、UVMap_Spine(uv1) の U(0..1)=根元→先端 で関節列にスキニングし、
 * 毎フレーム進行波で関節を曲げて頂点を書き換える。isDual=true なら uv1.v<0.5 を左チェーン/それ以外を右チェーンとする。
 * ジオメトリはインスタンス間で共有されないこと(CarModelLoader.getDragonCarScene がクローン済み)。
 */
export function createArticulatedChainRig(
  partObj: THREE.Object3D | null | undefined,
  numJoints: number,
  isDual: boolean,
  partType: DragonPartType,
  mirrorSign = 1,
): ArticulatedChainRig | null {
  if (!partObj) return null;
  const meshes: THREE.Mesh[] = [];
  partObj.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.isMesh && m.geometry && m.geometry.attributes.position) meshes.push(m);
  });
  if (meshes.length === 0) return null;

  const numChains = isDual ? 2 : 1;
  const mkVecs = (): THREE.Vector3[] => Array.from({ length: numJoints + 1 }, () => new THREE.Vector3());
  const chains: Chain[] = [];
  for (let ch = 0; ch < numChains; ch++) {
    chains.push({
      restJoints: mkVecs(),
      boneDeltas: mkVecs(),
      curJoints: mkVecs(),
      curQuats: Array.from({ length: numJoints + 1 }, () => new THREE.Quaternion()),
    });
  }

  let maxDist = 0.001;
  for (const m of meshes) {
    const pos = m.geometry.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const d = Math.sqrt(x * x + y * y + z * z);
      if (d > maxDist) maxDist = d;
    }
  }

  const primData: PrimData[] = meshes.map((m) => {
    const pos = m.geometry.attributes.position as THREE.BufferAttribute;
    const norm = (m.geometry.attributes.normal as THREE.BufferAttribute | undefined) ?? null;
    const uv1 = (m.geometry.attributes.uv1 ?? m.geometry.attributes.uv2) as THREE.BufferAttribute | undefined;
    const count = pos.count;
    const restPos = new Float32Array(pos.array);
    const restNorm = norm ? new Float32Array(norm.array) : null;
    const uArr = new Float32Array(count);
    const coreArr = new Uint8Array(count);
    const chainIdxArr = new Uint8Array(count);
    for (let i = 0; i < count; i++) {
      const x = restPos[i * 3], y = restPos[i * 3 + 1], z = restPos[i * 3 + 2];
      if (uv1) {
        uArr[i] = Math.min(1, Math.max(0, uv1.getX(i)));
        const vFlag = uv1.getY(i);
        if (isDual) {
          chainIdxArr[i] = vFlag < 0.5 ? 0 : 1;
          coreArr[i] = 1;
        } else {
          chainIdxArr[i] = 0;
          coreArr[i] = vFlag > 0.5 ? 1 : 0;
        }
      } else {
        uArr[i] = Math.min(1, Math.sqrt(x * x + y * y + z * z) / maxDist);
        chainIdxArr[i] = isDual && x >= 0 ? 1 : 0;
        coreArr[i] = 1;
      }
    }
    return {
      pos, norm, count, restPos, restNorm, uArr, coreArr, chainIdxArr,
      k0Arr: new Uint8Array(count), alphaArr: new Float32Array(count), localOffsets: new Float32Array(count * 3),
    };
  });

  // 各関節の静止位置 = その U 付近の頂点重心
  for (let ch = 0; ch < numChains; ch++) {
    const chain = chains[ch];
    const windowHalf = 1.35 / numJoints;
    for (let k = 0; k <= numJoints; k++) {
      const uTarget = k / numJoints;
      let sx = 0, sy = 0, sz = 0, cnt = 0;
      let fbX = 0, fbY = 0, fbZ = 0, fbCnt = 0;
      for (const pd of primData) {
        for (let i = 0; i < pd.count; i++) {
          if (pd.chainIdxArr[i] !== ch) continue;
          if (Math.abs(pd.uArr[i] - uTarget) > windowHalf) continue;
          const vx = pd.restPos[i * 3], vy = pd.restPos[i * 3 + 1], vz = pd.restPos[i * 3 + 2];
          fbX += vx; fbY += vy; fbZ += vz; fbCnt++;
          if (pd.coreArr[i]) { sx += vx; sy += vy; sz += vz; cnt++; }
        }
      }
      if (cnt > 0) chain.restJoints[k].set(sx / cnt, sy / cnt, sz / cnt);
      else if (fbCnt > 0) chain.restJoints[k].set(fbX / fbCnt, fbY / fbCnt, fbZ / fbCnt);
      else if (k > 0) chain.restJoints[k].copy(chain.restJoints[k - 1]);
    }
    for (let k = 1; k <= numJoints; k++) chain.boneDeltas[k].subVectors(chain.restJoints[k], chain.restJoints[k - 1]);
  }

  // 頂点ごとの所属関節区間・補間率・関節中心からのローカルオフセット
  for (const pd of primData) {
    for (let i = 0; i < pd.count; i++) {
      const rJoints = chains[pd.chainIdxArr[i]].restJoints;
      const f = pd.uArr[i] * numJoints;
      const k0 = Math.min(numJoints - 1, Math.max(0, Math.floor(f)));
      const alpha = f - k0;
      pd.k0Arr[i] = k0;
      pd.alphaArr[i] = alpha;
      const p0 = rJoints[k0], p1 = rJoints[k0 + 1];
      pd.localOffsets[i * 3] = pd.restPos[i * 3] - (p0.x + (p1.x - p0.x) * alpha);
      pd.localOffsets[i * 3 + 1] = pd.restPos[i * 3 + 1] - (p0.y + (p1.y - p0.y) * alpha);
      pd.localOffsets[i * 3 + 2] = pd.restPos[i * 3 + 2] - (p0.z + (p1.z - p0.z) * alpha);
    }
  }

  const tmpEuler = new THREE.Euler();
  const tmpDQ = new THREE.Quaternion();
  const tmpVec = new THREE.Vector3();

  return {
    update(t: number, presetKey: DragonVariant, ampScale = 1.0): void {
      for (let ch = 0; ch < numChains; ch++) {
        const chain = chains[ch];
        chain.curJoints[0].copy(chain.restJoints[0]);
        chain.curQuats[0].identity();
        const sideSign = (ch === 0 ? -1.0 : 1.0) * mirrorSign;

        for (let k = 1; k <= numJoints; k++) {
          const s = k / numJoints;
          const env = Math.pow(s, 1.22);
          let dPitch = 0, dYaw = 0, dRoll = 0;

          if (partType === 'horn') {
            const phase = t * 2.6 - s * 3.8;
            dPitch = (0.15 / numJoints) * env * Math.sin(phase) * ampScale;
            dYaw = (0.18 / numJoints) * env * Math.cos(phase * 0.85) * sideSign * ampScale;
            dRoll = (0.10 / numJoints) * env * Math.sin(phase + 0.7) * sideSign * ampScale;
          } else if (partType === 'wing') {
            const tw = t * WING_TEMPO, wa = ampScale * WING_AMP;   // 翼は、角や尻尾より速く大きく動かす
            if (presetKey === 'a') {
              // A (ワイバーン膜翼): 力強くしなやかな羽ばたき＆滑空の呼吸モーション
              const phase = tw * 3.2 - s * 4.2;
              dRoll = (0.48 / numJoints) * env * Math.sin(phase) * sideSign * wa;
              dPitch = (0.28 / numJoints) * env * Math.cos(phase - 0.5) * wa;
              dYaw = (0.24 / numJoints) * env * Math.sin(phase + 0.8) * sideSign * wa;
            } else if (presetKey === 'b') {
              // B (東洋龍の天衣・浮遊翡翠ブレード): 進行波でたなびく流麗な波動モーション
              const phase = tw * 4.4 - s * 6.8;
              dPitch = (0.42 / numJoints) * env * Math.sin(phase) * wa;
              dRoll = (0.36 / numJoints) * env * Math.cos(phase * 0.9) * sideSign * wa;
              dYaw = (0.38 / numJoints) * env * Math.sin(phase + 1.2) * sideSign * wa;
            } else {
              // C (重装甲シールドバインダー＆4連ノズル): 重厚な油圧フレア展開＋スラスター脈動
              const breath = Math.sin(tw * 2.4 - s * 2.8);
              const pulse = 0.25 * Math.sin(tw * 14.0 - s * 5.0);
              dYaw = (0.26 / numJoints) * env * (breath + pulse) * sideSign * wa;
              dRoll = (0.18 / numJoints) * env * Math.cos(tw * 2.4 - s * 3.0) * sideSign * wa;
              dPitch = (0.14 / numJoints) * env * pulse * wa;
            }
          } else if (presetKey === 'b') {
            // B (東洋龍ロングテール): 大きな横スイング＋進行波によるS字うねり
            const phaseY = t * 4.2 - s * 6.8;
            const phaseX = t * 3.0 - s * 5.4;
            const broadSweep = 0.65 * Math.sin(t * 1.85 - s * 2.2);
            const whip = 1.0 + 0.35 * Math.sin(t * 7.8 - s * 10.5) * s;
            const envSweep = Math.pow(s, 0.85);
            dYaw = (1.35 / numJoints) * (env * Math.sin(phaseY) * whip + envSweep * broadSweep) * ampScale * mirrorSign;
            dPitch = (0.48 / numJoints) * env * Math.cos(phaseX) * ampScale;
            dRoll = (0.42 / numJoints) * env * Math.sin(phaseY + 1.1) * ampScale * mirrorSign;
          } else if (presetKey === 'c') {
            // C (中央並列ツイン・バトルアックス＆メイステール): 中央から左右へ広がり、中央で交差しすぎず自然にしなる双尾モーション
            const phaseY = t * 2.6 - s * 4.0;
            const phaseX = t * 2.3 - s * 3.8;
            const heavySwing = 0.48 * Math.sin(t * 1.4 - s * 1.8);
            const envSweep = Math.pow(s, 0.85);
            const yawWave = env * Math.sin(phaseY) * 0.68 + envSweep * heavySwing - 0.12 * env;
            dYaw = (0.76 / numJoints) * yawWave * ampScale * mirrorSign;
            dPitch = (0.50 / numJoints) * env * (Math.sin(phaseX) + 0.22 * Math.cos(phaseX * 2.0)) * ampScale;
            dRoll = (0.30 / numJoints) * env * Math.cos(phaseY) * ampScale * mirrorSign;
          } else {
            // A (ワイバーン・ウィップテール): しなやかな鞭の横しなり＋大きな左右スイング
            const phaseY = t * 3.6 - s * 5.4;
            const phaseX = t * 2.6 - s * 4.4;
            const broadSweep = 0.72 * Math.cos(t * 1.65 - s * 2.0);
            const whip = 1.0 + 0.30 * Math.cos(t * 6.8 - s * 9.5) * s;
            const envSweep = Math.pow(s, 0.82);
            dYaw = (1.24 / numJoints) * (env * Math.sin(phaseY) * whip + envSweep * broadSweep) * ampScale * mirrorSign;
            dPitch = (0.42 / numJoints) * env * Math.cos(phaseX) * ampScale;
            dRoll = (0.36 / numJoints) * env * Math.sin(phaseY + 0.8) * ampScale * mirrorSign;
          }

          tmpEuler.set(dPitch, dYaw, dRoll, 'YXZ');
          tmpDQ.setFromEuler(tmpEuler);
          chain.curQuats[k].multiplyQuaternions(chain.curQuats[k - 1], tmpDQ);
          tmpVec.copy(chain.boneDeltas[k]).applyQuaternion(chain.curQuats[k]);
          chain.curJoints[k].addVectors(chain.curJoints[k - 1], tmpVec);
        }
      }

      // 頂点の更新(1フレームに約2.5万頂点)。隣り合う関節の回転差は小さいので slerp の代わりに nlerp にし、
      // 位置と法線で同じ回転を使い回す。オブジェクトは作らずスカラー演算だけで回す。
      for (const pd of primData) {
        const posArr = pd.pos.array as Float32Array;
        const normArr = pd.norm ? (pd.norm.array as Float32Array) : null;
        const rNorm = pd.restNorm;
        const offsets = pd.localOffsets;
        for (let i = 0; i < pd.count; i++) {
          const chain = chains[pd.chainIdxArr[i]];
          const k0 = pd.k0Arr[i];
          const alpha = pd.alphaArr[i];
          const p0 = chain.curJoints[k0], p1 = chain.curJoints[k0 + 1];
          const qa = chain.curQuats[k0], qb = chain.curQuats[k0 + 1];

          const wb = (qa.x * qb.x + qa.y * qb.y + qa.z * qb.z + qa.w * qb.w < 0 ? -alpha : alpha);
          const wa = 1 - alpha;
          let qx = qa.x * wa + qb.x * wb, qy = qa.y * wa + qb.y * wb, qz = qa.z * wa + qb.z * wb, qw = qa.w * wa + qb.w * wb;
          const inv = 1 / (Math.sqrt(qx * qx + qy * qy + qz * qz + qw * qw) || 1);
          qx *= inv; qy *= inv; qz *= inv; qw *= inv;

          const idx3 = i * 3;
          // v' = v + 2w(q×v) + 2 q×(q×v)
          let vx = offsets[idx3], vy = offsets[idx3 + 1], vz = offsets[idx3 + 2];
          let tx = 2 * (qy * vz - qz * vy), ty = 2 * (qz * vx - qx * vz), tz = 2 * (qx * vy - qy * vx);
          posArr[idx3] = p0.x + (p1.x - p0.x) * alpha + vx + qw * tx + (qy * tz - qz * ty);
          posArr[idx3 + 1] = p0.y + (p1.y - p0.y) * alpha + vy + qw * ty + (qz * tx - qx * tz);
          posArr[idx3 + 2] = p0.z + (p1.z - p0.z) * alpha + vz + qw * tz + (qx * ty - qy * tx);

          if (normArr && rNorm) {
            vx = rNorm[idx3]; vy = rNorm[idx3 + 1]; vz = rNorm[idx3 + 2];
            tx = 2 * (qy * vz - qz * vy); ty = 2 * (qz * vx - qx * vz); tz = 2 * (qx * vy - qy * vx);
            normArr[idx3] = vx + qw * tx + (qy * tz - qz * ty);
            normArr[idx3 + 1] = vy + qw * ty + (qz * tx - qx * tz);
            normArr[idx3 + 2] = vz + qw * tz + (qx * ty - qy * tx);
          }
        }
        pd.pos.needsUpdate = true;
        if (pd.norm) pd.norm.needsUpdate = true;
      }
    },
  };
}

// =============================================================================
// ドラゴン・カー本体
// =============================================================================

interface DragonDef {
  specs: CarSpecs;
  /** 接地影の幅 / 長さ / 中心Z */
  shadow: [number, number, number];
  cockpitEye: [number, number, number];
  /** 発光リム・LED(Mat_Emissive)の強さ */
  emissive: number;
  /** 角・翼に重ねる発光エフェクトの強さ。0 なら無し(Azure はモデル自体に発光ジオメトリがある) */
  partGlow: number;
  /** 尻尾にも発光エフェクトを重ねるか(partGlow > 0 のとき) */
  tailGlow: boolean;
}

const DRAGON_DEFS: Record<DragonVariant, DragonDef> = {
  a: {
    specs: {
      name: 'DRAGON CRIMSON',
      category: '紅蓮の火竜 / ウェスタン・クリムゾン・ハイパーカー',
      length: '4,580 mm',
      width: '2,080 mm',
      height: '1,140 mm',
      wheelbase: '2,740 mm',
      drivetrain: 'ミッドシップ ハイブリッドAWD',
      weight: '1,420 kg',
      description: '紅蓮の炎をまとうワイバーン型ハイパーカー。しなやかな鞭の尾と膜翼が、疾走に合わせて羽ばたく。',
    },
    shadow: [2.5, 5.4, -0.35],
    cockpitEye: [-0.30, 0.82, 0.05],
    emissive: 1.7,
    partGlow: 2.2,
    tailGlow: true,
  },
  b: {
    specs: {
      name: 'DRAGON AZURE',
      category: '蒼雷の東洋龍 / イースタン・アズール・フォーミュラ',
      length: '5,358 mm',
      width: '1,880 mm',
      height: '1,110 mm',
      wheelbase: '3,420 mm',
      drivetrain: 'ミッドシップ 電動ツインモーター',
      weight: '1,150 kg',
      description: '蒼い雷光を引く東洋龍のフォーミュラ。長くうねる尾と浮遊する翡翠のブレードが、風に流れる。',
    },
    shadow: [2.2, 6.2, -0.45],
    cockpitEye: [-0.28, 0.80, 0.10],
    emissive: 0.9,   // 翼のブレードが面で光るので、Crimson より抑える
    partGlow: 0,
    tailGlow: false,
  },
  c: {
    specs: {
      name: 'DRAGON GOLD',
      category: '黄金の重装竜 / アーマード・ゴールド・GTマッスル',
      length: '4,428 mm',
      width: '2,309 mm',
      height: '1,408 mm',
      wheelbase: '2,640 mm',
      drivetrain: 'フロントエンジン 重装AWD',
      weight: '1,980 kg',
      description: '黄金の装甲をまとう重装竜のGTマッスル。戦斧とメイスの尾を振り回し、4連ノズルが吠える。',
    },
    shadow: [2.8, 5.0, -0.2],
    cockpitEye: [-0.34, 1.02, 0.00],
    emissive: 0.9,   // 金の装甲の反射と重なって眩しいので、Crimson より抑える
    partGlow: 1.0,
    tailGlow: false,
  },
};

/** 消灯時(ガレージのライトOFF)に残す発光の割合(発光リム・LED、角・翼とも)。 */
const GLOW_OFF = 0.07;

const isMat = (name: string, prefix: string): boolean => name.startsWith(prefix);

interface PartGlowUniforms {
  uColor: { value: THREE.Color };
  uStrength: { value: number };
  uTime: { value: number };
}

const PART_GLOW_VERT = /* glsl */ `
attribute vec2 spineUV;
varying vec3 vN;
varying vec3 vV;
varying float vU;
void main() {
  vU = spineUV.x;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = -mv.xyz;
  vN = normalMatrix * normal;
  gl_Position = projectionMatrix * mv;
}`;

// 縁(フレネル)の発光 + 先端ほど強い発光を、根元から先端へ流れる脈動で揺らす
const PART_GLOW_FRAG = /* glsl */ `
uniform vec3 uColor;
uniform float uStrength;
uniform float uTime;
varying vec3 vN;
varying vec3 vV;
varying float vU;
void main() {
  float rim = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
  float tip = smoothstep(0.30, 1.0, vU);
  float wave = 0.5 + 0.5 * sin(uTime * 3.0 - vU * 9.0);
  float g = rim * (0.55 + 0.45 * wave) + tip * tip * (0.30 + 0.45 * wave);
  gl_FragColor = vec4(uColor * g * uStrength, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * 角・翼・尻尾(partObj)の非発光メッシュに、同じジオメトリを共有する加算ブレンドの発光メッシュを重ねる。
 * ジオメトリは共有なので、FK変形(頂点バッファの書き換え)も頂点数も増えない。FKリグを作った後に呼ぶこと。
 */
function addPartGlow(partObj: THREE.Object3D | null | undefined, uniforms: PartGlowUniforms): void {
  if (!partObj) return;
  const sources: THREE.Mesh[] = [];
  partObj.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh || !m.geometry?.attributes.position) return;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    if (mats.some((mat) => isMat(mat.name || '', 'Mat_Emissive') || isMat(mat.name || '', 'Mat_Scales'))) return;
    sources.push(m);
  });
  for (const src of sources) {
    const geo = src.geometry;
    const uv = geo.attributes.uv1 ?? geo.attributes.uv2;
    if (uv && !geo.attributes.spineUV) geo.setAttribute('spineUV', uv);
    const mat = new THREE.ShaderMaterial({
      uniforms: uniforms as unknown as Record<string, THREE.IUniform>,
      vertexShader: PART_GLOW_VERT,
      fragmentShader: PART_GLOW_FRAG,
      blending: THREE.AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: (Array.isArray(src.material) ? src.material[0] : src.material).side,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    });
    const glow = new THREE.Mesh(geo, mat);
    glow.position.copy(src.position);
    glow.quaternion.copy(src.quaternion);
    glow.scale.copy(src.scale);
    glow.castShadow = false;
    glow.receiveShadow = false;
    glow.frustumCulled = false;   // FK で頂点が動くので、静止形状の境界球でカリングしない
    src.parent?.add(glow);
  }
}

/**
 * 尻尾オブジェクトを左右対称に反転(頂点のX座標とX法線を反転し、三角形の頂点巻き順を入れ替える)して複製する。
 * C(DRAGON GOLD)の双尾(ツインテール)化に使用。
 */
function createMirroredTail(srcTail: THREE.Object3D): THREE.Object3D {
  const clone = srcTail.clone(true);
  clone.name = 'Dragon_Tail_R';
  clone.position.x = -srcTail.position.x;
  clone.traverse((c) => {
    const m = c as THREE.Mesh;
    if (!m.isMesh || !m.geometry) return;
    const geo = m.geometry.clone();
    const pos = geo.attributes.position as THREE.BufferAttribute | undefined;
    if (pos) {
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) arr[i] = -arr[i];
      pos.needsUpdate = true;
    }
    const norm = geo.attributes.normal as THREE.BufferAttribute | undefined;
    if (norm) {
      const arr = norm.array as Float32Array;
      for (let i = 0; i < arr.length; i += 3) arr[i] = -arr[i];
      norm.needsUpdate = true;
    }
    if (geo.index) {
      const idx = geo.index.array;
      for (let i = 0; i < idx.length; i += 3) {
        const tmp = idx[i + 1];
        idx[i + 1] = idx[i + 2];
        idx[i + 2] = tmp;
      }
      geo.index.needsUpdate = true;
    }
    geo.computeBoundingBox();
    geo.computeBoundingSphere();
    m.geometry = geo;
  });
  srcTail.parent?.add(clone);
  return clone;
}

export class DragonCarModel extends CarBase {
  public readonly specs: CarSpecs;
  public readonly variant: DragonVariant;

  public hornRig: ArticulatedChainRig | null = null;
  public wingRig: ArticulatedChainRig | null = null;
  public tailRig: ArticulatedChainRig | null = null;
  public tailRigMirror: ArticulatedChainRig | null = null;
  private lastRigT = -1;

  private paintMaterials: THREE.MeshStandardMaterial[] = [];
  private armorMaterials: THREE.MeshStandardMaterial[] = [];
  private emissiveMaterials: THREE.MeshStandardMaterial[] = [];
  /** 発光リム・LED の点灯時の強さ(DragonDef.emissive) */
  private emissiveOn = 0;
  private glassMaterials: THREE.MeshStandardMaterial[] = [];
  private partGlow: PartGlowUniforms | null = null;
  private partGlowStrength = 0;
  private readonly remote: boolean;

  constructor(variant: DragonVariant, opts: { remote?: boolean } = {}) {
    super();
    this.variant = variant;
    this.remote = !!opts.remote;
    const def = DRAGON_DEFS[variant];
    this.emissiveOn = def.emissive;
    this.specs = def.specs;
    this.skipMeshMerge = true;
    this.cockpitEyeOffset = new THREE.Vector3(...def.cockpitEye);
    this.cockpitLookOffset = new THREE.Vector3(0, -0.04, 20.0);
    this.buildCar(def);
    this.setLights(true);
  }

  private buildCar(def: DragonDef): void {
    const gltfScene = getDragonCarScene(this.variant);
    const carRoot = (gltfScene.getObjectByName('DragonCar_Root') as THREE.Group) || gltfScene;

    // dragon_car の GLB は glTF/Three.js 空間で既に +Z が前方(ノーズ)。回転は不要。
    carRoot.rotation.y = 0;

    this.wheels = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR']
      .map((n) => carRoot.getObjectByName(n))
      .filter(Boolean) as THREE.Group[];

    const seen = new Set<THREE.Material>();
    carRoot.traverse((child) => {
      const mesh = child as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (!mat || seen.has(mat)) continue;
        seen.add(mat);
        const m = mat as THREE.MeshPhysicalMaterial;
        const name = m.name || '';
        // ハイライトのエッジで白飛びが始まるギリギリまで攻めた反射強度(環境マップはDriveScene.applyPaintEnvironmentが付与する)
        m.envMapIntensity = 1.48;
        if (isMat(name, 'Mat_CarPaint') || isMat(name, 'Mat_Scales') || isMat(name, 'Mat_Armor')
          || isMat(name, 'Mat_Horn') || isMat(name, 'Mat_Emissive')) {
          m.userData = { ...m.userData, skyEnv: 1.7, skyEnvNight: 1.48 };
        }
        if (isMat(name, 'Mat_CarPaint')) {
          this.paintMaterials.push(m);
          this.bodyMaterial = m;
        } else if (isMat(name, 'Mat_Armor')) {
          this.armorMaterials.push(m);
          this.roofMaterial = m;
        } else if (isMat(name, 'Mat_Emissive')) {
          m.emissiveIntensity = def.emissive;
          this.emissiveMaterials.push(m);
        } else if (isMat(name, 'Mat_Glass')) {
          // transmission>0 だと three.js が全不透明物をもう1回描き直して重くなるため、透け感は opacity で出す
          m.transmission = 0;
          m.transparent = true;
          m.opacity = 0.24;
          m.roughness = 0.03;
          m.metalness = 0.10;
          m.depthWrite = false;
          m.side = THREE.DoubleSide;
          m.envMapIntensity = 1.80;
          m.userData = { ...m.userData, skyEnv: 1.8, skyEnvNight: 1.5 };
          this.glassMaterials.push(m);
          this.glassMaterial = m;
        }
        m.needsUpdate = true;
      }
    });

    // ガラスは Body_Chassis の1プリミティブなので、素材の visible を切り替える代理オブジェクトを windshield にする
    // (DriveScene がコクピット視点で windshield.visible = false にする)
    const glassMats = this.glassMaterials;
    const proxy = new THREE.Object3D();
    Object.defineProperty(proxy, 'visible', {
      get: () => glassMats.length === 0 || glassMats[0].visible,
      set: (v: boolean) => { for (const g of glassMats) g.visible = v; },
    });
    this.windshield = proxy;

    const tailObj = carRoot.getObjectByName('Dragon_Tail');
    let mirroredTailObj: THREE.Object3D | null = null;
    if (this.variant === 'c' && tailObj) {
      mirroredTailObj = createMirroredTail(tailObj);
      // リア中央に2本の根元を並べて配置し、そこから左右外側へ広がりながら後方へ伸びるシルエットにする
      const rootX = 0.22, rootY = 0.64, rootZ = -1.98;
      const inwardYaw = 0.22;   // 約12.6°: 元モデルの左右への曲がりを活かしつつ、横に広がりすぎないよう後方へ整える
      const pitchDown = -0.08;  // 約-4.5°: 根元から後方へ自然に流れる角度
      const tailScale = 0.88;
      tailObj.position.set(-rootX, rootY, rootZ);
      tailObj.rotation.set(pitchDown, -inwardYaw, 0, 'YXZ');
      tailObj.scale.setScalar(tailScale);
      mirroredTailObj.position.set(rootX, rootY, rootZ);
      mirroredTailObj.rotation.set(pitchDown, inwardYaw, 0, 'YXZ');
      mirroredTailObj.scale.setScalar(tailScale);
    }

    // 相手車両(remote)では、遠目で見分けがつかない角の微細な呼吸FK(約5,000〜10,000頂点)と追加の加算シェーダー重ね描きを省く
    this.hornRig = this.remote ? null : createArticulatedChainRig(carRoot.getObjectByName('Dragon_Horns'), 16, true, 'horn');
    this.wingRig = createArticulatedChainRig(carRoot.getObjectByName('Dragon_Wings'), 16, true, 'wing');
    this.tailRig = createArticulatedChainRig(tailObj, 32, false, 'tail', 1);
    this.tailRigMirror = createArticulatedChainRig(mirroredTailObj, 32, false, 'tail', -1);

    if (def.partGlow > 0 && !this.remote) {
      const emissive = this.emissiveMaterials[0]?.emissive;
      this.partGlowStrength = def.partGlow;
      this.partGlow = {
        uColor: { value: emissive ? emissive.clone() : new THREE.Color(1, 0.4, 0.05) },
        uStrength: { value: def.partGlow },
        uTime: { value: 0 },
      };
      addPartGlow(carRoot.getObjectByName('Dragon_Horns'), this.partGlow);
      addPartGlow(carRoot.getObjectByName('Dragon_Wings'), this.partGlow);
      if (def.tailGlow) {
        addPartGlow(tailObj, this.partGlow);
        addPartGlow(mirroredTailObj, this.partGlow);
      }
    }

    this.group.add(carRoot);
    this.addContactShadow(def.shadow[0], def.shadow[1], def.shadow[2]);
  }

  /**
   * 角・翼・尻尾のFKアニメーションを1フレーム進める。
   * @param t 経過秒(単調増加) @param speedRatio 0〜1。速いほど翼と尻尾の振幅が大きくなる
   */
  public updateDragonParts(t: number, speedRatio: number): void {
    const s = Math.min(1, Math.max(0, speedRatio));
    const phase = this.variant === 'a' ? 0 : this.variant === 'b' ? 0.8 : 1.6;
    if (this.partGlow) this.partGlow.uTime.value = t + phase;
    // 角・翼・尻尾の頂点(約2.5万)の計算と転送は、60Hz 程度で十分に滑らか。100〜165Hz の画面で毎フレーム回すと、
    // 1フレームのJSの約1割を占める(Firefox ではフレームの予算を超えやすい)。時間が戻ったとき(別の画面から戻った)は、すぐ更新する。
    if (t >= this.lastRigT && t - this.lastRigT < RIG_STEP_SEC) return;
    this.lastRigT = t;
    const tailAmp = 1.15 * (1 + s * 0.4);
    this.tailRig?.update(t + phase, this.variant, tailAmp);
    // 右側の双尾は位相(+1.15秒)と周期(0.94倍)を少しずらし、機械的な同時開閉にならない自然な揺れにする
    this.tailRigMirror?.update(t * 0.94 + phase + 1.15, this.variant, tailAmp);
    this.hornRig?.update(t + phase, this.variant, 1.0);
    this.wingRig?.update(t + phase, this.variant, 1.1 * (1 + s * 0.35));
  }

  public override setBodyColor(hex: number): void {
    for (const m of this.paintMaterials) m.color.setHex(hex);
  }

  public override setRoofColor(hex: number): void {
    for (const m of this.armorMaterials) m.color.setHex(hex);
  }

  public override setLights(enabled: boolean): void {
    this.lightsEnabled = enabled;
    for (const m of this.emissiveMaterials) m.emissiveIntensity = this.emissiveOn * (enabled ? 1 : GLOW_OFF);
    if (this.partGlow) this.partGlow.uStrength.value = this.partGlowStrength * (enabled ? 1 : GLOW_OFF);
  }
}
