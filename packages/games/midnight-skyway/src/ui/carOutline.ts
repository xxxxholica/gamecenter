import type { CarType } from '../../../../shared/carPalette';

/**
 * Neon cyber vector silhouette artwork for machine selection cards.
 * Matches the exact 3D models and orientations of each vehicle in Midnight Skyway.
 */
export function carOutlineSvg(carType: CarType): string {
  switch (carType) {
    case 'trail_j':
      return `
        <svg class="car-outline" viewBox="0 0 220 95" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <!-- Tech grid accents -->
          <line class="car-wire-grid" x1="15" y1="80" x2="205" y2="80"/>
          <path class="car-reticle" d="M 12 18 L 12 12 L 18 12"/>
          <path class="car-reticle" d="M 208 18 L 208 12 L 202 12"/>
          <path class="car-reticle" d="M 12 77 L 12 83 L 18 83"/>
          <path class="car-reticle" d="M 208 77 L 208 83 L 202 83"/>

          <!-- Trail J: Boxy rugged 4WD off-roader with roof rack & rear spare tire -->
          <!-- Roof Rack -->
          <line class="car-wire-sub" x1="92" y1="21" x2="174" y2="21"/>
          <line class="car-wire-sub" x1="98" y1="21" x2="98" y2="28"/>
          <line class="car-wire-sub" x1="133" y1="21" x2="133" y2="28"/>
          <line class="car-wire-sub" x1="168" y1="21" x2="168" y2="28"/>
          <!-- Roof Rack Fog Lights -->
          <circle class="car-accent-gold" cx="93" cy="21" r="2.2"/>
          <circle class="car-accent-gold" cx="102" cy="21" r="2.2"/>

          <!-- Rear Mounted Spare Wheel on Tailgate -->
          <circle class="car-wire-sub" cx="187" cy="52" r="11"/>
          <circle class="car-wire-dim" cx="187" cy="52" r="5"/>

          <!-- Main Chassis Outline (Glow + Solid) -->
          <path class="car-wire-glow" d="
            M 32 72 L 32 58 L 36 56 L 68 54 L 88 28 L 176 28 L 178 72
            L 165 72 A 15 15 0 0 0 135 72 L 77 72 A 15 15 0 0 0 47 72 Z
          "/>
          <path class="car-wire" d="
            M 32 72 L 32 58 L 36 56 L 68 54 L 88 28 L 176 28 L 178 72
            L 165 72 A 15 15 0 0 0 135 72 L 77 72 A 15 15 0 0 0 47 72 Z
          "/>

          <!-- Windows -->
          <polygon class="car-wire-sub" points="92,32 128,32 128,52 74,52"/>
          <polygon class="car-wire-sub" points="134,32 172,32 172,52 134,52"/>

          <!-- Door Line & Side Accent -->
          <line class="car-wire-dim" x1="131" y1="32" x2="131" y2="70"/>
          <line class="car-wire-dim" x1="72" y1="53" x2="175" y2="53"/>

          <!-- Headlight & Tail Lamp -->
          <polygon class="car-accent-headlight" points="32,59 36,58 36,66 32,67"/>
          <polygon class="car-accent-taillight" points="177,60 179,60 179,68 177,68"/>

          <!-- Wheels (Front & Rear) -->
          <circle class="car-wheel-rim" cx="62" cy="72" r="13"/>
          <circle class="car-wheel-hub" cx="62" cy="72" r="4.5"/>
          <line class="car-wheel-spoke" x1="62" y1="59" x2="62" y2="85"/>
          <line class="car-wheel-spoke" x1="49" y1="72" x2="75" y2="72"/>

          <circle class="car-wheel-rim" cx="150" cy="72" r="13"/>
          <circle class="car-wheel-hub" cx="150" cy="72" r="4.5"/>
          <line class="car-wheel-spoke" x1="150" y1="59" x2="150" y2="85"/>
          <line class="car-wheel-spoke" x1="137" y1="72" x2="163" y2="72"/>
        </svg>
      `;

    case 'cross_j':
      return `
        <svg class="car-outline" viewBox="0 0 220 95" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <!-- Tech grid accents -->
          <line class="car-wire-grid" x1="15" y1="80" x2="205" y2="80"/>
          <path class="car-reticle" d="M 12 18 L 12 12 L 18 12"/>
          <path class="car-reticle" d="M 208 18 L 208 12 L 202 12"/>
          <path class="car-reticle" d="M 12 77 L 12 83 L 18 83"/>
          <path class="car-reticle" d="M 208 77 L 208 83 L 202 83"/>

          <!-- Cross J: Suzuki Hustler style Kei Crossover SUV / Tall Wagon -->
          <!-- Roof Antenna (Angled backward) -->
          <line class="car-wire-dim" x1="166" y1="28" x2="176" y2="20"/>

          <!-- Main Chassis Outline (Glow + Solid) - Tall wagon crossover body -->
          <path class="car-wire-glow" d="
            M 28 72 L 28 56 Q 30 52 46 51 L 68 50 L 86 28 Q 90 27 100 27 L 174 27 Q 182 27 182 35 L 182 72
            L 170 72 A 14 14 0 0 0 142 72 L 76 72 A 14 14 0 0 0 48 72 Z
          "/>
          <path class="car-wire" d="
            M 28 72 L 28 56 Q 30 52 46 51 L 68 50 L 86 28 Q 90 27 100 27 L 174 27 Q 182 27 182 35 L 182 72
            L 170 72 A 14 14 0 0 0 142 72 L 76 72 A 14 14 0 0 0 48 72 Z
          "/>

          <!-- 6-Light Window Architecture (Signature Hustler feature!) -->
          <!-- Windshield A-pillar section -->
          <line class="car-wire-sub" x1="86" y1="28" x2="68" y2="50"/>
          <!-- Front Door Window -->
          <polygon class="car-wire-sub" points="88,31 116,31 116,49 72,49"/>
          <!-- B-Pillar Divider -->
          <line class="car-wire-sub" x1="119" y1="29" x2="119" y2="70"/>
          <!-- Rear Door Window -->
          <polygon class="car-wire-sub" points="122,31 150,31 150,49 122,49"/>
          <!-- C-Pillar & Quarter Glass -->
          <line class="car-wire-sub" x1="153" y1="29" x2="153" y2="49"/>
          <polygon class="car-wire-sub" points="156,32 174,32 174,49 156,49"/>

          <!-- Lower Body Door Cladding Molding (Crossover rugged protection) -->
          <rect class="car-wire-dim" x="78" y="62" width="62" height="4" rx="2"/>

          <!-- Front Round Retro Headlight (Circular with chrome bezel) -->
          <circle class="car-accent-headlight" cx="33" cy="56" r="4.5"/>
          <circle class="car-wheel-rim" cx="33" cy="56" r="4.5"/>
          <!-- Front Skid Guard & Fog Lamp -->
          <rect class="car-wire-sub" x="26" y="66" width="6" height="5" rx="1"/>
          <circle class="car-accent-gold" cx="31" cy="67" r="1.8"/>

          <!-- Tail Lamp (Vertical mini crossover lamp) -->
          <rect class="car-accent-taillight" x="180" y="52" width="2.5" height="10" rx="1"/>

          <!-- Wheels (Crossover 5-spoke style) -->
          <!-- Front Wheel -->
          <circle class="car-wheel-rim" cx="62" cy="72" r="13"/>
          <circle class="car-wheel-hub" cx="62" cy="72" r="4"/>
          <line class="car-wheel-spoke" x1="62" y1="59" x2="62" y2="85"/>
          <line class="car-wheel-spoke" x1="49" y1="72" x2="75" y2="72"/>
          <!-- Rear Wheel -->
          <circle class="car-wheel-rim" cx="156" cy="72" r="13"/>
          <circle class="car-wheel-hub" cx="156" cy="72" r="4"/>
          <line class="car-wheel-spoke" x1="156" y1="59" x2="156" y2="85"/>
          <line class="car-wheel-spoke" x1="143" y1="72" x2="169" y2="72"/>
        </svg>
      `;

    case 'combat_sedan':
      return `
        <svg class="car-outline" viewBox="0 0 220 95" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <!-- Tech grid accents -->
          <line class="car-wire-grid" x1="15" y1="80" x2="205" y2="80"/>
          <path class="car-reticle" d="M 12 18 L 12 12 L 18 12"/>
          <path class="car-reticle" d="M 208 18 L 208 12 L 202 12"/>
          <path class="car-reticle" d="M 12 77 L 12 83 L 18 83"/>
          <path class="car-reticle" d="M 208 77 L 208 83 L 202 83"/>

          <!-- Combat Sedan: Heavy Armored Muscle Sedan with Roof Twin Guns & Rear Upright Exhaust Stacks -->

          <!-- Roof Twin Heavy Machine Guns (Pointing Forward) -->
          <g class="car-turret-group">
            <rect class="car-weapon-body" x="108" y="24" width="22" height="6" rx="1"/>
            <!-- Twin Barrels pointing forward -->
            <line class="car-weapon-barrel" x1="108" y1="25.5" x2="84" y2="25.5"/>
            <line class="car-weapon-barrel" x1="108" y1="28.5" x2="84" y2="28.5"/>
            <!-- Muzzle Brakes -->
            <rect class="car-weapon-muzzle" x="82" y="24.5" width="3" height="5"/>
            <!-- Targeting Laser Reticle Glow -->
            <circle class="car-accent-red" cx="76" cy="27" r="1.8"/>
            <line class="car-laser-line" x1="82" y1="27" x2="68" y2="27"/>
          </g>

          <!-- Rear Upright Twin Exhaust Stacks + Neon Flame Accents -->
          <g class="car-exhaust-flames">
            <line class="car-pipe-line" x1="156" y1="46" x2="160" y2="20"/>
            <line class="car-pipe-line" x1="160" y1="46" x2="164" y2="20"/>
            <ellipse class="car-pipe-rim" cx="160" cy="19" rx="2" ry="1"/>
            <ellipse class="car-pipe-rim" cx="164" cy="19" rx="2" ry="1"/>
            <!-- Fluttering Neon Exhaust Flames -->
            <path class="car-flame-outer" d="M 158 19 Q 157 10 160 5 Q 163 11 161 19 Z"/>
            <path class="car-flame-outer" d="M 162 19 Q 162 9 165 4 Q 167 10 165 19 Z"/>
            <path class="car-flame-inner" d="M 159 19 Q 158.5 13 160 9 Q 161.5 13 160.5 19 Z"/>
            <path class="car-flame-inner" d="M 163 19 Q 163 12 164.5 8 Q 166 12 164.5 19 Z"/>
          </g>

          <!-- Heavy Front Ram Bumper (Spiked Wedge) -->
          <polygon class="car-ram-bumper" points="18,74 24,56 28,56 28,74"/>
          <line class="car-wire-sub" x1="18" y1="65" x2="13" y2="65"/>

          <!-- Main Heavy Chassis Outline (Glow + Solid) -->
          <path class="car-wire-glow" d="
            M 28 73 L 28 56 L 76 52 L 102 32 L 154 32 L 188 48 L 192 73
            L 182 73 A 15 15 0 0 0 152 73 L 74 73 A 15 15 0 0 0 44 73 Z
          "/>
          <path class="car-wire" d="
            M 28 73 L 28 56 L 76 52 L 102 32 L 154 32 L 188 48 L 192 73
            L 182 73 A 15 15 0 0 0 152 73 L 74 73 A 15 15 0 0 0 44 73 Z
          "/>

          <!-- Armored Windows -->
          <polygon class="car-wire-sub" points="106,36 126,36 126,50 82,50"/>
          <polygon class="car-wire-sub" points="130,36 150,36 150,50 130,50"/>
          <line class="car-wire-dim" x1="90" y1="43" x2="125" y2="43"/>
          <line class="car-wire-dim" x1="131" y1="43" x2="149" y2="43"/>

          <!-- Armored Plating & Bolt Studs -->
          <line class="car-wire-dim" x1="30" y1="64" x2="190" y2="64"/>
          <circle class="car-armor-bolt" cx="34" cy="64" r="1.2"/>
          <circle class="car-armor-bolt" cx="80" cy="64" r="1.2"/>
          <circle class="car-armor-bolt" cx="120" cy="64" r="1.2"/>
          <circle class="car-armor-bolt" cx="186" cy="64" r="1.2"/>

          <!-- Menacing Red Armored Headlight -->
          <polygon class="car-accent-red-lamp" points="28,58 36,57 36,63 28,64"/>
          <polygon class="car-accent-taillight" points="189,51 192,52 192,58 189,57"/>

          <!-- Heavy Reinforced Wheels -->
          <circle class="car-wheel-rim" cx="59" cy="73" r="14"/>
          <circle class="car-wheel-hub" cx="59" cy="73" r="5"/>
          <circle class="car-wire-dim" cx="59" cy="73" r="9"/>

          <circle class="car-wheel-rim" cx="167" cy="73" r="14"/>
          <circle class="car-wheel-hub" cx="167" cy="73" r="5"/>
          <circle class="car-wire-dim" cx="167" cy="73" r="9"/>
        </svg>
      `;

    case 'missile_truck_j':
      return `
        <svg class="car-outline" viewBox="0 0 220 95" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
          <!-- Tech grid accents -->
          <line class="car-wire-grid" x1="15" y1="80" x2="205" y2="80"/>
          <path class="car-reticle" d="M 12 18 L 12 12 L 18 12"/>
          <path class="car-reticle" d="M 208 18 L 208 12 L 202 12"/>
          <path class="car-reticle" d="M 12 77 L 12 83 L 18 83"/>
          <path class="car-reticle" d="M 208 77 L 208 83 L 202 83"/>

          <!-- Truck J MLRS: High-lift Kei truck with MLRS pod tilted UP-FORWARD (facing front) -->

          <!-- 8-Cell MLRS Rocket Launch Pod:
               Base on rear bed (x≈160), tilted diagonally UPWARDS towards FRONT/CAB (x≈98) -->
          <!-- Turntable & Hydraulic Piston on Bed -->
          <rect class="car-wire-sub" x="142" y="54" width="24" height="4" rx="1"/>
          <line class="car-wire-sub" x1="146" y1="54" x2="128" y2="38"/>

          <!-- Main Launch Pod (Tilted ~22 deg UP towards the FRONT / LEFT) -->
          <!-- Pod Body Shell -->
          <polygon class="car-pod-box" points="
            104,17  168,43  160,59  96,33
          "/>
          <!-- Pod Inner Body -->
          <polygon class="car-pod-inner" points="
            105,19  165,43  158,57  98,33
          "/>

          <!-- Longitudinal Pod Ribs -->
          <line class="car-wire-dim" x1="102" y1="22" x2="164" y2="47"/>
          <line class="car-wire-dim" x1="100" y1="27" x2="162" y2="52"/>

          <!-- Front Launch Aperture (Face at top-left, pointing forward & upward over cab) -->
          <!-- Top Row Missile Cells & Warheads -->
          <circle class="car-rocket-cell" cx="102" cy="20" r="2.5"/>
          <circle class="car-warhead-tip" cx="102" cy="20" r="1.3"/>
          <circle class="car-rocket-cell" cx="99" cy="24" r="2.5"/>
          <circle class="car-warhead-tip" cx="99" cy="24" r="1.3"/>
          <circle class="car-rocket-cell" cx="96" cy="28" r="2.5"/>
          <circle class="car-warhead-tip" cx="96" cy="28" r="1.3"/>
          <circle class="car-rocket-cell" cx="93" cy="32" r="2.5"/>
          <circle class="car-warhead-tip" cx="93" cy="32" r="1.3"/>

          <!-- Bottom Row Missile Cells & Warheads -->
          <circle class="car-rocket-cell" cx="106" cy="23" r="2.2"/>
          <circle class="car-warhead-tip" cx="106" cy="23" r="1.1"/>
          <circle class="car-rocket-cell" cx="103" cy="27" r="2.2"/>
          <circle class="car-warhead-tip" cx="103" cy="27" r="1.1"/>
          <circle class="car-rocket-cell" cx="100" cy="31" r="2.2"/>
          <circle class="car-warhead-tip" cx="100" cy="31" r="1.1"/>
          <circle class="car-rocket-cell" cx="97" cy="35" r="2.2"/>
          <circle class="car-warhead-tip" cx="97" cy="35" r="1.1"/>

          <!-- High-Lift Offroad Truck Chassis -->
          <!-- Cab (Front on the Left) -->
          <path class="car-wire-glow" d="
            M 24 70 L 26 50 L 40 32 L 82 32 L 84 58 L 192 58 L 192 70
            L 180 70 A 16 16 0 0 0 148 70 L 78 70 A 16 16 0 0 0 46 70 Z
          "/>
          <path class="car-wire" d="
            M 24 70 L 26 50 L 40 32 L 82 32 L 84 58 L 192 58 L 192 70
            L 180 70 A 16 16 0 0 0 148 70 L 78 70 A 16 16 0 0 0 46 70 Z
          "/>

          <!-- Cab Window -->
          <polygon class="car-wire-sub" points="43,36 78,36 78,50 34,50"/>
          <!-- Cab Door Line -->
          <line class="car-wire-dim" x1="80" y1="34" x2="80" y2="68"/>

          <!-- Truck Bed Floor & Heavy Roll-bar Behind Cab -->
          <line class="car-wire" x1="84" y1="58" x2="192" y2="58"/>
          <path class="car-wire-sub" d="M 86 58 L 90 34 L 98 34 L 102 58"/>

          <!-- Front Bumper & Bull-bar -->
          <path class="car-wire-sub" d="M 22 70 L 22 54 L 27 54"/>
          <circle class="car-accent-gold" cx="24" cy="56" r="2"/>

          <!-- High-Lift Chunky Off-road Wheels -->
          <!-- Front Wheel -->
          <circle class="car-wheel-rim" cx="62" cy="70" r="15"/>
          <circle class="car-wheel-hub" cx="62" cy="70" r="5"/>
          <line class="car-wheel-spoke" x1="62" y1="56" x2="62" y2="84"/>
          <line class="car-wheel-spoke" x1="48" y1="70" x2="76" y2="70"/>
          <!-- Rear Wheel -->
          <circle class="car-wheel-rim" cx="164" cy="70" r="15"/>
          <circle class="car-wheel-hub" cx="164" cy="70" r="5"/>
          <line class="car-wheel-spoke" x1="164" y1="56" x2="164" y2="84"/>
          <line class="car-wheel-spoke" x1="150" y1="70" x2="178" y2="70"/>
        </svg>
      `;
  }
}
