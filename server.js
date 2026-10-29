// Máy chủ: phục vụ giao diện tĩnh, API tài khoản (/api) và ghép phòng chơi online qua WebSocket (/ws).
// Máy chủ giữ ván cờ và kiểm tra từng nước đi, nên người chơi không thể đi sai luật.
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './public/js/engine.js';
import { Store } from './server/store.js';
import { createAuth } from './server/auth.js';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ các ký tự dễ nhầm: I, O, 0, 1
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};
const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export async function startServer({
  port = Number(process.env.PORT) || 3000,
  dataDir = process.env.DATA_DIR || path.join(ROOT, 'data'),
  env = process.env,
} = {}) {
  const store = new Store(path.join(dataDir, 'data.json'));
  const auth = createAuth({ store, env });
  const rooms = new Map(); // mã phòng -> { code, players: { w, b }, names, game, recorded }

  const server = http.createServer(async (req, res) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
      res.writeHead(400, SECURITY_HEADERS).end();
      return;
    }

    if (pathname.startsWith('/api/')) {
      await auth.handle(req, res, new URL(req.url, 'http://localhost'));
      return;
    }

    const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
    const file = path.normalize(path.join(PUBLIC_DIR, relative));
    if (!file.startsWith(PUBLIC_DIR + path.sep)) {
      res.writeHead(403, SECURITY_HEADERS).end();
      return;
    }
    try {
      const data = await readFile(file);
      res.writeHead(200, {
        ...SECURITY_HEADERS,
        'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream',
      });
      res.end(data);
    } catch {
      res.writeHead(404, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' }).end('Không tìm thấy trang');
    }
  });

  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });

  const send = (ws, msg) => {
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };

  const broadcast = (room, msg) => {
    send(room.players.w, msg);
    send(room.players.b, msg);
  };

  function newCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    } while (rooms.has(code));
    return code;
  }

  // Ghi kết quả ván cho những người chơi đã đăng nhập (chỉ ghi một lần mỗi ván).
  function finishGame(room, winner) {
    if (room.recorded) return;
    room.recorded = true;
    for (const color of ['w', 'b']) {
      const user = room.players[color]?.user;
      if (user) store.recordOnline(user.id, winner === null ? 'draw' : winner === color ? 'win' : 'loss');
    }
  }

  function createRoom(ws) {
    if (ws.room) return send(ws, { type: 'error', message: 'Bạn đang ở trong một phòng khác.' });
    const room = { code: newCode(), players: { w: ws, b: null }, names: { w: ws.name, b: null }, game: null, recorded: false };
    rooms.set(room.code, room);
    ws.room = room;
    ws.color = 'w';
    send(ws, { type: 'room', code: room.code });
  }

  function joinRoom(ws, code) {
    const room = rooms.get(code);
    if (ws.room) return send(ws, { type: 'error', message: 'Bạn đang ở trong một phòng khác.' });
    if (!room) return send(ws, { type: 'error', message: 'Không tìm thấy phòng với mã này.' });
    if (room.players.b) return send(ws, { type: 'error', message: 'Phòng đã đủ người.' });
    room.players.b = ws;
    room.names.b = ws.name;
    room.game = new Game();
    ws.room = room;
    ws.color = 'b';
    send(room.players.w, { type: 'start', color: 'w', code, names: room.names });
    send(ws, { type: 'start', color: 'b', code, names: room.names });
  }

  function playMove(ws, msg) {
    const room = ws.room;
    if (!room || !room.game) return send(ws, { type: 'error', message: 'Ván cờ chưa bắt đầu.' });
    if (room.game.status().over) return send(ws, { type: 'error', message: 'Ván cờ đã kết thúc.' });
    if (room.game.turn !== ws.color) return send(ws, { type: 'error', message: 'Chưa đến lượt bạn.' });

    const move = room.game.play(Number(msg.from), Number(msg.to), msg.promo ?? null);
    if (!move) return send(ws, { type: 'error', message: 'Nước đi không hợp lệ.' });
    broadcast(room, { type: 'move', from: move.from, to: move.to, promo: move.promo });
    const status = room.game.status();
    if (status.over) finishGame(room, status.winner);
  }

  function resign(ws) {
    const room = ws.room;
    if (!room || !room.game || room.game.status().over || room.recorded) {
      return send(ws, { type: 'error', message: 'Không thể đầu hàng lúc này.' });
    }
    const winner = ws.color === 'w' ? 'b' : 'w';
    finishGame(room, winner);
    broadcast(room, { type: 'over', reason: 'resign', winner });
  }

  function leaveRoom(ws) {
    const room = ws.room;
    if (!room) return;
    ws.room = null;
    if (room.players[ws.color] !== ws) return;
    rooms.delete(room.code);
    const other = room.players[ws.color === 'w' ? 'b' : 'w'];
    if (other) {
      other.room = null;
      send(other, { type: 'opponent_left' });
    }
  }

  wss.on('connection', (ws, req) => {
    const user = auth.userFromRequest(req);
    ws.user = user ? { id: user.id, name: user.name } : null;
    ws.name = user ? user.name : `Khách-${randomInt(1000, 10000)}`;

    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw);
      } catch {
        return send(ws, { type: 'error', message: 'Dữ liệu không hợp lệ.' });
      }
      switch (msg.type) {
        case 'create': return createRoom(ws);
        case 'join': return joinRoom(ws, String(msg.code ?? '').trim().toUpperCase());
        case 'move': return playMove(ws, msg);
        case 'resign': return resign(ws);
        default: return send(ws, { type: 'error', message: 'Lệnh không hợp lệ.' });
      }
    });
    ws.on('close', () => leaveRoom(ws));
  });

  await new Promise((resolve) => server.listen(port, resolve));
  return {
    server,
    store,
    port: server.address().port,
    async close() {
      for (const client of wss.clients) client.terminate();
      wss.close();
      await new Promise((resolve) => server.close(resolve));
      store.flush();
    },
  };
}

// Chạy trực tiếp: node server.js
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { port } = await startServer();
  console.log(`Cờ vua đang chạy tại http://localhost:${port}`);
  if (!process.env.SESSION_SECRET) {
    console.log('Gợi ý: đặt biến môi trường SESSION_SECRET để giữ phiên đăng nhập ổn định.');
  }
}
