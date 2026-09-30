(() => {
  const socket = typeof io === 'function' ? io() : null;
  let roomCode = '';
  let seat = '';
  let ownerByColor = { w: 'w', b: 'b' };
  let colorReversed = false;
  let applyingRemote = false;
  let lastStateKey = '';

  const baseInit = init;
  init = function () {
    colorReversed = false;
    ownerByColor = { w: 'w', b: 'b' };
    baseInit();
  };

  const controls = document.createElement('section');
  controls.id = 'onlineControls';
  controls.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:14px 0 0;padding:12px 14px;background:#fffefa;border:1px solid #e8e5de;border-radius:13px;font-size:12px';
  controls.innerHTML = '<strong>온라인 대전</strong><button id="createRoom" class="pill">방 만들기</button><input id="joinCode" maxlength="6" placeholder="방 코드" style="width:95px;padding:8px 10px;border:1px solid #e6e3dc;border-radius:9px;text-transform:uppercase"><button id="joinRoom" class="pill">참가</button><span id="roomStatus" style="color:#77796f">방을 만들거나 코드를 입력하세요.</span>';
  document.querySelector('.top').after(controls);

  function snapshot() {
    return {
      board, turn, drawn, deckRemaining, gameover,
      handIds: hand.map(card => card.id), ownerByColor, colorReversed
    };
  }
  function stateKey() { return JSON.stringify(snapshot()); }
  function canAct() { return !roomCode || ownerByColor[turn] === seat; }
  function status(message) { const el = document.querySelector('#roomStatus'); if (el) el.textContent = message; }
  function publish(force = false) {
    if (!socket || !roomCode || !seat || applyingRemote) return;
    const key = stateKey();
    if (!force && key === lastStateKey) return;
    lastStateKey = key;
    socket.emit('stateUpdate', { room: roomCode, seat, state: snapshot() });
  }
  function installState(state) {
    if (!state) return;
    applyingRemote = true;
    board = state.board;
    turn = state.turn;
    drawn = state.drawn;
    deckRemaining = state.deckRemaining;
    gameover = state.gameover;
    hand = (state.handIds || []).map(id => cards.find(card => card.id === id)).filter(Boolean);
    ownerByColor = state.ownerByColor || { w: 'w', b: 'b' };
    colorReversed = !!state.colorReversed;
    selectedCard = null; selectedSq = null; legal = []; extraMoves = 0; swapFirst = null;
    render();
    lastStateKey = stateKey();
    applyingRemote = false;
  }

  const baseRender = render;
  render = function () {
    baseRender();
    const pill = document.querySelector('.topright .pill');
    if (pill) pill.innerHTML = roomCode ? `<i class="dot"></i>방 ${roomCode} · ${seat === 'w' ? '플레이어 1' : '플레이어 2'}` : '<i class="dot"></i>로컬 2인 플레이';
    const colors = document.querySelectorAll('.boardtop .small');
    if (colors.length >= 2) {
      colors[0].textContent = `· ${ownerByColor.w === 'w' ? 'White' : 'Black'}`;
      colors[1].textContent = `· ${ownerByColor.w === 'b' ? 'White' : 'Black'}`;
    }
    const mark = document.querySelector('#turnMark');
    if (mark) mark.className = `turnmark ${ownerByColor[turn] === 'b' ? 'black' : ''}`;
    publish();
  };

  const baseDrawCard = drawCard;
  drawCard = function () {
    if (!canAct()) { toast('상대 차례예요.'); return; }
    baseDrawCard();
  };
  const baseUseCard = useCard;
  useCard = function () {
    if (!canAct()) { toast('상대 차례예요.'); return; }
    baseUseCard();
  };
  const baseClickSquare = clickSquare;
  clickSquare = function (r, c) {
    if (!canAct()) { toast('상대 차례예요.'); return; }
    baseClickSquare(r, c);
  };
  const baseBeginEffect = beginEffect;
  beginEffect = function () {
    if (!canAct()) return;
    if (selectedCard?.kind === 'color') ownerByColor = { w: ownerByColor.b, b: ownerByColor.w };
    if (selectedCard?.kind === 'skip') {
      log('⊘', '상대의 차례를 건너뛰어요.');
      drawn = false; selectedCard = null; hand = []; selectedSq = null; legal = []; extraMoves = 0; swapFirst = null;
      render();
      return;
    }
    baseBeginEffect();
  };

  // A color swap moves each color to the other side, so pawn directions reverse too.
  const currentBeginEffect = beginEffect;
  beginEffect = function () {
    if (selectedCard?.kind === 'color') colorReversed = !colorReversed;
    currentBeginEffect();
  };

  const baseGetMoves = getMoves;
  getMoves = function (r, c) {
    const p = board[r][c];
    if (!p || p.type !== 'P') return baseGetMoves(r, c);
    const out = [];
    const d = p.color === 'w' ? (colorReversed ? 1 : -1) : (colorReversed ? -1 : 1);
    const startRow = p.color === 'w' ? (colorReversed ? 1 : 6) : (colorReversed ? 6 : 1);
    const add = (rr, cc) => {
      if (rr < 0 || rr > 7 || cc < 0 || cc > 7) return false;
      const target = board[rr][cc];
      if (target?.color === p.color) return false;
      out.push([rr, cc]);
      return !target;
    };
    if (r + d >= 0 && r + d < 8 && !board[r + d][c]) {
      add(r + d, c);
      if (r === startRow && !board[r + 2 * d]?.[c]) add(r + 2 * d, c);
    }
    for (const dc of [-1, 1]) {
      if (board[r + d]?.[c + dc] && board[r + d][c + dc].color !== p.color) add(r + d, c + dc);
    }
    return out;
  };

  const renderWithPawnDirection = render;
  render = function () {
    renderWithPawnDirection();
    if (selectedSq) {
      const p = board[selectedSq[0]][selectedSq[1]];
      if (p?.type === 'P') document.querySelector('#boardHint').textContent = `폰 이동 방향: ${(p.color === 'w' ? (colorReversed ? 1 : -1) : (colorReversed ? -1 : 1)) < 0 ? '↑' : '↓'}`;
    }
  };

  document.querySelector('#createRoom').onclick = () => {
    if (!socket) { status('온라인 연결에 실패했어요.'); return; }
    socket.emit('createRoom', result => {
      if (!result?.ok) { status(result?.error || '방을 만들지 못했어요.'); return; }
      roomCode = result.room; seat = 'w'; ownerByColor = { w: 'w', b: 'b' };
      status(`방 코드 ${roomCode}를 친구에게 보내세요.`);
      lastStateKey = '';
      publish(true);
      render();
    });
  };
  document.querySelector('#joinRoom').onclick = () => {
    if (!socket) { status('온라인 연결에 실패했어요.'); return; }
    const code = document.querySelector('#joinCode').value.trim().toUpperCase();
    socket.emit('joinRoom', { room: code }, result => {
      if (!result?.ok) { status(result?.error || '방에 참가하지 못했어요.'); return; }
      roomCode = result.room; seat = result.seat;
      status(`방 ${roomCode} 참가 완료 · ${seat === 'w' ? '플레이어 1' : '플레이어 2'}`);
      installState(result.state);
    });
  };

  if (socket) {
    socket.on('connect', () => status('서버에 연결됐어요. 방을 만들거나 코드를 입력하세요.'));
    socket.on('disconnect', () => status('서버 연결이 끊겼어요. 다시 연결 중…'));
    socket.on('stateUpdate', installState);
    socket.on('playerJoined', () => status(`방 ${roomCode} · 두 명이 모두 참가했어요.`));
    socket.on('stateRejected', () => status('상대 차례의 조작은 반영되지 않았어요.'));
  } else status('온라인 스크립트를 불러오지 못했어요.');

  window.addEventListener('beforeunload', () => {
    if (socket && roomCode) socket.emit('leaveRoom', { room: roomCode, seat });
  });
})();
