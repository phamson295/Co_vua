// Tài khoản: đăng ký/đăng nhập bằng email, tài khoản nhanh (chỉ cần biệt danh), đăng nhập mạng xã hội
// (OAuth 2.0: Google, Facebook) và phiên đăng nhập bằng cookie có chữ ký.
// Người chơi không đăng nhập vẫn chơi được bình thường với tư cách khách.
import crypto from 'node:crypto';
import { promisify } from 'node:util';
import { POOLS } from '../public/js/shared.js';
import { PROVISIONAL_RD, levelFromXp, botXp, BOT_XP_DAILY_CAP } from '../public/js/rating.js';
import { DEFAULT_PUZZLE_RATING } from '../public/js/puzzle-core.js';
import { ACHIEVEMENT_IDS } from '../public/js/achievements.js';
import fs from 'node:fs';

const scrypt = promisify(crypto.scrypt);

const SESSION_COOKIE = 'cv_session';
const STATE_COOKIE = 'cv_oauth';
const SESSION_DAYS = 90;
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;

// Cấu hình từng nhà cung cấp. Địa chỉ có thể ghi đè bằng biến môi trường (GOOGLE_AUTH_URL...)
// để kiểm thử với máy chủ giả lập hoặc dùng bản tự triển khai.
const PROVIDERS = {
  google: {
    label: 'Google',
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    profile: (p) => ({ id: p.sub, name: p.name, email: p.email_verified ? p.email : null }),
  },
  facebook: {
    label: 'Facebook',
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    userUrl: 'https://graph.facebook.com/me?fields=id,name,email',
    scope: 'public_profile,email',
    profile: (p) => ({ id: p.id, name: p.name, email: p.email ?? null }),
  },
};

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function cleanName(value) {
  const name = String(value ?? '').replace(/\s+/g, ' ').trim();
  const length = [...name].length;
  if (length < 2 || length > 24) throw new HttpError(400, 'Tên hiển thị cần từ 2 đến 24 ký tự.');
  if (/[\u0000-\u001f\u007f<>]/.test(name)) throw new HttpError(400, 'Tên hiển thị chứa ký tự không hợp lệ.');
  return name;
}

function cleanEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (email.length > 254 || !EMAIL_PATTERN.test(email)) throw new HttpError(400, 'Email không hợp lệ.');
  return email;
}

function cleanPassword(value) {
  const password = String(value ?? '');
  if (password.length < 8) throw new HttpError(400, 'Mật khẩu cần ít nhất 8 ký tự.');
  if (password.length > 128) throw new HttpError(400, 'Mật khẩu quá dài (tối đa 128 ký tự).');
  return password;
}

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, 64);
  return `scrypt$${salt.toString('hex')}$${key.toString('hex')}`;
}

async function verifyPassword(password, stored) {
  const [scheme, saltHex, keyHex] = String(stored ?? '').split('$');
  if (scheme !== 'scrypt' || !saltHex || !keyHex) return false;
  const expected = Buffer.from(keyHex, 'hex');
  const actual = await scrypt(password, Buffer.from(saltHex, 'hex'), expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

export function publicUser(user) {
  const ratings = {};
  for (const pool of Object.keys(POOLS)) {
    const r = user.ratings?.[pool];
    ratings[pool] = r
      ? { rating: Math.round(r.rating), games: r.games, provisional: r.rd > PROVISIONAL_RD }
      : { rating: 1500, games: 0, provisional: true };
  }
  return {
    id: user.id,
    name: user.name,
    kind: user.kind,
    email: user.loginEmail ?? user.contactEmail ?? null,
    providers: Object.keys(user.providers ?? {}),
    stats: user.stats,
    ratings,
    xp: { total: user.xp ?? 0, ...levelFromXp(user.xp ?? 0) },
    puzzle: { ...DEFAULT_PUZZLE_RATING, ...user.puzzle },
    achievements: user.achievements ?? {},
    createdAt: user.createdAt,
  };
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header ?? '').split(';')) {
    const index = part.indexOf('=');
    if (index > 0) cookies[part.slice(0, index).trim()] = part.slice(index + 1).trim();
  }
  return cookies;
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function redirect(res, location) {
  res.writeHead(302, { Location: location, 'Cache-Control': 'no-store' });
  res.end();
}

async function readJson(req) {
  if (!/^application\/json/i.test(req.headers['content-type'] ?? '')) {
    throw new HttpError(415, 'Cần gửi dữ liệu dạng JSON.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 4096) throw new HttpError(413, 'Dữ liệu gửi lên quá lớn.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch {
    throw new HttpError(400, 'Dữ liệu JSON không hợp lệ.');
  }
}

const PUZZLE_XP = 5;
const PUZZLE_XP_DAILY_CAP = 100;

// Độ khó của từng bài giải đố (để máy chủ tự tính Puzzle Rating, không tin số liệu từ trình duyệt).
function loadPuzzleRatings() {
  try {
    const file = new URL('../public/data/puzzles.json', import.meta.url);
    return new Map(JSON.parse(fs.readFileSync(file, 'utf8')).map((p) => [p.id, p.rating]));
  } catch {
    return new Map();
  }
}

export function createAuth({ store, env = process.env }) {
  const puzzleRatings = loadPuzzleRatings();
  const secret = env.SESSION_SECRET || store.secret();
  const trustProxy = Boolean(env.TRUST_PROXY || env.RENDER);
  const attempts = new Map();
  const cleaner = setInterval(() => attempts.clear(), 60 * 60 * 1000);
  cleaner.unref();
  let dummyHash = null;

  const isSecure = (req) => Boolean(req.socket.encrypted) || (trustProxy && req.headers['x-forwarded-proto'] === 'https');
  const clientIp = (req) =>
    (trustProxy ? String(req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() : '') || req.socket.remoteAddress || 'unknown';

  // Giới hạn số lần thử trong một khoảng thời gian (chống dò mật khẩu, tạo tài khoản hàng loạt).
  function limited(key, max, windowMs) {
    const now = Date.now();
    const recent = (attempts.get(key) ?? []).filter((t) => now - t < windowMs);
    recent.push(now);
    attempts.set(key, recent);
    return recent.length > max;
  }

  function sign(payload) {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    return `${body}.${signature}`;
  }

  function verify(token) {
    const [body, signature] = String(token ?? '').split('.');
    if (!body || !signature) return null;
    const expected = crypto.createHmac('sha256', secret).update(body).digest('base64url');
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try {
      const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
      return payload.exp > Date.now() ? payload : null;
    } catch {
      return null;
    }
  }

  function cookie(req, name, value, maxAgeSeconds) {
    return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}${isSecure(req) ? '; Secure' : ''}`;
  }

  function addCookie(res, header) {
    res.setHeader('Set-Cookie', [...[].concat(res.getHeader('Set-Cookie') ?? []), header]);
  }

  function startSession(req, res, user) {
    const exp = Date.now() + SESSION_DAYS * 24 * 3600 * 1000;
    addCookie(res, cookie(req, SESSION_COOKIE, sign({ uid: user.id, exp }), SESSION_DAYS * 24 * 3600));
  }

  function userFromRequest(req) {
    const payload = verify(parseCookies(req.headers.cookie)[SESSION_COOKIE]);
    return payload ? store.getUser(payload.uid) : null;
  }

  function checkOrigin(req) {
    const origin = req.headers.origin;
    if (!origin) return;
    let host = '';
    try {
      host = new URL(origin).host;
    } catch {
      // Giá trị Origin không đọc được: coi như không hợp lệ.
    }
    if (host !== req.headers.host) throw new HttpError(403, 'Nguồn gửi yêu cầu không hợp lệ.');
  }

  function provider(name) {
    const base = PROVIDERS[name];
    if (!base) return null;
    const key = name.toUpperCase();
    const clientId = env[`${key}_CLIENT_ID`];
    const clientSecret = env[`${key}_CLIENT_SECRET`];
    return {
      ...base,
      name,
      authUrl: env[`${key}_AUTH_URL`] || base.authUrl,
      tokenUrl: env[`${key}_TOKEN_URL`] || base.tokenUrl,
      userUrl: env[`${key}_USERINFO_URL`] || base.userUrl,
      clientId,
      clientSecret,
      enabled: Boolean(clientId && clientSecret),
    };
  }

  const enabledProviders = () => Object.fromEntries(Object.keys(PROVIDERS).map((name) => [name, provider(name).enabled]));

  const baseUrl = (req) =>
    (env.PUBLIC_URL || env.RENDER_EXTERNAL_URL || `${isSecure(req) ? 'https' : 'http'}://${req.headers.host}`).replace(/\/$/, '');

  // ----- Email -----
  async function register(req, res) {
    if (limited(`register:${clientIp(req)}`, 10, 3600 * 1000)) throw new HttpError(429, 'Bạn đăng ký quá nhiều lần, hãy thử lại sau.');
    const body = await readJson(req);
    const name = cleanName(body.name);
    const email = cleanEmail(body.email);
    const password = cleanPassword(body.password);
    if (store.findByEmail(email)) throw new HttpError(409, 'Email này đã được đăng ký.');
    const user = store.createUser({ kind: 'email', name, loginEmail: email, passwordHash: await hashPassword(password) });
    startSession(req, res, user);
    json(res, 201, { user: publicUser(user) });
  }

  async function login(req, res) {
    const body = await readJson(req);
    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '').slice(0, 128);
    if (limited(`login:${clientIp(req)}`, 20, 15 * 60 * 1000) || limited(`login:${email}`, 8, 15 * 60 * 1000)) {
      throw new HttpError(429, 'Bạn thử đăng nhập quá nhiều lần, hãy chờ vài phút rồi thử lại.');
    }
    const user = store.findByEmail(email);
    dummyHash ??= await hashPassword('mat-khau-gia-de-can-bang-thoi-gian');
    const ok = await verifyPassword(password, user ? user.passwordHash : dummyHash);
    if (!user || !ok) throw new HttpError(401, 'Email hoặc mật khẩu không đúng.');
    startSession(req, res, user);
    json(res, 200, { user: publicUser(user) });
  }

  // ----- Tài khoản nhanh: chỉ cần biệt danh -----
  async function quick(req, res) {
    if (limited(`quick:${clientIp(req)}`, 20, 3600 * 1000)) throw new HttpError(429, 'Bạn tạo quá nhiều tài khoản, hãy thử lại sau.');
    const body = await readJson(req);
    const user = store.createUser({ kind: 'quick', name: cleanName(body.name) });
    startSession(req, res, user);
    json(res, 201, { user: publicUser(user) });
  }

  // Gắn email + mật khẩu cho tài khoản nhanh để đăng nhập lại được trên thiết bị khác.
  async function upgrade(req, res) {
    const user = userFromRequest(req);
    if (!user) throw new HttpError(401, 'Bạn chưa đăng nhập.');
    if (user.kind !== 'quick') throw new HttpError(400, 'Chỉ tài khoản nhanh mới cần nâng cấp.');
    const body = await readJson(req);
    const email = cleanEmail(body.email);
    const password = cleanPassword(body.password);
    if (store.findByEmail(email)) throw new HttpError(409, 'Email này đã được đăng ký.');
    store.setCredentials(user, email, await hashPassword(password));
    json(res, 200, { user: publicUser(user) });
  }

  // ----- Tiến trình: EXP từ ván đấu với Bot (máy người chơi báo về, có trần mỗi ngày) -----
  async function botProgress(req, res) {
    const user = userFromRequest(req);
    if (!user) throw new HttpError(401, 'Bạn chưa đăng nhập.');
    if (limited(`bot:${user.id}`, 120, 3600 * 1000)) throw new HttpError(429, 'Gửi kết quả quá nhanh, hãy thử lại sau.');
    const body = await readJson(req);
    const level = Number(body.level);
    const plies = Number(body.plies);
    if (!Number.isInteger(level) || level < 1 || level > 12) throw new HttpError(400, 'Cấp Bot không hợp lệ.');
    if (!['win', 'draw', 'loss'].includes(body.result)) throw new HttpError(400, 'Kết quả không hợp lệ.');
    if (!Number.isInteger(plies) || plies < 0 || plies > 1000) throw new HttpError(400, 'Số nước không hợp lệ.');
    const xp = store.addXp(user, botXp(level, body.result, plies), { source: 'bot', dailyCap: BOT_XP_DAILY_CAP });
    json(res, 200, { xp });
  }

  async function puzzleProgress(req, res) {
    const user = userFromRequest(req);
    if (!user) throw new HttpError(401, 'Bạn chưa đăng nhập.');
    if (limited(`puzzle:${user.id}`, 240, 3600 * 1000)) throw new HttpError(429, 'Gửi kết quả quá nhanh, hãy thử lại sau.');
    const body = await readJson(req);
    const rating = puzzleRatings.get(String(body.id));
    if (rating === undefined) throw new HttpError(400, 'Bài giải đố không tồn tại.');
    const solved = body.solved === true;
    const puzzle = store.recordPuzzle(user, rating, solved);
    const xp = solved ? store.addXp(user, PUZZLE_XP, { source: 'puzzle', dailyCap: PUZZLE_XP_DAILY_CAP }) : null;
    json(res, 200, { puzzle, xp });
  }

  async function syncAchievements(req, res) {
    const user = userFromRequest(req);
    if (!user) throw new HttpError(401, 'Bạn chưa đăng nhập.');
    const body = await readJson(req);
    const unlocked = Object.fromEntries(Object.entries(body.unlocked ?? {}).filter(([id]) => ACHIEVEMENT_IDS.has(id)));
    json(res, 200, { achievements: store.mergeAchievements(user, unlocked) });
  }

  async function renameAccount(req, res) {
    const user = userFromRequest(req);
    if (!user) throw new HttpError(401, 'Bạn chưa đăng nhập.');
    const body = await readJson(req);
    store.rename(user, cleanName(body.name));
    json(res, 200, { user: publicUser(user) });
  }

  async function deleteAccount(req, res) {
    const user = userFromRequest(req);
    if (!user) throw new HttpError(401, 'Bạn chưa đăng nhập.');
    const body = await readJson(req);
    if (body.confirm !== 'XÓA') throw new HttpError(400, 'Hãy gõ chữ XÓA để xác nhận.');
    store.deleteUser(user);
    addCookie(res, cookie(req, SESSION_COOKIE, '', 0));
    json(res, 200, { ok: true });
  }

  function leaderboard(res, url) {
    const pool = url.searchParams.get('pool');
    if (!POOLS[pool]) throw new HttpError(400, 'Nhóm xếp hạng không hợp lệ.');
    json(res, 200, { pool, players: store.leaderboard(pool) });
  }

  function logout(req, res) {
    addCookie(res, cookie(req, SESSION_COOKIE, '', 0));
    json(res, 200, { ok: true });
  }

  // ----- Mạng xã hội (OAuth 2.0, luồng authorization code) -----
  function oauthStart(req, res, name) {
    const config = provider(name);
    if (!config || !config.enabled) return redirect(res, '/?login_error=provider');
    const state = crypto.randomBytes(16).toString('hex');
    addCookie(res, cookie(req, STATE_COOKIE, `${name}.${state}`, 600));
    const url = new URL(config.authUrl);
    url.searchParams.set('client_id', config.clientId);
    url.searchParams.set('redirect_uri', `${baseUrl(req)}/api/auth/${name}/callback`);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', config.scope);
    url.searchParams.set('state', state);
    redirect(res, url.toString());
  }

  async function oauthCallback(req, res, name, query) {
    const config = provider(name);
    const expected = parseCookies(req.headers.cookie)[STATE_COOKIE];
    addCookie(res, cookie(req, STATE_COOKIE, '', 0));
    if (!config || !config.enabled) return redirect(res, '/?login_error=provider');
    if (query.get('error')) return redirect(res, '/?login_error=cancel');
    if (!expected || expected !== `${name}.${query.get('state')}` || !query.get('code')) {
      return redirect(res, '/?login_error=state');
    }
    try {
      const tokenResponse = await fetch(config.tokenUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code: query.get('code'),
          redirect_uri: `${baseUrl(req)}/api/auth/${name}/callback`,
          grant_type: 'authorization_code',
        }),
        signal: AbortSignal.timeout(8000),
      });
      const token = await tokenResponse.json();
      if (!tokenResponse.ok || !token.access_token) throw new Error(`token: ${JSON.stringify(token).slice(0, 200)}`);

      const userUrl = new URL(config.userUrl);
      userUrl.searchParams.set('access_token', token.access_token);
      const profileResponse = await fetch(userUrl, {
        headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(8000),
      });
      const profile = config.profile(await profileResponse.json());
      if (!profileResponse.ok || !profile.id) throw new Error('không đọc được hồ sơ');

      // Không tự gộp với tài khoản email trùng địa chỉ: email của tài khoản thường chưa được xác minh.
      let user = store.findByProvider(name, profile.id);
      if (!user) {
        let displayName;
        try {
          displayName = cleanName(profile.name);
        } catch {
          displayName = `Người chơi ${config.label}`;
        }
        user = store.createUser({
          kind: name,
          name: displayName,
          contactEmail: profile.email ?? undefined,
          providers: { [name]: String(profile.id) },
        });
      }
      startSession(req, res, user);
      return redirect(res, '/?login=ok');
    } catch (error) {
      console.warn(`Đăng nhập ${name} thất bại:`, error.message);
      return redirect(res, '/?login_error=failed');
    }
  }

  async function handle(req, res, url) {
    try {
      const route = `${req.method} ${url.pathname}`;
      if (req.method === 'POST') checkOrigin(req);

      const oauth = url.pathname.match(/^\/api\/auth\/(google|facebook)(\/callback)?$/);
      if (oauth && req.method === 'GET') {
        return oauth[2] ? await oauthCallback(req, res, oauth[1], url.searchParams) : oauthStart(req, res, oauth[1]);
      }

      switch (route) {
        case 'GET /api/me': {
          const user = userFromRequest(req);
          return json(res, 200, { user: user ? publicUser(user) : null, providers: enabledProviders() });
        }
        case 'POST /api/auth/register': return await register(req, res);
        case 'POST /api/auth/login': return await login(req, res);
        case 'POST /api/auth/quick': return await quick(req, res);
        case 'POST /api/auth/upgrade': return await upgrade(req, res);
        case 'POST /api/auth/logout': return logout(req, res);
        case 'POST /api/progress/bot': return await botProgress(req, res);
        case 'GET /api/leaderboard': return leaderboard(res, url);
        case 'POST /api/progress/puzzle': return await puzzleProgress(req, res);
        case 'POST /api/achievements': return await syncAchievements(req, res);
        case 'POST /api/account/name': return await renameAccount(req, res);
        case 'POST /api/account/delete': return await deleteAccount(req, res);
        default: return json(res, 404, { error: 'Không tìm thấy.' });
      }
    } catch (error) {
      if (error instanceof HttpError) return json(res, error.status, { error: error.message });
      console.error('Lỗi xử lý /api:', error);
      return json(res, 500, { error: 'Lỗi máy chủ.' });
    }
  }

  return { handle, userFromRequest };
}
