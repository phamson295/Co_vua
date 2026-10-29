// Giao diện và điều khiển: chơi 2 người, chơi với máy, chơi online; bàn cờ 2D và 3D.
import { Game, opponent } from './engine.js';
import { LEVELS } from './ai.js';
import { pieceSvg } from './pieces.js';
import { play as playSound, setSoundEnabled } from './sound.js';
import { initAccount, getUser } from './account.js';

const GLYPH = { K: '♚', Q: '♛', R: '♜', B: '♝', N: '♞', P: '♟' };
const PIECE_NAME = { Q: 'Hậu', R: 'Xe', B: 'Tượng', N: 'Mã' };
const PIECE_VALUE = { P: 1, N: 3, B: 3, R: 5, Q: 9 };
const COLOR_NAME = { w: 'Trắng', b: 'Đen' };
const FILES = 'abcdefgh';
const REASON_TEXT = {
  checkmate: 'Chiếu hết',
  stalemate: 'Hòa do hết nước đi',
  fifty: 'Hòa theo luật 50 nước',
  repetition: 'Hòa do lặp lại thế cờ 3 lần',
  insufficient: 'Hòa do không đủ quân',
  resign: 'Đầu hàng',
};

// ---------- Thiết lập giao diện ----------
const PIECE_OPTIONS = [
  { value: 'classic', label: 'Cổ điển' },
  { value: 'modern', label: 'Hiện đại' },
  { value: 'glyph', label: 'Ký tự' },
  { value: 'letters', label: 'Chữ cái' },
];
const BOARD_OPTIONS = [
  { value: 'wood', label: 'Gỗ', l: '#f0d9b5', d: '#b58863', f: '#5b3a1e' },
  { value: 'green', label: 'Xanh lá', l: '#eeeed2', d: '#769656', f: '#3f5a2a' },
  { value: 'blue', label: 'Xanh dương', l: '#dee3e6', d: '#8ca2ad', f: '#3d5566' },
  { value: 'marble', label: 'Đá cẩm thạch', l: '#f7f7f5', d: '#a9b4bd', f: '#6c7780' },
  { value: 'night', label: 'Ban đêm', l: '#6b7a93', d: '#2f3a4f', f: '#151a24' },
];
const VIEW_OPTIONS = [
  { value: '2d', label: '2D' },
  { value: '3d', label: '3D' },
];
const THEME_OPTIONS = [
  { value: 'auto', label: 'Tự động' },
  { value: 'light', label: 'Sáng' },
  { value: 'dark', label: 'Tối' },
];
const CHOICES = {
  pieces: PIECE_OPTIONS,
  board: BOARD_OPTIONS,
  view: VIEW_OPTIONS,
  theme: THEME_OPTIONS,
};
const DEFAULT_SETTINGS = {
  pieces: 'classic',
  board: 'wood',
  view: '2d',
  theme: 'auto',
  sound: true,
  hints: true,
  coords: true,
  rotate: true,
};
const SETTINGS_KEY = 'co-vua-settings';

const $ = (sel) => document.querySelector(sel);
const els = {
  screens: { menu: $('#menu'), ai: $('#ai-setup'), online: $('#online-setup'), game: $('#game') },
  board: $('#board'),
  board3d: $('#board3d'),
  playerTop: $('#player-top'),
  playerBottom: $('#player-bottom'),
  status: $('#status'),
  moves: $('#moves'),
  undo: $('#undo'),
  newGame: $('#new-game'),
  resign: $('#resign'),
  resetCam: $('#reset-cam'),
  aiColor: $('#ai-color'),
  aiLevel: $('#ai-level'),
  levelText: $('#level-text'),
  levelDesc: $('#level-desc'),
  roomCode: $('#room-code'),
  roomBox: $('#room-box'),
  roomCodeText: $('#room-code-text'),
  onlineMsg: $('#online-msg'),
  settingsDialog: $('#settings-dialog'),
  promoDialog: $('#promo-dialog'),
  promoChoices: $('#promo-choices'),
  resultDialog: $('#result-dialog'),
  resultIcon: $('#result-icon'),
  resultTitle: $('#result-title'),
  resultText: $('#result-text'),
  resultNew: $('#result-new'),
  toast: $('#toast'),
};

let game = new Game();
let mode = null; // 'local' | 'ai' | 'online'
let humanColor = 'w'; // quân của người chơi khi đấu với máy
let aiLevel = 5;
let myColor = 'w'; // quân của người chơi khi chơi online
let onlineNames = {}; // tên hai bên do máy chủ gửi: { w, b }
let roomCode = '';
let selected = null;
let finished = null; // { text, winner }: kết thúc do đầu hàng hoặc mất kết nối
let aiThinking = false;
let aiRequestId = 0;
let awaitingServer = false;
let socket = null;
let lastView = null;
let resultShown = false;
let resultTimer = 0;
let board3d = null;
let board3dLoading = null;
let toastTimer = 0;

const aiWorker = new Worker('js/ai-worker.js', { type: 'module' });

// ---------- Thiết lập: đọc, lưu, áp dụng ----------
const settings = loadSettings();

function loadSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    saved = {};
  }
  const result = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    const value = saved[key];
    const valid = CHOICES[key] ? CHOICES[key].some((o) => o.value === value) : typeof value === 'boolean';
    if (valid) result[key] = value;
  }
  return result;
}

function saveSettings() {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Không lưu được thì vẫn chơi bình thường với thiết lập hiện tại.
  }
}

function setSetting(key, value) {
  settings[key] = value;
  saveSettings();
  applySettings();
  render();
}

const SOUND_ICON = {
  on: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a10 10 0 0 1 0 14"/></svg>',
  off: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 5 6 9H2v6h4l5 4z"/><path d="m22 9-6 6"/><path d="m16 9 6 6"/></svg>',
};

function applySettings() {
  document.documentElement.dataset.theme = settings.theme;
  for (const opt of BOARD_OPTIONS) els.board.classList.toggle(`theme-${opt.value}`, opt.value === settings.board);
  els.board.classList.toggle('coords-off', !settings.coords);
  setSoundEnabled(settings.sound);
  $('#btn-sound').innerHTML = settings.sound ? SOUND_ICON.on : SOUND_ICON.off;

  const iconStyle = settings.pieces === 'modern' ? 'modern' : 'classic';
  $('#brand-logo').innerHTML = pieceSvg(iconStyle, 'wN');
  document.querySelectorAll('[data-icon]').forEach((el) => {
    el.innerHTML = pieceSvg(iconStyle, el.dataset.icon);
  });

  // Đồng bộ các nút chọn và công tắc trong hộp thoại giao diện
  for (const key of Object.keys(CHOICES)) {
    $(`#opt-${key}`)
      .querySelectorAll('[role="radio"]')
      .forEach((btn) => btn.setAttribute('aria-checked', String(btn.dataset.value === settings[key])));
  }
  for (const key of ['sound', 'hints', 'coords', 'rotate']) $(`#opt-${key}`).checked = settings[key];

  applyView();
  if (settings.view === '3d') ensure3D();
}

// Hiện bàn 2D hoặc 3D tùy thiết lập (bàn 3D chỉ hiện khi đã nạp xong).
function applyView() {
  const show3d = settings.view === '3d' && board3d !== null;
  els.board.hidden = show3d;
  els.board3d.hidden = !show3d;
  els.resetCam.hidden = !show3d || mode === null;
  if (show3d) board3d.resize();
}

async function ensure3D() {
  if (board3d) return;
  if (!board3dLoading) {
    board3dLoading = (async () => {
      try {
        const module = await import('./board3d.js');
        board3d = module.createBoard3D(els.board3d, { onSquare });
      } catch (error) {
        console.warn('Không bật được chế độ 3D:', error);
        board3d = null;
        settings.view = '2d';
        applySettings();
        toast('Thiết bị hoặc trình duyệt này không hỗ trợ 3D, đã chuyển về 2D.');
      } finally {
        board3dLoading = null;
      }
    })();
  }
  await board3dLoading;
  applyView();
  render();
}

function buildChoices(key, container, withPreview) {
  container.innerHTML = '';
  for (const opt of CHOICES[key]) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.setAttribute('role', 'radio');
    btn.dataset.value = opt.value;
    if (withPreview) {
      btn.className = 'chip';
      btn.innerHTML = `${choicePreview(key, opt)}<span>${opt.label}</span>`;
    } else {
      btn.textContent = opt.label;
    }
    btn.addEventListener('click', () => setSetting(key, opt.value));
    container.append(btn);
  }
}

function choicePreview(key, opt) {
  if (key === 'board') {
    return `<span class="swatch" style="--l:${opt.l};--d:${opt.d};--f:${opt.f}"></span>`;
  }
  if (opt.value === 'glyph') return `<span class="chip-preview glyph">${GLYPH.N}</span>`;
  if (opt.value === 'letters') return '<span class="chip-preview letters"><span>N</span></span>';
  return `<span class="chip-preview svg">${pieceSvg(opt.value, 'wN')}</span>`;
}

buildChoices('pieces', $('#opt-pieces'), true);
buildChoices('board', $('#opt-board'), true);
buildChoices('view', $('#opt-view'), false);
buildChoices('theme', $('#opt-theme'), false);
for (const key of ['sound', 'hints', 'coords', 'rotate']) {
  $(`#opt-${key}`).addEventListener('change', (e) => setSetting(key, e.target.checked));
}

// ---------- Bàn cờ 2D ----------
// Tạo 64 ô một lần; mỗi ô có phần tử quân và hai nhãn tọa độ, sau đó chỉ cập nhật nội dung.
const squares = [];
const pieceEls = [];
const rankEls = [];
const fileEls = [];
for (let i = 0; i < 64; i++) {
  const sq = document.createElement('div');
  sq.dataset.i = i;
  const pc = document.createElement('span');
  pc.className = 'pc';
  const rank = document.createElement('i');
  rank.className = 'co co-r';
  const file = document.createElement('i');
  file.className = 'co co-f';
  sq.append(pc, rank, file);
  squares.push(sq);
  pieceEls.push(pc);
  rankEls.push(rank);
  fileEls.push(file);
  els.board.append(sq);
}

function paintPiece(el, piece) {
  const key = piece ? `${settings.pieces}:${piece}` : '';
  if (el.dataset.key === key) return;
  el.dataset.key = key;
  el.textContent = '';
  el.removeAttribute('data-letter');
  if (!piece) {
    el.className = 'pc';
    return;
  }
  const colorClass = piece[0] === 'w' ? 'pw' : 'pb';
  if (settings.pieces === 'glyph') {
    el.className = `pc pk-glyph ${colorClass}`;
    el.textContent = GLYPH[piece[1]];
  } else if (settings.pieces === 'letters') {
    el.className = `pc pk-letters ${colorClass}`;
    el.dataset.letter = piece[1];
  } else {
    el.className = 'pc';
    el.innerHTML = pieceSvg(settings.pieces, piece);
  }
}

function render2d(vm) {
  els.board.classList.toggle('flipped', vm.view === 'b');
  const rankCol = vm.view === 'w' ? 0 : 7;
  const fileRow = vm.view === 'w' ? 7 : 0;
  squares.forEach((sq, i) => {
    const r = i >> 3;
    const c = i & 7;
    paintPiece(pieceEls[i], vm.board[i]);
    sq.className = 'sq ' + ((r + c) % 2 ? 'dark' : 'light');
    if (vm.last && (i === vm.last.from || i === vm.last.to)) sq.classList.add('last');
    if (i === vm.selected) sq.classList.add('sel');
    if (vm.targets.has(i)) sq.classList.add(vm.board[i] ? 'capture' : 'target');
    if (i === vm.kingSquare) sq.classList.add('check');
    rankEls[i].textContent = c === rankCol ? String(8 - r) : '';
    fileEls[i].textContent = r === fileRow ? FILES[c] : '';
  });
}

// Quân trượt từ ô đi sang ô đến (bù lại việc bàn cờ có thể đang xoay 180 độ).
function animateMove2d(move) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const pairs = [[move.from, move.to]];
  if (move.castle) pairs.push([move.to > move.from ? move.from + 3 : move.from - 4, (move.from + move.to) / 2]);
  const flipped = els.board.classList.contains('flipped');
  for (const [from, to] of pairs) {
    const a = squares[from].getBoundingClientRect();
    const b = squares[to].getBoundingClientRect();
    const dx = (a.left - b.left) * (flipped ? -1 : 1);
    const dy = (a.top - b.top) * (flipped ? -1 : 1);
    squares[to].style.zIndex = '5';
    const animation = pieceEls[to].animate(
      [{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'translate(0, 0)' }],
      { duration: 200, easing: 'ease-out' },
    );
    animation.onfinish = () => {
      squares[to].style.zIndex = '';
    };
  }
}

// ---------- Hiển thị chung ----------
function use3D() {
  return settings.view === '3d' && board3d !== null;
}

// Bên nào được nhìn bàn cờ từ phía dưới.
function viewColor() {
  if (mode === 'ai') return humanColor;
  if (mode === 'online') return myColor;
  return settings.rotate ? game.turn : 'w';
}

function outcomeFor(winner) {
  if (!winner) return 'draw';
  if (mode === 'ai') return winner === humanColor ? 'win' : 'lose';
  if (mode === 'online') return winner === myColor ? 'win' : 'lose';
  return 'win';
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
  if (finished) return finished.text;
  if (status.over) return resultText(status);
  if (aiThinking) return 'Máy đang suy nghĩ...';
  if (mode === 'online') return game.turn === myColor ? 'Đến lượt bạn.' : 'Đang chờ đối thủ đi...';
  return status.check ? 'Chiếu!' : `Đến lượt quân ${COLOR_NAME[game.turn]}.`;
}

function playerInfo(color) {
  if (mode === 'ai') {
    return color === humanColor
      ? { name: getUser()?.name ?? 'Bạn', sub: `Bạn · quân ${COLOR_NAME[color]}` }
      : { name: `Máy – cấp ${aiLevel}`, sub: LEVELS[aiLevel - 1].name };
  }
  if (mode === 'online') {
    return color === myColor
      ? { name: onlineNames[color] || 'Bạn', sub: `Bạn · quân ${COLOR_NAME[color]} · phòng ${roomCode}` }
      : { name: onlineNames[color] || 'Đối thủ', sub: `Đối thủ · quân ${COLOR_NAME[color]}` };
  }
  return { name: `Quân ${COLOR_NAME[color]}`, sub: `Người chơi ${color === 'w' ? 1 : 2}` };
}

// Quân của đối phương mà `color` đã ăn, xếp từ giá trị cao đến thấp.
function capturedBy(color) {
  return game.moves
    .filter((m) => m.piece[0] === color && m.captured)
    .map((m) => m.captured)
    .sort((a, b) => PIECE_VALUE[b[1]] - PIECE_VALUE[a[1]]);
}

function renderPlayer(el, color, over) {
  const info = playerInfo(color);
  const thinking = aiThinking && mode === 'ai' && color !== humanColor;
  el.querySelector('.pname').textContent = info.name;
  el.querySelector('.psub').textContent = thinking ? 'Đang suy nghĩ...' : info.sub;
  el.querySelector('.avatar').innerHTML = pieceSvg('classic', `${color}K`);
  el.classList.toggle('active', !over && game.turn === color);

  const mine = capturedBy(color);
  const theirs = capturedBy(opponent(color));
  const advantage = mine.reduce((s, p) => s + PIECE_VALUE[p[1]], 0) - theirs.reduce((s, p) => s + PIECE_VALUE[p[1]], 0);
  const taken = mine
    .map((p) => `<span class="cp ${p[0] === 'w' ? 'pw' : 'pb'}">${GLYPH[p[1]]}</span>`)
    .join('');
  el.querySelector('.pcap').innerHTML = taken + (advantage > 0 ? `<span class="adv">+${advantage}</span>` : '');
}

function renderMoves() {
  if (game.moves.length === 0) {
    els.moves.innerHTML = '<li><span class="empty">Chưa có nước đi.</span></li>';
    return;
  }
  const rows = [];
  for (let i = 0; i < game.moves.length; i += 2) {
    const cell = (index) => {
      const m = game.moves[index];
      return m ? `<span class="m${index === game.moves.length - 1 ? ' cur' : ''}">${m.san}</span>` : '<span></span>';
    };
    rows.push(`<li><span class="n">${i / 2 + 1}.</span>${cell(i)}${cell(i + 1)}</li>`);
  }
  els.moves.innerHTML = rows.join('');
  els.moves.scrollTop = els.moves.scrollHeight;
}

// `move`: nước vừa đi (để chạy hoạt ảnh); bỏ trống khi chỉ cập nhật lại hiển thị.
function render({ move = null } = {}) {
  const status = game.status();
  const { state } = game;
  const lastMove = game.moves[game.moves.length - 1] ?? null;
  const view = viewColor();
  const targets = new Set(selected !== null && settings.hints ? game.movesFrom(selected).map((m) => m.to) : []);
  const vm = {
    board: state.board,
    selected,
    targets,
    last: lastMove && { from: lastMove.from, to: lastMove.to },
    kingSquare: status.check ? state.board.indexOf(state.turn + 'K') : -1,
    view,
  };

  if (use3D()) {
    let moved = null;
    if (move) {
      moved = { from: move.from, to: move.to, promo: Boolean(move.promo) };
      if (move.castle) {
        moved.rook = {
          from: move.to > move.from ? move.from + 3 : move.from - 4,
          to: (move.from + move.to) / 2,
        };
      }
    }
    board3d.update({
      ...vm,
      moved,
      boardTheme: settings.board,
      pieceStyle: settings.pieces === 'modern' ? 'modern' : 'classic',
    });
  } else {
    render2d(vm);
    if (move && view === lastView) animateMove2d(move);
  }
  lastView = view;

  const over = status.over || Boolean(finished);
  renderPlayer(view === 'w' ? els.playerTop : els.playerBottom, 'b', over);
  renderPlayer(view === 'w' ? els.playerBottom : els.playerTop, 'w', over);
  renderMoves();
  els.status.textContent = statusText(status);

  els.undo.hidden = mode === 'online';
  els.undo.disabled = aiThinking || game.moves.length === 0;
  els.newGame.hidden = mode === 'online';
  els.resign.hidden = mode !== 'ai' && mode !== 'online';
  els.resign.disabled = over;
  els.resetCam.hidden = !use3D();

  if (over && !resultShown && mode !== null) {
    resultShown = true;
    resultTimer = setTimeout(openResult, 700);
  }
}

// ---------- Âm thanh, thông báo, kết quả ----------
function moveSound(m) {
  const status = game.status();
  playSound(status.check && !status.over ? 'check' : m.castle ? 'castle' : m.captured ? 'capture' : 'move');
  if (status.over) setTimeout(() => playSound(outcomeFor(status.winner) === 'lose' ? 'lose' : status.winner ? 'win' : 'draw'), 350);
}

function toast(text) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.hidden = true;
  }, 2600);
}

function openResult() {
  if (mode === null) return;
  const status = game.status();
  const winner = finished ? finished.winner : status.winner;
  const outcome = finished && finished.kind === 'left' ? 'info' : outcomeFor(winner);
  els.resultIcon.textContent = { win: '🏆', lose: '😞', draw: '🤝', info: '🏁' }[outcome];
  els.resultTitle.textContent =
    outcome === 'draw' ? 'Hòa cờ' : outcome === 'info' ? 'Ván cờ kết thúc' : mode === 'local' ? `Quân ${COLOR_NAME[winner]} thắng` : outcome === 'win' ? 'Bạn thắng!' : 'Bạn thua';
  els.resultText.textContent = finished ? finished.text : REASON_TEXT[status.reason] + '.';
  els.resultNew.hidden = mode === 'online';
  if (!els.resultDialog.open) els.resultDialog.showModal();
}

// ---------- Tương tác trên bàn cờ ----------
function canMove() {
  if (finished || aiThinking || awaitingServer) return false;
  if (game.status().over) return false;
  if (mode === 'ai') return game.turn === humanColor;
  if (mode === 'online') return game.turn === myColor;
  return mode === 'local';
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
  if (selected !== null) playSound('select');
  render();
}

function pieceMarkup(piece) {
  if (settings.pieces === 'glyph') return `<span class="chip-preview glyph">${GLYPH[piece[1]]}</span>`;
  if (settings.pieces === 'letters') return `<span class="chip-preview letters"><span>${piece[1]}</span></span>`;
  return `<span class="chip-preview svg">${pieceSvg(settings.pieces, piece)}</span>`;
}

function choosePromotion(candidates, onChoose) {
  els.promoChoices.innerHTML = '';
  for (const m of candidates) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'promo-btn';
    btn.innerHTML = `${pieceMarkup(m.piece[0] + m.promo)}<span>${PIECE_NAME[m.promo]}</span>`;
    btn.addEventListener('click', () => {
      els.promoDialog.close();
      onChoose(m.promo);
    });
    els.promoChoices.append(btn);
  }
  els.promoDialog.showModal();
}

function sendOrPlay(from, to, promo) {
  selected = null;
  if (mode === 'online') {
    awaitingServer = true;
    send({ type: 'move', from, to, promo });
    render();
    return;
  }
  const m = game.play(from, to, promo);
  if (!m) return;
  moveSound(m);
  render({ move: m });
  if (mode === 'ai' && !game.status().over && game.turn !== humanColor) askAI();
}

// ---------- Máy ----------
function askAI() {
  aiThinking = true;
  aiWorker.postMessage({ id: ++aiRequestId, level: aiLevel, state: game.state });
  render();
}

aiWorker.onmessage = ({ data }) => {
  if (data.id !== aiRequestId || mode !== 'ai') return;
  aiThinking = false;
  const m = data.move ? game.play(data.move.from, data.move.to, data.move.promo) : null;
  if (m) moveSound(m);
  render({ move: m });
};

function undoMove() {
  if (aiThinking || game.moves.length === 0) return;
  clearTimeout(resultTimer);
  resultShown = false;
  finished = null;
  selected = null;
  game.undo();
  // Đấu với máy: hoàn tác cả nước của máy để quay lại lượt người chơi.
  if (mode === 'ai' && game.turn !== humanColor && game.moves.length > 0) game.undo();
  render();
  if (mode === 'ai' && game.turn !== humanColor && !game.status().over) askAI();
}

// ---------- Bắt đầu và kết thúc ván ----------
function show(screen) {
  for (const [name, el] of Object.entries(els.screens)) el.hidden = name !== screen;
  if (screen === 'game') applyView();
}

function resetGame(nextMode) {
  mode = nextMode;
  game = new Game();
  selected = null;
  finished = null;
  aiThinking = false;
  awaitingServer = false;
  resultShown = false;
  lastView = null;
  clearTimeout(resultTimer);
  aiRequestId++;
  show('game');
  if (els.resultDialog.open) els.resultDialog.close();
  render();
  playSound('start');
}

function startAI(keepColor = false) {
  if (!keepColor) {
    const choice = els.aiColor.querySelector('[aria-checked="true"]').dataset.value;
    humanColor = choice === 'r' ? (Math.random() < 0.5 ? 'w' : 'b') : choice;
    aiLevel = Number(els.aiLevel.value);
  }
  resetGame('ai');
  if (game.turn !== humanColor) askAI();
}

function restartGame() {
  if (mode === 'ai') startAI(true);
  else if (mode === 'local') resetGame('local');
}

function goHome() {
  aiRequestId++;
  aiThinking = false;
  awaitingServer = false;
  mode = null;
  finished = null;
  clearTimeout(resultTimer);
  if (els.resultDialog.open) els.resultDialog.close();
  if (socket) {
    const old = socket;
    socket = null;
    old.close();
  }
  show('menu');
}

// ---------- Chơi online ----------
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
      finished = { text: 'Mất kết nối với máy chủ.', winner: null, kind: 'left' };
      render();
    } else {
      els.onlineMsg.textContent = 'Mất kết nối với máy chủ.';
    }
  };
}

function showError(text) {
  els.onlineMsg.textContent = text;
  if (mode === 'online') toast(text);
  playSound('error');
}

function handleServer(msg) {
  switch (msg.type) {
    case 'room':
      roomCode = msg.code;
      els.roomCodeText.textContent = msg.code;
      els.roomBox.hidden = false;
      els.onlineMsg.textContent = 'Đang chờ đối thủ vào phòng...';
      break;
    case 'start':
      myColor = msg.color;
      roomCode = msg.code;
      onlineNames = msg.names ?? {};
      resetGame('online');
      break;
    case 'move': {
      awaitingServer = false;
      const m = game.play(msg.from, msg.to, msg.promo);
      if (m) {
        moveSound(m);
        render({ move: m });
      } else {
        showError('Ván cờ không đồng bộ. Hãy về menu và vào lại phòng.');
        render();
      }
      break;
    }
    case 'over':
      finished = {
        text: msg.winner === myColor ? 'Đối thủ đã đầu hàng — Bạn thắng.' : 'Bạn đã đầu hàng — Đối thủ thắng.',
        winner: msg.winner,
        kind: 'resign',
      };
      playSound(outcomeFor(msg.winner) === 'win' ? 'win' : 'lose');
      render();
      break;
    case 'opponent_left':
      finished = { text: 'Đối thủ đã rời phòng.', winner: null, kind: 'left' };
      render();
      break;
    case 'error':
      awaitingServer = false;
      showError(msg.message);
      render();
      break;
  }
}

function roomLink() {
  return `${location.origin}${location.pathname}?room=${roomCode}`;
}

function createRoom() {
  els.roomBox.hidden = true;
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

async function copyText(text, okMessage) {
  try {
    await navigator.clipboard.writeText(text);
    toast(okMessage);
  } catch {
    window.prompt('Hãy sao chép nội dung dưới đây:', text);
  }
}

// ---------- Gắn sự kiện ----------
els.board.addEventListener('click', (e) => {
  const sq = e.target.closest('.sq');
  if (sq) onSquare(Number(sq.dataset.i));
});

$('#btn-local').addEventListener('click', () => resetGame('local'));
$('#btn-ai').addEventListener('click', () => show('ai'));
$('#btn-online').addEventListener('click', () => {
  els.onlineMsg.textContent = '';
  els.roomBox.hidden = true;
  show('online');
});
$('#ai-start').addEventListener('click', () => startAI());
$('#create-room').addEventListener('click', createRoom);
$('#join-room').addEventListener('click', joinRoom);
els.roomCode.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom();
});
$('#copy-room').addEventListener('click', () => copyText(roomLink(), 'Đã sao chép liên kết phòng'));
const shareButton = $('#share-room');
shareButton.hidden = !navigator.share;
shareButton.addEventListener('click', () => {
  navigator.share({ title: 'Cờ Vua', text: `Vào phòng cờ vua với mình, mã phòng ${roomCode}`, url: roomLink() }).catch(() => {});
});

document.querySelectorAll('[data-home]').forEach((btn) => btn.addEventListener('click', goHome));

els.undo.addEventListener('click', undoMove);
els.newGame.addEventListener('click', () => {
  if (game.moves.length > 0 && !game.status().over && !window.confirm('Bắt đầu ván mới? Ván hiện tại sẽ bị hủy.')) return;
  restartGame();
});
els.resign.addEventListener('click', () => {
  if (!window.confirm('Bạn chắc chắn muốn đầu hàng?')) return;
  if (mode === 'online') {
    send({ type: 'resign' });
  } else {
    aiRequestId++;
    aiThinking = false;
    const winner = opponent(humanColor);
    finished = { text: `Bạn đã đầu hàng — ${winnerLabel(winner)}.`, winner, kind: 'resign' };
    playSound('lose');
    render();
  }
});
els.resetCam.addEventListener('click', () => board3d?.resetCamera());
$('#copy-pgn').addEventListener('click', () => {
  if (game.moves.length === 0) toast('Chưa có nước đi nào.');
  else copyText(game.pgn(), 'Đã sao chép PGN');
});

$('#btn-sound').addEventListener('click', () => setSetting('sound', !settings.sound));
$('#btn-settings').addEventListener('click', () => els.settingsDialog.showModal());
$('#menu-settings').addEventListener('click', () => els.settingsDialog.showModal());
$('#settings-close').addEventListener('click', () => els.settingsDialog.close());
for (const dialog of [els.settingsDialog, els.resultDialog]) {
  dialog.addEventListener('click', (e) => {
    if (e.target === dialog) dialog.close();
  });
}

$('#result-new').addEventListener('click', () => {
  els.resultDialog.close();
  restartGame();
});
$('#result-view').addEventListener('click', () => els.resultDialog.close());
$('#result-home').addEventListener('click', goHome);

els.aiColor.querySelectorAll('[role="radio"]').forEach((btn) => {
  btn.addEventListener('click', () => {
    els.aiColor.querySelectorAll('[role="radio"]').forEach((b) => b.setAttribute('aria-checked', String(b === btn)));
  });
});

const LEVEL_DESC = [
  [3, 'Dành cho người mới tập chơi, máy thường đi sai.'],
  [6, 'Chơi giải trí, máy đôi lúc vẫn đi sai.'],
  [9, 'Khá chắc tay, biết tính vài nước phía trước.'],
  [12, 'Mạnh, tính sâu nhiều nước, rất ít khi mắc lỗi.'],
];
function updateLevelText() {
  const level = LEVELS[Number(els.aiLevel.value) - 1];
  els.levelText.textContent = `${level.level} – ${level.name}`;
  els.levelDesc.textContent = LEVEL_DESC.find(([max]) => level.level <= max)[1];
}
els.aiLevel.addEventListener('input', updateLevelText);
updateLevelText();

// ---------- Khởi động ----------
applySettings();
show('menu');
initAccount({
  button: $('#btn-account'),
  banner: $('#account-banner'),
  dialog: $('#account-dialog'),
  onChange: () => {
    if (mode !== null) render();
  },
  toast,
});

// Móc gỡ lỗi cho kiểm thử tự động, chỉ bật khi mở trang với ?debug
if (new URLSearchParams(location.search).has('debug')) {
  window.__covua = {
    board3d: () => board3d,
    game: () => game,
    selected: () => selected,
    // Nạp một thế cờ (FEN) để kiểm thử các tình huống như phong cấp.
    load(fen) {
      mode = mode ?? 'local';
      game = new Game(fen);
      selected = null;
      finished = null;
      resultShown = false;
      show('game');
      render();
    },
  };
}

// Mở bằng liên kết phòng (?room=ABCDE): vào phòng luôn.
const roomFromLink = new URLSearchParams(location.search).get('room');
if (roomFromLink) {
  els.roomCode.value = roomFromLink.toUpperCase().slice(0, 5);
  show('online');
  joinRoom();
}
