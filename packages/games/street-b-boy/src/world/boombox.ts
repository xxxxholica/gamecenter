import * as THREE from 'three';
import { TextureGenerator } from './textures';

export class BoomboxModel {
  public mesh: THREE.Group;
  private leftSpeaker: THREE.Mesh;
  private rightSpeaker: THREE.Mesh;
  private eqBars: THREE.Mesh[] = [];

  constructor(scale: number = 1.0) {
    this.mesh = new THREE.Group();

    const grilleTex = TextureGenerator.getSpeakerGrilleTexture();

    // 1. Main Boombox Body
    const bodyGeo = new THREE.BoxGeometry(4.2 * scale, 2.4 * scale, 1.4 * scale);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x1f2124,
      metalness: 0.6,
      roughness: 0.3
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.castShadow = true;
    body.receiveShadow = true;
    this.mesh.add(body);

    // Chrome corner bumpers
    const bumperGeo = new THREE.BoxGeometry(0.3 * scale, 2.5 * scale, 1.45 * scale);
    const bumperMat = new THREE.MeshStandardMaterial({ color: 0x888888, metalness: 0.9, roughness: 0.2 });
    const leftBumper = new THREE.Mesh(bumperGeo, bumperMat);
    leftBumper.position.set(-2.0 * scale, 0, 0);
    this.mesh.add(leftBumper);
    const rightBumper = new THREE.Mesh(bumperGeo, bumperMat);
    rightBumper.position.set(2.0 * scale, 0, 0);
    this.mesh.add(rightBumper);

    // 2. Handle
    const handleBarGeo = new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 3.2 * scale);
    const handleBarMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, metalness: 0.95, roughness: 0.1 });
    const handleBar = new THREE.Mesh(handleBarGeo, handleBarMat);
    handleBar.rotation.z = Math.PI / 2;
    handleBar.position.set(0, 1.6 * scale, 0);
    this.mesh.add(handleBar);

    const handlePostGeo = new THREE.CylinderGeometry(0.08 * scale, 0.08 * scale, 0.5 * scale);
    const leftPost = new THREE.Mesh(handlePostGeo, handleBarMat);
    leftPost.position.set(-1.5 * scale, 1.35 * scale, 0);
    this.mesh.add(leftPost);
    const rightPost = new THREE.Mesh(handlePostGeo, handleBarMat);
    rightPost.position.set(1.5 * scale, 1.35 * scale, 0);
    this.mesh.add(rightPost);

    // 3. Dual Speakers (Left & Right)
    const speakerRimGeo = new THREE.CylinderGeometry(0.85 * scale, 0.85 * scale, 0.1 * scale, 32);
    const speakerRimMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, emissive: 0x003344, roughness: 0.2 });

    const speakerConeGeo = new THREE.CylinderGeometry(0.75 * scale, 0.65 * scale, 0.12 * scale, 32);
    const speakerConeMat = new THREE.MeshStandardMaterial({ map: grilleTex, roughness: 0.8 });

    const capGeo = new THREE.SphereGeometry(0.22 * scale, 16, 16);
    const capMat = new THREE.MeshStandardMaterial({ color: 0xff1a1a, roughness: 0.3 });

    // Left Speaker Group
    const leftSpkGroup = new THREE.Group();
    const lRim = new THREE.Mesh(speakerRimGeo, speakerRimMat);
    lRim.rotation.x = Math.PI / 2;
    this.leftSpeaker = new THREE.Mesh(speakerConeGeo, speakerConeMat);
    this.leftSpeaker.rotation.x = Math.PI / 2;
    this.leftSpeaker.position.z = 0.04 * scale;
    const lCap = new THREE.Mesh(capGeo, capMat);
    lCap.position.z = 0.1 * scale;
    leftSpkGroup.add(lRim, this.leftSpeaker, lCap);
    leftSpkGroup.position.set(-1.2 * scale, -0.1 * scale, 0.7 * scale);
    this.mesh.add(leftSpkGroup);

    // Right Speaker Group
    const rightSpkGroup = new THREE.Group();
    const rRim = new THREE.Mesh(speakerRimGeo, speakerRimMat);
    rRim.rotation.x = Math.PI / 2;
    this.rightSpeaker = new THREE.Mesh(speakerConeGeo, speakerConeMat);
    this.rightSpeaker.rotation.x = Math.PI / 2;
    this.rightSpeaker.position.z = 0.04 * scale;
    const rCap = new THREE.Mesh(capGeo, capMat);
    rCap.position.z = 0.1 * scale;
    rightSpkGroup.add(rRim, this.rightSpeaker, rCap);
    rightSpkGroup.position.set(1.2 * scale, -0.1 * scale, 0.7 * scale);
    this.mesh.add(rightSpkGroup);

    // 4. Center Cassette Deck
    const deckGeo = new THREE.BoxGeometry(1.2 * scale, 0.8 * scale, 0.1 * scale);
    const deckMat = new THREE.MeshStandardMaterial({ color: 0x111111, metalness: 0.8, roughness: 0.4 });
    const deck = new THREE.Mesh(deckGeo, deckMat);
    deck.position.set(0, -0.2 * scale, 0.72 * scale);
    this.mesh.add(deck);

    // Cassette Window
    const winGeo = new THREE.BoxGeometry(0.9 * scale, 0.45 * scale, 0.12 * scale);
    const winMat = new THREE.MeshStandardMaterial({ color: 0x334455, transparent: true, opacity: 0.8 });
    const win = new THREE.Mesh(winGeo, winMat);
    win.position.set(0, -0.2 * scale, 0.74 * scale);
    this.mesh.add(win);

    // 5. LED Equalizer Bars (Top Center)
    const numBars = 7;
    const barWidth = 0.1 * scale;
    for (let i = 0; i < numBars; i++) {
      const barGeo = new THREE.BoxGeometry(barWidth, 0.3 * scale, 0.05 * scale);
      const color = (i < 4) ? 0x00f0ff : (i < 6) ? 0xffe600 : 0xff1a1a;
      const barMat = new THREE.MeshBasicMaterial({ color: color });
      const bar = new THREE.Mesh(barGeo, barMat);
      bar.position.set((i - (numBars - 1) / 2) * (barWidth * 1.5), 0.6 * scale, 0.72 * scale);
      this.mesh.add(bar);
      this.eqBars.push(bar);
    }

    // 6. Dual Antennas (Chrome)
    const antGeo = new THREE.CylinderGeometry(0.02 * scale, 0.04 * scale, 1.8 * scale);
    const antMat = new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 0.95, roughness: 0.1 });
    const leftAnt = new THREE.Mesh(antGeo, antMat);
    leftAnt.rotation.z = 0.35;
    leftAnt.position.set(-1.8 * scale, 1.8 * scale, -0.4 * scale);
    this.mesh.add(leftAnt);
    const rightAnt = new THREE.Mesh(antGeo, antMat);
    rightAnt.rotation.z = -0.35;
    rightAnt.position.set(1.8 * scale, 1.8 * scale, -0.4 * scale);
    this.mesh.add(rightAnt);
  }

  public update(time: number): void {
    // Pulse speakers on the beat
    const beat = Math.abs(Math.sin(time * 6.5));
    const punch = Math.pow(beat, 4) * 0.25;
    this.leftSpeaker.position.z = 0.04 + punch;
    this.rightSpeaker.position.z = 0.04 + punch;

    // Pulse equalizer bars
    this.eqBars.forEach((bar, idx) => {
      const factor = Math.abs(Math.sin(time * 8 + idx * 0.9));
      bar.scale.y = 0.2 + factor * 1.2;
    });
  }
}
