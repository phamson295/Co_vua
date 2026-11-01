import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { LANGUAGES, flagSvg } from '../public/js/languages.js';
import { chibiSvg } from '../public/js/chibi.js';

const load = (code) => JSON.parse(readFileSync(new URL(`../public/i18n/${code}.json`, import.meta.url), 'utf8'));
const vi = load('vi');
const placeholders = (s) => (s.match(/\{\w+\}/g) ?? []).sort().join(',');

test('có 20 ngôn ngữ, mỗi ngôn ngữ có file dịch và cờ', () => {
  assert.equal(LANGUAGES.length, 20);
  assert.equal(new Set(LANGUAGES.map((l) => l.code)).size, 20);
  for (const l of LANGUAGES) {
    assert.ok(existsSync(new URL(`../public/i18n/${l.code}.json`, import.meta.url)), `thiếu file ${l.code}.json`);
    assert.match(flagSvg(l.code), /^<svg[\s\S]*<\/svg>$/);
  }
});

for (const l of LANGUAGES) {
  test(`bản dịch ${l.code}: đủ khóa, không rỗng, giữ nguyên {biến}`, () => {
    const d = load(l.code);
    assert.deepEqual(Object.keys(d).sort(), Object.keys(vi).sort());
    for (const [k, v] of Object.entries(d)) {
      assert.ok(typeof v === 'string' && v.trim(), `${l.code}: ${k} rỗng`);
      assert.equal(placeholders(v), placeholders(vi[k]), `${l.code}: ${k} sai biến`);
    }
  });
}

test('hình chibi cho cả 6 loại quân và 2 màu', () => {
  for (const type of 'KQRBNP') {
    for (const color of 'wb') assert.match(chibiSvg(type, color), /^<svg[^>]*class="chibi"/);
  }
});
