import * as CANNON from 'cannon-es';

export class PhysicsWorld {
  public world: CANNON.World;
  public defaultMaterial: CANNON.Material;
  public dohyoMaterial: CANNON.Material;
  public fighterMaterial: CANNON.Material;

  constructor() {
    this.world = new CANNON.World();
    // どっしりとした重厚な相撲重力
    this.world.gravity.set(0, -28, 0);

    // ソルバー設定（衝突時の安定性向上）
    const solver = new CANNON.GSSolver();
    solver.iterations = 10;
    this.world.solver = solver;

    // マテリアル定義
    this.defaultMaterial = new CANNON.Material('default');
    this.dohyoMaterial = new CANNON.Material('dohyo');
    this.fighterMaterial = new CANNON.Material('fighter');

    // 力士 vs 土俵（適度な摩擦で踏ん張りが効く）
    const fighterDohyoContact = new CANNON.ContactMaterial(
      this.fighterMaterial,
      this.dohyoMaterial,
      {
        friction: 0.45,
        restitution: 0.05,
      }
    );
    this.world.addContactMaterial(fighterDohyoContact);

    // 力士 vs 力士（相撲の押し合い・がっぷり四つ）
    const fighterFighterContact = new CANNON.ContactMaterial(
      this.fighterMaterial,
      this.fighterMaterial,
      {
        friction: 0.2,
        restitution: 0.35, // 衝突時の適度な反発
      }
    );
    this.world.addContactMaterial(fighterFighterContact);

    // デフォルト接触
    const defaultContact = new CANNON.ContactMaterial(
      this.defaultMaterial,
      this.defaultMaterial,
      {
        friction: 0.3,
        restitution: 0.1,
      }
    );
    this.world.defaultContactMaterial = defaultContact;
  }

  public step(dt: number) {
    // 安定した固定ステップ (60Hz)
    const fixedTimeStep = 1 / 60;
    this.world.step(fixedTimeStep, Math.min(dt, 0.1), 3);
  }
}
