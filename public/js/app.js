// Giao diện và điều khiển: chơi 2 người, chơi với máy, chơi online.
import { Game, sqName, opponent } from './engine.js';
import { LEVELS } from './ai.js';

const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const OUTLINE_GLYPH = { K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙' };
const DEFAULT_SETTINGS = { pieces: 'classic', board: 'wood', view: '2d' };
const SETTINGS_KEY = 'co-vua-settings';
const BOARD_THEMES = ['wood', 'green', 'blue', 'marble', 'night'];
const PIECE_SETS = ['classic', 'outline', 'letters'];
const PROMO_NAME = { Q: 'Hậu', R: 'Xe', B: 'Tượng', N: 'Mã' };
const COLOR_NAME = { w: 'Trắng', b: 'Đen' };
const REASON_TEXT = {
  checkmate: 'Chiếu hết',
  stalemate: 'Hòa do hết nước đi',
  fifty: 'Hòa theo luật 50 nước',
  repetition: 'Hòa do lặp lại thế cờ 3 lần',
  insufficient: 'Hòa do không đủ quân',
  resign: 'Đầu hàng',
};

const $ = (sel) => document.querySelector(sel);
const els = {
  menu: $('#menu'),
  aiSetup: $('#ai-setup'),
  onlineSetup: $('#online-setup'),
  game: $('#game'),
  board: $('#board'),
  boardWrap: $('#board-wrap'),
  settingSelects: document.querySelectorAll('[data-setting]'),
  modeText: $('#mode-text'),
  turnText: $('#turn-text'),
  status: $('#status'),
  moves: $('#moves'),
  undo: $('#undo'),
  resign: $('#resign'),
  rotateOption: $('#rotate-option'),
  autoRotate: $('#auto-rotate'),
  aiColor: $('#ai-color'),
  aiLevel: $('#ai-level'),
  levelText: $('#level-text'),
  roomCode: $('#room-code'),
  onlineMsg: $('#online-msg'),
  promo: $('#promo'),
  promoChoices: $('#promo-choices'),
};

let game = new Game();
let mode = null; // 'local' | 'ai' | 'online'
let humanColor = 'w'; // quân của người chơi khi đấu với máy
let aiLevel = 5;
let myColor = 'w'; // quân của người chơi khi chơi online
let roomCode = '';
let selected = null;
let finishedText = null; // thông báo kết thúc do đầu hàng hoặc mất kết nối
let aiThinking = false;
let aiRequestId = 0;
let awaitingServer = false;
let socket = null;

const aiWorker = new Worker('js/ai-worker.js', { type: 'module' });

// Tạo 64 ô một lần, mỗi ô có một phần tử quân riêng; sau đó chỉ cập nhật nội dung và lớp CSS.
const squares = [];
const pieceEls = [];
for (let i = 0; i < 64; i++) {
  const sq = document.createElement('div');
  sq.dataset.i = i;
  const pc = document.createElement('span');
  pc.className = 'pc';
  sq.append(pc);
  squares.push(sq);
  pieceEls.push(pc);
  els.board.append(sq);
}

// Thiết lập giao diện, lưu trên trình duyệt (nếu trình duyệt cho phép).
const settings = loadSettings();

function loadSettings() {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Không lưu được thì vẫn chơi bình thường với thiết lập hiện tại.
  }
}

function applySettings() {
  for (const t of BOARD_THEMES) els.board.classList.toggle(`theme-${t}`, t === settings.board);
  for (const p of PIECE_SETS) els.board.classList.toggle(`ps-${p}`, p === settings.pieces);
  const is3d = settings.view === '3d';
  els.boardWrap.classList.toggle('view3d', is3d);
  els.board.classList.toggle('view3d', is3d);
  for (const el of els.settingSelects) el.value = settings[el.dataset.setting];
}

for (const el of els.settingSelects) {
  el.addEventListener('change', () => {
    settings[el.dataset.setting] = el.value;
    saveSettings();
    applySettings();
    render();
  });
}

function pieceText(piece) {
  if (!piece) return '';
  const type = piece[1];
  if (settings.pieces === 'letters') return type;
  if (settings.pieces === 'outline' && piece[0] === 'w') return OUTLINE_GLYPH[type];
  return GLYPH[type];
}

function show(screen) {
  for (const el of [els.menu, els.aiSetup, els.onlineSetup, els.game]) {
    el.hidden = el !== screen;
  }
}

// Bên nào được nhìn bàn cờ từ phía dưới.
function viewColor() {
  if (mode === 'ai') return humanColor;
  if (mode === 'online') return myColor;
  return els.autoRotate.checked ? game.turn : 'w';
}

function winnerLabel(winner) {
  if (mode === 'ai') return winner === humanColor ? 'Bạn thắng' : 'Máy thắng';
  if (mode === 'online') return winner === myColor ? 'Bạn thắng' : 'Đối thủ thắng';
  return `${COLOR_NAME[winner]} thắng`;
}

function resultText(status) {
  const reason = REASON_TEXT[status.reason];
  return status.winner ? `${reason} — ${winnerLabel(status.winner)}.` : `${reason} — ván hòa.`;
}

function statusText(status) {
  if (finishedText) return finishedText;
  if (status.over) return resultText(status);
  if (aiThinking) return 'Máy đang suy nghĩ...';
  if (mode === 'online') return game.turn === myColor ? 'Đến lượt bạn.' : 'Đang chờ đối thủ đi...';
  return status.check ? 'Đang bị chiếu!' : '';
}

function movesText() {
  return game.moves
    .map((m, i) => {
      const text = `${sqName(m.from)}-${sqName(m.to)}${m.promo ? '=' + m.promo : ''}`;
      return i % 2 === 0 ? `${i / 2 + 1}. ${text}` : text;
    })
    .join('  ');
}

function modeText() {
  if (mode === 'local') return 'Hai người chơi';
  if (mode === 'ai') {
    return `Với máy – cấp ${aiLevel} (${LEVELS[aiLevel - 1].name}), bạn cầm quân ${COLOR_NAME[humanColor]}`;
  }
  return `Online – phòng ${roomCode}, bạn cầm quân ${COLOR_NAME[myColor]}`;
}

function render() {
  const { state } = game;
  const status = game.status();
  const last = game.moves[game.moves.length - 1];
  const targets = new Set(selected === null ? [] : game.movesFrom(selected).map((m) => m.to));
  const kingSquare = status.check ? state.board.indexOf(state.turn + 'K') : -1;

  els.board.classList.toggle('flipped', viewColor() === 'b');

  squares.forEach((sq, i) => {
    const piece = state.board[i];
    pieceEls[i].textContent = pieceText(piece);
    pieceEls[i].className = piece ? `pc ${piece[0] === 'w' ? 'pw' : 'pb'}` : 'pc';
    sq.className = 'sq ' + (((i >> 3) + (i & 7)) % 2 ? 'dark' : 'light');
    if (last && (i === last.from || i === last.to)) sq.classList.add('last');
    if (i === selected) sq.classList.add('sel');
    if (targets.has(i)) sq.classList.add(piece ? 'capture' : 'target');
    if (i === kingSquare) sq.classList.add('check');
  });

  els.modeText.textContent = modeText();
  els.turnText.textContent = status.over ? 'Ván cờ kết thúc' : `Lượt: ${COLOR_NAME[state.turn]}`;
  els.status.textContent = statusText(status);
  els.moves.textContent = movesText();

  const ended = Boolean(finishedText) || status.over;
  els.undo.hidden = mode === 'online';
  els.undo.disabled = aiThinking || game.moves.length === 0;
  els.resign.hidden = mode !== 'ai' && mode !== 'online';
  els.resign.disabled = ended;
  els.rotateOption.hidden = mode !== 'local';
}

function canMove() {
  if (finishedText || aiThinking || awaitingServer) return false;
  if (game.status().over) return false;
  if (mode === 'ai') return game.turn === humanColor;
  if (mode === 'online') return game.turn === myColor;
  return true;
}

function onSquare(i) {
  if (!canMove()) return;

  if (selected !== null) {
    const candidates = game.movesFrom(selected).filter((m) => m.to === i);
    if (candidates.length > 0) {
      const from = selected;
      if (candidates[0].promo) {
        choosePromotion(candidates, (promo) => sendOrPlay(from, i, promo));
      } else {
        sendOrPlay(from, i, null);
      }
      return;
    }
  }

  const piece = game.state.board[i];
  selected = piece && piece[0] === game.turn && i !== selected ? i : null;
  render();
}

function choosePromotion(candidates, onChoose) {
  els.promoChoices.innerHTML = '';
  for (const m of candidates) {
    const btn = document.createElement('button');
    btn.className = 'btn primary';
    btn.textContent = `${GLYPH[m.promo]} ${PROMO_NAME[m.promo]}`;
    btn.addEventListener('click', () => {
      els.promo.hidden = true;
      onChoose(m.promo);
    });
    els.promoChoices.append(btn);
  }
  els.promo.hidden = false;
}

function sendOrPlay(from, to, promo) {
  selected = null;
  if (mode === 'online') {
    awaitingServer = true;
    send({ type: 'move', from, to, promo });
    render();
    return;
  }
  game.play(from, to, promo);
  render();
  if (mode === 'ai' && !game.status().over && game.turn !== humanColor) askAI();
}

function askAI() {
  aiThinking = true;
  aiWorker.postMessage({ id: ++aiRequestId, level: aiLevel, state: game.state });
  render();
}

aiWorker.onmessage = ({ data }) => {
  if (data.id !== aiRequestId || mode !== 'ai') return;
  aiThinking = false;
  if (data.move) game.play(data.move.from, data.move.to, data.move.promo);
  render();
};

function undoMove() {
  if (aiThinking || game.moves.length === 0) return;
  selected = null;
  game.undo();
  // Đấu với máy: hoàn tác cả nước của máy để quay lại lượt người chơi.
  if (mode === 'ai' && game.turn !== humanColor && game.moves.length > 0) game.undo();
  render();
  if (mode === 'ai' && game.turn !== humanColor && !game.status().over) askAI();
}

function resetGame(nextMode) {
  mode = nextMode;
  game = new Game();
  selected = null;
  finishedText = null;
  aiThinking = false;
  awaitingServer = false;
  aiRequestId++;
  show(els.game);
  render();
}

function startAI() {
  const choice = els.aiColor.value;
  humanColor = choice === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : choice;
  aiLevel = Number(els.aiLevel.value);
  resetGame('ai');
  if (game.turn !== humanColor) askAI();
}

function goHome() {
  aiRequestId++;
  aiThinking = false;
  awaitingServer = false;
  mode = null;
  finishedText = null;
  if (socket) {
    const old = socket;
    socket = null;
    old.close();
  }
  show(els.menu);
}

// Chơi online
function send(msg) {
  if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(msg));
}

function connect(onOpen) {
  if (socket) {
    const old = socket;
    socket = null;
    old.close();
  }
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  socket = ws;
  ws.onopen = onOpen;
  ws.onmessage = (e) => handleServer(JSON.parse(e.data));
  ws.onerror = () => {
    if (socket === ws) els.onlineMsg.textContent = 'Không kết nối được máy chủ.';
  };
  ws.onclose = () => {
    if (socket !== ws) return;
    socket = null;
    if (mode === 'online') {
      finishedText = 'Mất kết nối với máy chủ.';
      render();
    } else {
      els.onlineMsg.textContent = 'Mất kết nối với máy chủ.';
    }
  };
}

function showError(text) {
  els.onlineMsg.textContent = text;
  if (mode === 'online') els.status.textContent = text;
}

function handleServer(msg) {
  switch (msg.type) {
    case 'room':
      roomCode = msg.code;
      els.onlineMsg.textContent = `Mã phòng: ${msg.code}. Gửi mã này cho bạn để họ vào phòng. Đang chờ đối thủ...`;
      break;
    case 'start':
      myColor = msg.color;
      roomCode = msg.code;
      resetGame('online');
      break;
    case 'move':
      awaitingServer = false;
      if (!game.play(msg.from, msg.to, msg.promo)) {
        showError('Ván cờ không đồng bộ. Hãy về menu và vào lại phòng.');
      }
      render();
      break;
    case 'over':
      finishedText = `${REASON_TEXT[msg.reason]} — ${winnerLabel(msg.winner)}.`;
      render();
      break;
    case 'opponent_left':
      finishedText = 'Đối thủ đã rời phòng.';
      render();
      break;
    case 'error':
      awaitingServer = false;
      showError(msg.message);
      render();
      break;
  }
}

function createRoom() {
  els.onlineMsg.textContent = 'Đang tạo phòng...';
  connect(() => send({ type: 'create' }));
}

function joinRoom() {
  const code = els.roomCode.value.trim().toUpperCase();
  if (!code) {
    els.onlineMsg.textContent = 'Hãy nhập mã phòng.';
    return;
  }
  els.onlineMsg.textContent = 'Đang vào phòng...';
  connect(() => send({ type: 'join', code }));
}

// Gắn sự kiện
els.board.addEventListener('click', (e) => {
  const sq = e.target.closest('.sq');
  if (sq) onSquare(Number(sq.dataset.i));
});

$('#btn-local').addEventListener('click', () => resetGame('local'));
$('#btn-ai').addEventListener('click', () => show(els.aiSetup));
$('#btn-online').addEventListener('click', () => {
  els.onlineMsg.textContent = '';
  show(els.onlineSetup);
});
$('#ai-start').addEventListener('click', startAI);
$('#create-room').addEventListener('click', createRoom);
$('#join-room').addEventListener('click', joinRoom);
els.roomCode.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom();
});
document.querySelectorAll('[data-home]').forEach((btn) => btn.addEventListener('click', goHome));

els.undo.addEventListener('click', undoMove);
els.resign.addEventListener('click', () => {
  if (!confirm('Bạn chắc chắn muốn đầu hàng?')) return;
  if (mode === 'online') {
    send({ type: 'resign' });
  } else {
    aiRequestId++;
    aiThinking = false;
    finishedText = `${REASON_TEXT.resign} — ${winnerLabel(opponent(humanColor))}.`;
    render();
  }
});
els.autoRotate.addEventListener('change', render);

els.aiLevel.addEventListener('input', updateLevelText);
function updateLevelText() {
  const level = LEVELS[Number(els.aiLevel.value) - 1];
  els.levelText.textContent = `${level.level} – ${level.name}`;
}
updateLevelText();

applySettings();
show(els.menu);
