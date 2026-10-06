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

    // 力士 vs 土俵。
    // 摩擦を持たせると、接地した力士の水平速度がほぼ打ち消され(設定速度の約7%しか進めない)、
    // 歩行も突進も思いどおりの速さにならない。そのため摩擦は0にして、
    // 止まる・滑る挙動は SumoFighter 側の制動(brake / GROUND_DRAG)で作る。
    const fighterDohyoContact = new CANNON.ContactMaterial(
      this.fighterMaterial,
      this.dohyoMaterial,
      {
        friction: 0.0,
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
