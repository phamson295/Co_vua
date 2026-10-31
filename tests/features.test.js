import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../server.js';
import { fromFen, applyMove, legalMoves, toUci } from '../public/js/engine.js';
import { isCheckmate, mateMoves, forcesMateIn2, updatePuzzleRating, pickPuzzle } from '../public/js/puzzle-core.js';
import { evaluate, ACHIEVEMENTS } from '../public/js/achievements.js';

const PUZZLES = JSON.parse(fs.readFileSync(new URL('../public/data/puzzles.json', import.meta.url), 'utf8'));

let app;
let base;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'covua-features-'));
  app = await startServer({ port: 0, dataDir, env: {} });
  base = `http://127.0.0.1:${app.port}`;
});

after(async () => {
  await app.close();
  fs.rmSync(dataDir, { recursive: true, force: true });
});

async function api(pathname, { method = 'GET', body, jar = {} } = {}) {
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(base + pathname, {
    method,
    headers: { ...(body ? { 'Content-Type': 'application/json' } : {}), ...(cookie ? { Cookie: cookie } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(';');
    const [name, value] = pair.split('=');
    if (attrs.some((a) => a.trim() === 'Max-Age=0')) delete jar[name];
    else jar[name] = value;
  }
  return { status: res.status, data: await res.json().catch(() => null) };
}

async function account(name) {
  const jar = {};
  await api('/api/auth/quick', { method: 'POST', jar, body: { name } });
  return jar;
}

function connect(jar = {}) {
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, { headers: cookie ? { Cookie: cookie } : {} });
  ws.inbox = [];
  ws.on('message', (raw) => ws.inbox.push(JSON.parse(raw)));
  ws.cmd = (msg) => ws.send(JSON.stringify(msg));
  return new Promise((resolve) => ws.on('open', () => resolve(ws)));
}

async function waitFor(ws, predicate, label, timeout = 3000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const index = ws.inbox.findIndex(predicate);
    if (index >= 0) return ws.inbox.splice(index, 1)[0];
    await new Promise((r) => setTimeout(r, 15));
  }
  throw new Error(`Hết thời gian chờ: ${label}`);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ----- Kho bài giải đố -----
test('kho giải đố: đủ bài, mã không trùng, lời giải đúng và duy nhất', () => {
  assert.ok(PUZZLES.length >= 60, `có ${PUZZLES.length} bài`);
  assert.equal(new Set(PUZZLES.map((p) => p.id)).size, PUZZLES.length);
  const byUci = (state, uci) => legalMoves(state).find((m) => toUci(m) === uci);
  for (const p of PUZZLES) {
    const start = fromFen(p.fen);
    if (p.type === 'mate1') {
      assert.equal(mateMoves(start).length, 1, `${p.id}: chỉ một nước chiếu hết`);
      assert.ok(isCheckmate(applyMove(start, byUci(start, p.line[0]))), `${p.id}: nước giải chiếu hết`);
    } else {
      assert.equal(p.type, 'mate2');
      assert.equal(mateMoves(start).length, 0, `${p.id}: không có chiếu hết 1 nước`);
      const key = byUci(start, p.line[0]);
      assert.ok(forcesMateIn2(start, key), `${p.id}: nước đầu buộc chiếu hết`);
      const afterKey = applyMove(start, key);
      const afterDefense = applyMove(afterKey, byUci(afterKey, p.line[1]));
      assert.ok(isCheckmate(applyMove(afterDefense, byUci(afterDefense, p.line[2]))), `${p.id}: đường giải kết thúc bằng chiếu hết`);
    }
    assert.ok(p.rating >= 500 && p.rating <= 2200);
  }
});

test('Puzzle Rating: đúng tăng, sai giảm, chuỗi và chọn bài vừa sức', () => {
  const start = { rating: 1000, games: 0, streak: 0, best: 0, solved: 0 };
  const win = updatePuzzleRating(start, 1200, true);
  assert.ok(win.rating > 1000 && win.streak === 1 && win.solved === 1);
  const lose = updatePuzzleRating(win, 800, false);
  assert.ok(lose.rating < win.rating && lose.streak === 0 && lose.best === 1);
  const picked = pickPuzzle(PUZZLES, 1400, [], () => 0);
  assert.ok(Math.abs(picked.rating - 1250) <= Math.min(...PUZZLES.map((p) => Math.abs(p.rating - 1250))) + 1);
  const recent = PUZZLES.slice(0, PUZZLES.length - 1).map((p) => p.id);
  assert.equal(pickPuzzle(PUZZLES, 1000, recent).id, PUZZLES.at(-1).id, 'tránh bài vừa gặp');
});

// ----- Thành tựu -----
test('thành tựu: chấm theo ván cờ và giải đố, không mở lại lần hai', () => {
  const progress = {};
  const moves = [
    { piece: 'wP', captured: null }, { piece: 'bP', captured: null },
    { piece: 'wK', castle: true, captured: null }, { piece: 'bN', captured: null },
  ];
  const fresh = evaluate(progress, { type: 'game', mode: 'ai', outcome: 'win', reason: 'resign', moves, me: 'w', level: 9, rated: false, view3d: true });
  const ids = fresh.map((a) => a.id);
  for (const id of ['first_game', 'first_win', 'bot_5', 'bot_9', 'castle', 'clean_win', 'view_3d']) assert.ok(ids.includes(id), id);
  assert.ok(!ids.includes('bot_12') && !ids.includes('online_win'));
  assert.equal(evaluate(progress, { type: 'game', mode: 'ai', outcome: 'win', reason: 'resign', moves, me: 'w', level: 9 }).length, 0);
  assert.equal(progress.counters.games, 2);
  const puzzle = evaluate(progress, { type: 'puzzle', solved: true, streak: 5, rating: 1450, totalSolved: 1 }).map((a) => a.id);
  assert.deepEqual(puzzle.sort(), ['puzzle_1', 'puzzle_1400', 'puzzle_streak_5']);
  assert.ok(ACHIEVEMENTS.length >= 20);
});

// ----- API -----
test('API giải đố: cần đăng nhập, kiểm tra mã bài, cập nhật rating và EXP', async () => {
  const p = PUZZLES[0];
  assert.equal((await api('/api/progress/puzzle', { method: 'POST', body: { id: p.id, solved: true } })).status, 401);
  const jar = await account('Giải Đố');
  assert.equal((await api('/api/progress/puzzle', { method: 'POST', jar, body: { id: 'khong-co', solved: true } })).status, 400);
  const ok = await api('/api/progress/puzzle', { method: 'POST', jar, body: { id: p.id, solved: true } });
  assert.equal(ok.status, 200);
  assert.ok(ok.data.puzzle.rating > 1000 || p.rating < 600);
  assert.equal(ok.data.xp.gained, 5);
  const fail = await api('/api/progress/puzzle', { method: 'POST', jar, body: { id: p.id, solved: false } });
  assert.equal(fail.data.puzzle.streak, 0);
  assert.equal(fail.data.xp, null);
  const me = (await api('/api/me', { jar })).data.user;
  assert.equal(me.puzzle.games, 2);
});

test('API thành tựu: bỏ mã không hợp lệ, giữ thời điểm mở sớm nhất', async () => {
  const jar = await account('Sưu Tầm');
  const first = await api('/api/achievements', { method: 'POST', jar, body: { unlocked: { first_game: 2000, khong_co: 1 } } });
  assert.deepEqual(first.data.achievements, { first_game: 2000 });
  const second = await api('/api/achievements', { method: 'POST', jar, body: { unlocked: { first_game: 1000, castle: 3000 } } });
  assert.deepEqual(second.data.achievements, { first_game: 1000, castle: 3000 });
  assert.deepEqual((await api('/api/me', { jar })).data.user.achievements, { first_game: 1000, castle: 3000 });
});

test('đổi tên hiển thị và xóa tài khoản', async () => {
  const jar = {};
  const email = `xoa-${Date.now()}@example.com`;
  await api('/api/auth/register', { method: 'POST', jar, body: { name: 'Tên Cũ', email, password: 'matkhau123' } });
  assert.equal((await api('/api/account/name', { method: 'POST', jar, body: { name: 'X' } })).status, 400);
  const renamed = await api('/api/account/name', { method: 'POST', jar, body: { name: 'Tên Mới' } });
  assert.equal(renamed.data.user.name, 'Tên Mới');
  assert.equal((await api('/api/account/delete', { method: 'POST', jar, body: { confirm: 'xoa' } })).status, 400);
  assert.equal((await api('/api/account/delete', { method: 'POST', jar, body: { confirm: 'XÓA' } })).status, 200);
  assert.equal((await api('/api/me', { jar })).data.user, null);
  const login = await api('/api/auth/login', { method: 'POST', body: { email, password: 'matkhau123' } });
  assert.equal(login.status, 401, 'không đăng nhập được tài khoản đã xóa');
  const again = await api('/api/auth/register', { method: 'POST', body: { name: 'Đăng Ký Lại', email, password: 'matkhau123' } });
  assert.equal(again.status, 201, 'email được giải phóng để đăng ký lại');
});

// ----- Ghép trận -----
test('ghép trận: hai người cùng thể thức được ghép, màu quân ngược nhau', async () => {
  const a = await connect();
  const b = await connect();
  a.cmd({ type: 'seek', tc: '3+2' });
  const seeking = await waitFor(a, (m) => m.type === 'seeking', 'đang tìm');
  assert.equal(seeking.tc.id, '3+2');
  b.cmd({ type: 'seek', tc: '3+2' });
  const sa = await waitFor(a, (m) => m.type === 'start', 'bắt đầu A');
  const sb = await waitFor(b, (m) => m.type === 'start', 'bắt đầu B');
  assert.notEqual(sa.color, sb.color);
  assert.equal(sa.code, sb.code);
  assert.equal(sa.tc.id, '3+2');
  a.close();
  b.close();
});

test('ghép trận: khác thể thức thì không ghép, hủy tìm thì rời hàng chờ', async () => {
  const a = await connect();
  const b = await connect();
  const c = await connect();
  a.cmd({ type: 'seek', tc: '1+0' });
  b.cmd({ type: 'seek', tc: '10+0' });
  await sleep(300);
  assert.ok(!a.inbox.some((m) => m.type === 'start') && !b.inbox.some((m) => m.type === 'start'));
  a.cmd({ type: 'cancel_seek' });
  await waitFor(a, (m) => m.type === 'seek_cancelled', 'đã hủy');
  c.cmd({ type: 'seek', tc: '1+0' });
  await sleep(300);
  assert.ok(!c.inbox.some((m) => m.type === 'start'), 'người đã hủy không còn trong hàng chờ');
  for (const ws of [a, b, c]) ws.close();
});

test('ghép trận: không ghép một tài khoản với chính nó', async () => {
  const jar = await account('Hai Tab');
  const tab1 = await connect(jar);
  const tab2 = await connect(jar);
  tab1.cmd({ type: 'seek', tc: '5+0' });
  tab2.cmd({ type: 'seek', tc: '5+0' });
  await sleep(300);
  assert.ok(!tab1.inbox.some((m) => m.type === 'start'));
  tab1.close();
  tab2.close();
});
