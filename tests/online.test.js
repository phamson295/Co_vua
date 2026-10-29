import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../server.js';

// Đồng hồ chạy nhanh gấp 50 lần (1 phút = 1,2 giây), chờ nối lại 400 ms để kiểm thử nhanh.
const CLOCK_SCALE = 0.02;
const GRACE_MS = 400;

let app;
let base;
let dataDir;

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'covua-online-'));
  app = await startServer({ port: 0, dataDir, env: {}, clockScale: CLOCK_SCALE, graceMs: GRACE_MS });
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
    const [pair] = line.split(';');
    const [name, value] = pair.split('=');
    jar[name] = value;
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

// Tạo phòng và cho người thứ hai vào; trả về hai kết nối đã nhận lệnh bắt đầu.
async function pair({ tc = 'none', rated = true, jarA = {}, jarB = {} } = {}) {
  const a = await connect(jarA);
  const b = await connect(jarB);
  a.cmd({ type: 'create', tc, rated });
  const room = await waitFor(a, (m) => m.type === 'room', 'room');
  b.cmd({ type: 'join', code: room.code });
  const startA = await waitFor(a, (m) => m.type === 'start', 'start A');
  const startB = await waitFor(b, (m) => m.type === 'start', 'start B');
  return { a, b, room, startA, startB };
}

async function move(ws, from, to, others) {
  ws.cmd({ type: 'move', from, to });
  const m = await waitFor(ws, (x) => x.type === 'move' && x.from === from && x.to === to, `nước ${from}-${to}`);
  for (const o of others) await waitFor(o, (x) => x.type === 'move' && x.from === from && x.to === to, `nước ${from}-${to} (đối thủ)`);
  return m;
}

const FOOLS_MATE = [[53, 45], [12, 28], [54, 38], [3, 39]];

test('đồng hồ: bắt đầu sau nước đầu của Trắng và xử thua khi hết giờ', async () => {
  const { a, b, startA } = await pair({ tc: '1+0' });
  assert.equal(startA.tc.id, '1+0');
  assert.deepEqual(startA.clock, { w: 1200, b: 1200, running: null });
  const m = await move(a, 52, 36, [b]);
  assert.equal(m.clock.running, 'b');
  const over = await waitFor(a, (x) => x.type === 'over', 'hết giờ', 3000);
  assert.equal(over.reason, 'timeout');
  assert.equal(over.winner, 'w');
  assert.equal(over.clock.b, 0);
  a.close();
  b.close();
});

test('xin hòa: từ chối rồi đồng ý', async () => {
  const { a, b } = await pair();
  await move(a, 52, 36, [b]);
  a.cmd({ type: 'draw_offer' });
  await waitFor(b, (x) => x.type === 'draw_offer', 'lời mời hòa');
  b.cmd({ type: 'draw_decline' });
  await waitFor(a, (x) => x.type === 'draw_declined', 'từ chối hòa');
  a.cmd({ type: 'draw_offer' });
  await waitFor(b, (x) => x.type === 'draw_offer', 'lời mời hòa lần 2');
  b.cmd({ type: 'draw_accept' });
  const over = await waitFor(a, (x) => x.type === 'over', 'hòa');
  assert.equal(over.winner, null);
  assert.equal(over.reason, 'agreement');
  a.close();
  b.close();
});

test('tái đấu: cả hai đồng ý thì bắt đầu ván mới và đổi màu quân', async () => {
  const { a, b, startA } = await pair();
  assert.equal(startA.color, 'w');
  a.cmd({ type: 'resign' });
  await waitFor(b, (x) => x.type === 'over', 'kết thúc');
  b.cmd({ type: 'rematch' });
  await waitFor(a, (x) => x.type === 'rematch_offer', 'lời mời tái đấu');
  a.cmd({ type: 'rematch' });
  const again = await waitFor(a, (x) => x.type === 'start', 'ván mới');
  assert.equal(again.color, 'b', 'đổi màu quân');
  const againB = await waitFor(b, (x) => x.type === 'start', 'ván mới B');
  assert.equal(againB.color, 'w');
  await move(b, 52, 36, [a]);
  a.close();
  b.close();
});

test('mất kết nối rồi nối lại: nhận lại toàn bộ ván cờ và chơi tiếp', async () => {
  const { a, b, room, startA } = await pair();
  await move(a, 52, 36, [b]);
  await move(b, 12, 28, [a]);
  a.terminate();
  await waitFor(b, (x) => x.type === 'opponent_disconnected', 'báo mất kết nối');

  const a2 = await connect();
  a2.cmd({ type: 'rejoin', code: room.code, token: startA.token });
  const state = await waitFor(a2, (x) => x.type === 'state', 'trạng thái ván');
  assert.equal(state.color, 'w');
  assert.equal(state.status, 'playing');
  assert.deepEqual(state.moves.map((m) => [m.from, m.to]), [[52, 36], [12, 28]]);
  await waitFor(b, (x) => x.type === 'opponent_reconnected', 'báo đã nối lại');
  await move(a2, 62, 45, [b]);

  const stranger = await connect();
  stranger.cmd({ type: 'rejoin', code: room.code, token: 'sai' });
  await waitFor(stranger, (x) => x.type === 'rejoin_failed', 'token sai bị từ chối');
  a2.close();
  b.close();
  stranger.close();
});

test('bỏ ván: không quay lại trong thời gian chờ thì xử thua', async () => {
  const { a, b } = await pair();
  await move(a, 52, 36, [b]);
  a.terminate();
  const over = await waitFor(b, (x) => x.type === 'over', 'xử thua do bỏ ván', GRACE_MS + 2000);
  assert.equal(over.reason, 'abandon');
  assert.equal(over.winner, 'b');
  b.close();
});

test('bấm rời phòng giữa ván thì xử thua ngay', async () => {
  const { a, b } = await pair();
  b.cmd({ type: 'leave' });
  const over = await waitFor(a, (x) => x.type === 'over', 'rời phòng', 500);
  assert.equal(over.reason, 'abandon');
  assert.equal(over.winner, 'w');
  a.close();
  b.close();
});

test('ván xếp hạng: rating, EXP, thống kê và bảng xếp hạng được cập nhật', async () => {
  const jarA = await account('Trắng Xếp Hạng');
  const jarB = await account('Đen Xếp Hạng');
  const { a, b, startA } = await pair({ tc: '5+0', jarA, jarB });
  assert.equal(startA.rated, true);
  assert.deepEqual(startA.ratings.w, { rating: 1500, provisional: true });
  for (const [i, [from, to]] of FOOLS_MATE.entries()) await move(i % 2 ? b : a, from, to, [i % 2 ? a : b]);
  const overA = await waitFor(a, (x) => x.type === 'over', 'kết thúc A');
  const overB = await waitFor(b, (x) => x.type === 'over', 'kết thúc B');
  assert.equal(overA.reason, 'checkmate');
  assert.equal(overA.rating.pool, 'blitz');
  assert.ok(overA.rating.after < 1500, `Trắng thua giảm điểm: ${overA.rating.after}`);
  assert.ok(overB.rating.after > 1500, `Đen thắng tăng điểm: ${overB.rating.after}`);
  assert.equal(overA.xp.gained, 0, 'ván dưới 12 nửa nước không có EXP');

  const meB = (await api('/api/me', { jar: jarB })).data.user;
  assert.equal(meB.ratings.blitz.games, 1);
  assert.equal(meB.ratings.blitz.rating, overB.rating.after);
  assert.equal(meB.stats.online.wins, 1);
  const board = (await api('/api/leaderboard?pool=blitz')).data.players;
  assert.ok(board.some((p) => p.name === 'Đen Xếp Hạng'));
  assert.ok(!('id' in board[0]) && !('email' in board[0]), 'bảng xếp hạng không lộ id/email');
  assert.equal((await api('/api/leaderboard?pool=xyz')).status, 400);
  a.close();
  b.close();
});

test('không tính điểm: phòng chọn không xếp hạng, hoặc có người là khách', async () => {
  const jarA = await account('Không Xếp Hạng A');
  const jarB = await account('Không Xếp Hạng B');
  const unrated = await pair({ rated: false, jarA, jarB });
  assert.equal(unrated.startA.rated, false);
  unrated.a.cmd({ type: 'resign' });
  const over = await waitFor(unrated.b, (x) => x.type === 'over', 'kết thúc');
  assert.equal(over.rated, false);
  assert.equal(over.rating, null);

  const guest = await pair({ jarA });
  assert.equal(guest.startA.rated, false, 'có khách thì không xếp hạng');
  for (const ws of [unrated.a, unrated.b, guest.a, guest.b]) ws.close();
});

test('ván bỏ trước khi cả hai đi nước nào thì không tính kết quả', async () => {
  const jarA = await account('Bỏ Sớm A');
  const jarB = await account('Bỏ Sớm B');
  const { a, b } = await pair({ jarA, jarB });
  a.cmd({ type: 'resign' });
  const over = await waitFor(b, (x) => x.type === 'over', 'kết thúc');
  assert.equal(over.rated, false);
  const me = (await api('/api/me', { jar: jarB })).data.user;
  assert.equal(me.stats.online.played, 0);
  a.close();
  b.close();
});

test('chat nhanh: chuyển cho cả hai bên, chặn gửi dồn dập và mã câu không hợp lệ', async () => {
  const { a, b } = await pair();
  a.cmd({ type: 'chat', id: 1 });
  const got = await waitFor(b, (x) => x.type === 'chat', 'chat');
  assert.deepEqual(got, { type: 'chat', from: 'w', id: 1 });
  a.cmd({ type: 'chat', id: 2 }); // quá nhanh, bị bỏ qua
  a.cmd({ type: 'chat', id: 99 });
  await sleep(200);
  assert.equal(b.inbox.filter((x) => x.type === 'chat').length, 0);
  a.close();
  b.close();
});

test('EXP từ ván đấu với Bot: cần đăng nhập, kiểm tra dữ liệu và có trần mỗi ngày', async () => {
  assert.equal((await api('/api/progress/bot', { method: 'POST', body: { level: 5, result: 'win', plies: 40 } })).status, 401);
  const jar = await account('Cày Bot');
  assert.equal((await api('/api/progress/bot', { method: 'POST', jar, body: { level: 13, result: 'win', plies: 40 } })).status, 400);
  assert.equal((await api('/api/progress/bot', { method: 'POST', jar, body: { level: 5, result: 'thắng', plies: 40 } })).status, 400);
  const first = await api('/api/progress/bot', { method: 'POST', jar, body: { level: 12, result: 'win', plies: 40 } });
  assert.equal(first.data.xp.gained, 30);
  let total = 30;
  let last;
  for (let i = 0; i < 12; i++) {
    last = (await api('/api/progress/bot', { method: 'POST', jar, body: { level: 12, result: 'win', plies: 40 } })).data.xp;
    total += last.gained;
  }
  assert.equal(total, 300, 'trần 300 EXP mỗi ngày từ Bot');
  assert.equal(last.capped, true);
  const me = (await api('/api/me', { jar })).data.user;
  assert.equal(me.xp.total, 300);
  assert.equal(me.xp.level, 3);
});
