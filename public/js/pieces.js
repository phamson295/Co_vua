// Quân cờ vector (SVG) cho giao diện 2D. Mỗi kiểu có hình dạng riêng, hệ tọa độ 100x100.
// Mỗi quân gồm: `shapes` (hình khối, vẽ 2 lần: lớp viền và lớp tô) và `details` (nét chi tiết).

const BASE_CLASSIC = '<rect x="21" y="81" width="58" height="9" rx="4.5"/><rect x="28" y="74" width="44" height="9" rx="4"/>';
const BASE_MODERN = '<rect x="23" y="80" width="54" height="10" rx="3"/>';

const CLASSIC = {
  P: {
    shapes:
      '<circle cx="50" cy="27" r="12.5"/><rect x="36" y="38" width="28" height="7" rx="3.5"/>' +
      '<path d="M40 44 C41 58 35 66 28 75 H72 C65 66 59 58 60 44 Z"/>' + BASE_CLASSIC,
    details: '<path d="M43 52 C44 60 41 66 37 71" opacity=".35"/>',
  },
  R: {
    shapes:
      '<path d="M26 17 H38 V27 H44 V17 H56 V27 H62 V17 H74 V38 H26 Z"/>' +
      '<path d="M32 37 H68 L64 48 H36 Z"/><path d="M36 47 H64 L69 75 H31 Z"/>' + BASE_CLASSIC,
    details: '<path d="M32 38 H68" /><path d="M37 49 H63"/>',
  },
  B: {
    shapes:
      '<circle cx="50" cy="13" r="5.5"/><path d="M50 19 C33 28 29 43 36 53 H64 C71 43 67 28 50 19 Z"/>' +
      '<rect x="33" y="51" width="34" height="7" rx="3.5"/>' +
      '<path d="M40 57 C41 65 37 70 30 75 H70 C63 70 59 65 60 57 Z"/>' + BASE_CLASSIC,
    details: '<path d="M56 27 L45 41"/><path d="M34 54 H66"/>',
  },
  N: {
    shapes:
      '<path d="M27 76 C27 61 35 53 43 49 C37 50 29 51 25 47 C21 43 23 38 29 32 ' +
      'C34 27 39 24 39 17 L41 9 L49 15 C66 16 77 38 74 76 Z"/>' + BASE_CLASSIC,
    details:
      '<circle cx="41" cy="29" r="2.6" stroke="none" style="fill:var(--dt)"/>' +
      '<path d="M26 44 L30 45"/><path d="M50 22 C60 28 66 44 66 62" opacity=".4"/>',
  },
  Q: {
    shapes:
      '<path d="M27 75 L21 35 L36 53 L37 24 L46 52 L50 19 L54 52 L63 24 L64 53 L79 35 L73 75 Z"/>' +
      '<circle cx="21" cy="31" r="5"/><circle cx="37" cy="20" r="5"/><circle cx="50" cy="15" r="5"/>' +
      '<circle cx="63" cy="20" r="5"/><circle cx="79" cy="31" r="5"/>' +
      '<rect x="30" y="64" width="40" height="8" rx="4"/>' + BASE_CLASSIC,
    details: '<path d="M33 66 H67" opacity=".4"/>',
  },
  K: {
    shapes:
      '<rect x="45.5" y="5" width="9" height="28" rx="2.5"/><rect x="37" y="13" width="26" height="9" rx="2.5"/>' +
      '<path d="M50 32 C29 28 20 50 29 62 H71 C80 50 71 28 50 32 Z"/>' +
      '<rect x="31" y="61" width="38" height="9" rx="4"/><path d="M33 69 L29 75 H71 L67 69 Z"/>' + BASE_CLASSIC,
    details: '<path d="M33 40 C38 36 44 35 50 35" opacity=".4"/><path d="M32 65 H68" opacity=".4"/>',
  },
};

const MODERN = {
  P: {
    shapes: '<circle cx="50" cy="33" r="14"/><path d="M33 52 H67 L73 80 H27 Z"/>' + BASE_MODERN,
    details: '',
  },
  R: {
    shapes:
      '<path d="M27 18 H40 V29 H45 V18 H55 V29 H60 V18 H73 V42 H27 Z"/><rect x="33" y="41" width="34" height="40"/>' +
      BASE_MODERN,
    details: '<path d="M33 52 H67" opacity=".35"/>',
  },
  B: {
    shapes: '<path d="M50 10 L71 42 L50 56 L29 42 Z"/><path d="M37 56 H63 L70 80 H30 Z"/>' + BASE_MODERN,
    details: '<path d="M50 20 V40" opacity=".5"/>',
  },
  N: {
    shapes: '<path d="M28 80 L31 50 L24 43 L43 14 L51 25 L69 32 L74 80 Z"/>' + BASE_MODERN,
    details: '<circle cx="44" cy="30" r="2.6" stroke="none" style="fill:var(--dt)"/>',
  },
  Q: {
    shapes:
      '<path d="M26 80 L21 28 L38 46 L50 17 L62 46 L79 28 L74 80 Z"/><circle cx="50" cy="12" r="5.5"/>' + BASE_MODERN,
    details: '<path d="M33 66 H67" opacity=".4"/>',
  },
  K: {
    shapes:
      '<rect x="45" y="6" width="10" height="32" rx="1.5"/><rect x="36" y="15" width="28" height="10" rx="1.5"/>' +
      '<path d="M33 40 H67 L73 80 H27 Z"/>' + BASE_MODERN,
    details: '<path d="M33 54 H67" opacity=".4"/>',
  },
};

export const PIECE_STYLES = {
  classic: { name: 'Cổ điển', set: CLASSIC },
  modern: { name: 'Hiện đại', set: MODERN },
};

// Markup SVG của một quân: `style` là 'classic' | 'modern', `piece` dạng 'wK', 'bP'...
export function pieceSvg(style, piece) {
  const shape = PIECE_STYLES[style].set[piece[1]];
  const cls = piece[0] === 'w' ? 'pw' : 'pb';
  return (
    `<svg class="pcv ${cls}" viewBox="0 0 100 100" aria-hidden="true">` +
    `<g class="o">${shape.shapes}</g><g class="f">${shape.shapes}</g><g class="dt">${shape.details}</g></svg>`
  );
}
