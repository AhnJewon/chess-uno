(() => {
  const socket = typeof io === 'function' ? io() : null;
  let room = '';
  let seat = '';
  let applying = false;
  let lastSent = '';
  let searching = false;

  const statusElement = document.querySelector('#roomStatus');
  const nicknameInput = document.querySelector('#nickname');
  const quickButton = document.querySelector('#quickMatch');
  const lobby = document.querySelector('#roomLobby');
  const roomListElement = document.querySelector('#roomList');
  const savedNickname = localStorage.getItem('chessUnoNickname');
  nicknameInput.value = savedNickname || `기사${Math.floor(1000 + Math.random() * 9000)}`;
  localStorage.setItem('chessUnoNickname', nicknameInput.value);
  nicknameInput.addEventListener('input', () => localStorage.setItem('chessUnoNickname', nicknameInput.value.trim().slice(0, 20)));

  // 랭킹용 플레이어 ID. 닉네임과 달리 바뀌지 않고, 빠른 매칭 기록이 이 ID로 쌓인다.
  const playerId = (() => {
    try {
      let id = localStorage.getItem('chessUnoPlayerId');
      if (!/^[A-Za-z0-9]{16,40}$/.test(id || '')) {
        const bytes = new Uint8Array(12); crypto.getRandomValues(bytes);
        id = [...bytes].map(b => b.toString(36).padStart(2, '0')).join('');
        localStorage.setItem('chessUnoPlayerId', id);
      }
      return id;
    } catch { return null; }
  })();

  const nickname = () => {
    const value = nicknameInput.value.replace(/\s+/g, ' ').trim().slice(0, 20) || `기사${Math.floor(1000 + Math.random() * 9000)}`;
    nicknameInput.value = value;
    localStorage.setItem('chessUnoNickname', value);
    return value;
  };
  const status = message => { statusElement.textContent = message; };
  const copyRoomCode = async code => {
    try { await navigator.clipboard.writeText(code); }
    catch {
      const field=document.createElement('textarea');field.value=code;field.style.position='fixed';field.style.opacity='0';document.body.appendChild(field);field.select();document.execCommand('copy');field.remove();
    }
    toast(`방 코드 ${code}를 복사했어요.`);
  };
  const roomStatus = (before, code, after='') => {
    const button=document.createElement('button');button.className='pill roomcode';button.textContent=code;button.title='방 코드 복사';button.onclick=()=>copyRoomCode(code);
    statusElement.replaceChildren(document.createTextNode(before),button,document.createTextNode(after));
  };
  let names = { w:null, b:null };
  const applyRoomInfo = info => {
    if (!info || (room && info.room !== room)) return;
    names = { ...names, ...info.names };
    document.querySelector('#p1Name').textContent=info.names?.w || '플레이어 1';
    document.querySelector('#p2Name').textContent=info.names?.b || '플레이어 2';
  };
  // 게임 기록에 "닉네임(흰색)"으로 남긴다. 방 밖에서는 색 이름만.
  playerLabel = color => {
    const name = room && names[game.ownerByColor?.[color] || color];
    return name ? `${name}(${colorName(color)})` : colorName(color);
  };

  const chatLog = document.querySelector('#chatLog');
  const chatInput = document.querySelector('#chatInput');
  const chatSend = document.querySelector('#chatSend');
  const offerBar = document.querySelector('#newGameOffer');
  const setChatEnabled = on => { chatInput.disabled=!on; chatSend.disabled=!on; };
  const appendChat = entry => {
    chatLog.querySelector('.chatempty')?.remove();
    const row=document.createElement('div');
    row.className=`chatmsg ${entry.seat}${entry.sid&&entry.sid===socket?.id?' mine':''}`;
    if (entry.seat==='system') row.textContent=`· ${entry.text}`;
    else {
      const who=document.createElement('b');
      who.textContent=`${entry.name}${entry.seat==='spectator'?' (관전)':entry.seat==='w'?' (흰색)':' (검은색)'}`;
      row.append(who,`: ${entry.text}`);
    }
    const nearBottom=chatLog.scrollHeight-chatLog.scrollTop-chatLog.clientHeight<40;
    chatLog.appendChild(row);
    if (nearBottom) chatLog.scrollTop=chatLog.scrollHeight;
  };
  const renderChat = list => {
    chatLog.replaceChildren();
    if (!list?.length) { const empty=document.createElement('div');empty.className='chatempty';empty.textContent='아직 대화가 없어요. 먼저 인사해 보세요.';chatLog.appendChild(empty); }
    (list||[]).forEach(appendChat);
    chatLog.scrollTop=chatLog.scrollHeight;
  };
  const hideOffer = () => offerBar.classList.remove('open');
  const setSearching = value => {
    searching=value;
    quickButton.textContent=value?'매칭 취소':'빠른 매칭';
    quickButton.classList.toggle('searching',value);
  };

  const canAct = () => !room || (seat !== 'spectator' && game.ownerByColor[game.turn] === seat);
  canPlayerInteract = canAct;
  currentOwnerCanAct = function () {
    if (canAct()) return true;
    toast(seat==='spectator'?'관전 중에는 조작할 수 없어요.':'상대 차례예요.');
    return false;
  };

  function install(next) {
    if (!next) return;
    const previousResult=game.result;
    applying=true;game=next;selected=null;targets=[];swapFirst=null;forcedPawnSquare=null;
    if(game.result!==previousResult){hiddenResult='';celebratedResult='';}
    lastSent=JSON.stringify(game);render();applying=false;
    if(!game.over) document.querySelector('#ratingDelta').textContent='';
  }

  function enter(result, message) {
    if (!result?.ok) return status(result?.error || '방에 들어가지 못했어요.');
    setSearching(false);
    room=result.room;seat=result.seat;
    applyRoomInfo(result.info);
    if (result.state) install(result.state);
    else lastSent=JSON.stringify(game);
    renderChat(result.chat); setChatEnabled(true); hideOffer();
    roomStatus(message,room,seat==='spectator'?' · 실시간 보기 전용':' · 누르면 복사돼요.');
    socket?.emit('requestRoomList');
  }

  function joinByCode(code) {
    if (!socket) return status('서버 연결에 실패했어요.');
    socket.emit('joinRoom',{room:code,nickname:nickname()},result=>enter(result,'방 '));
  }

  function watchByCode(code) {
    if (!socket) return status('서버 연결에 실패했어요.');
    socket.emit('watchRoom',{room:code,nickname:nickname()},result=>enter(result,'방 '));
  }

  function renderRoomList(rooms) {
    roomListElement.innerHTML='';
    if (!rooms?.length) {
      const empty=document.createElement('div');empty.className='roomempty';empty.textContent='현재 공개 방이 없어요. 새 공개 방을 만들어 보세요.';roomListElement.appendChild(empty);return;
    }
    rooms.forEach(item=>{
      const row=document.createElement('div');row.className='roomrow';
      const meta=document.createElement('div');meta.className='roommeta';
      const title=document.createElement('strong');title.textContent=item.name;
      const detail=document.createElement('small');detail.textContent=`${item.host}${item.guest?` vs ${item.guest}`:''} · 코드 ${item.code}${item.over?' · 게임 종료':''}`;
      meta.append(title,detail);
      const badge=document.createElement('div');badge.className='roombadge';badge.textContent=`플레이어 ${item.players}/2 · 관전 ${item.spectators}`;
      const actions=document.createElement('div');actions.className='roomactions';
      const current=item.code===room;
      const join=document.createElement('button');join.className='pill';join.textContent=current?'참가 중':item.open?'참가':'만원';join.disabled=current||!item.open;join.onclick=()=>joinByCode(item.code);
      const watch=document.createElement('button');watch.className='pill';watch.textContent='관전';watch.onclick=()=>watchByCode(item.code);
      actions.append(join,watch);
      if(current&&seat==='w'){
        const close=document.createElement('button');close.className='pill danger';close.textContent='방 닫기';
        close.onclick=()=>{if(!confirm('이 공개 방을 닫을까요? 참가자와 관전자도 방에서 나가게 됩니다.'))return;socket.emit('closeRoom',{room:item.code},result=>{if(!result?.ok)toast(result?.error||'방을 닫지 못했어요.')})};
        actions.appendChild(close);
      }
      row.append(meta,badge,actions);roomListElement.appendChild(row);
    });
  }

  onStateChanged = function (state) {
    if (!socket || !room || !seat || seat==='spectator' || applying) return;
    const key=JSON.stringify(state);if(key===lastSent)return;
    lastSent=key;socket.emit('stateUpdate',{room,seat,state});
  };

  // 온라인 방에서는 새 게임을 제안하고 상대가 수락해야 시작된다.
  requestNewGame = () => {
    if (!socket || !room) { if (confirm('새 게임을 시작할까요?')) freshGame(); return; }
    if (seat==='spectator') return toast('관전 중에는 새 게임을 시작할 수 없어요.');
    if (!confirm('상대에게 새 게임을 제안할까요? 상대가 수락하면 판이 처음부터 시작돼요.')) return;
    socket.emit('requestNewGame',{room,state:makeFreshState()},result=>{
      if (!result?.ok) return toast(result?.error||'새 게임을 제안하지 못했어요.');
      toast(result.started?'상대가 없어 바로 새 게임을 시작했어요.':'새 게임을 제안했어요. 상대의 수락을 기다려요.');
    });
  };
  requestResign = () => {
    if (!socket || !room) { if (game.over) return toast('이미 끝난 게임이에요.'); if (confirm(`${colorName(game.turn)}이 항복할까요?`)) resign(game.turn); return; }
    if (seat==='spectator') return toast('관전 중에는 항복할 수 없어요.');
    if (game.over) return toast('이미 끝난 게임이에요.');
    if (!confirm('정말 항복할까요? 상대의 승리로 게임이 끝나요.')) return;
    socket.emit('resign',{room},result=>{ if(!result?.ok) toast(result?.error||'항복하지 못했어요.'); });
  };
  // 랭킹 팝업
  const rankModal = document.querySelector('#rankModal');
  const renderRanking = data => {
    const rows=document.querySelector('#rankRows'), me=data?.me;
    rows.replaceChildren();
    if (!data?.top?.length) { const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.className='empty';td.textContent='아직 기록이 없어요. 빠른 매칭으로 첫 기록을 남겨 보세요.';tr.appendChild(td);rows.appendChild(tr); }
    (data?.top||[]).forEach(p=>{
      const tr=document.createElement('tr'); if (me?.rank===p.rank) tr.className='me';
      [`${p.rank}`,p.name,`${p.rating}`,`${p.wins}승 ${p.losses}패${p.draws?` ${p.draws}무`:''}`].forEach(text=>{const td=document.createElement('td');td.textContent=text;tr.appendChild(td);});
      rows.appendChild(tr);
    });
    document.querySelector('#rankMe').textContent=!me?'이 브라우저에서는 랭킹 기록을 쓸 수 없어요.':me.games?`내 기록 · ${me.rank}위 / ${me.total}명 · 레이팅 ${me.rating} · ${me.wins}승 ${me.losses}패${me.draws?` ${me.draws}무`:''}`:`아직 랭킹 판이 없어요 · 시작 레이팅 ${me.rating}`;
  };
  const closeRanking = () => rankModal.classList.remove('open');
  document.querySelector('#rankOpen').onclick=()=>{
    rankModal.classList.add('open'); document.querySelector('#rankMe').textContent='불러오는 중…';
    if (socket?.connected) socket.emit('getRanking',{playerId},renderRanking);
    else fetch('/api/leaderboard').then(r=>r.json()).then(top=>renderRanking({top,me:null})).catch(()=>renderRanking(null));
  };
  document.querySelector('#rankClose').onclick=closeRanking;
  rankModal.onclick=event=>{ if(event.target===rankModal) closeRanking(); };
  document.addEventListener('keydown',event=>{ if(event.key==='Escape') closeRanking(); });

  const answerOffer = accept => { hideOffer(); socket?.emit('answerNewGame',{room,accept},result=>{ if(!result?.ok) toast(result?.error||'응답하지 못했어요.'); }); };
  document.querySelector('#acceptNewGame').onclick=()=>answerOffer(true);
  document.querySelector('#declineNewGame').onclick=()=>answerOffer(false);

  document.querySelector('#chatForm').onsubmit=event=>{
    event.preventDefault();
    const text=chatInput.value.trim();
    if (!text || !socket || !room) return;
    socket.emit('chat',{room,text},result=>{ if(!result?.ok) return toast(result?.error||'메시지를 보내지 못했어요.'); chatInput.value=''; });
  };

  document.querySelector('#createRoom').onclick=()=>{
    if(!socket)return status('서버 연결에 실패했어요.');
    socket.emit('createRoom',{state:game,nickname:nickname(),visibility:'private'},result=>enter(result,'비공개 방 '));
  };
  document.querySelector('#createPublicRoom').onclick=()=>{
    if(!socket)return status('서버 연결에 실패했어요.');
    const name=document.querySelector('#publicRoomName').value;
    socket.emit('createRoom',{state:game,nickname:nickname(),visibility:'public',name},result=>enter(result,'공개 방 '));
  };
  document.querySelector('#joinRoom').onclick=()=>joinByCode(document.querySelector('#joinCode').value.trim().toUpperCase());
  document.querySelector('#watchRoom').onclick=()=>watchByCode(document.querySelector('#joinCode').value.trim().toUpperCase());
  document.querySelector('#toggleRoomList').onclick=()=>{
    lobby.classList.toggle('open');
    if(lobby.classList.contains('open'))socket?.emit('requestRoomList');
  };
  document.querySelector('#refreshRooms').onclick=()=>socket?.emit('requestRoomList');
  quickButton.onclick=()=>{
    if(!socket)return status('서버 연결에 실패했어요.');
    if(searching)return socket.emit('cancelQuickMatch',()=>{setSearching(false);status('빠른 매칭을 취소했어요.')});
    setSearching(true);status(`${nickname()} 님의 상대를 찾는 중…`);
    socket.emit('quickMatch',{state:game,nickname:nickname(),playerId},result=>{
      if(!result?.ok){setSearching(false);return status(result?.error||'매칭을 시작하지 못했어요.');}
      if(result.status==='matched')enter(result,'빠른 매칭 ');
    });
  };

  if (socket) {
    socket.on('connect',()=>{status('연결됨 · 빠른 매칭 또는 방을 선택하세요.');socket.emit('requestRoomList')});
    socket.on('disconnect',()=>{setSearching(false);status('서버 연결이 끊겼어요. 다시 연결 중…')});
    socket.on('matchFound',result=>enter(result,'빠른 매칭 '));
    socket.on('roomList',renderRoomList);
    socket.on('roomInfo',applyRoomInfo);
    socket.on('roomClosed',payload=>{
      if(payload?.room!==room)return;
      room='';seat='';lastSent='';names={w:null,b:null};setChatEnabled(false);hideOffer();
      document.querySelector('#p1Name').textContent='플레이어 1';document.querySelector('#p2Name').textContent='플레이어 2';
      status(payload.message||'공개 방이 닫혔어요.');toast(payload.message||'공개 방이 닫혔어요.');render();socket.emit('requestRoomList');
    });
    socket.on('stateUpdate',payload=>{
      const next=payload?.state||payload;
      if(payload?.room&&payload.room!==room)return;
      install(next);
    });
    socket.on('playerJoined',()=>roomStatus('방 ',room,' · 상대가 참가했어요.'));
    socket.on('playerLeft',()=>roomStatus('방 ',room,seat==='spectator'?' 관전 중 · 플레이어 한 명이 나갔어요.':' · 상대가 나갔어요.'));
    socket.on('stateRejected',message=>status(message||'현재 차례가 아니라 반영되지 않았어요.'));
    socket.on('chat',payload=>{ if(payload?.room===room) appendChat(payload.entry); });
    socket.on('newGameOffer',payload=>{
      if (payload?.room!==room || seat==='spectator' || payload.seat===seat) return;
      document.querySelector('#newGameOfferText').textContent=`${payload.name} 님이 새 게임을 제안했어요. 수락하면 판이 처음부터 시작돼요.`;
      offerBar.classList.add('open');
    });
    socket.on('newGameOfferClosed',payload=>{ if(payload?.room===room) hideOffer(); });
    socket.on('ratingResult',payload=>{
      if (payload?.room!==room) return;
      const line = s => { const c=payload.changes[s]; return `${payload.names[s]} ${c.before} → ${c.after} (${c.delta>=0?'+':''}${c.delta})`; };
      const text = seat==='w'||seat==='b' ? `레이팅 ${line(seat).replace(`${payload.names[seat]} `,'')}` : `${line('w')} · ${line('b')}`;
      document.querySelector('#ratingDelta').textContent=`🏆 ${text}`;
      toast(`🏆 ${text}`);
    });
  }
})();
