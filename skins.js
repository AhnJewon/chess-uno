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
  const svg = inner => `<svg viewBox="0 0 45 45" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${inner}</svg>`;

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
    }
  };

  const boards = {
    classic: { label: '클래식', light: '#f0e8d6', dark: '#9eb889' },
    wood: { label: '나무', light: '#f0d9b5', dark: '#b58863' },
    ocean: { label: '바다', light: '#e3e9ec', dark: '#7f9cad' },
    stone: { label: '돌', light: '#e8e6e1', dark: '#a3a19b' }
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
