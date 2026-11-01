// Nhân vật chibi hiện giữa màn hình khi chiếu tướng: mỗi loại quân một hình, màu theo bên đang chiếu.

const PALETTE = {
  w: { body: '#fff7ea', shade: '#eadcc2', line: '#3b2a1a', cheek: '#ffaaaa' },
  b: { body: '#46434f', shade: '#2f2d37', line: '#111015', cheek: '#ff8ea4' },
};
const GOLD = '#f6c443';

// Khuôn mặt chibi: mắt to long lanh, lông mày quyết tâm, miệng hét, má hồng. (fx, fy) là tâm khuôn mặt.
function face(p, fx = 100, fy = 100, scale = 1) {
  const e = (dx) => fx + dx * scale;
  const y = (dy) => fy + dy * scale;
  return (
    `<g stroke-linecap="round" stroke-linejoin="round">` +
    `<ellipse cx="${e(-30)}" cy="${y(14)}" rx="${9 * scale}" ry="${5.5 * scale}" fill="${p.cheek}" opacity="0.75"/>` +
    `<ellipse cx="${e(30)}" cy="${y(14)}" rx="${9 * scale}" ry="${5.5 * scale}" fill="${p.cheek}" opacity="0.75"/>` +
    [-18, 18]
      .map(
        (dx) =>
          `<ellipse cx="${e(dx)}" cy="${y(-4)}" rx="${10 * scale}" ry="${12.5 * scale}" fill="#fff" stroke="${p.line}" stroke-width="${3 * scale}"/>` +
          `<ellipse cx="${e(dx + 1.5)}" cy="${y(-2)}" rx="${6.5 * scale}" ry="${8.5 * scale}" fill="#2a1d12"/>` +
          `<circle cx="${e(dx - 1)}" cy="${y(-6)}" r="${2.8 * scale}" fill="#fff"/>` +
          `<circle cx="${e(dx + 4)}" cy="${y(2)}" r="${1.3 * scale}" fill="#fff"/>`,
      )
      .join('') +
    `<path d="M${e(-31)} ${y(-24)} L${e(-9)} ${y(-17)}M${e(31)} ${y(-24)} L${e(9)} ${y(-17)}" stroke="${p.line}" stroke-width="${4.5 * scale}" fill="none"/>` +
    `<path d="M${e(-10)} ${y(16)} Q${e(0)} ${y(34)} ${e(10)} ${y(16)} Z" fill="#8e2a3b" stroke="${p.line}" stroke-width="${3 * scale}"/>` +
    `<path d="M${e(-4)} ${y(25)} Q${e(0)} ${y(29)} ${e(4)} ${y(25)}" fill="#ff7d8f"/>` +
    `</g>`
  );
}

// Tay giơ kiếm: tư thế "tấn công" đáng yêu.
function sword(p) {
  return (
    `<g stroke-linecap="round">` +
    `<path d="M150 150 L176 70" stroke="${p.line}" stroke-width="11"/>` +
    `<path d="M150 150 L176 70" stroke="#dfe7f1" stroke-width="6"/>` +
    `<path d="M141 138 L162 145" stroke="${p.line}" stroke-width="7"/>` +
    `<path d="M141 138 L162 145" stroke="${GOLD}" stroke-width="4"/>` +
    `<circle cx="148" cy="152" r="11" fill="${p.body}" stroke="${p.line}" stroke-width="4"/>` +
    `</g>`
  );
}

function base(p) {
  return (
    `<ellipse cx="100" cy="218" rx="58" ry="8" fill="rgba(0,0,0,0.22)"/>` +
    `<path d="M46 212 Q46 194 62 192 H138 Q154 194 154 212 Z" fill="${p.shade}" stroke="${p.line}" stroke-width="4"/>` +
    `<path d="M66 194 Q70 158 82 146 H118 Q130 158 134 194 Z" fill="${p.body}" stroke="${p.line}" stroke-width="4"/>` +
    `<circle cx="58" cy="168" r="10" fill="${p.body}" stroke="${p.line}" stroke-width="4"/>`
  );
}

const HEAD = (p) => `<circle cx="100" cy="98" r="52" fill="${p.body}" stroke="${p.line}" stroke-width="4"/>`;

const CHIBI = {
  // Tốt: chú lính nhỏ đội mũ sắt.
  P: (p) =>
    base(p) +
    HEAD(p) +
    `<path d="M50 88 Q50 40 100 40 Q150 40 150 88 Q100 72 50 88 Z" fill="${p.shade}" stroke="${p.line}" stroke-width="4"/>` +
    `<circle cx="100" cy="38" r="8" fill="${p.shade}" stroke="${p.line}" stroke-width="4"/>` +
    face(p, 100, 110) +
    sword(p),
  // Mã: đầu ngựa có bờm, nhìn nghiêng.
  N: (p) =>
    `<ellipse cx="100" cy="218" rx="58" ry="8" fill="rgba(0,0,0,0.22)"/>` +
    `<path d="M46 212 Q46 194 62 192 H138 Q154 194 154 212 Z" fill="${p.shade}" stroke="${p.line}" stroke-width="4"/>` +
    `<path d="M62 194 C58 160 70 142 86 130 C70 132 50 130 40 118 C30 104 36 90 52 78 C66 66 78 56 80 36 L86 16 L102 34 C146 34 166 90 150 194 Z" fill="${p.body}" stroke="${p.line}" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="M104 36 Q126 40 138 60 L128 60 Q140 74 146 92 L134 90 Q146 108 148 126" fill="none" stroke="${p.line}" stroke-width="4" stroke-linecap="round"/>` +
    `<ellipse cx="50" cy="104" rx="4" ry="3" fill="${p.line}"/>` +
    face(p, 96, 84, 0.82) +
    sword(p),
  // Tượng: mũ mitra nhọn có khe chéo.
  B: (p) =>
    base(p) +
    HEAD(p) +
    `<path d="M62 74 Q66 26 100 10 Q134 26 138 74 Q100 62 62 74 Z" fill="${p.body}" stroke="${p.line}" stroke-width="4"/>` +
    `<path d="M110 24 L94 54" stroke="${p.line}" stroke-width="4" stroke-linecap="round"/>` +
    `<circle cx="100" cy="9" r="7" fill="${p.body}" stroke="${p.line}" stroke-width="4"/>` +
    face(p, 100, 108) +
    sword(p),
  // Xe: hình tháp lâu đài.
  R: (p) =>
    base(p) +
    `<path d="M48 64 V36 H66 V48 H84 V36 H116 V48 H134 V36 H152 V64" fill="${p.shade}" stroke="${p.line}" stroke-width="4" stroke-linejoin="round"/>` +
    `<rect x="48" y="58" width="104" height="96" rx="24" fill="${p.body}" stroke="${p.line}" stroke-width="4"/>` +
    face(p, 100, 106) +
    sword(p),
  // Hậu: vương miện vàng nhiều ngọc.
  Q: (p) =>
    base(p) +
    HEAD(p) +
    `<path d="M56 62 L58 24 L78 46 L100 16 L122 46 L142 24 L144 62 Z" fill="${GOLD}" stroke="${p.line}" stroke-width="4" stroke-linejoin="round"/>` +
    [[58, 22], [100, 14], [142, 22]].map(([x, yy]) => `<circle cx="${x}" cy="${yy}" r="6" fill="${GOLD}" stroke="${p.line}" stroke-width="3"/>`).join('') +
    `<circle cx="100" cy="48" r="5" fill="#e5484d" stroke="${p.line}" stroke-width="2"/>` +
    face(p, 100, 108) +
    sword(p),
  // Vua: vương miện có thánh giá.
  K: (p) =>
    base(p) +
    HEAD(p) +
    `<path d="M58 62 L62 32 L82 46 L100 30 L118 46 L138 32 L142 62 Z" fill="${GOLD}" stroke="${p.line}" stroke-width="4" stroke-linejoin="round"/>` +
    `<path d="M100 4 V30M90 13 H110" stroke="${p.line}" stroke-width="10" stroke-linecap="round"/>` +
    `<path d="M100 4 V30M90 13 H110" stroke="${GOLD}" stroke-width="5" stroke-linecap="round"/>` +
    face(p, 100, 108) +
    sword(p),
};

export function chibiSvg(type, color) {
  const draw = CHIBI[type] ?? CHIBI.P;
  return `<svg viewBox="0 0 200 230" class="chibi" aria-hidden="true">${draw(PALETTE[color] ?? PALETTE.w)}</svg>`;
}

let hideTimer = 0;

// Hiện hoạt ảnh: nhân vật bật ra giữa màn hình kèm bong bóng chữ và tia lấp lánh, rồi tự ẩn.
export function playCheckFx(container, { type, color, mate, text }) {
  const sparks = Array.from({ length: 12 }, (_, i) => `<i style="--a:${i * 30}deg;--d:${(i % 3) * 0.06}s"></i>`).join('');
  container.innerHTML =
    `<div class="fx-wrap${mate ? ' mate' : ''}">` +
    `<div class="fx-burst">${sparks}</div>` +
    `<div class="fx-chibi">${chibiSvg(type, color)}</div>` +
    `<div class="fx-bubble"></div>` +
    `</div>`;
  container.querySelector('.fx-bubble').textContent = text;
  container.hidden = false;
  clearTimeout(hideTimer);
  hideTimer = setTimeout(() => {
    container.hidden = true;
    container.innerHTML = '';
  }, mate ? 2300 : 1500);
}
