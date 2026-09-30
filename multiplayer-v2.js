(() => {
  const socket = typeof io === 'function' ? io() : null;
  let room = '';
  let seat = '';
  let applying = false;
  let lastSent = '';
  const statusElement = document.querySelector('#roomStatus');
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
  const canAct = () => !room || (seat !== 'spectator' && game.ownerByColor[game.turn] === seat);
  canPlayerInteract = canAct;
  currentOwnerCanAct = function () {
    if (canAct()) return true;
    toast('상대 차례예요.');
    return false;
  };
  function install(next) {
    if (!next) return;
    const previousResult=game.result;
    applying = true; game = next; selected = null; targets = []; swapFirst = null; forcedPawnSquare = null;
    if (game.result!==previousResult) { hiddenResult=''; celebratedResult=''; }
    lastSent = JSON.stringify(game); render(); applying = false;
  }
  onStateChanged = function (state) {
    if (!socket || !room || !seat || applying) return;
    const key = JSON.stringify(state); if (key === lastSent) return;
    lastSent = key; socket.emit('stateUpdate', { room, seat, state });
  };
  document.querySelector('#createRoom').onclick = () => {
    if (!socket) return status('서버 연결에 실패했어요.');
    socket.emit('createRoom', game, result => {
      if (!result?.ok) return status(result?.error || '방을 만들지 못했어요.');
      room=result.room; seat='w'; roomStatus('방 코드 ',room,' · 누르면 복사돼요.'); notifyState();
    });
  };
  document.querySelector('#joinRoom').onclick = () => {
    if (!socket) return status('서버 연결에 실패했어요.');
    const code=document.querySelector('#joinCode').value.trim().toUpperCase();
    socket.emit('joinRoom',{room:code},result=>{
      if(!result?.ok)return status(result?.error||'방에 참가하지 못했어요.');
      room=result.room;seat=result.seat;install(result.state);roomStatus('방 ',room,' 참가 완료 · 플레이어 2');
    });
  };
  document.querySelector('#watchRoom').onclick = () => {
    if (!socket) return status('서버 연결에 실패했어요.');
    const code=document.querySelector('#joinCode').value.trim().toUpperCase();
    socket.emit('watchRoom',{room:code},result=>{
      if(!result?.ok)return status(result?.error||'방을 관전할 수 없어요.');
      room=result.room;seat='spectator';install(result.state);roomStatus('방 ',room,' 관전 중 · 실시간 보기 전용');
    });
  };
  if (socket) {
    socket.on('connect',()=>status('연결됨 · 방을 만들거나 코드를 입력하세요.'));
    socket.on('disconnect',()=>status('서버 연결이 끊겼어요. 다시 연결 중…'));
    socket.on('stateUpdate',install);
    socket.on('playerJoined',()=>roomStatus('방 ',room,seat==='spectator'?' 관전 중 · 두 명이 대전 중이에요.':' · 두 명이 모두 참가했어요.'));
    socket.on('playerLeft',()=>roomStatus('방 ',room,seat==='spectator'?' 관전 중 · 플레이어 한 명이 나갔어요.':' · 상대가 나갔어요.'));
    socket.on('stateRejected',message=>status(message||'현재 차례가 아니라 반영되지 않았어요.'));
  }
})();
