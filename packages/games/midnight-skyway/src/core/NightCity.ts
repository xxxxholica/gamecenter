import * as THREE from 'three';
import { makeHighwayTexture } from '../maps/ViaductBuilder';
import { mulberry32 } from '../../../../shared/online/seededRandom';
import { radialTexture } from './fxTextures';

/**
 * タイトル〜出走前のメニュー用の背景: 夜の雨の東京の高架を走っている情景。
 * 車は原点に止まったまま、道路・ビル・街灯のほうが後ろへ流れる(トレッドミル方式)。
 * ビルと街灯は一定の長さのタイルにまとめ、2枚を交互に送って途切れなく見せる。
 */
const SPAN = 336;                  // 1タイルの長さ(m)。街灯の間隔(28m)の整数倍
const LAMP_GAP = 28;
const ROAD_W = 9.6;
const ROAD_REPEAT = 24;            // 道路の模様が繰り返す長さ(m)

export class NightCity {
  public readonly group = new THREE.Group();
  private scrolled = 0;
  private readonly roadTex: THREE.CanvasTexture;
  private readonly tiles: THREE.Group[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];

  constructor() {
    // ---- 道路(模様を流して、走っているように見せる)
    this.roadTex = makeHighwayTexture(ROAD_W, ROAD_REPEAT);
    this.roadTex.wrapS = this.roadTex.wrapT = THREE.RepeatWrapping;
    this.roadTex.repeat.set(1, 700 / ROAD_REPEAT);
    const roadGeo = new THREE.PlaneGeometry(ROAD_W, 700);
    const road = new THREE.Mesh(roadGeo, new THREE.MeshStandardMaterial({ map: this.roadTex, roughness: 0.55, metalness: 0 }));
    road.rotation.x = -Math.PI / 2;
    road.position.z = 250;
    road.receiveShadow = true;
    this.group.add(road);
    this.disposables.push(roadGeo, road.material as THREE.Material, this.roadTex);

    // ---- 高架の欄干(長いので、流さず固定)
    const railGeo = new THREE.BoxGeometry(0.28, 0.95, 700);
    const railMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.5, metalness: 0.4 });
    const stripGeo = new THREE.BoxGeometry(0.05, 0.05, 700);
    const stripMat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(railGeo, railMat);
      rail.position.set(side * (ROAD_W / 2 + 0.2), 0.48, 250);
      const strip = new THREE.Mesh(stripGeo, stripMat);
      strip.position.set(side * (ROAD_W / 2 + 0.2 - side * 0.0), 0.72, 250);
      strip.position.x = side * (ROAD_W / 2 + 0.07);
      this.group.add(rail, strip);
    }
    this.disposables.push(railGeo, railMat, stripGeo, stripMat);

    // ---- 流れるタイル(ビル・街灯)
    const buildingGeo = new THREE.BoxGeometry(1, 1, 1);
    const buildingMat = this.makeBuildingMaterial();
    const poleGeo = new THREE.BoxGeometry(0.16, 9, 0.16);
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3a, roughness: 0.6, metalness: 0.5 });
    const armGeo = new THREE.BoxGeometry(2.4, 0.12, 0.12);
    const headGeo = new THREE.BoxGeometry(0.9, 0.16, 0.36);
    const headMat = new THREE.MeshBasicMaterial({ color: 0xfff2d6 });
    const poolGeo = new THREE.PlaneGeometry(10, 13).rotateX(-Math.PI / 2);
    const poolTex = radialTexture(64, [[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,190,110,0.55)'], [1, 'rgba(0,0,0,0)']]);
    const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, opacity: 0.3, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    const glowTex = radialTexture(64, [[0, 'rgba(255,255,255,1)'], [0.18, 'rgba(255,200,130,0.9)'], [1, 'rgba(0,0,0,0)']]);
    this.disposables.push(buildingGeo, buildingMat, poleGeo, poleMat, armGeo, headGeo, headMat, poolGeo, poolTex, poolMat, glowTex);

    for (let k = 0; k < 2; k++) {
      const tile = new THREE.Group();
      const rnd = mulberry32(1234 + k * 977);

      // ビル: 道路の両側に2列ずつ。道路から離れるほど高く密に
      const list: Array<{ x: number; z: number; w: number; d: number; h: number }> = [];
      for (const side of [-1, 1]) {
        for (const row of [0, 1]) {
          let z = -60 + rnd() * 8;
          while (z < SPAN - 60) {
            const w = 9 + rnd() * 12, d = 9 + rnd() * 10, h = 22 + rnd() * (row ? 90 : 60);
            const x = side * (ROAD_W / 2 + 6.5 + row * 24 + w / 2 + rnd() * 3);
            list.push({ x, z: z + d / 2, w, d, h });
            z += d + 1.5 + rnd() * 5;
          }
        }
      }
      const buildings = new THREE.InstancedMesh(buildingGeo, buildingMat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), color = new THREE.Color();
      list.forEach((b, i) => {
        m.compose(new THREE.Vector3(b.x, (b.h - 30) / 2, b.z), q, new THREE.Vector3(b.w, b.h + 30, b.d));
        buildings.setMatrixAt(i, m);
        color.setHSL(0.6 + rnd() * 0.08, 0.25, 0.07 + rnd() * 0.06);
        buildings.setColorAt(i, color);
      });
      tile.add(buildings);

      // 街灯: 28mおき、左右交互。灯りの下の路面にも光だまりを置く
      const lamps = SPAN / LAMP_GAP;
      const poles = new THREE.InstancedMesh(poleGeo, poleMat, lamps);
      const arms = new THREE.InstancedMesh(armGeo, poleMat, lamps);
      const heads = new THREE.InstancedMesh(headGeo, headMat, lamps);
      const pools = new THREE.InstancedMesh(poolGeo, poolMat, lamps);
      const glowPos = new Float32Array(lamps * 3);
      for (let i = 0; i < lamps; i++) {
        const side = i % 2 ? 1 : -1;
        const z = -60 + i * LAMP_GAP;
        const px = side * (ROAD_W / 2 + 0.9);
        const hx = px - side * 1.2;
        m.makeTranslation(px, 4.5, z); poles.setMatrixAt(i, m);
        m.makeTranslation(px - side * 1.1, 8.95, z); arms.setMatrixAt(i, m);
        m.makeTranslation(hx - side * 0.4, 8.85, z); heads.setMatrixAt(i, m);
        m.makeTranslation(hx - side * 0.4, 0.04, z); pools.setMatrixAt(i, m);
        glowPos.set([hx - side * 0.4, 8.7, z], i * 3);
      }
      tile.add(poles, arms, heads, pools);
      const glowGeo = new THREE.BufferGeometry();
      glowGeo.setAttribute('position', new THREE.BufferAttribute(glowPos, 3));
      const glow = new THREE.Points(glowGeo, new THREE.PointsMaterial({
        map: glowTex, size: 4.5, sizeAttenuation: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      }));
      glow.frustumCulled = false;
      tile.add(glow);
      this.disposables.push(glowGeo, glow.material as THREE.Material);

      this.tiles.push(tile);
      this.group.add(tile);
    }
    this.update(0, 0);
  }

  /** 夜のビル: 世界座標ではなく建物ごとの座標で、点灯した窓を描く(建物が流れても窓が付いてくる)。 */
  private makeBuildingMaterial(): THREE.MeshStandardMaterial {
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85, metalness: 0.05 });
    mat.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying vec3 vObjN; varying float vSeed;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vec3 sc = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
          vObj = position * sc; vObjN = normal; vSeed = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.11;`);
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>
          varying vec3 vObj; varying vec3 vObjN; varying float vSeed;
          float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }`)
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
          {
            float wall = step(abs(vObjN.y), 0.5);
            float u = vObj.z * abs(vObjN.x) + vObj.x * abs(vObjN.z);
            vec2 cell = vec2(floor(u / 2.6), floor(vObj.y / 3.7));
            vec2 f = vec2(fract(u / 2.6), fract(vObj.y / 3.7));
            float rect = step(0.2, f.x) * step(f.x, 0.8) * step(0.28, f.y) * step(f.y, 0.78);
            float r = h21(cell + vSeed);
            float lit = step(0.5, r);
            vec3 tint = mix(vec3(1.0, 0.86, 0.6), vec3(0.7, 0.88, 1.0), step(0.85, h21(cell + vSeed + 5.0)));
            totalEmissiveRadiance += tint * lit * rect * wall * 1.1;
          }`);
    };
    return mat;
  }

  /** speed: 後ろへ流す速さ(m/s) */
  public update(dt: number, speed: number): void {
    this.scrolled += speed * dt;
    this.roadTex.offset.y -= (speed * dt) / ROAD_REPEAT;
    this.tiles.forEach((tile, k) => {
      const z = ((((k * SPAN - this.scrolled) % (2 * SPAN)) + 2 * SPAN) % (2 * SPAN)) - SPAN;
      tile.position.z = z;
    });
  }

  public dispose(): void {
    for (const d of this.disposables) d.dispose();
  }
}
