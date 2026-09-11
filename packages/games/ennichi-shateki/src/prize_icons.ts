// Vector SVG illustrations and display names for shooting gallery prizes

export function getPrizeShortName(name: string, type: string): string {
  switch (type) {
    case 'daruma':
      return '金ダルマ';
    case 'treasure':
      return '千両箱';
    case 'manekineko':
      return '招き猫';
    case 'tv':
      return 'レトロTV';
    case 'robot':
      return 'ロボット';
    case 'watergun':
      return '水鉄砲';
    case 'juicecan':
      return 'サイダー缶';
    case 'snackbox':
      return '駄菓子箱';
    case 'ramune':
      return 'ラムネ瓶';
    case 'caramel':
      return 'キャラメル';
    case 'ufo':
      return 'UFO';
    case 'duck':
      return 'アヒル';
    case 'balloon':
      return 'ふうせん';
    case 'bear':
      return 'クマぬいぐるみ';
    case 'kitsune':
      return '狐のお面';
    case 'sofubi':
      return 'ソフビ人形';
    default:
      return name.length > 5 ? name.slice(0, 5) : name;
  }
}

export function getPrizeSvg(type: string): string {
  switch (type) {
    case 'daruma':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <circle cx="24" cy="25" r="21" fill="#d32f2f" stroke="#ffd700" stroke-width="2"/>
        <ellipse cx="24" cy="18" rx="14" ry="11" fill="#fffdfa"/>
        <path d="M14 13 Q20 11 22 14" stroke="#111" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <path d="M34 13 Q28 11 26 14" stroke="#111" stroke-width="2.5" fill="none" stroke-linecap="round"/>
        <circle cx="18" cy="19" r="2.5" fill="#111"/>
        <circle cx="30" cy="19" r="2.5" fill="#111"/>
        <path d="M19 24 Q24 22 29 24" stroke="#111" stroke-width="2" fill="none"/>
        <circle cx="24" cy="34" r="7" fill="#ffd700"/>
        <text x="24" y="37" font-size="8" font-weight="900" fill="#990000" text-anchor="middle" font-family="sans-serif">福</text>
      </svg>`;

    case 'treasure':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <rect x="6" y="16" width="36" height="24" rx="3" fill="#2d1b0d" stroke="#ffcc00" stroke-width="2"/>
        <path d="M6 18 Q24 8 42 18 L42 22 Q24 13 6 22 Z" fill="#4a2e18" stroke="#ffcc00" stroke-width="1.5"/>
        <rect x="20" y="21" width="8" height="11" rx="1.5" fill="#ffcc00"/>
        <circle cx="24" cy="26" r="2" fill="#111"/>
        <ellipse cx="14" cy="32" rx="4" ry="6" fill="#ffd700" stroke="#b8860b" stroke-width="1"/>
        <ellipse cx="34" cy="32" rx="4" ry="6" fill="#ffd700" stroke="#b8860b" stroke-width="1"/>
      </svg>`;

    case 'manekineko':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <ellipse cx="24" cy="27" rx="16" ry="17" fill="#ffffff" stroke="#ffcc00" stroke-width="2"/>
        <polygon points="12,13 16,4 23,12" fill="#fff" stroke="#ffcc00" stroke-width="1.5"/>
        <polygon points="14,12 16,6 21,12" fill="#ff7799"/>
        <polygon points="36,13 32,4 25,12" fill="#fff" stroke="#ffcc00" stroke-width="1.5"/>
        <polygon points="34,12 32,6 27,12" fill="#ff7799"/>
        <ellipse cx="36" cy="18" rx="5" ry="9" fill="#fff" stroke="#ffcc00" stroke-width="1.5"/>
        <circle cx="18" cy="21" r="2" fill="#111"/>
        <circle cx="28" cy="21" r="2" fill="#111"/>
        <path d="M21 25 Q23 27 25 25" stroke="#111" stroke-width="1.5" fill="none"/>
        <rect x="14" y="29" width="18" height="4" rx="2" fill="#d32f2f"/>
        <circle cx="23" cy="33" r="3" fill="#ffd700"/>
      </svg>`;

    case 'tv':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <line x1="20" y1="12" x2="12" y2="4" stroke="#ccc" stroke-width="2"/>
        <line x1="24" y1="12" x2="32" y2="4" stroke="#ccc" stroke-width="2"/>
        <rect x="6" y="12" width="36" height="28" rx="4" fill="#5c381e" stroke="#2a180b" stroke-width="2"/>
        <rect x="10" y="15" width="23" height="22" rx="3" fill="#3a4b5c" stroke="#1b2530" stroke-width="1.5"/>
        <line x1="12" y1="20" x2="31" y2="20" stroke="#557088" stroke-width="1"/>
        <line x1="12" y1="26" x2="31" y2="26" stroke="#557088" stroke-width="1"/>
        <circle cx="38" cy="20" r="3" fill="#ffcc00"/>
        <circle cx="38" cy="29" r="3" fill="#888"/>
      </svg>`;

    case 'robot':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <line x1="24" y1="10" x2="24" y2="4" stroke="#00e5ff" stroke-width="2"/>
        <circle cx="24" cy="3" r="2.5" fill="#ff3b30"/>
        <rect x="12" y="10" width="24" height="20" rx="3" fill="#546e7a" stroke="#cfd8dc" stroke-width="1.5"/>
        <rect x="16" y="14" width="5" height="5" fill="#ffeb3b"/>
        <rect x="27" y="14" width="5" height="5" fill="#ffeb3b"/>
        <rect x="16" y="23" width="16" height="3" fill="#e53935"/>
        <rect x="10" y="31" width="28" height="12" rx="2" fill="#37474f" stroke="#cfd8dc" stroke-width="1.5"/>
        <circle cx="18" cy="37" r="3" fill="#00e5ff"/>
        <circle cx="30" cy="37" r="3" fill="#76ff03"/>
      </svg>`;

    case 'watergun':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <rect x="10" y="10" width="22" height="9" rx="4.5" fill="#00b0ff" stroke="#fff" stroke-width="1.5"/>
        <path d="M8 20 L38 20 L38 27 L28 27 L25 38 L18 38 L20 27 L8 27 Z" fill="#ff3d00" stroke="#ffe57f" stroke-width="1.5"/>
        <rect x="4" y="22" width="5" height="3" fill="#ffd600"/>
        <path d="M22 28 Q24 33 25 33" stroke="#ffd600" stroke-width="2.5" fill="none"/>
      </svg>`;

    case 'juicecan':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <rect x="14" y="8" width="20" height="32" rx="3" fill="#0288d1" stroke="#cfd8dc" stroke-width="2"/>
        <ellipse cx="24" cy="8" rx="10" ry="2.5" fill="#eceff1"/>
        <ellipse cx="24" cy="40" rx="10" ry="2.5" fill="#b0bec5"/>
        <path d="M15 20 Q24 16 33 20 L33 29 Q24 33 15 29 Z" fill="#e0f7fa" opacity="0.9"/>
        <polygon points="24,19 26,23 30,23 27,26 28,30 24,27 20,30 21,26 18,23 22,23" fill="#ffeb3b"/>
      </svg>`;

    case 'snackbox':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <rect x="10" y="10" width="28" height="30" rx="2" fill="#d32f2f" stroke="#ffeb3b" stroke-width="2"/>
        <polygon points="10,10 24,20 38,10" fill="#b71c1c"/>
        <circle cx="24" cy="27" r="9" fill="#ffeb3b"/>
        <text x="24" y="30" font-size="7" font-weight="900" fill="#b71c1c" text-anchor="middle" font-family="sans-serif">大入</text>
      </svg>`;

    case 'ramune':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <path d="M20 7 L28 7 L28 11 L26 15 L28 20 L27 38 L21 38 L20 20 L22 15 L20 11 Z" fill="#4dd0e1" stroke="#00838f" stroke-width="1.5"/>
        <circle cx="24" cy="17" r="2.5" fill="#e0f7fa"/>
        <rect x="21" y="5" width="6" height="3" rx="1" fill="#00acc1"/>
        <rect x="21" y="25" width="6" height="8" rx="1" fill="#ffffff" opacity="0.9"/>
        <text x="24" y="31" font-size="5" font-weight="900" fill="#00838f" text-anchor="middle" font-family="sans-serif">波</text>
      </svg>`;

    case 'caramel':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <rect x="11" y="9" width="26" height="30" rx="3" fill="#f57c00" stroke="#fff9c4" stroke-width="2"/>
        <rect x="15" y="13" width="18" height="22" rx="2" fill="#fff9c4"/>
        <circle cx="24" cy="24" r="6" fill="#d84315"/>
        <polygon points="24,19 25.5,22.5 29,23 26.5,25.5 27,29 24,27 21,29 21.5,25.5 19,23 22.5,22.5" fill="#fff9c4"/>
      </svg>`;

    case 'ufo':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <ellipse cx="24" cy="20" rx="11" ry="9" fill="#00e5ff" opacity="0.85"/>
        <ellipse cx="24" cy="27" rx="21" ry="8" fill="#7e57c2" stroke="#ffeb3b" stroke-width="1.5"/>
        <ellipse cx="24" cy="25" rx="15" ry="4" fill="#b39ddb"/>
        <circle cx="10" cy="27" r="2" fill="#ff1744"/>
        <circle cx="17" cy="30" r="2" fill="#00e676"/>
        <circle cx="24" cy="31" r="2" fill="#ffea00"/>
        <circle cx="31" cy="30" r="2" fill="#00e676"/>
        <circle cx="38" cy="27" r="2" fill="#ff1744"/>
      </svg>`;

    case 'duck':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <path d="M12 28 Q12 20 22 20 Q24 14 30 14 Q36 14 37 19 Q43 20 41 24 Q37 25 35 24 Q37 32 26 35 Q14 36 12 28 Z" fill="#ffd600" stroke="#ff9100" stroke-width="1.5"/>
        <polygon points="37,17 46,19 37,22" fill="#ff6d00"/>
        <circle cx="31" cy="18" r="2" fill="#111"/>
        <circle cx="32" cy="17.5" r="0.6" fill="#fff"/>
        <circle cx="22" cy="28" r="6" fill="#fff" stroke="#d50000" stroke-width="1.5"/>
        <circle cx="22" cy="28" r="2.5" fill="#d50000"/>
      </svg>`;

    case 'balloon':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <path d="M13 22 C13 11 35 11 35 22 C35 30 25 34 24 37 C23 34 13 30 13 22 Z" fill="#ff1744" stroke="#ffcdd2" stroke-width="1.5"/>
        <path d="M24 12 C29 12 35 17 35 22 C35 30 25 34 24 37 Z" fill="#ffffff" opacity="0.9"/>
        <polygon points="21,37 27,37 24,40" fill="#d50000"/>
        <path d="M24 40 Q21 44 24 46" stroke="#fff" stroke-width="1" fill="none"/>
        <ellipse cx="18" cy="18" rx="2" ry="5" fill="#fff" opacity="0.6" transform="rotate(-25 18 18)"/>
      </svg>`;

    case 'bear':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <circle cx="15" cy="13" r="6" fill="#8d6e63"/>
        <circle cx="15" cy="13" r="3.5" fill="#d7ccc8"/>
        <circle cx="33" cy="13" r="6" fill="#8d6e63"/>
        <circle cx="33" cy="13" r="3.5" fill="#d7ccc8"/>
        <circle cx="24" cy="26" r="17" fill="#8d6e63"/>
        <ellipse cx="24" cy="29" rx="8" ry="6" fill="#d7ccc8"/>
        <circle cx="18" cy="23" r="2.5" fill="#111"/>
        <circle cx="30" cy="23" r="2.5" fill="#111"/>
        <ellipse cx="24" cy="27" rx="3.5" ry="2.5" fill="#111"/>
      </svg>`;

    case 'kitsune':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <polygon points="12,18 10,4 21,14" fill="#fff" stroke="#d50000" stroke-width="1.5"/>
        <polygon points="36,18 38,4 27,14" fill="#fff" stroke="#d50000" stroke-width="1.5"/>
        <polygon points="11,6 12,12 18,12" fill="#d50000"/>
        <polygon points="37,6 36,12 30,12" fill="#d50000"/>
        <ellipse cx="24" cy="27" rx="16" ry="17" fill="#ffffff" stroke="#222" stroke-width="1.5"/>
        <path d="M14 24 Q18 20 22 24" stroke="#d50000" stroke-width="2" fill="none"/>
        <path d="M34 24 Q30 20 26 24" stroke="#d50000" stroke-width="2" fill="none"/>
        <circle cx="18" cy="24" r="1.8" fill="#111"/>
        <circle cx="30" cy="24" r="1.8" fill="#111"/>
        <circle cx="24" cy="35" r="2" fill="#111"/>
        <circle cx="24" cy="18" r="2.5" fill="#d50000"/>
      </svg>`;

    case 'sofubi':
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <ellipse cx="24" cy="26" rx="16" ry="17" fill="#43a047" stroke="#2e7d32" stroke-width="2"/>
        <ellipse cx="24" cy="30" rx="10" ry="10" fill="#c8e6c9"/>
        <polygon points="16,12 18,5 21,12" fill="#ffd600"/>
        <polygon points="32,12 30,5 27,12" fill="#ffd600"/>
        <circle cx="18" cy="21" r="3" fill="#ffeb3b"/>
        <circle cx="18" cy="21" r="1.5" fill="#111"/>
        <circle cx="30" cy="21" r="3" fill="#ffeb3b"/>
        <circle cx="30" cy="21" r="1.5" fill="#111"/>
        <path d="M19 28 Q24 33 29 28" stroke="#111" stroke-width="1.5" fill="none"/>
      </svg>`;

    default:
      return `<svg viewBox="0 0 48 48" width="40" height="40">
        <circle cx="24" cy="24" r="18" fill="#ffd700" stroke="#ff9100" stroke-width="2"/>
        <polygon points="24,12 27,20 36,20 29,25 32,34 24,28 16,34 19,25 12,20 21,20" fill="#fff"/>
      </svg>`;
  }
}
