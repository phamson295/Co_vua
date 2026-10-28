// Máy chủ: phục vụ giao diện tĩnh và ghép phòng chơi online qua WebSocket (/ws).
// Máy chủ giữ ván cờ và kiểm tra từng nước đi, nên người chơi không thể đi sai luật.
import http from 'node:http';
import path from 'node:path';
import { readFile } from 'node:fs/promises';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { Game } from './public/js/engine.js';

const PUBLIC_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const PORT = Number(process.env.PORT) || 3000;
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ các ký tự dễ nhầm: I, O, 0, 1
const CONTENT_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const rooms = new Map(); // mã phòng -> { code, players: { w, b }, game }

const server = http.createServer(async (req, res) => {
  const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const relative = urlPath === '/' ? 'index.html' : urlPath.slice(1);
  const file = path.normalize(path.join(PUBLIC_DIR, relative));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) {
    res.writeHead(403).end();
    return;
  }
  try {
    const data = await readFile(file);
    res.writeHead(200, { 'Content-Type': CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('Không tìm thấy trang');
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

function createRoom(ws) {
  if (ws.room) return send(ws, { type: 'error', message: 'Bạn đang ở trong một phòng khác.' });
  const room = { code: newCode(), players: { w: ws, b: null }, game: null };
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
  room.game = new Game();
  ws.room = room;
  ws.color = 'b';
  send(room.players.w, { type: 'start', color: 'w', code });
  send(ws, { type: 'start', color: 'b', code });
}

function playMove(ws, msg) {
  const room = ws.room;
  if (!room || !room.game) return send(ws, { type: 'error', message: 'Ván cờ chưa bắt đầu.' });
  if (room.game.status().over) return send(ws, { type: 'error', message: 'Ván cờ đã kết thúc.' });
  if (room.game.turn !== ws.color) return send(ws, { type: 'error', message: 'Chưa đến lượt bạn.' });

  const move = room.game.play(Number(msg.from), Number(msg.to), msg.promo ?? null);
  if (!move) return send(ws, { type: 'error', message: 'Nước đi không hợp lệ.' });
  broadcast(room, { type: 'move', from: move.from, to: move.to, promo: move.promo });
}

function resign(ws) {
  const room = ws.room;
  if (!room || !room.game || room.game.status().over) {
    return send(ws, { type: 'error', message: 'Không thể đầu hàng lúc này.' });
  }
  const winner = ws.color === 'w' ? 'b' : 'w';
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

wss.on('connection', (ws) => {
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

server.listen(PORT, () => {
  console.log(`Cờ vua đang chạy tại http://localhost:${PORT}`);
});
