// Phòng chơi online qua WebSocket: ghép phòng bằng mã, đồng hồ do máy chủ giữ, xin hòa, tái đấu,
// chat nhanh, nối lại khi mất kết nối, rating Glicko-2 và EXP khi ván kết thúc.
// Máy chủ giữ ván cờ và kiểm tra từng nước đi, nên người chơi không thể đi sai luật hay sửa đồng hồ.
import { WebSocketServer } from 'ws';
import { randomInt, randomBytes } from 'node:crypto';
import { Game } from '../public/js/engine.js';
import { Clock, findTimeControl, poolOf, hasMatingMaterial, CHAT_PHRASES } from '../public/js/shared.js';
import { onlineXp, PROVISIONAL_RD } from '../public/js/rating.js';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // bỏ các ký tự dễ nhầm: I, O, 0, 1
const MIN_PLIES_RATED = 2; // ván bị bỏ trước khi cả hai bên đi nước nào thì không tính điểm
const other = (color) => (color === 'w' ? 'b' : 'w');

// clockScale, graceMs: chỉnh nhỏ lại khi kiểm thử để không phải chờ lâu.
export function attachGameServer({ server, auth, store, clockScale = 1, graceMs = 60000 }) {
  const rooms = new Map();
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 1024 });

  const send = (ws, msg) => {
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
  };
  const sendTo = (room, color, msg) => send(room.players[color]?.ws, msg);
  const broadcast = (room, msg) => {
    sendTo(room, 'w', msg);
    sendTo(room, 'b', msg);
  };

  function newCode() {
    let code;
    do {
      code = Array.from({ length: 5 }, () => CODE_CHARS[randomInt(CODE_CHARS.length)]).join('');
    } while (rooms.has(code));
    return code;
  }

  const isRated = (room) => {
    const w = room.players.w?.user;
    const b = room.players.b?.user;
    return room.rated && Boolean(w && b) && w.id !== b.id;
  };

  function ratingOf(slot, room) {
    if (!slot?.user) return null;
    const user = store.getUser(slot.user.id);
    if (!user) return null;
    const r = store.getRating(user, poolOf(room.tc));
    return { rating: Math.round(r.rating), provisional: r.rd > PROVISIONAL_RD };
  }

  const clockView = (room) => (room.clock ? room.clock.snapshot(Date.now()) : null);

  function scheduleFlag(room) {
    clearTimeout(room.flagTimer);
    const clock = room.clock;
    if (!clock || !clock.running || room.status !== 'playing') return;
    const color = clock.running;
    room.flagTimer = setTimeout(() => {
      if (room.status !== 'playing' || clock.running !== color || clock.remaining(color, Date.now()) > 0) {
        return scheduleFlag(room);
      }
      clock.stop(Date.now());
      clock.time[color] = 0;
      // Hết giờ thì thua, trừ khi đối phương không còn đủ quân để chiếu hết (khi đó hòa).
      const winner = hasMatingMaterial(room.game.state.board, other(color)) ? other(color) : null;
      finish(room, winner, winner ? 'timeout' : 'timeout_draw');
    }, Math.max(0, clock.remaining(color, Date.now())) + 5);
  }

  function roomInfo(room) {
    return {
      code: room.code,
      tc: { id: room.tc.id, label: room.tc.label, short: room.tc.short },
      rated: isRated(room),
      names: { w: room.players.w?.name ?? null, b: room.players.b?.name ?? null },
      ratings: { w: ratingOf(room.players.w, room), b: ratingOf(room.players.b, room) },
    };
  }

  function startGame(room) {
    room.game = new Game();
    room.status = 'playing';
    room.result = null;
    room.drawOffer = null;
    room.rematch.clear();
    room.clock = room.tc.base ? new Clock(room.tc.base * 1000 * clockScale, room.tc.inc * 1000 * clockScale) : null;
    for (const color of ['w', 'b']) {
      const slot = room.players[color];
      sendTo(room, color, { type: 'start', color, token: slot.token, clock: clockView(room), ...roomInfo(room) });
    }
  }

  // Kết thúc ván: dừng đồng hồ, ghi thống kê, rating, EXP rồi báo cho từng người.
  function finish(room, winner, reason) {
    if (room.status !== 'playing') return;
    room.status = 'over';
    room.result = { winner, reason };
    room.drawOffer = null;
    clearTimeout(room.flagTimer);
    if (room.clock) room.clock.stop(Date.now());

    const plies = room.game.moves.length;
    const counted = plies >= MIN_PLIES_RATED;
    const users = {
      w: room.players.w?.user ? store.getUser(room.players.w.user.id) : null,
      b: room.players.b?.user ? store.getUser(room.players.b.user.id) : null,
    };
    const resultFor = (color) => (winner === null ? 'draw' : winner === color ? 'win' : 'loss');

    let ratings = null;
    if (counted && isRated(room) && users.w && users.b) {
      const scoreW = winner === null ? 0.5 : winner === 'w' ? 1 : 0;
      ratings = store.applyRatedGame(users.w, users.b, scoreW, poolOf(room.tc));
    }
    const xp = {};
    for (const color of ['w', 'b']) {
      const user = users[color];
      if (!user || !counted) continue;
      store.recordOnline(user.id, resultFor(color));
      // Người bỏ ván không được EXP.
      const amount = reason === 'abandon' && winner !== color ? 0 : onlineXp(resultFor(color), plies);
      xp[color] = store.addXp(user, amount, { source: 'online' });
    }

    for (const color of ['w', 'b']) {
      sendTo(room, color, {
        type: 'over',
        winner,
        reason,
        clock: clockView(room),
        rated: Boolean(ratings),
        rating: ratings ? { pool: ratings.pool, ...ratings[color], opponent: ratings[other(color)] } : null,
        xp: xp[color] ?? null,
      });
    }
    if (!room.players.w?.connected && !room.players.b?.connected) deleteRoom(room);
  }

  function deleteRoom(room) {
    clearTimeout(room.flagTimer);
    for (const color of ['w', 'b']) clearTimeout(room.players[color]?.graceTimer);
    rooms.delete(room.code);
  }

  function makeSlot(ws) {
    return { ws, user: ws.user, name: ws.name, token: randomBytes(16).toString('hex'), connected: true, graceTimer: null };
  }

  function attach(ws, room, color) {
    ws.room = room;
    ws.color = color;
  }

  // ----- Các lệnh từ người chơi -----
  function newRoom(ws, tc, rated) {
    const room = {
      code: newCode(),
      tc,
      rated,
      players: { w: makeSlot(ws), b: null },
      game: null,
      status: 'waiting',
      result: null,
      clock: null,
      flagTimer: null,
      drawOffer: null,
      rematch: new Set(),
    };
    rooms.set(room.code, room);
    attach(ws, room, 'w');
    return room;
  }

  function createRoom(ws, msg) {
    if (ws.room) return send(ws, { type: 'error', message: 'Bạn đang ở trong một phòng khác.' });
    cancelSeek(ws);
    const room = newRoom(ws, findTimeControl(String(msg.tc ?? 'none')), msg.rated !== false);
    send(ws, { type: 'room', token: room.players.w.token, ...roomInfo(room), rated: room.rated });
  }

  // ----- Ghép trận ngẫu nhiên: cùng thể thức, rating gần nhau; chờ càng lâu thì khoảng chênh càng rộng -----
  const queue = []; // { ws, tc, rating, since }
  const searchWindow = (entry, now) => Math.min(500, 100 + (20 * (now - entry.since)) / 1000);

  function seek(ws, msg) {
    if (ws.room) return send(ws, { type: 'error', message: 'Bạn đang ở trong một phòng khác.' });
    cancelSeek(ws);
    const tc = findTimeControl(String(msg.tc ?? '5+0'));
    const user = ws.user ? store.getUser(ws.user.id) : null;
    const rating = user ? Math.round(store.getRating(user, poolOf(tc)).rating) : 1500;
    queue.push({ ws, tc, rating, since: Date.now() });
    const waiting = queue.filter((e) => e.tc.id === tc.id).length;
    send(ws, { type: 'seeking', tc: { id: tc.id, label: tc.label, short: tc.short }, rating, waiting });
    matchQueue();
  }

  function cancelSeek(ws) {
    for (let i = queue.length - 1; i >= 0; i--) if (queue[i].ws === ws) queue.splice(i, 1);
  }

  function matchQueue() {
    const now = Date.now();
    for (let i = 0; i < queue.length; i++) {
      for (let j = i + 1; j < queue.length; j++) {
        const a = queue[i];
        const b = queue[j];
        if (a.tc.id !== b.tc.id) continue;
        if (a.ws.user && b.ws.user && a.ws.user.id === b.ws.user.id) continue; // không tự ghép với chính mình
        if (Math.abs(a.rating - b.rating) > Math.max(searchWindow(a, now), searchWindow(b, now))) continue;
        queue.splice(j, 1);
        queue.splice(i, 1);
        const [white, black] = Math.random() < 0.5 ? [a, b] : [b, a];
        const room = newRoom(white.ws, a.tc, true);
        room.players.b = makeSlot(black.ws);
        attach(black.ws, room, 'b');
        startGame(room);
        return matchQueue();
      }
    }
  }
  const matchTimer = setInterval(matchQueue, 2000);
  matchTimer.unref();

  function joinRoom(ws, code) {
    const room = rooms.get(code);
    if (ws.room) return send(ws, { type: 'error', message: 'Bạn đang ở trong một phòng khác.' });
    if (!room) return send(ws, { type: 'error', message: 'Không tìm thấy phòng với mã này.' });
    if (room.status !== 'waiting' || room.players.b) return send(ws, { type: 'error', message: 'Phòng đã đủ người.' });
    room.players.b = makeSlot(ws);
    attach(ws, room, 'b');
    startGame(room);
  }

  function rejoin(ws, code, token) {
    const room = rooms.get(code);
    const color = room && ['w', 'b'].find((c) => room.players[c]?.token === token);
    if (!room || !color) return send(ws, { type: 'rejoin_failed', message: 'Phòng không còn tồn tại.' });
    const slot = room.players[color];
    if (slot.ws && slot.ws !== ws) {
      const old = slot.ws;
      old.room = null;
      old.close();
    }
    clearTimeout(slot.graceTimer);
    slot.ws = ws;
    slot.connected = true;
    attach(ws, room, color);
    if (room.status === 'waiting') {
      return send(ws, { type: 'room', token, ...roomInfo(room), rated: room.rated });
    }
    send(ws, {
      type: 'state',
      color,
      token,
      status: room.status,
      result: room.result,
      moves: room.game.moves.map((m) => ({ from: m.from, to: m.to, promo: m.promo })),
      clock: clockView(room),
      drawOffer: room.drawOffer === null ? null : room.drawOffer === color ? 'sent' : 'received',
      opponentConnected: Boolean(room.players[other(color)]?.connected),
      ...roomInfo(room),
    });
    sendTo(room, other(color), { type: 'opponent_reconnected' });
  }

  function playMove(ws, msg) {
    const room = ws.room;
    if (!room || room.status !== 'playing') return send(ws, { type: 'error', message: 'Ván cờ chưa bắt đầu hoặc đã kết thúc.' });
    if (room.game.turn !== ws.color) return send(ws, { type: 'error', message: 'Chưa đến lượt bạn.' });
    if (room.clock && room.clock.remaining(ws.color, Date.now()) <= 0) return; // hết giờ: chờ bộ hẹn giờ xử thua

    const move = room.game.play(Number(msg.from), Number(msg.to), msg.promo ?? null);
    if (!move) return send(ws, { type: 'error', message: 'Nước đi không hợp lệ.' });
    if (room.clock) room.clock.press(ws.color, Date.now());
    if (room.drawOffer) room.drawOffer = null; // đi nước tiếp coi như từ chối lời mời hòa
    const status = room.game.status();
    broadcast(room, { type: 'move', from: move.from, to: move.to, promo: move.promo, clock: clockView(room) });
    if (status.over) finish(room, status.winner, status.reason);
    else scheduleFlag(room);
  }

  function resign(ws) {
    const room = ws.room;
    if (!room || room.status !== 'playing') return send(ws, { type: 'error', message: 'Không thể đầu hàng lúc này.' });
    finish(room, other(ws.color), 'resign');
  }

  function drawOffer(ws) {
    const room = ws.room;
    if (!room || room.status !== 'playing') return;
    if (room.drawOffer === other(ws.color)) return finish(room, null, 'agreement'); // hai bên cùng mời hòa
    if (room.drawOffer === ws.color) return;
    room.drawOffer = ws.color;
    sendTo(room, other(ws.color), { type: 'draw_offer' });
  }

  function drawReply(ws, accept) {
    const room = ws.room;
    if (!room || room.status !== 'playing' || room.drawOffer !== other(ws.color)) return;
    if (accept) return finish(room, null, 'agreement');
    room.drawOffer = null;
    sendTo(room, other(ws.color), { type: 'draw_declined' });
  }

  function rematch(ws) {
    const room = ws.room;
    if (!room || room.status !== 'over') return;
    if (!room.players[other(ws.color)]?.connected) {
      return send(ws, { type: 'error', message: 'Đối thủ đã rời phòng.' });
    }
    room.rematch.add(ws.color);
    if (room.rematch.size < 2) return sendTo(room, other(ws.color), { type: 'rematch_offer' });
    // Cả hai đồng ý: đổi màu quân rồi bắt đầu ván mới.
    const { w, b } = room.players;
    room.players = { w: b, b: w };
    attach(room.players.w.ws, room, 'w');
    attach(room.players.b.ws, room, 'b');
    startGame(room);
  }

  function chat(ws, msg) {
    const room = ws.room;
    const id = Number(msg.id);
    if (!room || !room.players.b || !Number.isInteger(id) || id < 0 || id >= CHAT_PHRASES.length) return;
    const slot = room.players[ws.color];
    const now = Date.now();
    if (now - (slot.lastChat ?? 0) < 1500) return;
    slot.lastChat = now;
    broadcast(room, { type: 'chat', from: ws.color, id });
  }

  // Rời phòng: chủ động (bấm "Về menu") thì xử lý ngay; mất kết nối thì chờ một khoảng để nối lại.
  function leave(ws, { immediate }) {
    const room = ws.room;
    ws.room = null;
    if (!room) return;
    const color = ws.color;
    const slot = room.players[color];
    if (!slot || slot.ws !== ws) return;
    slot.ws = null;
    slot.connected = false;
    const opponent = room.players[other(color)];

    if (room.status === 'waiting') {
      if (immediate) return deleteRoom(room);
      slot.graceTimer = setTimeout(() => deleteRoom(room), graceMs);
      return;
    }
    if (room.status === 'playing') {
      if (immediate) return finish(room, other(color), 'abandon');
      sendTo(room, other(color), { type: 'opponent_disconnected', seconds: Math.round(graceMs / 1000) });
      slot.graceTimer = setTimeout(() => finish(room, other(color), 'abandon'), graceMs);
      return;
    }
    // Ván đã kết thúc: không thể tái đấu nữa.
    room.rematch.clear();
    sendTo(room, other(color), { type: 'opponent_left' });
    if (!opponent?.connected) deleteRoom(room);
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
        case 'create': return createRoom(ws, msg);
        case 'seek': return seek(ws, msg);
        case 'cancel_seek':
          cancelSeek(ws);
          return send(ws, { type: 'seek_cancelled' });
        case 'join': return joinRoom(ws, String(msg.code ?? '').trim().toUpperCase());
        case 'rejoin': return rejoin(ws, String(msg.code ?? '').trim().toUpperCase(), String(msg.token ?? ''));
        case 'move': return playMove(ws, msg);
        case 'resign': return resign(ws);
        case 'draw_offer': return drawOffer(ws);
        case 'draw_accept': return drawReply(ws, true);
        case 'draw_decline': return drawReply(ws, false);
        case 'rematch': return rematch(ws);
        case 'chat': return chat(ws, msg);
        case 'leave': return leave(ws, { immediate: true });
        default: return send(ws, { type: 'error', message: 'Lệnh không hợp lệ.' });
      }
    });
    ws.on('close', () => {
      cancelSeek(ws);
      leave(ws, { immediate: false });
    });
  });

  return {
    rooms,
    close() {
      clearInterval(matchTimer);
      for (const room of rooms.values()) deleteRoom(room);
      for (const client of wss.clients) client.terminate();
      wss.close();
    },
  };
}
