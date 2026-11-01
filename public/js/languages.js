// 20 ngôn ngữ và cờ quốc gia vẽ bằng SVG (emoji cờ không hiển thị trên Windows nên không dùng).
// Cờ được giản lược cho kích thước biểu tượng nhỏ (30×20).

// Ngôi sao 5 cánh tâm (cx, cy), bán kính r, quay `rot` độ.
function star(cx, cy, r, fill, rot = 0) {
  const points = [];
  for (let i = 0; i < 10; i++) {
    const radius = i % 2 === 0 ? r : r * 0.4;
    const angle = ((rot - 90 + i * 36) * Math.PI) / 180;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return `<polygon points="${points.join(' ')}" fill="${fill}"/>`;
}

const hStripes = (colors) =>
  colors.map((c, i) => `<rect y="${(20 / colors.length) * i}" width="30" height="${20 / colors.length + 0.05}" fill="${c}"/>`).join('');
const vStripes = (colors) =>
  colors.map((c, i) => `<rect x="${(30 / colors.length) * i}" width="${30 / colors.length + 0.05}" height="20" fill="${c}"/>`).join('');

const FLAGS = {
  vi: `<rect width="30" height="20" fill="#da251d"/>${star(15, 10.5, 6, '#ffcd00')}`,
  en:
    '<rect width="30" height="20" fill="#012169"/>' +
    '<path d="M0 0 30 20M30 0 0 20" stroke="#fff" stroke-width="4"/>' +
    '<path d="M0 0 30 20M30 0 0 20" stroke="#c8102e" stroke-width="1.6"/>' +
    '<path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6.5"/>' +
    '<path d="M15 0v20M0 10h30" stroke="#c8102e" stroke-width="3.6"/>',
  zh:
    `<rect width="30" height="20" fill="#de2910"/>${star(5.5, 5.5, 3.2, '#ffde00')}` +
    `${star(10.5, 2.4, 1, '#ffde00', 20)}${star(12.5, 4.6, 1, '#ffde00', 45)}${star(12.5, 7.6, 1, '#ffde00', 0)}${star(10.5, 9.6, 1, '#ffde00', 20)}`,
  ja: '<rect width="30" height="20" fill="#fff"/><circle cx="15" cy="10" r="6" fill="#bc002d"/>',
  ko:
    '<rect width="30" height="20" fill="#fff"/>' +
    '<path d="M10 10a5 5 0 0 1 10 0z" fill="#cd2e3a"/><path d="M10 10a5 5 0 0 0 10 0z" fill="#0047a0"/>' +
    '<circle cx="12.5" cy="10" r="2.5" fill="#cd2e3a"/><circle cx="17.5" cy="10" r="2.5" fill="#0047a0"/>' +
    '<g stroke="#000" stroke-width="1.1"><path d="M3.5 5.2 6.5 2.6M4.3 6.2 7.3 3.6M5.1 7.2 8.1 4.6"/>' +
    '<path d="M22.7 15.4 25.7 12.8M23.5 16.4 26.5 13.8M24.3 17.4 27.3 14.8"/>' +
    '<path d="M22.7 4.6 25.7 7.2M23.5 3.6 26.5 6.2M24.3 2.6 27.3 5.2"/>' +
    '<path d="M3.5 14.8 6.5 17.4M4.3 13.8 7.3 16.4M5.1 12.8 8.1 15.4"/></g>',
  th: hStripes(['#a51931', '#f4f5f8', '#2d2a4a', '#2d2a4a', '#f4f5f8', '#a51931']),
  id: hStripes(['#ce1126', '#ffffff']),
  ms:
    hStripes(['#cc0001', '#fff', '#cc0001', '#fff', '#cc0001', '#fff', '#cc0001', '#fff', '#cc0001', '#fff', '#cc0001', '#fff', '#cc0001', '#fff']) +
    '<rect width="15" height="11.43" fill="#010066"/>' +
    '<circle cx="6" cy="5.7" r="3.8" fill="#fc0"/><circle cx="7.2" cy="5.7" r="3.2" fill="#010066"/>' +
    star(11.2, 5.7, 2.6, '#fc0'),
  hi:
    hStripes(['#ff9933', '#ffffff', '#138808']) +
    '<circle cx="15" cy="10" r="2.6" fill="none" stroke="#000080" stroke-width="0.7"/><circle cx="15" cy="10" r="0.6" fill="#000080"/>',
  es: '<rect width="30" height="20" fill="#aa151b"/><rect y="5" width="30" height="10" fill="#f1bf00"/>',
  pt:
    '<rect width="30" height="20" fill="#009c3b"/><polygon points="15,2.5 27.5,10 15,17.5 2.5,10" fill="#ffdf00"/>' +
    '<circle cx="15" cy="10" r="4.4" fill="#002776"/><path d="M10.8 9.2q4.2-1.4 8.4 1.4" stroke="#fff" stroke-width="0.8" fill="none"/>',
  fr: vStripes(['#002395', '#ffffff', '#ed2939']),
  de: hStripes(['#000000', '#dd0000', '#ffce00']),
  it: vStripes(['#009246', '#ffffff', '#ce2b37']),
  ru: hStripes(['#ffffff', '#0039a6', '#d52b1e']),
  tr:
    '<rect width="30" height="20" fill="#e30a17"/><circle cx="11" cy="10" r="5" fill="#fff"/>' +
    `<circle cx="12.3" cy="10" r="4" fill="#e30a17"/>${star(17.4, 10, 2.4, '#fff', -90)}`,
  ar:
    '<rect width="30" height="20" fill="#006c35"/>' +
    '<path d="M7 7.5q2-2 4 0t4 0 4 0 4 0" stroke="#fff" stroke-width="1.2" fill="none"/>' +
    '<path d="M8 11.5h14" stroke="#fff" stroke-width="1"/><path d="M8 13.5h15l1 -1" stroke="#fff" stroke-width="1.2" fill="none"/>',
  pl: hStripes(['#ffffff', '#dc143c']),
  nl: hStripes(['#ae1c28', '#ffffff', '#21468b']),
  uk: hStripes(['#0057b7', '#ffd700']),
};

// code: mã ngôn ngữ (tên file trong public/i18n/), match: mã ngôn ngữ trình duyệt tương ứng.
export const LANGUAGES = [
  { code: 'vi', name: 'Tiếng Việt', match: ['vi'] },
  { code: 'en', name: 'English', match: ['en'] },
  { code: 'zh', name: '中文 (简体)', match: ['zh'] },
  { code: 'ja', name: '日本語', match: ['ja'] },
  { code: 'ko', name: '한국어', match: ['ko'] },
  { code: 'th', name: 'ไทย', match: ['th'] },
  { code: 'id', name: 'Bahasa Indonesia', match: ['id', 'in'] },
  { code: 'ms', name: 'Bahasa Melayu', match: ['ms'] },
  { code: 'hi', name: 'हिन्दी', match: ['hi'] },
  { code: 'es', name: 'Español', match: ['es'] },
  { code: 'pt', name: 'Português (Brasil)', match: ['pt'] },
  { code: 'fr', name: 'Français', match: ['fr'] },
  { code: 'de', name: 'Deutsch', match: ['de'] },
  { code: 'it', name: 'Italiano', match: ['it'] },
  { code: 'ru', name: 'Русский', match: ['ru'] },
  { code: 'tr', name: 'Türkçe', match: ['tr'] },
  { code: 'ar', name: 'العربية', match: ['ar'], rtl: true },
  { code: 'pl', name: 'Polski', match: ['pl'] },
  { code: 'nl', name: 'Nederlands', match: ['nl'] },
  { code: 'uk', name: 'Українська', match: ['uk'] },
];

export function flagSvg(code) {
  return `<svg class="flag" viewBox="0 0 30 20" aria-hidden="true">${FLAGS[code] ?? ''}</svg>`;
}
