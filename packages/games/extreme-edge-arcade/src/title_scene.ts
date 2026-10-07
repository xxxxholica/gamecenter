import * as THREE from 'three';

export class TitleScene {
  private group = new THREE.Group();
  private turntableGroup = new THREE.Group();
  private particles!: THREE.Points;
  private orbitAngle = 0;
  private lightsGroup = new THREE.Group();

  init(scene: THREE.Scene) {
    this.group = new THREE.Group();
    this.turntableGroup = new THREE.Group();
    this.lightsGroup = new THREE.Group();

    // 1. Dark Metallic Floor with Arcade Grid Pattern
    const floorGeom = new THREE.PlaneGeometry(30, 30);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x0a0a0f,
      roughness: 0.25,
      metalness: 0.85,
    });
    const floor = new THREE.Mesh(floorGeom, floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.05;
    this.group.add(floor);

    // Grid wireframe helper for authentic arcade floor
    const gridHelper = new THREE.GridHelper(30, 30, 0xff0055, 0x1a2244);
    gridHelper.position.y = -0.04;
    this.group.add(gridHelper);

    // 2. Rotating Turntable Pedestal
    const pedestalGeom = new THREE.CylinderGeometry(3.2, 3.4, 0.3, 36);
    const pedestalMat = new THREE.MeshStandardMaterial({
      color: 0x1f232d,
      roughness: 0.3,
      metalness: 0.9,
    });
    const pedestal = new THREE.Mesh(pedestalGeom, pedestalMat);
    pedestal.position.y = 0.15;
    this.turntableGroup.add(pedestal);

    // Glowing rim around turntable edge
    const ringGeom = new THREE.TorusGeometry(3.25, 0.04, 8, 36);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.3;
    this.turntableGroup.add(ring);

    // 3. Four Key Showcase Objects placed evenly on the turntable (radius = 1.9)
    // Object A: Drink Glass (Stage 1)
    const glassGroup = this.buildGlassModel();
    glassGroup.position.set(1.9, 0.3, 0);
    glassGroup.rotation.y = -Math.PI / 2;
    this.turntableGroup.add(glassGroup);

    // Object B: Smartphone (Stage 2)
    const phoneGroup = this.buildPhoneModel();
    phoneGroup.position.set(0, 0.3, 1.9);
    phoneGroup.rotation.y = Math.PI;
    this.turntableGroup.add(phoneGroup);

    // Object C: Twin-Bell Clock (Stage 3)
    const clockGroup = this.buildClockModel();
    clockGroup.position.set(-1.9, 0.3, 0);
    clockGroup.rotation.y = Math.PI / 2;
    this.turntableGroup.add(clockGroup);

    // Object D: Balloon (Stage 4)
    const balloonGroup = this.buildBalloonModel();
    balloonGroup.position.set(0, 0.3, -1.9);
    balloonGroup.rotation.y = 0;
    this.turntableGroup.add(balloonGroup);

    this.group.add(this.turntableGroup);

    // 4. Dramatic Multi-Color Lighting
    const ambLight = new THREE.AmbientLight(0x334466, 0.6);
    this.lightsGroup.add(ambLight);

    // Main Warm Spotlight
    const spot1 = new THREE.SpotLight(0xffea00, 3.5, 20, Math.PI / 5, 0.4);
    spot1.position.set(4, 7, 5);
    spot1.target = pedestal;
    this.lightsGroup.add(spot1);

    // Cyber Cyan Spotlight
    const spot2 = new THREE.SpotLight(0x00e5ff, 4.0, 20, Math.PI / 5, 0.4);
    spot2.position.set(-5, 6, -4);
    spot2.target = pedestal;
    this.lightsGroup.add(spot2);

    // Red Rim Light
    const dirRed = new THREE.DirectionalLight(0xff1144, 1.5);
    dirRed.position.set(0, 4, -6);
    this.lightsGroup.add(dirRed);

    this.group.add(this.lightsGroup);

    // 5. Floating Dust & Spark Particles
    const particleCount = 200;
    const particleGeom = new THREE.BufferGeometry();
    const posArr = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      posArr[i * 3 + 0] = (Math.random() - 0.5) * 16;
      posArr[i * 3 + 1] = Math.random() * 6 + 0.2;
      posArr[i * 3 + 2] = (Math.random() - 0.5) * 16;
    }
    particleGeom.setAttribute('position', new THREE.BufferAttribute(posArr, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0xffeeaa,
      size: 0.08,
      transparent: true,
      opacity: 0.8,
      blending: THREE.AdditiveBlending,
    });
    this.particles = new THREE.Points(particleGeom, particleMat);
    this.group.add(this.particles);

    scene.add(this.group);
  }

  private buildGlassModel(): THREE.Group {
    const g = new THREE.Group();
    // Glass
    const glass = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.35, 1.4, 20, 1, true),
      new THREE.MeshStandardMaterial({
        color: 0x99ddff,
        transparent: true,
        opacity: 0.4,
        roughness: 0.1,
      })
    );
    glass.position.y = 0.7;
    g.add(glass);

    // Liquid (Green Melon Soda)
    const liquid = new THREE.Mesh(
      new THREE.CylinderGeometry(0.43, 0.34, 1.1, 18),
      new THREE.MeshStandardMaterial({
        color: 0x00ff66,
        roughness: 0.2,
      })
    );
    liquid.position.y = 0.55;
    g.add(liquid);

    // Foam Head
    const foam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.45, 0.43, 0.25, 18),
      new THREE.MeshStandardMaterial({
        color: 0xffffff,
        roughness: 0.9,
      })
    );
    foam.position.y = 1.2;
    g.add(foam);

    return g;
  }

  private buildPhoneModel(): THREE.Group {
    const g = new THREE.Group();
    // Phone chassis
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 1.4, 0.08),
      new THREE.MeshStandardMaterial({
        color: 0x111115,
        metalness: 0.9,
        roughness: 0.2,
      })
    );
    body.position.y = 0.75;
    body.rotation.x = -0.2;
    g.add(body);

    // Glowing screen
    const screen = new THREE.Mesh(
      new THREE.PlaneGeometry(0.72, 1.3),
      new THREE.MeshBasicMaterial({
        color: 0xff1a1a,
      })
    );
    screen.position.set(0, 0.75, 0.045);
    screen.rotation.x = -0.2;
    g.add(screen);

    return g;
  }

  private buildClockModel(): THREE.Group {
    const g = new THREE.Group();
    // Clock Case
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.65, 0.65, 0.35, 24),
      new THREE.MeshStandardMaterial({
        color: 0xdd1122,
        metalness: 0.8,
        roughness: 0.25,
      })
    );
    body.rotation.x = Math.PI / 2;
    body.position.y = 0.8;
    g.add(body);

    // Dial face
    const dial = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24),
      new THREE.MeshBasicMaterial({ color: 0xffffee })
    );
    dial.position.set(0, 0.8, 0.18);
    g.add(dial);

    // Bells
    const bellGeom = new THREE.SphereGeometry(0.3, 12, 12, 0, Math.PI * 2, 0, Math.PI * 0.5);
    const bellMat = new THREE.MeshStandardMaterial({ color: 0xcccccc, metalness: 0.95 });
    const bellL = new THREE.Mesh(bellGeom, bellMat);
    bellL.position.set(-0.5, 1.4, 0);
    bellL.rotation.z = Math.PI * 0.25;
    const bellR = new THREE.Mesh(bellGeom, bellMat);
    bellR.position.set(0.5, 1.4, 0);
    bellR.rotation.z = -Math.PI * 0.25;
    g.add(bellL, bellR);

    return g;
  }

  private buildBalloonModel(): THREE.Group {
    const g = new THREE.Group();
    // 空気入れの台座
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.4, 0.45, 0.2, 20),
      new THREE.MeshStandardMaterial({ color: 0xcfd4dc, metalness: 0.9, roughness: 0.25 })
    );
    base.position.y = 0.1;
    g.add(base);

    // ふくらんだ赤い風船(縦に少し長い)
    const balloon = new THREE.Mesh(
      new THREE.SphereGeometry(0.55, 32, 24),
      new THREE.MeshStandardMaterial({ color: 0xe8213a, roughness: 0.25, emissive: 0x440008, emissiveIntensity: 0.25 })
    );
    balloon.scale.y = 1.15;
    balloon.position.y = 0.98;
    g.add(balloon);

    // 口の結び目
    const knot = new THREE.Mesh(
      new THREE.ConeGeometry(0.07, 0.14, 10),
      new THREE.MeshStandardMaterial({ color: 0xe8213a, roughness: 0.25 })
    );
    knot.rotation.x = Math.PI;
    knot.position.y = 0.3;
    g.add(knot);

    return g;
  }

  update(dt: number, camera: THREE.PerspectiveCamera) {
    // 1. Rotate turntable slowly
    this.turntableGroup.rotation.y += dt * 0.35;

    // 2. Orbit camera smoothly around objects
    this.orbitAngle += dt * 0.22;
    const radius = 5.6;
    const camX = Math.cos(this.orbitAngle) * radius;
    const camZ = Math.sin(this.orbitAngle) * radius;
    const camY = 2.7 + Math.sin(this.orbitAngle * 0.8) * 0.4;

    camera.position.set(camX, camY, camZ);
    camera.lookAt(0, 0.85, 0);

    // 3. Jiggle floating particles
    if (this.particles) {
      const pos = this.particles.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        let y = pos.getY(i) + dt * 0.25;
        if (y > 6.0) y = 0.2;
        pos.setY(i, y);
      }
      pos.needsUpdate = true;
    }
  }

  cleanup(scene: THREE.Scene) {
    scene.remove(this.group);
  }
}
