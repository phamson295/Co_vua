// Đa ngôn ngữ: từ điển mỗi ngôn ngữ nằm ở public/i18n/<mã>.json.
// Chữ thiếu trong một ngôn ngữ sẽ lấy từ tiếng Anh, rồi tiếng Việt.
import { LANGUAGES } from './languages.js';

const STORAGE_KEY = 'co-vua-lang';
const cache = {};
let current = 'vi';
let dict = {};
let fallbacks = [];

async function load(code) {
  if (!cache[code]) {
    const res = await fetch(`i18n/${code}.json`);
    if (!res.ok) throw new Error(`Không tải được ngôn ngữ ${code}`);
    cache[code] = await res.json();
  }
  return cache[code];
}

export const getLanguage = () => current;

// t('khoa', { ten: 'giá trị' }): thay {ten} trong câu bằng giá trị.
export function t(key, vars) {
  let text = dict[key];
  if (text === undefined) {
    for (const d of fallbacks) {
      if (d[key] !== undefined) {
        text = d[key];
        break;
      }
    }
  }
  if (text === undefined) return key;
  return vars ? text.replace(/\{(\w+)\}/g, (m, name) => (vars[name] ?? m)) : text;
}

// Dịch các phần tử có data-i18n (nội dung) và data-i18n-attr ("thuộc_tính:khóa;...").
export function applyDom(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    el.textContent = t(el.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    for (const pair of el.dataset.i18nAttr.split(';')) {
      const [attr, key] = pair.split(':');
      el.setAttribute(attr, t(key));
    }
  });
}

function detect() {
  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {
    saved = null;
  }
  if (LANGUAGES.some((l) => l.code === saved)) return saved;
  for (const tag of navigator.languages ?? [navigator.language ?? '']) {
    const base = String(tag).toLowerCase().split('-')[0];
    const lang = LANGUAGES.find((l) => l.match.includes(base));
    if (lang) return lang.code;
  }
  return 'vi';
}

export async function setLanguage(code, { remember = true } = {}) {
  const lang = LANGUAGES.find((l) => l.code === code) ?? LANGUAGES[0];
  const [main, en, vi] = await Promise.all([load(lang.code), load('en'), load('vi')]);
  dict = main;
  fallbacks = [en, vi];
  current = lang.code;
  document.documentElement.lang = lang.code;
  document.documentElement.dir = lang.rtl ? 'rtl' : 'ltr';
  if (remember) {
    try {
      localStorage.setItem(STORAGE_KEY, lang.code);
    } catch {
      // Không lưu được lựa chọn thì lần sau tự nhận theo trình duyệt.
    }
  }
  applyDom();
}

export async function initI18n() {
  try {
    await setLanguage(detect(), { remember: false });
  } catch (error) {
    console.warn('Không tải được bản dịch, dùng chữ mặc định:', error);
  }
}
