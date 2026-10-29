import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import WebSocket from 'ws';
import { startServer } from '../server.js';

let app;
let base;
let dataDir;
let idp;
let idpPort;
const idpRequests = [];

// Máy chủ OAuth giả: /token đổi mã lấy access token, /userinfo trả hồ sơ.
function startMockIdp() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => (body += chunk));
      req.on('end', () => {
        const url = new URL(req.url, 'http://x');
        res.setHeader('Content-Type', 'application/json');
        if (url.pathname === '/token') {
          idpRequests.push(Object.fromEntries(new URLSearchParams(body)));
          return res.end(JSON.stringify({ access_token: 'token-abc' }));
        }
        if (url.pathname === '/userinfo' && req.headers.authorization === 'Bearer token-abc') {
          return res.end(JSON.stringify({ sub: 'g-123', name: 'Nguyễn Văn A', email: 'a@example.com', email_verified: true }));
        }
        res.statusCode = 401;
        res.end('{}');
      });
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

before(async () => {
  dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'covua-test-'));
  idp = await startMockIdp();
  idpPort = idp.address().port;
  app = await startServer({
    port: 0,
    dataDir,
    env: {
      GOOGLE_CLIENT_ID: 'client-id',
      GOOGLE_CLIENT_SECRET: 'client-secret',
      GOOGLE_AUTH_URL: `http://127.0.0.1:${idpPort}/auth`,
      GOOGLE_TOKEN_URL: `http://127.0.0.1:${idpPort}/token`,
      GOOGLE_USERINFO_URL: `http://127.0.0.1:${idpPort}/userinfo`,
    },
  });
  base = `http://127.0.0.1:${app.port}`;
});

after(async () => {
  await app.close();
  await new Promise((resolve) => idp.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// Gọi API, giữ cookie theo từng "trình duyệt" (jar).
async function api(pathname, { method = 'GET', body, jar = {}, headers = {} } = {}) {
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const res = await fetch(base + pathname, {
    method,
    redirect: 'manual',
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  for (const line of res.headers.getSetCookie()) {
    const [pair, ...attrs] = line.split(';');
    const [name, value] = pair.split('=');
    if (attrs.some((a) => a.trim() === 'Max-Age=0')) delete jar[name];
    else jar[name] = value;
  }
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    // Phản hồi không phải JSON (ví dụ chuyển hướng).
  }
  return { status: res.status, data, location: res.headers.get('location'), setCookie: res.headers.getSetCookie() };
}

const unique = (label) => `${label}-${Math.random().toString(36).slice(2, 8)}@example.com`;

test('khách chưa đăng nhập: /api/me trả về user rỗng và danh sách nhà cung cấp', async () => {
  const { status, data } = await api('/api/me');
  assert.equal(status, 200);
  assert.equal(data.user, null);
  assert.deepEqual(data.providers, { google: true, facebook: false });
});

test('đăng ký bằng email, đăng nhập lại, đăng xuất', async () => {
  const email = unique('dangky');
  const jar = {};
  const reg = await api('/api/auth/register', { method: 'POST', jar, body: { name: 'Lan Anh', email, password: 'matkhau123' } });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.user.name, 'Lan Anh');
  assert.equal(reg.data.user.kind, 'email');
  assert.ok(!('passwordHash' in reg.data.user), 'không được lộ mật khẩu băm');
  assert.ok(reg.setCookie.some((c) => c.includes('HttpOnly') && c.includes('SameSite=Lax')));

  assert.equal((await api('/api/me', { jar })).data.user.email, email);

  await api('/api/auth/logout', { method: 'POST', jar });
  assert.equal((await api('/api/me', { jar })).data.user, null);

  const login = await api('/api/auth/login', { method: 'POST', jar, body: { email: email.toUpperCase(), password: 'matkhau123' } });
  assert.equal(login.status, 200, 'email không phân biệt hoa thường');
  assert.equal((await api('/api/me', { jar })).data.user.name, 'Lan Anh');
});

test('đăng ký: kiểm tra dữ liệu đầu vào và email trùng', async () => {
  const email = unique('trung');
  const ok = await api('/api/auth/register', { method: 'POST', body: { name: 'An', email, password: 'matkhau123' } });
  assert.equal(ok.status, 201);
  const dup = await api('/api/auth/register', { method: 'POST', body: { name: 'Bình', email, password: 'matkhau123' } });
  assert.equal(dup.status, 409);
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { name: 'Bình', email: 'khong-hop-le', password: 'matkhau123' } })).status, 400);
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { name: 'Bình', email: unique('x'), password: '123' } })).status, 400);
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { name: 'B', email: unique('x'), password: 'matkhau123' } })).status, 400);
  assert.equal((await api('/api/auth/register', { method: 'POST', body: { name: '<script>', email: unique('x'), password: 'matkhau123' } })).status, 400);
});

test('đăng nhập sai mật khẩu bị từ chối và bị giới hạn số lần thử', async () => {
  const email = unique('khoa');
  await api('/api/auth/register', { method: 'POST', body: { name: 'Khóa Thử', email, password: 'matkhau123' } });
  const wrong = await api('/api/auth/login', { method: 'POST', body: { email, password: 'sai-mat-khau' } });
  assert.equal(wrong.status, 401);
  assert.equal(wrong.data.error, 'Email hoặc mật khẩu không đúng.');
  const unknown = await api('/api/auth/login', { method: 'POST', body: { email: unique('khong-co'), password: 'sai-mat-khau' } });
  assert.equal(unknown.data.error, wrong.data.error, 'không tiết lộ email có tồn tại hay không');

  let last;
  for (let i = 0; i < 9; i++) last = await api('/api/auth/login', { method: 'POST', body: { email, password: 'sai-mat-khau' } });
  assert.equal(last.status, 429);
  const stillLocked = await api('/api/auth/login', { method: 'POST', body: { email, password: 'matkhau123' } });
  assert.equal(stillLocked.status, 429, 'bị khóa tạm thời cả khi nhập đúng');
});

test('tài khoản nhanh chỉ cần biệt danh và có thể nâng cấp bằng email', async () => {
  const jar = {};
  const quick = await api('/api/auth/quick', { method: 'POST', jar, body: { name: 'Chơi Nhanh' } });
  assert.equal(quick.status, 201);
  assert.equal(quick.data.user.kind, 'quick');
  assert.equal(quick.data.user.email, null);
  assert.equal((await api('/api/me', { jar })).data.user.name, 'Chơi Nhanh');

  const email = unique('nangcap');
  const up = await api('/api/auth/upgrade', { method: 'POST', jar, body: { email, password: 'matkhau123' } });
  assert.equal(up.status, 200);
  assert.equal(up.data.user.kind, 'email');
  assert.equal(up.data.user.id, quick.data.user.id, 'giữ nguyên tài khoản');

  const other = {};
  const login = await api('/api/auth/login', { method: 'POST', jar: other, body: { email, password: 'matkhau123' } });
  assert.equal(login.data.user.id, quick.data.user.id, 'đăng nhập lại được trên thiết bị khác');
  assert.equal((await api('/api/auth/upgrade', { method: 'POST', jar: other, body: { email: unique('y'), password: 'matkhau123' } })).status, 400);
  assert.equal((await api('/api/auth/upgrade', { method: 'POST', body: { email: unique('z'), password: 'matkhau123' } })).status, 401);
});

test('phiên đăng nhập bị giả mạo hoặc từ nguồn lạ đều bị từ chối', async () => {
  const jar = {};
  await api('/api/auth/quick', { method: 'POST', jar, body: { name: 'Người Thật' } });
  const forged = { cv_session: jar.cv_session.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A')) };
  assert.equal((await api('/api/me', { jar: forged })).data.user, null);

  const evil = await api('/api/auth/quick', { method: 'POST', body: { name: 'Kẻ Lạ' }, headers: { Origin: 'https://evil.example' } });
  assert.equal(evil.status, 403);
  const notJson = await fetch(`${base}/api/auth/quick`, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: 'x' });
  assert.equal(notJson.status, 415);
});

test('đăng nhập Google (OAuth): tạo tài khoản, đăng nhập lại không tạo trùng', async () => {
  const jar = {};
  const start = await api('/api/auth/google', { jar });
  assert.equal(start.status, 302);
  const authUrl = new URL(start.location);
  assert.equal(authUrl.origin, `http://127.0.0.1:${idpPort}`);
  assert.equal(authUrl.searchParams.get('client_id'), 'client-id');
  assert.equal(authUrl.searchParams.get('redirect_uri'), `${base}/api/auth/google/callback`);
  const state = authUrl.searchParams.get('state');
  assert.ok(state && jar.cv_oauth, 'có tham số state và cookie đối chiếu');

  const done = await api(`/api/auth/google/callback?code=abc&state=${state}`, { jar });
  assert.equal(done.status, 302);
  assert.equal(done.location, '/?login=ok');
  assert.equal(idpRequests.at(-1).client_secret, 'client-secret');
  assert.equal(idpRequests.at(-1).code, 'abc');

  const me = (await api('/api/me', { jar })).data.user;
  assert.equal(me.name, 'Nguyễn Văn A');
  assert.equal(me.kind, 'google');
  assert.equal(me.email, 'a@example.com');

  const again = {};
  const start2 = await api('/api/auth/google', { jar: again });
  const state2 = new URL(start2.location).searchParams.get('state');
  await api(`/api/auth/google/callback?code=abc&state=${state2}`, { jar: again });
  assert.equal((await api('/api/me', { jar: again })).data.user.id, me.id);
});

test('đăng nhập OAuth: state sai, người dùng từ chối, nhà cung cấp chưa cấu hình', async () => {
  const jar = {};
  await api('/api/auth/google', { jar });
  const bad = await api('/api/auth/google/callback?code=abc&state=sai', { jar });
  assert.equal(bad.location, '/?login_error=state');

  const denied = {};
  const s = await api('/api/auth/google', { jar: denied });
  const state = new URL(s.location).searchParams.get('state');
  const cancel = await api(`/api/auth/google/callback?error=access_denied&state=${state}`, { jar: denied });
  assert.equal(cancel.location, '/?login_error=cancel');

  const noCookie = await api(`/api/auth/google/callback?code=abc&state=${state}`);
  assert.equal(noCookie.location, '/?login_error=state');

  const facebook = await api('/api/auth/facebook');
  assert.equal(facebook.location, '/?login_error=provider');
});

test('đường dẫn sai định dạng không làm sập máy chủ', async () => {
  const res = await fetch(`${base}/%E0%A4%A`);
  assert.equal(res.status, 400);
  assert.equal((await fetch(`${base}/`)).status, 200);
  assert.equal((await fetch(`${base}/../server.js`)).status === 200, false);
});

// ----- WebSocket: tên người chơi và thống kê -----
function connect(jar = {}) {
  const cookie = Object.entries(jar).map(([k, v]) => `${k}=${v}`).join('; ');
  const ws = new WebSocket(`ws://127.0.0.1:${app.port}/ws`, { headers: cookie ? { Cookie: cookie } : {} });
  ws.inbox = [];
  ws.on('message', (raw) => ws.inbox.push(JSON.parse(raw)));
  return new Promise((resolve) => ws.on('open', () => resolve(ws)));
}

async function waitFor(ws, predicate, label) {
  for (let i = 0; i < 100; i++) {
    const found = ws.inbox.find(predicate);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`Hết thời gian chờ: ${label}`);
}

test('online: tên người chơi được truyền cho hai bên và kết quả ghi vào thống kê', async () => {
  const jarA = {};
  const jarB = {};
  await api('/api/auth/register', { method: 'POST', jar: jarA, body: { name: 'Trắng Thủ', email: unique('a'), password: 'matkhau123' } });
  await api('/api/auth/quick', { method: 'POST', jar: jarB, body: { name: 'Đen Thủ' } });

  const a = await connect(jarA);
  const b = await connect(jarB);
  a.send(JSON.stringify({ type: 'create' }));
  const { code } = await waitFor(a, (m) => m.type === 'room', 'mã phòng');
  b.send(JSON.stringify({ type: 'join', code }));
  const startA = await waitFor(a, (m) => m.type === 'start', 'start A');
  await waitFor(b, (m) => m.type === 'start', 'start B');
  assert.deepEqual(startA.names, { w: 'Trắng Thủ', b: 'Đen Thủ' });

  // Chiếu hết kiểu "Fool's mate": f3 e5 g4 Qh4#
  const moves = [[a, 53, 45], [b, 12, 28], [a, 54, 38], [b, 3, 39]];
  for (const [ws, from, to] of moves) {
    ws.send(JSON.stringify({ type: 'move', from, to }));
    await waitFor(ws, (m) => m.type === 'move' && m.from === from && m.to === to, `nước ${from}-${to}`);
  }
  await new Promise((r) => setTimeout(r, 100));
  const meA = (await api('/api/me', { jar: jarA })).data.user;
  const meB = (await api('/api/me', { jar: jarB })).data.user;
  assert.deepEqual(meA.stats.online, { played: 1, wins: 0, losses: 1, draws: 0 });
  assert.deepEqual(meB.stats.online, { played: 1, wins: 1, losses: 0, draws: 0 });
  a.close();
  b.close();
});

test('online: khách không đăng nhập có tên "Khách-xxxx" và không bị ghi thống kê', async () => {
  const guest = await connect();
  const host = await connect();
  host.send(JSON.stringify({ type: 'create' }));
  const { code } = await waitFor(host, (m) => m.type === 'room', 'mã phòng');
  guest.send(JSON.stringify({ type: 'join', code }));
  const start = await waitFor(guest, (m) => m.type === 'start', 'start');
  assert.match(start.names.w, /^Khách-\d{4}$/);
  assert.match(start.names.b, /^Khách-\d{4}$/);
  host.send(JSON.stringify({ type: 'resign' }));
  const over = await waitFor(guest, (m) => m.type === 'over', 'over');
  assert.equal(over.winner, 'b');
  host.close();
  guest.close();
});

test('dữ liệu người dùng được lưu xuống file và nạp lại đúng', async () => {
  const email = unique('luu');
  await api('/api/auth/register', { method: 'POST', body: { name: 'Lưu Trữ', email, password: 'matkhau123' } });
  app.store.flush();
  const saved = JSON.parse(fs.readFileSync(path.join(dataDir, 'data.json'), 'utf8'));
  const record = Object.values(saved.users).find((u) => u.loginEmail === email);
  assert.ok(record, 'có bản ghi trong file');
  assert.ok(record.passwordHash.startsWith('scrypt$'), 'mật khẩu được băm, không lưu dạng thô');
  assert.ok(!JSON.stringify(saved).includes('matkhau123'));
});
