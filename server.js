const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const ratings = require('./ratings');
const ChessCards = require('./cards');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();
const waitingMatches = new Map();
const ratingStore = ratings.createStore(path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'ratings.json'));
// 이보다 일찍 끝난 빠른 매칭 판은 랭킹에 넣지 않는다(양쪽이 두 턴씩은 두어야 함).
const MIN_RATED_MOVE = 5;
app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.get('/', (_req, res) => res.sendFile(__dirname + '/game.html'));
app.get('/debug-play.html', (_req, res) => res.sendFile(__dirname + '/game.html'));
app.get('/api/rooms', (_req, res) => res.json(publicRoomList()));
app.get('/api/leaderboard', (_req, res) => res.json(ratingStore.leaderboard(20)));
app.use(express.static(__dirname));
app.get('/health', (_req, res) => res.json({ ok: true, rooms: rooms.size, waiting: waitingMatches.size }));

function makeCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(''); }
  while (rooms.has(code));
  return code;
}

function cleanText(value, fallback, max = 20) {
  return String(value || '').replace(/\s+/g, ' ').trim().slice(0, max) || fallback;
}

function makeRoom(hostId, state, options = {}) {
  const code = makeCode();
  rooms.set(code, {
    players: { w: hostId, b: null },
    names: { w: cleanText(options.nickname, '플레이어 1'), b: null },
    spectators: new Map(),
    state: state || null,
    visibility: options.visibility === 'public' ? 'public' : 'private',
    name: cleanText(options.name, '체스 UNO 공개 대전', 24),
    mode: options.mode || 'code',
    chat: [],
    newGameOffer: null,
    weights: ChessCards.normalizeWeights(state?.weights),
    skins: { w: null, b: null },
    pids: { w: null, b: null },
    rated: false,
    ratedDone: false,
    createdAt: Date.now()
  });
  return code;
}

function roomInfo(code, room) {
  return { room: code, names: room.names, skins: room.skins, spectators: room.spectators.size };
}

function emitRoomInfo(code, room) { io.to(code).emit('roomInfo', roomInfo(code, room)); }

function roleOf(room, socketId) {
  if (room.players.w === socketId) return { seat: 'w', name: room.names.w };
  if (room.players.b === socketId) return { seat: 'b', name: room.names.b };
  if (room.spectators?.has(socketId)) return { seat: 'spectator', name: room.spectators.get(socketId) };
  return null;
}

// 채팅은 방마다 최근 60개를 남겨 나중에 들어온 사람도 볼 수 있게 한다.
function pushChat(code, room, entry) {
  const full = { ...entry, at: Date.now() };
  room.chat.push(full);
  if (room.chat.length > 60) room.chat.splice(0, room.chat.length - 60);
  io.to(code).emit('chat', { room: code, entry: full });
}

function systemChat(code, room, text) { pushChat(code, room, { seat: 'system', name: '', text }); }

const colorName = c => c === 'w' ? '흰색' : '검은색';
const colorOfSeat = (state, seat) => ['w', 'b'].find(c => (state?.ownerByColor?.[c] || c) === seat) || seat;

// 빠른 매칭 판이 끝나면 한 번만 레이팅을 반영하고 결과를 방에 알린다.
function finishRated(code, room) {
  const state = room.state;
  if (!room.rated || room.ratedDone || !state?.over) return;
  room.ratedDone = true;
  if ((state.moveNo || 1) < MIN_RATED_MOVE) return systemChat(code, room, '너무 일찍 끝난 판이라 랭킹에 반영하지 않았어요.');
  const result = String(state.result || '');
  const winnerColor = result.includes('흰색 승리') ? 'w' : result.includes('검은색 승리') ? 'b' : null;
  const winnerSeat = winnerColor ? (state.ownerByColor?.[winnerColor] || winnerColor) : null;
  const change = ratingStore.recordGame({ id: room.pids.w, name: room.names.w }, { id: room.pids.b, name: room.names.b }, winnerSeat === 'w' ? 'a' : winnerSeat === 'b' ? 'b' : 'draw');
  const changes = { w: change.a, b: change.b };
  io.to(code).emit('ratingResult', { room: code, changes, names: { ...room.names } });
  const line = seat => `${room.names[seat]} ${changes[seat].before}→${changes[seat].after} (${changes[seat].delta >= 0 ? '+' : ''}${changes[seat].delta})`;
  systemChat(code, room, `🏆 랭킹 반영: ${line('w')}, ${line('b')}`);
}

// 레이팅 판에서 한쪽이 나가면 남은 쪽의 기권승으로 끝낸다.
function forfeitOnLeave(code, room, seat) {
  const state = room.state;
  if (!room.rated || room.ratedDone || !state || state.over || (state.moveNo || 1) < MIN_RATED_MOVE) return;
  const loser = colorOfSeat(state, seat), winner = loser === 'w' ? 'b' : 'w';
  const text = `${colorName(winner)} 승리 · ${room.names[seat]}(${colorName(loser)}) 님이 나가 기권패`;
  room.state = { ...state, over: true, result: text, drawn: false, cardId: null, activeKind: null, movesLeft: 0,
    log: [{ n: state.moveNo || 1, m: `🏆 ${text}` }, ...(state.log || [])].slice(0, 200) };
  io.to(code).emit('stateUpdate', { room: code, state: room.state });
  finishRated(code, room);
}

function publicRoomList() {
  return [...rooms.entries()]
    .filter(([, room]) => room.visibility === 'public')
    .sort((a, b) => b[1].createdAt - a[1].createdAt)
    .map(([code, room]) => ({
      code, name: room.name, host: room.names.w || '빈 자리', guest: room.names.b,
      players: Number(Boolean(room.players.w)) + Number(Boolean(room.players.b)),
      spectators: room.spectators.size, open: room.mode !== 'quick' && (!room.players.w || !room.players.b), over: Boolean(room.state?.over), custom: Boolean(room.weights), quick: room.mode === 'quick'
    }));
}

function broadcastRoomList() { io.emit('roomList', publicRoomList()); }

function takeWaitingOpponent(socketId) {
  for (const [otherId, entry] of waitingMatches) {
    if (otherId === socketId) continue;
    waitingMatches.delete(otherId);
    const otherSocket = io.sockets.sockets.get(otherId);
    if (otherSocket?.connected) return { otherSocket, entry };
  }
  return null;
}

io.on('connection', socket => {
  socket.emit('roomList', publicRoomList());
  socket.on('requestRoomList', () => socket.emit('roomList', publicRoomList()));

  socket.on('createRoom', (payload, callback = () => {}) => {
    waitingMatches.delete(socket.id);
    leaveRooms();
    const structured = payload && Object.prototype.hasOwnProperty.call(payload, 'state');
    const state = structured ? payload.state : payload;
    const visibility = structured ? payload.visibility : 'private';
    const code = makeRoom(socket.id, state, { visibility, name: payload?.name, nickname: payload?.nickname });
    socket.join(code);
    const room = rooms.get(code);
    if (room.state) room.state.weights = room.weights;
    callback({ ok: true, room: code, seat: 'w', state: room.state, info: roomInfo(code, room), chat: room.chat });
    if (visibility === 'public') broadcastRoomList();
  });

  socket.on('quickMatch', ({ state, nickname, playerId } = {}, callback = () => {}) => {
    waitingMatches.delete(socket.id);
    leaveRooms();
    const pid = ratings.isPlayerId(playerId) ? playerId : null;
    const opponent = takeWaitingOpponent(socket.id);
    if (!opponent) {
      waitingMatches.set(socket.id, { state, nickname: cleanText(nickname, '플레이어'), pid });
      return callback({ ok: true, status: 'waiting' });
    }
    // 빠른 매칭 판은 공개 목록에 올려 누구나 관전할 수 있게 한다(참가는 불가).
    const code = makeRoom(opponent.otherSocket.id, opponent.entry.state || state, { mode: 'quick', visibility: 'public', nickname: opponent.entry.nickname });
    const room = rooms.get(code);
    room.players.b = socket.id;
    room.names.b = cleanText(nickname, '플레이어 2');
    // 빠른 매칭은 랭킹이 공정하도록 항상 기본 확률로 둔다.
    room.weights = null; if (room.state) room.state.weights = null;
    room.pids = { w: opponent.entry.pid, b: pid };
    // 같은 브라우저끼리(탭 두 개) 매칭된 판은 랭킹에 넣지 않는다.
    room.rated = Boolean(room.pids.w && room.pids.b && room.pids.w !== room.pids.b);
    opponent.otherSocket.join(code); socket.join(code);
    const info = roomInfo(code, room);
    opponent.otherSocket.emit('matchFound', { ok: true, room: code, seat: 'w', state: room.state, info, chat: room.chat });
    callback({ ok: true, status: 'matched', room: code, seat: 'b', state: room.state, info, chat: room.chat });
    emitRoomInfo(code, room);
    room.name = `빠른 매칭 · ${room.names.w} vs ${room.names.b}`;
    broadcastRoomList();
  });

  socket.on('cancelQuickMatch', (callback = () => {}) => callback({ ok: true, cancelled: waitingMatches.delete(socket.id) }));

  socket.on('closeRoom', ({ room } = {}, callback = () => {}) => {
    const code = String(room || '').toUpperCase();
    const game = rooms.get(code);
    if (!game) return callback({ ok: false, error: '이미 사라진 방이에요.' });
    if (game.visibility !== 'public') return callback({ ok: false, error: '공개 방만 목록에서 닫을 수 있어요.' });
    if (game.mode === 'quick') return callback({ ok: false, error: '빠른 매칭 방은 닫을 수 없어요.' });
    if (game.players.w !== socket.id) return callback({ ok: false, error: '방을 만든 플레이어만 닫을 수 있어요.' });
    io.to(code).emit('roomClosed', { room: code, message: '방장이 공개 방을 닫았어요.' });
    io.in(code).socketsLeave(code);
    rooms.delete(code);
    callback({ ok: true });
    broadcastRoomList();
  });

  socket.on('joinRoom', ({ room, nickname } = {}, callback = () => {}) => {
    waitingMatches.delete(socket.id);
    const code = String(room || '').toUpperCase();
    leaveRooms(null, code);
    const game = rooms.get(code);
    if (!game) return callback({ ok: false, error: '방 코드를 찾을 수 없어요.' });
    if (game.mode === 'quick') return callback({ ok: false, error: '빠른 매칭 판은 관전만 할 수 있어요.' });
    const seat = !game.players.w ? 'w' : !game.players.b ? 'b' : '';
    if (!seat) return callback({ ok: false, error: '이미 두 명이 참가한 방이에요.' });
    game.spectators?.delete(socket.id);
    game.players[seat] = socket.id;
    game.names[seat] = cleanText(nickname, seat === 'w' ? '플레이어 1' : '플레이어 2');
    socket.join(code);
    callback({ ok: true, room: code, seat, state: game.state, info: roomInfo(code, game), chat: game.chat });
    systemChat(code, game, `${game.names[seat]} 님이 참가했어요.`);
    socket.to(code).emit('playerJoined');
    emitRoomInfo(code, game);
    if (game.visibility === 'public') broadcastRoomList();
  });

  socket.on('watchRoom', ({ room, nickname } = {}, callback = () => {}) => {
    waitingMatches.delete(socket.id);
    const code = String(room || '').toUpperCase();
    leaveRooms(null, code);
    const game = rooms.get(code);
    if (!game) return callback({ ok: false, error: '방 코드를 찾을 수 없어요.' });
    if (!game.spectators) game.spectators = new Map();
    game.spectators.set(socket.id, cleanText(nickname, '관전자'));
    socket.join(code);
    callback({ ok: true, room: code, seat: 'spectator', state: game.state, info: roomInfo(code, game), chat: game.chat });
    systemChat(code, game, `${game.spectators.get(socket.id)} 님이 관전을 시작했어요.`);
    emitRoomInfo(code, game);
    if (game.visibility === 'public') broadcastRoomList();
  });

  socket.on('stateUpdate', ({ room, seat, state } = {}) => {
    const code = String(room || '').toUpperCase();
    const game = rooms.get(code);
    if (!game || !state || game.players[seat] !== socket.id) return;
    const allowedSeat = game.state ? game.state.ownerByColor?.[game.state.turn] : 'w';
    const reject = message => { socket.emit('stateRejected', message); if (game.state) socket.emit('stateUpdate', { room: code, state: game.state }); };
    if (allowedSeat !== seat) return reject('상대 차례의 조작은 반영되지 않았어요.');
    if (!Array.isArray(state.board) || state.board.length !== 8 || !['w','b'].includes(state.turn)) return socket.emit('stateRejected', '잘못된 게임 상태예요.');
    // 새 게임은 상대 동의(answerNewGame)로만 시작된다. 차례인 쪽이 혼자 판을 되돌리는 것을 막는다.
    if (game.state?.moveNo && !(Number(state.moveNo) >= game.state.moveNo)) return reject('진행 중인 판은 새 게임 제안과 상대 수락으로만 초기화할 수 있어요.');
    state.weights = game.weights; // 확률은 방을 만들 때 정한 값으로 고정
    const overChanged = Boolean(game.state?.over) !== Boolean(state.over);
    game.state = state;
    socket.to(code).emit('stateUpdate', { room: code, state });
    if (overChanged && game.visibility === 'public') broadcastRoomList();
    if (overChanged && state.over) finishRated(code, game);
  });

  // 플레이어 스킨은 자기 기물과 자기 진영(판 절반)에 적용되어 모두에게 보인다.
  socket.on('setSkin', ({ room, skin } = {}) => {
    const code = String(room || '').toUpperCase();
    const game = rooms.get(code);
    const role = game && roleOf(game, socket.id);
    if (!role || role.seat === 'spectator') return;
    const key = v => (/^[a-z]{2,16}$/i.test(String(v || '')) ? String(v) : null);
    game.skins[role.seat] = { pieces: key(skin?.pieces) || 'unicode', board: key(skin?.board) || 'classic' };
    emitRoomInfo(code, game);
  });

  socket.on('getRanking', ({ playerId } = {}, callback = () => {}) => callback({ ok: true, season: ratingStore.seasonInfo(), top: ratingStore.leaderboard(20), me: ratingStore.stats(playerId) }));

  // 참가자와 관전자 모두 채팅할 수 있다.
  socket.on('chat', ({ room, text } = {}, callback = () => {}) => {
    const code = String(room || '').toUpperCase();
    const game = rooms.get(code);
    const role = game && roleOf(game, socket.id);
    if (!role) return callback({ ok: false, error: '방에 들어가야 채팅할 수 있어요.' });
    const message = cleanText(text, '', 200);
    if (!message) return callback({ ok: false, error: '메시지를 입력해 주세요.' });
    pushChat(code, game, { seat: role.seat, name: role.name || '익명', text: message, sid: socket.id });
    callback({ ok: true });
  });

  socket.on('requestNewGame', ({ room, state } = {}, callback = () => {}) => {
    const code = String(room || '').toUpperCase();
    const game = rooms.get(code);
    const role = game && roleOf(game, socket.id);
    if (!role || role.seat === 'spectator') return callback({ ok: false, error: '대전 중인 플레이어만 새 게임을 제안할 수 있어요.' });
    if (!state || !Array.isArray(state.board) || state.board.length !== 8) return callback({ ok: false, error: '잘못된 게임 상태예요.' });
    state.weights = game.weights;
    const other = role.seat === 'w' ? 'b' : 'w';
    if (!game.players[other]) {
      game.state = state; game.newGameOffer = null; game.rated = false;
      io.to(code).emit('stateUpdate', { room: code, state });
      systemChat(code, game, `${role.name} 님이 새 게임을 시작했어요.`);
      return callback({ ok: true, started: true });
    }
    game.newGameOffer = { seat: role.seat, state };
    io.to(code).emit('newGameOffer', { room: code, seat: role.seat, name: role.name });
    systemChat(code, game, `${role.name} 님이 새 게임을 제안했어요.`);
    callback({ ok: true, started: false });
  });

  socket.on('answerNewGame', ({ room, accept } = {}, callback = () => {}) => {
    const code = String(room || '').toUpperCase();
    const game = rooms.get(code);
    const role = game && roleOf(game, socket.id);
    const offer = game?.newGameOffer;
    if (!offer || !role || role.seat === 'spectator' || role.seat === offer.seat) return callback({ ok: false, error: '응답할 새 게임 제안이 없어요.' });
    game.newGameOffer = null;
    io.to(code).emit('newGameOfferClosed', { room: code });
    if (accept) {
      game.state = offer.state; game.ratedDone = false;
      io.to(code).emit('stateUpdate', { room: code, state: offer.state });
      systemChat(code, game, `${role.name} 님이 수락해서 새 게임을 시작했어요.`);
      if (game.visibility === 'public') broadcastRoomList();
    } else systemChat(code, game, `${role.name} 님이 새 게임 제안을 거절했어요.`);
    callback({ ok: true });
  });

  // 항복은 차례와 상관없이 할 수 있어야 해서 stateUpdate와 따로 서버가 판을 끝낸다.
  socket.on('resign', ({ room } = {}, callback = () => {}) => {
    const code = String(room || '').toUpperCase();
    const game = rooms.get(code);
    const role = game && roleOf(game, socket.id);
    if (!role || role.seat === 'spectator') return callback({ ok: false, error: '대전 중인 플레이어만 항복할 수 있어요.' });
    const state = game.state;
    if (!state || state.over) return callback({ ok: false, error: '이미 끝난 게임이에요.' });
    const color = ['w', 'b'].find(c => (state.ownerByColor?.[c] || c) === role.seat) || role.seat;
    const colorName = c => c === 'w' ? '흰색' : '검은색';
    const winner = color === 'w' ? 'b' : 'w';
    const label = `${role.name}(${colorName(color)})`;
    game.state = { ...state, over: true, result: `${colorName(winner)} 승리 · ${label} 항복`, drawn: false, cardId: null, activeKind: null, movesLeft: 0, lastMove: null,
      log: [{ n: state.moveNo || 1, m: `🏆 ${colorName(winner)} 승리 · ${label} 항복` }, { n: state.moveNo || 1, m: `🏳 ${label}: 항복` }, ...(state.log || [])].slice(0, 200) };
    io.to(code).emit('stateUpdate', { room: code, state: game.state });
    systemChat(code, game, `${role.name} 님이 항복했어요.`);
    finishRated(code, game);
    if (game.visibility === 'public') broadcastRoomList();
    callback({ ok: true });
  });

  // 방에서 나가기(버튼) 와 연결 끊김이 같은 처리를 쓴다. onlyCode가 있으면 그 방만.
  function leaveRooms(onlyCode, exceptCode) {
    let publicChanged = false;
    for (const [code, game] of rooms) {
      if ((onlyCode && code !== onlyCode) || code === exceptCode) continue;
      if (!roleOf(game, socket.id)) continue;
      if (game.spectators?.delete(socket.id) && game.visibility === 'public') publicChanged = true;
      for (const seat of ['w', 'b']) {
        if (game.players[seat] === socket.id) {
          const leftName = game.names[seat];
          if (game.newGameOffer?.seat === seat) { game.newGameOffer = null; io.to(code).emit('newGameOfferClosed', { room: code }); }
          systemChat(code, game, `${leftName || '플레이어'} 님이 나갔어요.`);
          forfeitOnLeave(code, game, seat);
          game.rated = false;
          game.players[seat] = null;
          game.names[seat] = null;
          game.skins[seat] = null;
          socket.to(code).emit('playerLeft', { seat });
          emitRoomInfo(code, game);
          if (game.visibility === 'public') publicChanged = true;
        }
      }
      socket.leave(code);
      if (!game.players.w && !game.players.b && !game.spectators?.size) rooms.delete(code);
    }
    if (publicChanged) broadcastRoomList();
  }

  socket.on('leaveRoom', ({ room } = {}, callback = () => {}) => {
    const code = String(room || '').toUpperCase();
    if (!rooms.has(code)) return callback({ ok: true });
    leaveRooms(code);
    callback({ ok: true });
  });

  socket.on('disconnect', () => {
    waitingMatches.delete(socket.id);
    leaveRooms();
  });
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Chess UNO listening on ${port}`));
