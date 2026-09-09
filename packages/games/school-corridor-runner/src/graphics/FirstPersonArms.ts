import * as THREE from 'three';

/**
 * 一人称視点（FPS視点）手元アーム ＆ 投擲・アクションモーション
 * カメラの子要素として画面手前に両腕と百科事典を表示
 */
export class FirstPersonArms {
  public group: THREE.Group;

  // 左腕（百科事典を抱え持つ）
  private leftArmGroup: THREE.Group;
  private leftForearm: THREE.Mesh;
  private leftHand: THREE.Mesh;
  private leftBook: THREE.Group;

  // 右腕（アクション・投擲を行う）
  private rightArmGroup: THREE.Group;
  private rightForearm: THREE.Mesh;
  private rightHand: THREE.Mesh;
  private rightShurikenCard: THREE.Mesh;
  private rightThrowBook: THREE.Group;

  // 基本位置（カメラローカル座標系）
  private readonly LEFT_BASE_POS = new THREE.Vector3(-0.36, -0.28, -0.56);
  private readonly RIGHT_BASE_POS = new THREE.Vector3(0.36, -0.28, -0.56);

  // アニメーションタイマー
  private shurikenTimer: number = 0;
  private readonly SHURIKEN_DURATION = 0.18;

  private bombTimer: number = 0;
  private readonly BOMB_DURATION = 0.42;

  private reloadTimer: number = 0;
  private readonly RELOAD_DURATION = 0.32;

  // 状態値
  private slideProgress: number = 0;
  private jumpProgress: number = 0;
  private crashProgress: number = 0;
  private isCrashed: boolean = false;

  constructor() {
    this.group = new THREE.Group();

    // マテリアル定義（学ラン制服、白いワイシャツ、肌色、赤革百科事典、金文字）
    const uniformMat = new THREE.MeshLambertMaterial({ color: 0x12173d }); // 濃紺学ラン制服
    const shirtMat = new THREE.MeshLambertMaterial({ color: 0xf5f5f5 });   // 白ワイシャツカフス
    const skinMat = new THREE.MeshLambertMaterial({ color: 0xffdfba });    // 明るい健康的なベージュ肌色
    const bookCoverMat = new THREE.MeshLambertMaterial({ color: 0x9b111e }); // 深紅の百科事典表紙
    const bookPageMat = new THREE.MeshLambertMaterial({ color: 0xfffde7 }); // クリーム色用紙束
    const goldMat = new THREE.MeshStandardMaterial({ color: 0xffd700, metalness: 0.8, roughness: 0.2 }); // 金装飾
    const cardMat = new THREE.MeshLambertMaterial({ color: 0xff4081 });     // 単語帳シュリケンピンク

    // ----------------------------------------------------
    // 1. 左腕 ＆ 百科事典（画面左下に小脇に抱えて持つ）
    // ----------------------------------------------------
    this.leftArmGroup = new THREE.Group();
    this.leftArmGroup.position.copy(this.LEFT_BASE_POS);

    // 左前腕（袖）
    const sleeveGeo = new THREE.BoxGeometry(0.16, 0.16, 0.48);
    this.leftForearm = new THREE.Mesh(sleeveGeo, uniformMat);
    this.leftForearm.position.set(0, 0, 0.15);
    this.leftForearm.rotation.set(-0.25, 0.35, -0.15);
    this.leftArmGroup.add(this.leftForearm);

    // 白いシャツカフス
    const cuffGeo = new THREE.BoxGeometry(0.15, 0.15, 0.05);
    const leftCuff = new THREE.Mesh(cuffGeo, shirtMat);
    leftCuff.position.set(0, 0, -0.25);
    this.leftForearm.add(leftCuff);

    // 左手（肌色・本を下から支えるポーズ）
    const handGeo = new THREE.BoxGeometry(0.14, 0.13, 0.16);
    this.leftHand = new THREE.Mesh(handGeo, skinMat);
    this.leftHand.position.set(0, -0.02, -0.34);
    this.leftForearm.add(this.leftHand);

    // 百科事典（厚みのある重厚な辞典）
    this.leftBook = new THREE.Group();
    this.leftBook.position.set(0.08, 0.04, -0.36);
    this.leftBook.rotation.set(0.2, -0.4, 0.25);

    // 表紙（上・下・背）
    const coverTop = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.015, 0.42), bookCoverMat);
    coverTop.position.y = 0.07;
    this.leftBook.add(coverTop);

    const coverBottom = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.015, 0.42), bookCoverMat);
    coverBottom.position.y = -0.07;
    this.leftBook.add(coverBottom);

    const spine = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.15, 0.42), bookCoverMat);
    spine.position.x = -0.155;
    this.leftBook.add(spine);

    // 本文ページ束（分厚い紙）
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.30, 0.12, 0.40), bookPageMat);
    pages.position.set(0.005, 0, 0);
    this.leftBook.add(pages);

    // 金文字オーナメント（表紙エンブレム）
    const emblem = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.005, 0.16), goldMat);
    emblem.position.set(0, 0.08, 0);
    this.leftBook.add(emblem);

    this.leftForearm.add(this.leftBook);
    this.group.add(this.leftArmGroup);

    // ----------------------------------------------------
    // 2. 右腕（画面右下・投擲アクションを行う）
    // ----------------------------------------------------
    this.rightArmGroup = new THREE.Group();
    this.rightArmGroup.position.copy(this.RIGHT_BASE_POS);

    // 右前腕（袖）
    this.rightForearm = new THREE.Mesh(sleeveGeo, uniformMat);
    this.rightForearm.position.set(0, 0, 0.15);
    this.rightForearm.rotation.set(-0.25, -0.35, 0.15);
    this.rightArmGroup.add(this.rightForearm);

    // 白いシャツカフス
    const rightCuff = new THREE.Mesh(cuffGeo, shirtMat);
    rightCuff.position.set(0, 0, -0.25);
    this.rightForearm.add(rightCuff);

    // 右手（肌色）
    this.rightHand = new THREE.Mesh(handGeo, skinMat);
    this.rightHand.position.set(0, -0.02, -0.34);
    this.rightForearm.add(this.rightHand);

    // 単語帳シュリケン（投擲時に一瞬右手に現れる）
    const cardGeo = new THREE.BoxGeometry(0.14, 0.01, 0.22);
    this.rightShurikenCard = new THREE.Mesh(cardGeo, cardMat);
    this.rightShurikenCard.position.set(0, 0.06, 0);
    this.rightShurikenCard.rotation.set(0.3, 0.2, -0.4);
    this.rightShurikenCard.visible = false;
    this.rightHand.add(this.rightShurikenCard);

    // ボム投擲時に右手が振りかぶる百科事典
    this.rightThrowBook = this.leftBook.clone(true);
    this.rightThrowBook.position.set(0, 0.06, 0);
    this.rightThrowBook.rotation.set(0, 0, 0);
    this.rightThrowBook.visible = false;
    this.rightHand.add(this.rightThrowBook);

    this.group.add(this.rightArmGroup);
  }

  /**
   * 単語帳シュリケン投擲モーション発動
   */
  public triggerShuriken(): void {
    this.shurikenTimer = this.SHURIKEN_DURATION;
    this.rightShurikenCard.visible = true;
  }

  /**
   * 百科事典ボム投擲モーション発動
   */
  public triggerBombThrow(remainingStock: number): void {
    this.bombTimer = this.BOMB_DURATION;
    this.rightThrowBook.visible = true;
    this.leftBook.visible = false; // 投げている間は左手から消える

    if (remainingStock > 0) {
      // 0.25秒後に下から次の辞書を取り出す
      setTimeout(() => {
        if (!this.isCrashed) {
          this.reloadTimer = this.RELOAD_DURATION;
          this.leftBook.visible = true;
        }
      }, 250);
    }
  }

  /**
   * 激突クラッシュ演出（手元が画面外へ吹き飛ぶ）
   */
  public triggerCrash(): void {
    this.isCrashed = true;
    this.crashProgress = 0;
  }

  public reset(): void {
    this.shurikenTimer = 0;
    this.bombTimer = 0;
    this.reloadTimer = 0;
    this.slideProgress = 0;
    this.jumpProgress = 0;
    this.crashProgress = 0;
    this.isCrashed = false;

    this.leftBook.visible = true;
    this.rightThrowBook.visible = false;
    this.rightShurikenCard.visible = false;

    this.leftArmGroup.position.copy(this.LEFT_BASE_POS);
    this.leftArmGroup.rotation.set(0, 0, 0);
    this.rightArmGroup.position.copy(this.RIGHT_BASE_POS);
    this.rightArmGroup.rotation.set(0, 0, 0);
  }

  /**
   * 毎フレームの手元モーション更新
   */
  public update(
    dt: number,
    runCycle: number,
    speed: number,
    isSliding: boolean,
    isJumping: boolean,
    bombStock: number
  ): void {
    // 激突時: 手元が吹き飛んで画面外へ消える
    if (this.isCrashed) {
      this.crashProgress = Math.min(1.0, this.crashProgress + dt * 4.0);
      this.leftArmGroup.position.y -= dt * 3.5;
      this.leftArmGroup.position.x -= dt * 2.0;
      this.leftArmGroup.rotation.z -= dt * 6.0;

      this.rightArmGroup.position.y -= dt * 4.0;
      this.rightArmGroup.position.x += dt * 2.5;
      this.rightArmGroup.rotation.z += dt * 7.0;
      return;
    }

    // 辞書ストックの有無で左手の本の表示制御
    if (this.bombTimer <= 0 && this.reloadTimer <= 0) {
      this.leftBook.visible = bombStock > 0;
    }

    // 1. スライディング姿勢（床に手を突くように前下方へ）
    const targetSlide = isSliding ? 1.0 : 0.0;
    this.slideProgress += (targetSlide - this.slideProgress) * Math.min(1.0, dt * 16);

    // 2. ジャンプ浮遊（慣性で腕がフワッと浮く）
    const targetJump = isJumping ? 1.0 : 0.0;
    this.jumpProgress += (targetJump - this.jumpProgress) * Math.min(1.0, dt * 12);

    // 3. 走行ハンドボブ（走るリズムに合わせた腕の揺れ）
    const bobIntensity = Math.min(1.2, speed / 35);
    const bobY = Math.abs(Math.sin(runCycle * 2)) * 0.024 * bobIntensity;
    const bobX = Math.cos(runCycle) * 0.016 * bobIntensity;

    // 左腕位置（基本 ＋ ボブ ＋ ジャンプ ＋ スライド）
    const leftTarget = this.LEFT_BASE_POS.clone();
    leftTarget.x += bobX * 0.6;
    leftTarget.y += bobY - this.slideProgress * 0.18 + this.jumpProgress * 0.06;
    leftTarget.z += Math.sin(runCycle) * 0.02 * bobIntensity - this.slideProgress * 0.15;

    // リロードアニメーション（下からせり上がる）
    if (this.reloadTimer > 0) {
      this.reloadTimer -= dt;
      const progress = 1.0 - (this.reloadTimer / this.RELOAD_DURATION);
      leftTarget.y -= (1.0 - progress) * 0.35; // 下からスッと持ち上がる
    }

    this.leftArmGroup.position.copy(leftTarget);
    this.leftArmGroup.rotation.x = this.slideProgress * 0.45 - this.jumpProgress * 0.2;
    this.leftArmGroup.rotation.y = this.slideProgress * 0.2;

    // 4. 右腕（通常ボブ ＆ アクションモーション）
    const rightTarget = this.RIGHT_BASE_POS.clone();
    rightTarget.x -= bobX * 0.8;
    rightTarget.y += -bobY - this.slideProgress * 0.18 + this.jumpProgress * 0.06;
    rightTarget.z += -Math.sin(runCycle) * 0.06 * bobIntensity - this.slideProgress * 0.15;

    // (A) 単語帳シュリケンクイックスナップ（ボタン1）
    if (this.shurikenTimer > 0) {
      this.shurikenTimer -= dt;
      const p = 1.0 - (this.shurikenTimer / this.SHURIKEN_DURATION);
      // 鋭く前方へ突き出し、瞬時に戻る
      const punchZ = Math.sin(p * Math.PI) * 0.32;
      rightTarget.z -= punchZ;
      rightTarget.x -= punchZ * 0.3;
      rightTarget.y += punchZ * 0.15;

      this.rightArmGroup.rotation.x = -punchZ * 1.5;
      this.rightArmGroup.rotation.y = punchZ * 0.8;

      if (this.shurikenTimer <= 0) {
        this.rightShurikenCard.visible = false;
      }
    }
    // (B) 百科事典ボム豪快投擲ストローク（ボタン2）
    else if (this.bombTimer > 0) {
      this.bombTimer -= dt;
      const p = 1.0 - (this.bombTimer / this.BOMB_DURATION);

      if (p < 0.35) {
        // 振りかぶり: 右手を後ろ上方にグッと引き絞る
        const backP = p / 0.35;
        rightTarget.x += backP * 0.12;
        rightTarget.y += backP * 0.22;
        rightTarget.z += backP * 0.18;
        this.rightArmGroup.rotation.x = backP * 0.7;
        this.rightArmGroup.rotation.z = -backP * 0.35;
      } else if (p < 0.75) {
        // 前方への力強い全力スイング投擲！
        const throwP = (p - 0.35) / 0.4;
        rightTarget.x -= throwP * 0.25;
        rightTarget.y -= throwP * 0.15;
        rightTarget.z -= throwP * 0.45;
        this.rightArmGroup.rotation.x = -throwP * 1.2;
        this.rightArmGroup.rotation.y = throwP * 0.5;

        // 投擲ポイント（p=0.45付近）で手元の辞書が消えて前方へ飛ぶ
        if (p > 0.45) {
          this.rightThrowBook.visible = false;
        }
      } else {
        // フォロースルーから復帰
        const returnP = (p - 0.75) / 0.25;
        this.rightThrowBook.visible = false;
        rightTarget.lerp(this.RIGHT_BASE_POS, returnP);
        this.rightArmGroup.rotation.set(0, 0, 0);
      }
    } else {
      this.rightArmGroup.rotation.x = this.slideProgress * 0.45 - this.jumpProgress * 0.2;
      this.rightArmGroup.rotation.y = -this.slideProgress * 0.2;
    }

    this.rightArmGroup.position.copy(rightTarget);
  }
}
