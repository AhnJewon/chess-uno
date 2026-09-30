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
  const applyRoomInfo = info => {
    if (!info || (room && info.room !== room)) return;
    document.querySelector('#p1Name').textContent=info.names?.w || '플레이어 1';
    document.querySelector('#p2Name').textContent=info.names?.b || '플레이어 2';
  };
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
  }

  function enter(result, message) {
    if (!result?.ok) return status(result?.error || '방에 들어가지 못했어요.');
    setSearching(false);
    room=result.room;seat=result.seat;
    if (result.state) install(result.state);
    else lastSent=JSON.stringify(game);
    applyRoomInfo(result.info);
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
    socket.emit('quickMatch',{state:game,nickname:nickname()},result=>{
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
      room='';seat='';lastSent='';
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
  }
})();
