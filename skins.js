// 기물·보드 스킨. 기물 그림은 직접 그린 SVG라 외부 라이선스가 없다.
// 스킨은 각자 화면에만 적용되고 localStorage에 저장된다.
const ChessSkins = (() => {
  const palette = color => color === 'w'
    ? { fill: '#fbf8ee', stroke: '#3b3d36', accent: '#d5aa55' }
    : { fill: '#353b35', stroke: '#f3efe2', accent: '#d5aa55' };

  const base = c => `<rect x="10" y="36" width="25" height="5" rx="2" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6"/>`;
  const minimalShapes = {
    P: c => `${base(c)}<path d="M15 36 Q16 26 22.5 22 Q29 26 30 36 Z" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6"/><circle cx="22.5" cy="15" r="6" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6"/>`,
    R: c => `${base(c)}<rect x="14" y="18" width="17" height="18" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6"/><path d="M12 18 V9 h4 v4 h4 v-4 h5 v4 h4 v-4 h4 v9 Z" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6" stroke-linejoin="round"/>`,
    B: c => `${base(c)}<path d="M15 36 Q14 25 22.5 12 Q31 25 30 36 Z" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6"/><circle cx="22.5" cy="9" r="3" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6"/><path d="M25.5 19 L20 26" stroke="${c.stroke}" stroke-width="1.8" stroke-linecap="round"/>`,
    N: c => `${base(c)}<path d="M14 36 C14 28 17 24 20.5 21 L15.5 19.5 C14.5 15 18 10 24 9 C30.5 9 33.5 15 32.5 22 C31.5 28 30.5 32 30.5 36 Z" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="23" cy="15" r="1.4" fill="${c.stroke}"/>`,
    Q: c => `${base(c)}<path d="M13 36 L11 17 L17 25 L22.5 12 L28 25 L34 17 L32 36 Z" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6" stroke-linejoin="round"/><circle cx="11" cy="15.5" r="2.2" fill="${c.accent}" stroke="${c.stroke}" stroke-width="1"/><circle cx="22.5" cy="10.5" r="2.2" fill="${c.accent}" stroke="${c.stroke}" stroke-width="1"/><circle cx="34" cy="15.5" r="2.2" fill="${c.accent}" stroke="${c.stroke}" stroke-width="1"/>`,
    K: c => `${base(c)}<path d="M14 36 Q13 26 16 20 H29 Q32 26 31 36 Z" fill="${c.fill}" stroke="${c.stroke}" stroke-width="1.6" stroke-linejoin="round"/><rect x="21" y="5" width="3" height="12" rx="1" fill="${c.accent}" stroke="${c.stroke}" stroke-width="1"/><rect x="17" y="8.5" width="11" height="3" rx="1" fill="${c.accent}" stroke="${c.stroke}" stroke-width="1"/>`
  };
  const hanja = { K: '王', Q: '后', R: '車', B: '象', N: '馬', P: '兵' };
  const svg = (inner, style = '') => `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"${style ? ` style="${style}"` : ''}>${inner}</svg>`;

  // 픽셀: 9×9 도트(한 칸 5px). 외곽선 층을 먼저 깔고 위에 채운다.
  const pixelMaps = {
    P: ['.........', '.........', '...###...', '...###...', '....#....', '...###...', '..#####..', '.#######.', '.........'],
    R: ['.........', '.##.#.##.', '.#######.', '..#####..', '..#####..', '..#####..', '.#######.', '#########', '.........'],
    N: ['.........', '...###...', '..#####..', '.###.##..', '.#######.', '....###..', '...####..', '.#######.', '.........'],
    B: ['....#....', '...###...', '..##.##..', '..#.###..', '..#####..', '...###...', '..#####..', '.#######.', '.........'],
    Q: ['#...#...#', '##.###.##', '#########', '.#######.', '..#####..', '..#####..', '.#######.', '#########', '.........'],
    K: ['....#....', '...###...', '....#....', '.#######.', '#########', '.#######.', '..#####..', '.#######.', '#########']
  };
  const pixel = (type, color) => {
    const c = color === 'w' ? { fill: '#f6f2e4', edge: '#3b3d36' } : { fill: '#3a4140', edge: '#e9e3d0' };
    const cells = [];
    pixelMaps[type].forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '#') cells.push([x * 5, y * 5]); }));
    return svg(cells.map(([x, y]) => `<rect x="${x - 0.9}" y="${y - 0.9}" width="6.8" height="6.8" fill="${c.edge}"/>`).join('') + cells.map(([x, y]) => `<rect x="${x}" y="${y}" width="5" height="5" fill="${c.fill}"/>`).join(''), 'shape-rendering:crispEdges');
  };

  // 네온·은과 금은 미니멀 모양을 다른 색으로 칠한다.
  const neon = (type, color) => {
    const glow = color === 'w' ? '#5ee7ff' : '#ff5ec8';
    return svg(minimalShapes[type]({ fill: color === 'w' ? 'rgba(94,231,255,.14)' : 'rgba(255,94,200,.14)', stroke: glow, accent: glow }), `filter:drop-shadow(0 0 2px ${glow}) drop-shadow(0 0 5px ${glow})`);
  };
  const metal = (type, color) => svg(minimalShapes[type](color === 'w'
    ? { fill: '#e6e9ee', stroke: '#5d6470', accent: '#ffffff' }
    : { fill: '#d6a736', stroke: '#6b4c10', accent: '#fff0b3' }));

  // 우노 카드: 흰색은 빨강, 검은색은 파랑 카드 위 흰 타원에 기물 문양
  const glyph = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
  const unoCard = (type, color) => {
    const main = color === 'w' ? '#d8433b' : '#2b6cb5';
    return svg(`<rect x="8" y="3.5" width="29" height="38" rx="5" fill="${main}" stroke="#ffffff" stroke-width="2.2"/><ellipse cx="22.5" cy="22.5" rx="11.5" ry="15" transform="rotate(28 22.5 22.5)" fill="#ffffff"/><text x="22.5" y="29" text-anchor="middle" font-size="19" fill="${main}" font-family="'Segoe UI Symbol','Noto Sans Symbols2',serif">${glyph[type]}</text><text x="11.5" y="11" font-size="6.5" font-weight="800" fill="#ffffff" font-family="sans-serif">${type}</text>`);
  };

  // 동물: 흰색은 크림색 말, 검은색은 진회색 말
  const animal = { K: '🦁', Q: '🦅', R: '🐘', B: '🦉', N: '🐴', P: '🐭' };
  const animalToken = (type, color) => svg(`<circle cx="22.5" cy="22.5" r="19.5" fill="${color === 'w' ? '#fff6e2' : '#363c3a'}" stroke="${color === 'w' ? '#c79a2c' : '#9fb0c4'}" stroke-width="2.6"/><text x="22.5" y="30.5" text-anchor="middle" font-size="22">${animal[type]}</text>`);

  const pieceSets = {
    unicode: { label: '기본 문자', render: null },
    minimal: { label: '미니멀', render: (type, color) => svg(minimalShapes[type](palette(color))) },
    janggi: {
      label: '장기풍',
      render: (type, color) => {
        const ring = color === 'w' ? '#a8452f' : '#2f5a8a';
        const c = palette(color);
        return svg(`<circle cx="22.5" cy="22.5" r="19" fill="${color === 'w' ? '#f6ecd2' : '#e9e2cf'}" stroke="${ring}" stroke-width="2.4"/><circle cx="22.5" cy="22.5" r="15" fill="none" stroke="${ring}" stroke-width="0.9" opacity=".6"/><text x="22.5" y="29.5" text-anchor="middle" font-size="19" font-weight="700" font-family="serif" fill="${ring}">${hanja[type]}</text>${type === 'K' ? `<circle cx="22.5" cy="22.5" r="21" fill="none" stroke="${c.accent}" stroke-width="1.4"/>` : ''}`);
      }
    },
    pixel: { label: '픽셀', render: pixel },
    neon: { label: '네온', render: neon },
    metal: { label: '은과 금', render: metal },
    uno: { label: '우노 카드', render: unoCard },
    animal: { label: '동물', render: animalToken }
  };

  const boards = {
    classic: { label: '클래식', light: '#f0e8d6', dark: '#9eb889' },
    wood: { label: '나무', light: '#f0d9b5', dark: '#b58863' },
    ocean: { label: '바다', light: '#e3e9ec', dark: '#7f9cad' },
    stone: { label: '돌', light: '#e8e6e1', dark: '#a3a19b' },
    blossom: { label: '벚꽃', light: '#fbeaee', dark: '#dc9cae' },
    mint: { label: '민트', light: '#e7f5ef', dark: '#7fc0a8' },
    lavender: { label: '라벤더', light: '#efeaf8', dark: '#a493c9' },
    desert: { label: '사막', light: '#f5e6c8', dark: '#cfa468' },
    neonNight: { label: '네온 밤', light: '#2a3150', dark: '#1a1f36' },
    unoRed: { label: '우노 레드', light: '#fff1cf', dark: '#df5a4b' }
  };

  const KEY = 'chessUnoSkin';
  function load() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) || '{}');
      return { pieces: pieceSets[saved.pieces] ? saved.pieces : 'unicode', board: boards[saved.board] ? saved.board : 'classic' };
    } catch { return { pieces: 'unicode', board: 'classic' }; }
  }
  function save(skin) { try { localStorage.setItem(KEY, JSON.stringify(skin)); } catch {} }

  return { pieceSets, boards, load, save };
})();
