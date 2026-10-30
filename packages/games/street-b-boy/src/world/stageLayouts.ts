// ステージごとのレイアウト(足場・敵・ギミックの配置)。Stage の add* を呼んで並べるだけのデータ的なコード。
// stage.ts が肥大化していたため切り出した(中身は変えていない)。
import * as THREE from 'three';
import {
  CassetteTape, StageBlock, StreetObstacle,
  GrindRail, FireHydrant, SubwooferPad, SteamVent, LaserGrid, MovingPlatform,
  CrumblingPlatform, Checkpoint, VerticalLaserTrap
} from '../entities/objects';
import { SecurityBot, SkaterDog, SurveillanceDrone } from '../entities/enemies';
import { TextureGenerator } from './textures';
import type { Stage } from './stage';

export function addSign(s: Stage, x: number, y: number, text: string): void {
  const sign = new THREE.Mesh(
    new THREE.BoxGeometry(3.4, 1.7, 0.2),
    new THREE.MeshStandardMaterial({ map: TextureGenerator.getNeonBillboardTexture(text), roughness: 0.4 })
  );
  sign.position.set(x, y, -1.9);
  s.bgGroup.add(sign);
}

// -------------------------------------------------------------
// STAGE 1: BRONX STREET (基本の動きを覚える面: 看板つきの導入、レール、ドローン、消火栓)
// -------------------------------------------------------------
export function buildStage1(s: Stage): void {
  // Road 1: X -6 to 24
  s.addPlatform(-6, 0, 30, 4, true);

  // チュートリアルの看板(背景)
  addSign(s, 4, 4.4, 'JUMP: Z/SPACE');
  addSign(s, 15, 4.4, 'SPIN: X/K');
  addSign(s, 23, 4.4, 'HIT HYDRANT!');

  // Intro Question & Brick Blocks
  s.addBlock(new StageBlock(8, 3.2, 'question'));
  s.addBlock(new StageBlock(10, 3.2, 'brick'));
  s.addBlock(new StageBlock(12, 3.2, 'question'));
  s.addBlock(new StageBlock(14, 3.2, 'brick'));

  // Patrolling enemy first, then a cardboard box to spin through
  s.addEnemy(new SecurityBot(18.5, 0, 1.5));
  s.addObstacle(new StreetObstacle(20.5, 0, 'cardboard'));

  // Fire hydrant launches to a gold cassette
  s.addFireHydrant(new FireHydrant(23, 0));
  s.addCassette(new CassetteTape(23, 6.2, true));

  // Pit 1: X 24 to 29 (Gap 5.0 units - requires run jump or grind rail)
  s.addGrindRail(new GrindRail(24.5, 1.4, 7.5));

  // Road 2: X 29 to 50
  s.addPlatform(29, 0, 19.5, 4, true);
  s.addCheckpoint(new Checkpoint(30.5, 0));

  // Steam Vent & aggressive Skater Dog
  s.addSteamVent(new SteamVent(32, 0));
  s.addEnemy(new SkaterDog(36, 0, 4));

  // Elevated scaffolding platform (一方通行)
  s.addPlatform(36, 2.6, 8, 0.5);
  s.addCassette(new CassetteTape(38, 3.8));
  s.addCassette(new CassetteTape(40, 3.8));
  s.addCassette(new CassetteTape(42, 3.8));

  s.addObstacle(new StreetObstacle(46, 0, 'trash_can'));

  // Pit 2: X 48.5 to 55 (Gap 6.5 units)
  // Road 3: X 55 to 75.5
  s.addPlatform(55, 0, 20.5, 4, true);
  s.addCheckpoint(new Checkpoint(56.5, 0));

  // Stepping subway entrance stairs guarded by Drone
  s.addPlatform(58, 1.6, 5, 1.6);
  s.addPlatform(63, 3.0, 5, 3.0);
  s.addEnemy(new SurveillanceDrone(62.5, 4.8, 3.5));

  // High secret route blocks
  s.addBlock(new StageBlock(68, 6.2, 'brick'));
  s.addBlock(new StageBlock(70, 6.2, 'question'));
  s.addBlock(new StageBlock(72, 6.2, 'brick'));

  // Intermittent security laser grid before pit 3
  s.addLaserGrid(new LaserGrid(72, 0, 3.0, 1.15, true));

  // Pit 3: X 75.5 to 82 (Gap 6.5 units)
  // Road 4: X 82 to 112
  s.addPlatform(82, 0, 30, 4, true);
  s.addCheckpoint(new Checkpoint(83.5, 0));

  s.addEnemy(new SkaterDog(91, 0, 4));

  // Trash can obstacle & Grind Rail 2
  s.addObstacle(new StreetObstacle(86, 0, 'trash_can'));
  s.addGrindRail(new GrindRail(88, 1.2, 8.0));

  // Brick stairs & Cassettes
  s.addBlock(new StageBlock(98, 3.2, 'brick'));
  s.addBlock(new StageBlock(99, 3.2, 'question'));
  s.addBlock(new StageBlock(100, 3.2, 'brick'));

  s.addEnemy(new SecurityBot(106, 0, 2.5));

  // Subwoofer Bounce Pad before goal!
  s.addSubwoofer(new SubwooferPad(110, 0));

  // Raised stage platforms leading to goal turntable (solid steps)
  s.addPlatform(115, 1.5, 8, 1.5);
  s.addPlatform(123, 2.8, 8, 2.8);
  s.addPlatform(131, 3.5, 14, 3.5);
}

// -------------------------------------------------------------
// STAGE 2: SUBWAY CYPHER (線路と停車中の電車。3つ目の線路はレールカートで渡る)
// -------------------------------------------------------------
export function buildStage2(s: Stage): void {
  // Station Platform 1: X -6 to 24
  s.addPlatform(-6, 0, 30, 4);

  s.addBlock(new StageBlock(8, 3.2, 'question'));
  s.addBlock(new StageBlock(10, 3.2, 'question'));
  s.addBlock(new StageBlock(12, 3.2, 'brick'));

  // Steam vent & initial patrol bot
  s.addSteamVent(new SteamVent(14, 0));
  s.addObstacle(new StreetObstacle(17, 0, 'trash_can'));
  s.addEnemy(new SecurityBot(20, 0, 3));

  // 線路1 X 24〜38 は奈落。停車中の電車の屋根を橋にして渡る(両側の隙間は3.5m。落ちるとミス)

  // Parked Subway Train 1 (y = 1.8)。犬は電車の屋根の上を走る
  s.addPlatform(27.5, 1.8, 7, 2.8);
  s.addEnemy(new SkaterDog(31, 1.8, 3.0));
  s.addGrindRail(new GrindRail(27.5, 2.8, 7.0));
  s.addCassette(new CassetteTape(30, 4.0));
  s.addCassette(new CassetteTape(32, 4.0));

  // Station Platform 2: X 38 to 64
  s.addPlatform(38, 0, 26, 4);
  s.addCheckpoint(new Checkpoint(39.5, 0));

  // SECURITY LASER GRID & Skater Dog (separated so laser and enemy do not overlap)
  s.addLaserGrid(new LaserGrid(43, 0, 3.5, 1.15, false));
  s.addEnemy(new SkaterDog(56, 0, 4));

  // Overhead Walkway (一方通行)
  s.addPlatform(49, 2.6, 7, 0.5);
  s.addBlock(new StageBlock(51, 5.6, 'question', true)); // Hidden Gold Cassette!
  s.addBlock(new StageBlock(53, 5.6, 'brick'));

  // 線路2 X 64〜76 も奈落。電車の屋根を橋にして渡る(両側の隙間は3.5m)
  // Parked Subway Train 2: ドローン1体が上空を巡回
  s.addPlatform(67.5, 1.8, 5, 2.8);
  s.addEnemy(new SurveillanceDrone(70, 4.2, 4));

  // Station Platform 3: X 76 to 104
  s.addPlatform(76, 0, 28, 4);
  s.addCheckpoint(new Checkpoint(77.5, 0));

  s.addBlock(new StageBlock(82, 3.2, 'question'));
  s.addBlock(new StageBlock(84, 3.2, 'brick'));
  s.addBlock(new StageBlock(86, 3.2, 'question'));

  s.addEnemy(new SecurityBot(86, 0, 2.5));
  s.addLaserGrid(new LaserGrid(92, 0, 3.2, 1.15, true));

  // Subwoofer Bounce Pad
  s.addSubwoofer(new SubwooferPad(98, 0));

  // Sunken track 3: X 104 to 118。レールと床を撤去し、動く床のみの奈落エリアにする(落ちたらデス)
  s.addMovingPlatform(new MovingPlatform(108, 0.5, 5.0, 4.0, 0, 1.9, 'gondola'));

  // Final Concourse Platform: X 118 to 150
  s.addPlatform(118, 0, 32, 4);
  s.addCheckpoint(new Checkpoint(119.5, 0));
  // Double Laser Grid: しゃがんで潜る1基と、低い位置を跳び越える1基(高さ2.3では立ったまま下を通れてしまうため)
  s.addLaserGrid(new LaserGrid(123, 0, 3.2, 1.15, true));
  s.addLaserGrid(new LaserGrid(129, 0, 3.2, 0.6, false));
  s.addEnemy(new SkaterDog(134, 0, 3));

  s.addPlatform(136, 1.5, 8, 1.5);
  s.addPlatform(144, 3.5, 12, 3.5);

}

// -------------------------------------------------------------
// STAGE 3: ROOFTOP SKYLINE (ビルの谷間。崩れる足場板とゴンドラで渡る縦の動きの面)
// -------------------------------------------------------------
export function buildStage3(s: Stage): void {
  // Rooftop 1: X -6 to 22
  s.addPlatform(-6, 0, 28, 4);

  s.addBlock(new StageBlock(7, 3.2, 'question'));
  s.addBlock(new StageBlock(9, 3.2, 'brick'));
  s.addBlock(new StageBlock(11, 3.2, 'question'));

  s.addObstacle(new StreetObstacle(15, 0, 'cardboard'));
  s.addEnemy(new SecurityBot(17, 0, 3));
  s.addFireHydrant(new FireHydrant(20, 0));

  // 崩れる足場板 X 24〜32(面3の固有ギミック)。乗ると約0.5秒で落ちるので立ち止まらずに渡る
  s.addCrumblingPlatform(new CrumblingPlatform(24, 1.6, 2.4));
  s.addCrumblingPlatform(new CrumblingPlatform(27.6, 1.6, 2.4));
  s.addCrumblingPlatform(new CrumblingPlatform(31.2, 1.6, 2.4));
  s.addEnemy(new SurveillanceDrone(27, 4.4, 4));
  s.addCassette(new CassetteTape(26, 2.8));
  s.addCassette(new CassetteTape(28, 2.8));
  s.addCassette(new CassetteTape(30, 2.8));

  // Rooftop 2: X 34 to 51 (動く床とめり込まないよう長さを調整)
  s.addPlatform(34, 2.4, 17, 5);
  s.addCheckpoint(new Checkpoint(35.5, 2.4));
  s.addEnemy(new SkaterDog(43, 2.4, 4));

  // Grind Rail along rooftop parapet
  s.addGrindRail(new GrindRail(36, 3.6, 8.0));

  // High air duct route with Gold Cassette! (一方通行)
  s.addPlatform(42, 5.0, 6, 0.6);
  s.addBlock(new StageBlock(44, 8.0, 'question', true));
  s.addBlock(new StageBlock(46, 8.0, 'brick'));

  // Fast Moving Gondola Platform over abyss (めり込みを解消した配置: X 55.5〜62.5)
  s.addMovingPlatform(new MovingPlatform(59, 2.2, 5.0, 3.5, 0, 2.3));
  s.addEnemy(new SurveillanceDrone(60, 5.0, 5));

  // Rooftop 3: X 68 to 90
  s.addPlatform(68, 1.5, 22, 5);
  s.addCheckpoint(new Checkpoint(69.5, 1.5));
  s.addBlock(new StageBlock(74, 4.7, 'question'));
  s.addBlock(new StageBlock(76, 4.7, 'brick'));
  s.addEnemy(new SecurityBot(74, 1.5, 2.5));
  // 低いビーム(しゃがみでは潜れない。ジャンプで越える)
  s.addLaserGrid(new LaserGrid(80, 1.5, 3.2, 0.6, true));

  // Subwoofer Bounce Pad on Rooftop 3!
  s.addSubwoofer(new SubwooferPad(87, 1.5));

  // High Vertical Moving Gondola Platform (床の間に収まる自然な上下動)
  s.addMovingPlatform(new MovingPlatform(93, 2.8, 5.0, 0, 1.6, 2.3));
  s.addEnemy(new SurveillanceDrone(95, 5.2, 5));

  // Rooftop 4: X 101 to 124
  s.addPlatform(101, 2.0, 23, 5);
  s.addCheckpoint(new Checkpoint(102.5, 2.0));
  s.addObstacle(new StreetObstacle(106, 2.0, 'cardboard'));
  s.addEnemy(new SkaterDog(110, 2.0, 4));
  s.addObstacle(new StreetObstacle(115, 2.0, 'cardboard'));

  // High Grind Rail into Helipad: 奈落の12mを渡る。ヘリポートの縁(X 136)までつなぐ。
  // 簡単になりすぎないよう、レール上に低いレーザーを置く(しゃがみでは潜れない。ジャンプで跳び越える)
  s.addGrindRail(new GrindRail(124, 2.4, 12.0));
  s.addLaserGrid(new LaserGrid(129.5, 2.4, 1.5, 0.55, false));

  // Penthouse Helipad & DJ Stage: X 136 to 158
  s.addPlatform(136, 1.5, 22, 4);
  s.addCheckpoint(new Checkpoint(137.5, 1.5));
  s.addEnemy(new SecurityBot(140, 1.5, 2.5));
  s.addPlatform(144, 2.8, 12, 2.8);
}

// -------------------------------------------------------------
// STAGE 4: NEON BLOCK PARTY (ビートに合わせて交互に点滅するレーザーが主役の総まとめ)
// -------------------------------------------------------------
export function buildStage4(s: Stage): void {
  // BGMのテンポに合わせ、4拍(2.5秒)を1周期にする
  const BEAT_PERIOD = 2.5;
  // 発射時間の割合。交互の点滅でも「両方が消える」瞬間がなく、必ずどちらかは撃っている
  const LASER_DUTY = 0.7;

  // Neon Boulevard 1: X -6 to 24
  s.addPlatform(-6, 0, 30, 4, true);

  s.addBlock(new StageBlock(6, 3.2, 'question'));
  s.addBlock(new StageBlock(8, 3.2, 'question'));
  s.addBlock(new StageBlock(10, 3.2, 'question'));
  s.addBlock(new StageBlock(12, 3.2, 'brick'));

  s.addFireHydrant(new FireHydrant(15, 0));
  s.addEnemy(new SkaterDog(17, 0, 3.5));
  s.addObstacle(new StreetObstacle(19, 0, 'cardboard'));

  // High Neon Speaker Stack with Grind Rail
  s.addPlatform(26, 1.8, 8, 1.8);
  s.addGrindRail(new GrindRail(27, 2.8, 6.0));
  s.addEnemy(new SurveillanceDrone(30, 4.6, 4));

  // Neon Boulevard 2: X 36 to 62
  s.addPlatform(36, 0, 26, 4, true);
  s.addCheckpoint(new Checkpoint(37.5, 0));

  // ビート同期レーザー(交互に点滅する2連)
  s.addLaserGrid(new LaserGrid(40, 0, 3.5, 1.15, true, { period: BEAT_PERIOD, phase: 0, duty: LASER_DUTY }));
  // 2基目は低いビーム(しゃがみでは潜れない。ジャンプで越える)
  s.addLaserGrid(new LaserGrid(52, 0, 3.0, 0.6, true, { period: BEAT_PERIOD, phase: 0.5, duty: LASER_DUTY }));

  // Gimmick: Steam Vent & High Secret Gold Cassette (一方通行)
  s.addSteamVent(new SteamVent(46, 0));
  s.addPlatform(48, 2.8, 6, 0.6);
  s.addBlock(new StageBlock(50, 5.8, 'question', true));

  s.addEnemy(new SurveillanceDrone(58, 4.6, 3.5));

  // Fast Moving Gondola Platform over Neon Abyss
  s.addMovingPlatform(new MovingPlatform(64, 2.0, 7.0, 4.5, 0, 2.8));

  // Neon Boulevard 3: X 76 to 106
  s.addPlatform(76, 0, 30, 4, true);
  s.addCheckpoint(new Checkpoint(77.5, 0));

  s.addBlock(new StageBlock(82, 3.2, 'question'));
  s.addBlock(new StageBlock(84, 3.2, 'brick'));
  s.addBlock(new StageBlock(86, 3.2, 'question'));

  s.addEnemy(new SecurityBot(84, 0, 2.5));

  // Subwoofer Bounce Pad launch!
  s.addSubwoofer(new SubwooferPad(90, 0));

  // High Grind Rail over dual pulsing lasers (ビート同期・交互点滅。レールの3m間隔の支柱とレーザーの両端を揃える)
  s.addGrindRail(new GrindRail(93, 2.8, 12.8));
  s.addLaserGrid(new LaserGrid(96.4, 0, 3.0, 1.15, true, { period: BEAT_PERIOD, phase: 0, duty: LASER_DUTY }));
  s.addLaserGrid(new LaserGrid(102.4, 0, 3.0, 0.6, true, { period: BEAT_PERIOD, phase: 0.5, duty: LASER_DUTY }));

  // レール上空のドローンは入口と出口で移動範囲が重ならない2体に整理
  s.addEnemy(new SurveillanceDrone(95, 4.2, 2.0, 1));
  s.addEnemy(new SurveillanceDrone(105, 4.0, 2.0, -1));

  // スピーカーの島(X 108〜112): サブウーファーが宙に浮かないよう足場を置く。
  // 島の上のサブウーファーで高く跳ぶと、上空のカセットを取れる。
  s.addPlatform(108, 0, 4, 4, true);
  s.addSubwoofer(new SubwooferPad(110, 0));
  s.addCassette(new CassetteTape(109, 8.0));
  s.addCassette(new CassetteTape(111, 8.0));

  // Stepped Champion Pyramid leading to Grandmaster Turntable (solid steps)
  // 段の間の穴は4〜6m(走り幅跳びの限界の約半分)。最上段には跳び越えるレーザーを置く
  s.addPlatform(116, 1.5, 6, 1.5);
  s.addEnemy(new SkaterDog(119, 1.5, 2.5));
  s.addPlatform(127, 2.8, 6, 2.8);
  s.addEnemy(new SecurityBot(130, 2.8, 2.0));
  s.addPlatform(139, 3.8, 6, 3.8);
  s.addCheckpoint(new Checkpoint(140, 3.8));
  s.addLaserGrid(new LaserGrid(141.5, 3.8, 2.5, 0.6, true, { period: BEAT_PERIOD, phase: 0, duty: LASER_DUTY }));
  s.addCassette(new CassetteTape(141.5, 5.4));
  s.addCassette(new CassetteTape(143.5, 5.4));

  // Final Grand Stage
  s.addPlatform(150, 2.0, 10, 2.0);
  s.addPlatform(154, 4.0, 14, 4.0);
}

// -------------------------------------------------------------
// STAGE 5 (FINAL): DOG PACK RUSH (後ろから大量の犬が追ってくる。立ち止まれない縦横無尽のパルクール)
// 穴は最大でも走り幅跳びの限界(約10m)の7割台、段差は跳躍の高さ(約4m)の7割台までに収め、
// 犬の大群も同じ道を通れるようにする(穴は10m未満、段差は犬の跳躍3.6m未満)。
// -------------------------------------------------------------
export function buildStage5(s: Stage): void {
  // BGM(124BPM)の4拍 = 約1.94秒を、ビート同期レーザーの1周期にする
  const BEAT_PERIOD = 1.94;
  // 発射時間の割合。交互点滅でも、両方が消える瞬間はない
  const LASER_DUTY = 0.65;

  // A. スタートの直線: X -6 to 28
  s.addPlatform(-6, 0, 34, 4, true);
  s.addObstacle(new StreetObstacle(13, 0, 'cardboard'));
  s.addFireHydrant(new FireHydrant(20, 0));
  s.addCassette(new CassetteTape(9, 2.6));
  s.addCassette(new CassetteTape(24, 2.6));

  // B. 7mの穴を越えた先のレーザー通路: X 35 to 51
  s.addPlatform(35, 0, 16, 4, true);
  s.addCheckpoint(new Checkpoint(36.5, 0));
  s.addLaserGrid(new LaserGrid(41, 0, 3.5, 1.15, true, { period: BEAT_PERIOD, phase: 0, duty: LASER_DUTY }));
  s.addLaserGrid(new LaserGrid(46.5, 0, 3.0, 0.6, true, { period: BEAT_PERIOD, phase: 0.5, duty: LASER_DUTY }));

  // C. 7mの穴の先から、3段の駆け上がり(段差1.5 → 1.5 → 1.2、間は3m)
  s.addPlatform(58, 1.5, 6, 1.5);
  s.addEnemy(new SecurityBot(61, 1.5, 2.0));
  s.addPlatform(67, 3.0, 6, 3.0);
  s.addPlatform(76, 4.2, 6, 4.2);
  s.addEnemy(new SurveillanceDrone(70, 6.4, 4));

  // D. 崩れる足場の橋(約0.5秒で落ちる。立ち止まらずに渡る)
  s.addCrumblingPlatform(new CrumblingPlatform(85, 4.2, 2.0));
  s.addCrumblingPlatform(new CrumblingPlatform(88.4, 4.2, 2.0));
  s.addCrumblingPlatform(new CrumblingPlatform(91.8, 4.4, 2.0));
  s.addCrumblingPlatform(new CrumblingPlatform(95.2, 4.4, 2.0));
  s.addCassette(new CassetteTape(89, 5.6));
  s.addCassette(new CassetteTape(93, 5.8));

  // E. 休憩の足場(チェックポイント)から、動く足場で奈落を渡る
  s.addPlatform(99, 3.4, 10, 3.4);
  s.addCheckpoint(new Checkpoint(100.5, 3.4));
  s.addEnemy(new SecurityBot(105, 3.4, 2.5));
  // 動く足場は出発点を中心に ±deltaX で往復する。両端の足場(X 109 と 124)に食い込まない範囲 X 110.1〜123.1 に収める。
  // 最大の速さ = deltaX × speed = 7.2m/s(走る速さ9.8m/sより遅く、乗って渡れる)
  s.addMovingPlatform(new MovingPlatform(114.1, 3.0, 5.0, 4.0, 0, 1.8));
  s.addEnemy(new SurveillanceDrone(116, 6.0, 4.5));

  // F. 動く足場の向こうの広場: X 124 to 138
  s.addPlatform(124, 3.2, 14, 3.2);
  s.addCheckpoint(new Checkpoint(125.5, 3.2));
  s.addSubwoofer(new SubwooferPad(132, 3.2));
  s.addCassette(new CassetteTape(132, 10.0));

  // G. 地上へ降りて、ビートに合わせて交互に点滅するレーザーとレール: X 142 to 186
  s.addPlatform(142, 0, 44, 4, true);
  s.addCheckpoint(new Checkpoint(143.5, 0));
  s.addLaserGrid(new LaserGrid(149, 0, 3.0, 1.15, true, { period: BEAT_PERIOD, phase: 0, duty: LASER_DUTY }));
  s.addLaserGrid(new LaserGrid(155, 0, 3.0, 0.6, true, { period: BEAT_PERIOD, phase: 0.5, duty: LASER_DUTY }));
  s.addEnemy(new SecurityBot(152, 0, 2.5));
  s.addGrindRail(new GrindRail(161, 2.8, 12.8));
  s.addLaserGrid(new LaserGrid(164.4, 0, 3.0, 1.15, true, { period: BEAT_PERIOD, phase: 0, duty: LASER_DUTY }));
  s.addLaserGrid(new LaserGrid(170.4, 0, 3.0, 0.6, true, { period: BEAT_PERIOD, phase: 0.5, duty: LASER_DUTY }));
  s.addEnemy(new SurveillanceDrone(165, 4.2, 4));
  s.addEnemy(new SurveillanceDrone(171, 4.4, 4.5));
  s.addObstacle(new StreetObstacle(178, 0, 'cardboard'));

  // H. 崩れる足場の橋の上で、ビート同期レーザーを跳び越える(B・Gの直線レーザーとは違い、足場が落ちる前に越える)
  s.addPlatform(194, 0, 5, 4, true);
  s.addCheckpoint(new Checkpoint(195.5, 0));
  const SHORT_SHAKE = 0.35;
  for (const px of [201, 204.4, 207.8, 211.2]) {
    s.addCrumblingPlatform(new CrumblingPlatform(px, 0, 2.0, SHORT_SHAKE));
  }
  s.addLaserGrid(new LaserGrid(202.6, 0, 3.0, 0.6, true, { period: BEAT_PERIOD, phase: 0, duty: LASER_DUTY }));
  s.addLaserGrid(new LaserGrid(208.6, 0, 3.0, 0.6, true, { period: BEAT_PERIOD, phase: 0.5, duty: LASER_DUTY }));
  s.addEnemy(new SurveillanceDrone(206, 4.2, 4, -1));
  s.addCassette(new CassetteTape(205.4, 2.6));
  s.addPlatform(217, 0, 3, 4, true);
  s.addCheckpoint(new Checkpoint(218, 0));

  // I. 崩れる足場の階段で屋上へ(1段あがるごとに1.2m。落ちるまで0.35秒、間隔4.2m)
  s.addPlatform(224, 1.5, 4, 1.5);
  s.addCrumblingPlatform(new CrumblingPlatform(232, 2.7, 2.0, SHORT_SHAKE));
  s.addCrumblingPlatform(new CrumblingPlatform(236.2, 3.9, 2.0, SHORT_SHAKE));
  s.addCrumblingPlatform(new CrumblingPlatform(240.4, 5.1, 2.0, SHORT_SHAKE));
  s.addCrumblingPlatform(new CrumblingPlatform(244.6, 6.3, 2.0, SHORT_SHAKE));
  s.addCassette(new CassetteTape(237.2, 5.4));
  s.addPlatform(249, 6.3, 8, 6.3);
  s.addCheckpoint(new Checkpoint(250.5, 6.3));
  s.addEnemy(new SurveillanceDrone(252, 8.8, 3, 1));
  s.addEnemy(new SurveillanceDrone(255, 9.6, 2.5, -1));

  // J. 屋上から降りて、2枚の動く足場(高さ違い)を乗り継いで奈落を渡る。ドローン2体が両側から狙う。
  // 往復の範囲は 1枚目 X 265.5〜276、2枚目 X 273.5〜284(足場 X 264 と 286 に食い込まない)。最大の速さは 5.4 / 4.8m/s
  s.addPlatform(258, 2.0, 6, 2.0);
  s.addMovingPlatform(new MovingPlatform(268.5, 2.0, 4.5, 3.0, 0, 1.8));
  s.addMovingPlatform(new MovingPlatform(276.5, 3.6, 4.5, 3.0, 0, 1.6));
  s.addEnemy(new SurveillanceDrone(270, 5.8, 3.5, 1));
  s.addEnemy(new SurveillanceDrone(279, 7.0, 3.5, -1));

  // K. ゴール前: 8段の足場を登って高さ33.5mの台へ上がり、深い縦穴をゆっくり舞い降りながら(落下速度は縮む)、
  // 横向きのレーザー3本を避ける。3本目を抜けると、景色が1面の夜の街へ変わり(setReturnBlend)、
  // 操作が効かなくなって、壁が消え、落ちた先の地上のゴール(縦穴の底)に着地して、爆発とともにクリア(ステージ1の舞台へ戻ってくる)。
  // 穴の幅は7m。レーザーは左右の壁から交互に出ていて、落ちながら左右の空きへ寄って通り抜ける。
  // 1本目は右の壁から(左が空く)、2本目は左の壁から(右が空く)、3本目は右の壁から(左が空く)。
  // 左右の空きの中心は2.1m以上離れている。レーザーの間は9m。穴の中の落下速度は13m/sが上限で、
  // 体の高さ分を引いた7mの間(約0.55秒)に、左右へ2〜3m寄って次の空きへ入る。
  const TOP = 33.5;
  const SX = 358.5; // 縦穴の左の壁(最上段の台の右端)
  s.addPlatform(286, 2.0, 8, 2.0);
  s.addCheckpoint(new Checkpoint(288.5, 2.0));
  s.addSubwoofer(new SubwooferPad(287, 2.0));
  s.addCassette(new CassetteTape(287, 9.0));
  for (let i = 0; i < 8; i++) {
    s.addPlatform(297.5 + 6.5 * i, 5.5 + 3.5 * i, 3, 5.5 + 3.5 * i);
  }
  // 階段の足場の隙間から、下からレーザーが飛んでくる(発射間隔・スピード・タイミングを全てバラバラにしてスリルを高める)
  const STEP_LASER_CONFIGS = [
    { x: 301.8, period: 1.5, phase: 0.15, speed: 17 }, // 1段目隙間: 中速
    { x: 308.3, period: 2.8, phase: 0.70, speed: 36 }, // 2段目隙間: 超高速レーザー！不意打ち
    { x: 314.8, period: 1.1, phase: 0.40, speed: 14 }, // 3段目隙間: 低速・小刻み連射
    { x: 321.3, period: 2.3, phase: 0.10, speed: 29 }, // 4段目隙間: 高速レーザー
    { x: 327.8, period: 0.9, phase: 0.85, speed: 21 }, // 5段目隙間: 高回転ビーム
    { x: 334.3, period: 3.2, phase: 0.55, speed: 40 }, // 6段目隙間: 超音速の一撃！
    { x: 340.8, period: 1.7, phase: 0.30, speed: 16 }, // 7段目隙間: ゆったり
    { x: 347.3, period: 2.0, phase: 0.95, speed: 27 }, // 最上段手前: ゴール前迎撃レーザー
  ];
  for (const cfg of STEP_LASER_CONFIGS) {
    s.addVerticalLaserTrap(new VerticalLaserTrap(cfg.x, 0, 42, cfg.period, cfg.phase, cfg.speed));
  }

  s.addPlatform(SX - 9, TOP, 9, TOP - 9.5);
  s.addCheckpoint(new Checkpoint(SX - 7.5, TOP));
  // 最上段の台の上空の天井(大ジャンプで右の壁を越えるのを防ぐ)
  s.addPlatform(SX - 9, TOP + 8, 18, 2);
  // 縦穴の右の壁: 上空での外回りを防ぎ、落下中に縦穴として囲みつつ、着地時に自然に上へ見切れるよう下端を y=9.5 (3本目のレーザー y=10.9 より下)に設定
  s.addPlatform(SX + 7, TOP + 8, 24, (TOP + 8) - 9.5);
  // 縦穴の底は地上。ゴールのターンテーブルは落ちる先(X SX+3.5)。1面と同じアスファルトの道が右へ続く
  s.addPlatform(SX, 0.0, 34, 4, true, false, true);
  s.addFireHydrant(new FireHydrant(SX + 19, 0));
  s.addObstacle(new StreetObstacle(SX + 23, 0, 'trash_can'));
  s.addObstacle(new StreetObstacle(SX + 27, 0, 'cardboard'));
  addSign(s, SX + 21, 4.4, 'BRONX STREET');
  // 縦穴内のレーザー3本: 開いている位置(左右)をランダムにし、空きルートにカセットテープを配置
  const shaftLaserYs = [28.9, 19.9, 10.9];
  for (const y of shaftLaserYs) {
    const openLeft = Math.random() < 0.5;
    const laserX = openLeft ? SX + 3.0 : SX;
    const tapeX = openLeft ? SX + 1.5 : SX + 5.5;
    s.addLaserGrid(new LaserGrid(laserX, y, 4.0, 0.6, false));
    s.addCassette(new CassetteTape(tapeX, y + 0.6));
  }
  s.dropShaft = { x0: SX, x1: SX + 7, topY: TOP, fallSpeedLimit: 13, revealY: 8.5, wallXs: [SX - 9, SX + 7] };
}
