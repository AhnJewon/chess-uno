const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const rooms = new Map();
const waitingMatches = new Map();
app.use((_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.get('/', (_req, res) => res.sendFile(__dirname + '/game.html'));
app.get('/debug-play.html', (_req, res) => res.sendFile(__dirname + '/game.html'));
app.get('/api/rooms', (_req, res) => res.json(publicRoomList()));
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
    createdAt: Date.now()
  });
  return code;
}

function roomInfo(code, room) {
  return { room: code, names: room.names, spectators: room.spectators.size };
}

function emitRoomInfo(code, room) { io.to(code).emit('roomInfo', roomInfo(code, room)); }

function publicRoomList() {
  return [...rooms.entries()]
    .filter(([, room]) => room.visibility === 'public')
    .sort((a, b) => b[1].createdAt - a[1].createdAt)
    .map(([code, room]) => ({
      code, name: room.name, host: room.names.w || '빈 자리', guest: room.names.b,
      players: Number(Boolean(room.players.w)) + Number(Boolean(room.players.b)),
      spectators: room.spectators.size, open: !room.players.w || !room.players.b, over: Boolean(room.state?.over)
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
    const structured = payload && Object.prototype.hasOwnProperty.call(payload, 'state');
    const state = structured ? payload.state : payload;
    const visibility = structured ? payload.visibility : 'private';
    const code = makeRoom(socket.id, state, { visibility, name: payload?.name, nickname: payload?.nickname });
    socket.join(code);
    const room = rooms.get(code);
    callback({ ok: true, room: code, seat: 'w', state, info: roomInfo(code, room) });
    if (visibility === 'public') broadcastRoomList();
  });

  socket.on('quickMatch', ({ state, nickname } = {}, callback = () => {}) => {
    waitingMatches.delete(socket.id);
    const opponent = takeWaitingOpponent(socket.id);
    if (!opponent) {
      waitingMatches.set(socket.id, { state, nickname: cleanText(nickname, '플레이어') });
      return callback({ ok: true, status: 'waiting' });
    }
    const code = makeRoom(opponent.otherSocket.id, opponent.entry.state || state, { mode: 'quick', nickname: opponent.entry.nickname });
    const room = rooms.get(code);
    room.players.b = socket.id;
    room.names.b = cleanText(nickname, '플레이어 2');
    opponent.otherSocket.join(code); socket.join(code);
    const info = roomInfo(code, room);
    opponent.otherSocket.emit('matchFound', { ok: true, room: code, seat: 'w', state: room.state, info });
    callback({ ok: true, status: 'matched', room: code, seat: 'b', state: room.state, info });
    emitRoomInfo(code, room);
  });

  socket.on('cancelQuickMatch', (callback = () => {}) => callback({ ok: true, cancelled: waitingMatches.delete(socket.id) }));

  socket.on('closeRoom', ({ room } = {}, callback = () => {}) => {
    const code = String(room || '').toUpperCase();
    const game = rooms.get(code);
    if (!game) return callback({ ok: false, error: '이미 사라진 방이에요.' });
    if (game.visibility !== 'public') return callback({ ok: false, error: '공개 방만 목록에서 닫을 수 있어요.' });
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
    const game = rooms.get(code);
    if (!game) return callback({ ok: false, error: '방 코드를 찾을 수 없어요.' });
    const seat = !game.players.w ? 'w' : !game.players.b ? 'b' : '';
    if (!seat) return callback({ ok: false, error: '이미 두 명이 참가한 방이에요.' });
    game.spectators?.delete(socket.id);
    game.players[seat] = socket.id;
    game.names[seat] = cleanText(nickname, seat === 'w' ? '플레이어 1' : '플레이어 2');
    socket.join(code);
    callback({ ok: true, room: code, seat, state: game.state, info: roomInfo(code, game) });
    socket.to(code).emit('playerJoined');
    emitRoomInfo(code, game);
    if (game.visibility === 'public') broadcastRoomList();
  });

  socket.on('watchRoom', ({ room, nickname } = {}, callback = () => {}) => {
    waitingMatches.delete(socket.id);
    const code = String(room || '').toUpperCase();
    const game = rooms.get(code);
    if (!game) return callback({ ok: false, error: '방 코드를 찾을 수 없어요.' });
    if (!game.spectators) game.spectators = new Map();
    game.spectators.set(socket.id, cleanText(nickname, '관전자'));
    socket.join(code);
    callback({ ok: true, room: code, seat: 'spectator', state: game.state, info: roomInfo(code, game) });
    emitRoomInfo(code, game);
    if (game.visibility === 'public') broadcastRoomList();
  });

  socket.on('stateUpdate', ({ room, seat, state } = {}) => {
    const code = String(room || '').toUpperCase();
    const game = rooms.get(code);
    if (!game || !state || game.players[seat] !== socket.id) return;
    const allowedSeat = game.state ? game.state.ownerByColor?.[game.state.turn] : 'w';
    if (allowedSeat !== seat) return socket.emit('stateRejected', '상대 차례의 조작은 반영되지 않았어요.');
    if (!Array.isArray(state.board) || state.board.length !== 8 || !['w','b'].includes(state.turn)) return socket.emit('stateRejected', '잘못된 게임 상태예요.');
    const overChanged = Boolean(game.state?.over) !== Boolean(state.over);
    game.state = state;
    socket.to(code).emit('stateUpdate', { room: code, state });
    if (overChanged && game.visibility === 'public') broadcastRoomList();
  });

  socket.on('disconnect', () => {
    waitingMatches.delete(socket.id);
    let publicChanged = false;
    for (const [code, game] of rooms) {
      if (game.spectators?.delete(socket.id) && game.visibility === 'public') publicChanged = true;
      for (const seat of ['w', 'b']) {
        if (game.players[seat] === socket.id) {
          game.players[seat] = null;
          game.names[seat] = null;
          socket.to(code).emit('playerLeft', { seat });
          emitRoomInfo(code, game);
          if (game.visibility === 'public') publicChanged = true;
        }
      }
      if (!game.players.w && !game.players.b && !game.spectators?.size) rooms.delete(code);
    }
    if (publicChanged) broadcastRoomList();
  });
});

const port = Number(process.env.PORT || 3000);
server.listen(port, '0.0.0.0', () => console.log(`Chess UNO listening on ${port}`));
