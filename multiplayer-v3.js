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
  let names = { w:null, b:null }, roomSkins = { w:null, b:null };
  const applyRoomInfo = info => {
    if (!info || (room && info.room !== room)) return;
    names = { ...names, ...info.names };
    if (info.skins) { roomSkins = { ...info.skins }; render(); }
    document.querySelector('#p1Name').textContent=info.names?.w || '플레이어 1';
    document.querySelector('#p2Name').textContent=info.names?.b || '플레이어 2';
  };
  // 방 안에서는 각 자리의 스킨으로 그린다. 내 자리는 바로 바뀌도록 내 스킨을 쓴다. 스킨 정보가 없는 상대는 기본.
  skinOf = seatKey => !room ? skin : seatKey === seat ? skin : (roomSkins[seatKey] || { pieces:'unicode', board:'classic' });
  onSkinChanged = () => { if (socket && room && seat !== 'spectator') socket.emit('setSkin',{ room, skin }); };

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
    renderChat(result.chat); setChatEnabled(true); hideOffer(); leaveButton.hidden=false; onSkinChanged();
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
      const badge=document.createElement('div');badge.className='roombadge';badge.textContent=`플레이어 ${item.players}/2 · 관전 ${item.spectators}`; if(item.quick){const q=document.createElement("span");q.className="custombadge";q.textContent="빠른 매칭";badge.appendChild(q);} if(item.custom){const tag=document.createElement("span");tag.className="custombadge";tag.textContent="사용자 확률";badge.appendChild(tag);}
      const actions=document.createElement('div');actions.className='roomactions';
      const current=item.code===room;
      const join=document.createElement('button');join.className='pill';join.textContent=current?'참가 중':item.quick?'대전 중':item.open?'참가':'만원';join.disabled=current||!item.open;join.onclick=()=>joinByCode(item.code);
      const watch=document.createElement('button');watch.className='pill';watch.textContent='관전';watch.onclick=()=>watchByCode(item.code);
      actions.append(join,watch);
      if(current&&seat==='w'&&!item.quick){
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
    socket.emit('requestNewGame',{room,state:makeFreshState(game.weights)},result=>{
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
  // 방 나가기: 서버에 알리고, 내 화면은 혼자 두는 판으로 돌아간다.
  const leaveButton=document.querySelector('#leaveRoom');
  function exitRoomLocal(message) {
    room='';seat='';lastSent='';names={w:null,b:null};roomSkins={w:null,b:null};setChatEnabled(false);hideOffer();leaveButton.hidden=true;
    document.querySelector('#p1Name').textContent='플레이어 1';document.querySelector('#p2Name').textContent='플레이어 2';
    document.querySelector('#ratingDelta').textContent='';
    freshGame();
    status(message);toast(message);socket?.emit('requestRoomList');
  }
  leaveButton.onclick=()=>{
    if (!room) return;
    const playing = seat!=='spectator' && !game.over && game.moveNo>1;
    const question = !playing ? '방에서 나갈까요?' : seat && game.ownerByColor ? '대전 중에 나가면 상대가 이긴 걸로 처리될 수 있어요(빠른 매칭은 기권패). 나갈까요?' : '방에서 나갈까요?';
    if (!confirm(question)) return;
    const code=room;
    socket.emit('leaveRoom',{room:code},()=>exitRoomLocal('방에서 나왔어요.'));
  };

  // 랭킹 팝업
  const rankModal = document.querySelector('#rankModal');
  const renderRanking = data => {
    const rows=document.querySelector('#rankRows'), me=data?.me, season=data?.season;
    document.querySelector('#rankTitle').textContent=`🏆 빠른 매칭 랭킹${season?` · ${season.label}`:''}`;
    const seasonLine=document.querySelector('#rankSeason'); seasonLine.replaceChildren();
    if (season?.last?.top?.length) {
      const champ=season.last.top[0], label=document.createElement('b'); label.textContent=`${season.last.label} 1위`;
      seasonLine.append('🥇 ',label,` ${champ.name} (${champ.rating})${season.last.top[1]?` · 2위 ${season.last.top[1].name}`:''}${season.last.top[2]?` · 3위 ${season.last.top[2].name}`:''}`);
    } else if (season) seasonLine.textContent='매달 1일 0시(한국 시간)에 새 시즌이 시작돼요.';
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

  // 방 만들기 팝업: 공개 여부, 방 이름, 카드 확률(프리셋 + 카드별 슬라이더)
  const createModal=document.querySelector('#createModal');
  let createVisibility='private', draftWeights=ChessCards.defaultWeights();
  const weightList=document.querySelector('#weightList');
  const renderDraft=()=>{
    createModal.querySelectorAll('[data-vis]').forEach(b=>b.classList.toggle('on',b.dataset.vis===createVisibility));
    document.querySelector('#createNameRow').style.display=createVisibility==='public'?'':'none';
    const normalized=ChessCards.normalizeWeights(draftWeights);
    document.querySelectorAll('#presetButtons [data-preset]').forEach(b=>{const w=ChessCards.presets[b.dataset.preset].weights;b.classList.toggle('on',ChessCards.cards.every(c=>w[c.id]===draftWeights[c.id]));});
    weightList.querySelectorAll('.weightrow').forEach(row=>{
      const card=ChessCards.cards.find(c=>c.id===row.dataset.card), w=draftWeights[card.id];
      row.querySelector('input').value=w; row.querySelector('.w').textContent=w;
      row.querySelector('.p').textContent=ChessCards.percentLabel(card,draftWeights);
      row.classList.toggle('zero',w===0);
    });
    const total=ChessCards.totalWeight(draftWeights);
    document.querySelector('#createSum').textContent=!total?'모든 카드가 0이면 방을 만들 수 없어요.':normalized?'방장 설정 확률 · 랭킹 미반영':'기본 확률';
    document.querySelector('#createConfirm').disabled=!total;
  };
  document.querySelector('#presetButtons').replaceChildren(...Object.entries(ChessCards.presets).map(([key,preset])=>{
    const b=document.createElement('button');b.type='button';b.className='pill';b.dataset.preset=key;b.textContent=preset.label;
    b.onclick=()=>{draftWeights={...preset.weights};renderDraft();};return b;
  }));
  weightList.replaceChildren(...ChessCards.cards.map(card=>{
    const row=document.createElement('div');row.className='weightrow';row.dataset.card=card.id;
    const icon=document.createElement('span');icon.className='icon';icon.textContent=card.icon;
    const name=document.createElement('span');name.textContent=card.name;
    const range=document.createElement('input');range.type='range';range.min='0';range.max=card.id==='move'?'100':'50';range.step='1';range.setAttribute('aria-label',`${card.name} 가중치`);
    range.oninput=()=>{draftWeights[card.id]=Number(range.value);renderDraft();};
    const w=document.createElement('span');w.className='w';const p=document.createElement('span');p.className='p';
    row.append(icon,name,range,w,p);return row;
  }));
  createModal.querySelectorAll('[data-vis]').forEach(b=>b.onclick=()=>{createVisibility=b.dataset.vis;renderDraft();});
  const openCreate=visibility=>{ if(!socket)return status('서버 연결에 실패했어요.'); createVisibility=visibility; renderDraft(); createModal.classList.add('open'); };
  const closeCreate=()=>createModal.classList.remove('open');
  document.querySelector('#createRoom').onclick=()=>openCreate('private');
  document.querySelector('#createPublicRoom').onclick=()=>openCreate('public');
  document.querySelector('#createClose').onclick=closeCreate;
  createModal.onclick=event=>{ if(event.target===createModal) closeCreate(); };
  document.addEventListener('keydown',event=>{ if(event.key==='Escape') closeCreate(); });
  document.querySelector('#createConfirm').onclick=()=>{
    if(!ChessCards.totalWeight(draftWeights))return;
    const state=makeFreshState(draftWeights), name=document.querySelector('#createName').value, visibility=createVisibility;
    socket.emit('createRoom',{state,nickname:nickname(),visibility,name},result=>{ if(result?.ok) closeCreate(); enter(result,visibility==='public'?'공개 방 ':'비공개 방 '); });
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
      exitRoomLocal(payload.message||'공개 방이 닫혔어요.');
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
