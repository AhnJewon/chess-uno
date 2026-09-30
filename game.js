const symbols = { K:'♚', Q:'♛', R:'♜', B:'♝', N:'♞', P:'♟' };
const cards = ChessCards.cards;

let game = {};
let orient = false;
let selected = null;
let targets = [];
let swapFirst = null;
let forcedPawnSquare = null;
let toastTimer;
let hiddenResult = '';
let celebratedResult = '';
let onStateChanged = () => {};
let canPlayerInteract = () => true;

function freshGame() {
  game = { board: ChessRules.initialBoard(), turn:'w', meta:{ colorReversed:false, enPassant:null }, ownerByColor:{w:'w',b:'b'}, drawn:false, cardId:null, activeKind:null, movesLeft:0, deck:24, over:false, result:'' };
  hiddenResult = '';
  celebratedResult = '';
  selected = null; targets = []; swapFirst = null; forcedPawnSquare = null;
  document.querySelector('#log').innerHTML = '';
  addLog('🎮 새 게임이 시작됐어요. 흰색부터 카드를 뽑으세요.');
  render(); notifyState();
}

function notifyState() { onStateChanged(structuredClone(game)); }
function addLog(message) { const el=document.createElement('div'); el.textContent=message; document.querySelector('#log').prepend(el); }
function toast(message) { const el=document.querySelector('#notice'); el.textContent=message; el.classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>el.classList.remove('show'),1900); }
function activeCard() { return cards.find(c=>c.id===game.cardId) || null; }
function currentOwnerCanAct() { return true; }
function drawWeighted() { let roll=Math.random()*cards.reduce((s,c)=>s+c.weight,0); return cards.find(c=>(roll-=c.weight)<0) || cards[0]; }

function eachOwnPiece(callback) {
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (game.board[r][c]?.color===game.turn && callback(r,c,game.board[r][c])) return true;
  return false;
}

function canAddWithoutCheck(type) {
  for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
    if (game.board[r][c] || (type==='P' && !ChessRules.pawnPlacementAllowed(r,game.turn,!!game.meta.colorReversed))) continue;
    const trial=ChessRules.copyBoard(game.board); trial[r][c]={color:game.turn,type,hasMoved:true};
    if (!ChessRules.inCheck(trial,game.turn,game.meta)) return true;
  }
  return false;
}

function hasMovablePawn() {
  return eachOwnPiece((r,c,p)=>p.type==='P' && ChessRules.legalMoves(game.board,r,c,game.meta).length>0);
}

function swapGroups(kind) {
  if (kind==='ownSwap') return [game.turn,game.turn];
  if (kind==='enemySwap') return [ChessRules.opposite(game.turn),ChessRules.opposite(game.turn)];
  return [game.turn,ChessRules.opposite(game.turn)];
}

function hasValidSwap(kind) {
  const [firstColor,secondColor]=swapGroups(kind); const first=[]; const second=[];
  for(let r=0;r<8;r++)for(let c=0;c<8;c++){
    const p=game.board[r][c];
    if(!p||p.type==='K')continue;
    if(p.color===firstColor)first.push([r,c]);
    if(p.color===secondColor)second.push([r,c]);
  }
  for(const one of first)for(const two of second){
    if(one[0]===two[0]&&one[1]===two[1])continue;
    const trial=ChessRules.copyBoard(game.board);
    [trial[one[0]][one[1]],trial[two[0]][two[1]]]=[trial[two[0]][two[1]],trial[one[0]][one[1]]];
    if(!ChessRules.inCheck(trial,game.turn,game.meta)&&!ChessRules.hasStrandedPawn(trial,game.meta))return true;
  }
  return false;
}

function canResolveCheck(kind) {
  if (!ChessRules.inCheck(game.board,game.turn,game.meta)) return true;
  if (kind==='move') return ChessRules.allLegalMoves(game.board,game.turn,game.meta).length>0;
  if (kind==='double') return ChessRules.allDoubleFirstMoves(game.board,game.turn,game.meta).length>0;
  if (kind==='distance') return eachOwnPiece((r,c)=>ChessRules.distanceMoves(game.board,r,c,game.meta).length>0);
  if (kind==='pawnTwice') return eachOwnPiece((r,c,p)=>p.type==='P' && ChessRules.legalMoves(game.board,r,c,game.meta).length>0);
  if (['swap','ownSwap','enemySwap'].includes(kind)) return hasValidSwap(kind);
  if (kind==='shuffle') return true;
  if (kind==='change') return eachOwnPiece((r,c,p)=>{
    if(p.type==='K')return false;
    return ['Q','R','B','N','P'].some(type=>{const trial=ChessRules.copyBoard(game.board);trial[r][c].type=type;return !ChessRules.inCheck(trial,game.turn,game.meta);});
  });
  if (kind==='addPawn') return canAddWithoutCheck('P');
  if (kind==='color') {
    const trial=ChessRules.reverseColors(game.board),nextMeta={colorReversed:!game.meta.colorReversed,enPassant:null};
    return !ChessRules.inCheck(trial,game.turn,nextMeta);
  }
  if (kind==='wild') return cards.some(card=>card.kind!=='wild' && canResolveCheck(card.kind));
  return false;
}

// 체크 중에 좋은 카드를 뽑았는데 체크를 못 풀면 패배 대신 한 수 이동으로 바꾼다.
function applyCheckFallback(kind) {
  if (!ChessCards.checkFallbackKinds.includes(kind) || !ChessRules.inCheck(game.board,game.turn,game.meta) || canResolveCheck(kind)) return kind;
  const card=cards.find(c=>c.kind===kind);
  game.cardId='move';
  addLog(`♟ 「${card.name}」 카드로는 체크를 풀 수 없어 「한 수 이동」으로 바뀌었어요.`);
  return 'move';
}

function cardCheckmate(card) {
  if (card?.kind==='move') return endGame(`${colorName(ChessRules.opposite(game.turn))} 승리 · 체크메이트`);
  return endGame(`${colorName(ChessRules.opposite(game.turn))} 승리 · 「${card.name}」 카드로 체크를 해소할 수 없어 카드 체크메이트`);
}

function drawCard() {
  if (game.drawn || game.over || !currentOwnerCanAct()) return;
  if (game.deck <= 0) game.deck = 24;
  const card=drawWeighted(); game.deck--; game.drawn=true; game.cardId=card.id;
  addLog(`🃏 ${colorName(game.turn)}이 「${card.name}」 카드를 뽑았어요.`);
  const kind=applyCheckFallback(card.kind);
  if (!canResolveCheck(kind)) return cardCheckmate(activeCard());
  render(); notifyState();
}

function useCard() {
  if (!game.drawn || game.activeKind || game.over || !currentOwnerCanAct()) return;
  const card=activeCard();
  if (card.kind==='wild') {
    const choices=cards.filter(c=>!['move','wild'].includes(c.kind)&&canResolveCheck(c.kind)).map(c=>[c.icon,c.name,c.kind]);
    if (!choices.length) { game.cardId='move'; addLog('★ 체크를 풀 수 있는 특수 효과가 없어 「한 수 이동」으로 바뀌었어요.'); return startEffect('move'); }
    return choose('와일드 효과 선택','사용할 특수 효과를 고르세요.',choices,kind=>startEffect(kind));
  }
  startEffect(card.kind);
}

function startEffect(kind) {
  let fallbackMessage = '';
  if (kind==='pawnTwice' && !ChessRules.inCheck(game.board,game.turn,game.meta) && !hasMovablePawn()) {
    game.cardId='move'; kind='move';
    fallbackMessage='움직일 수 있는 폰이 없어 「한 수 이동」으로 바뀌었어요.';
    addLog(`♟ ${fallbackMessage}`);
  }
  if (['swap','ownSwap','enemySwap'].includes(kind) && !ChessRules.inCheck(game.board,game.turn,game.meta) && !hasValidSwap(kind)) {
    game.cardId='move'; kind='move';
    fallbackMessage='교환할 기물 조합이 없어 「한 수 이동」으로 바뀌었어요.';
    addLog(`⇄ ${fallbackMessage}`);
  }
  kind=applyCheckFallback(kind);
  if (!canResolveCheck(kind)) return cardCheckmate(cards.find(card=>card.kind===kind)||activeCard());
  // 이동하지 않는 카드를 쓰면 상대 폰을 앙파상으로 잡을 기회도 지나간다.
  if (['skip','shuffle','swap','ownSwap','enemySwap','change','addPawn'].includes(kind)) game.meta={...game.meta,enPassant:null};
  game.activeKind=kind; selected=null; targets=[];
  if (kind==='color') return colorReverse();
  if (kind==='skip') return finishTurn('⊘ 카드를 뽑은 사람이 자기 차례를 넘겼어요.');
  if (kind==='shuffle') return shufflePieces();
  game.movesLeft=(kind==='double'||kind==='pawnTwice')?2:(['move','distance'].includes(kind)?1:0);
  render(); toast(fallbackMessage||effectHelp(kind)); notifyState();
}

function effectHelp(kind) { return ({move:'움직일 기물을 고르세요.',double:game.movesLeft===1?'두 번째 이동으로 반드시 체크를 해소하세요.':'첫 번째 이동은 임시 체크 상태를 허용해요.',distance:'움직일 기물을 고르세요. 폰·나이트·킹은 두 배 거리 칸도 표시돼요.',pawnTwice:'두 번 움직일 폰을 고르세요.',swap:'내 기물 하나를 고른 뒤 바꿀 상대 기물을 고르세요.',ownSwap:'킹을 제외한 내 기물 두 개를 차례로 고르세요.',enemySwap:'킹을 제외한 상대 기물 두 개를 차례로 고르세요.',change:'바꿀 내 기물을 고르세요.',addPawn:'내 군대가 시작한 쪽 4개 줄에서 빈 칸을 고르세요. 반전되면 허용 구역도 바뀝니다.'})[kind]||''; }
function colorName(c) { return c==='w'?'흰색':'검은색'; }

function activeMoves(r,c) {
  if (game.activeKind==='distance') return ChessRules.distanceMoves(game.board,r,c,game.meta);
  if (game.activeKind==='double' && game.movesLeft===2) return ChessRules.doubleFirstMoves(game.board,r,c,game.meta);
  return ChessRules.legalMoves(game.board,r,c,game.meta);
}

function clickSquare(r,c) {
  if (!game.activeKind || game.over || !currentOwnerCanAct()) return;
  const p=game.board[r][c];
  if (['swap','ownSwap','enemySwap'].includes(game.activeKind)) return handleSwap(r,c,p);
  if (game.activeKind==='change') return handleChange(r,c,p);
  if (game.activeKind==='addPawn') return addPawnAt(r,c,p);
  if (!selected) {
    if (p?.color!==game.turn) return toast('현재 색의 기물을 골라 주세요.');
    if (game.activeKind==='pawnTwice' && (p.type!=='P' || (forcedPawnSquare && (forcedPawnSquare[0]!==r||forcedPawnSquare[1]!==c)))) return toast('선택한 같은 폰으로 움직여야 해요.');
    selected=[r,c]; targets=activeMoves(r,c); render(); return;
  }
  const move=targets.find(m=>m.to[0]===r&&m.to[1]===c);
  if (!move) {
    if (p?.color===game.turn && !(game.activeKind==='pawnTwice'&&forcedPawnSquare&&(forcedPawnSquare[0]!==r||forcedPawnSquare[1]!==c))) { selected=[r,c]; targets=activeMoves(r,c); render(); }
    else toast('그 칸으로는 움직일 수 없어요.');
    return;
  }
  if (move.promotion) return choose('폰 승격','바꿀 기물을 고르세요.',[['♛','퀸','Q'],['♜','룩','R'],['♝','비숍','B'],['♞','나이트','N']],type=>commitMove(move,type));
  commitMove(move,'Q');
}

function commitMove(move,promotion) {
  const applied=ChessRules.applyMove(game.board,move,game.meta,promotion);
  if (game.activeKind==='double' && game.movesLeft===2 && ChessRules.allLegalMoves(applied.board,game.turn,applied.meta).length===0) return toast('이 첫 수 뒤에는 체크를 해소할 두 번째 수가 없어요.');
  game.board=applied.board; game.meta=applied.meta;
  selected=null; targets=[]; game.movesLeft--;
  if (game.activeKind==='double' && game.movesLeft>0) {
    addLog(`×2 ${colorName(game.turn)}의 첫 이동이 끝났어요. 두 번째 이동으로 킹을 안전하게 만드세요.`);render();notifyState();return;
  }
  const opponent=ChessRules.opposite(game.turn); const status=ChessRules.status(game.board,opponent,game.meta);
  if (status.reason==='stalemate') return endGame('무승부 · 스테일메이트');
  if (game.activeKind==='pawnTwice' && game.movesLeft>0) {
    const [r,c]=move.to,pawn=game.board[r][c];
    if (pawn?.type==='P' && pawn.color===game.turn) {
      forcedPawnSquare=[r,c]; selected=[r,c]; targets=ChessRules.legalMoves(game.board,r,c,game.meta);
      if (targets.length) { addLog(`♟ ${colorName(game.turn)}의 같은 폰 추가 이동이 남았어요.`); render(); notifyState(); return; }
    }
    game.movesLeft=0;
  }
  if (game.movesLeft>0) { addLog(`♟ ${colorName(game.turn)}의 추가 이동이 남았어요.`); render(); notifyState(); return; }
  finishTurn(`♟ ${colorName(game.turn)}이 이동했어요.${status.check?' 체크!':''}`);
}

function addPawnAt(r,c,p) {
  if (p || game.board[r][c]) return toast('폰은 빈 칸에만 추가할 수 있어요.');
  if (!ChessRules.pawnPlacementAllowed(r,game.turn,!!game.meta.colorReversed)) return toast('폰은 자기 진영 4개 줄에만 추가할 수 있어요.');
  game.board[r][c]={color:game.turn,type:'P',hasMoved:true};
  if (ChessRules.inCheck(game.board,game.turn,game.meta)) { game.board[r][c]=null; return toast('그 칸에 추가해도 체크를 해소할 수 없어요.'); }
  finishTurn(`♟ ${colorName(game.turn)}의 폰을 자기 진영에 추가했어요.`);
}

function inCheckNow() { return ChessRules.inCheck(game.board,game.turn,game.meta); }

function swapTrial(a,b) {
  const board=ChessRules.copyBoard(game.board); [board[a[0]][a[1]],board[b[0]][b[1]]]=[board[b[0]][b[1]],board[a[0]][a[1]]];
  if (ChessRules.inCheck(board,game.turn,game.meta)) return { ok:false, reason:inCheckNow()?'그 교환으로는 체크가 풀리지 않아요. 다시 고르세요.':'그 교환은 내 킹을 체크 상태로 만들어요. 다시 고르세요.' };
  if (ChessRules.hasStrandedPawn(board,game.meta)) return { ok:false, reason:'폰을 승격 줄로 옮기는 교환은 할 수 없어요. 다시 고르세요.' };
  return { ok:true, board };
}

// 첫 기물과 바꿀 수 있는 짝(판에 표시할 칸)
function swapPartners(kind,r,c) {
  const [,secondColor]=swapGroups(kind), out=[];
  for (let rr=0;rr<8;rr++) for (let cc=0;cc<8;cc++) {
    const q=game.board[rr][cc];
    if (!q || q.color!==secondColor || q.type==='K' || (rr===r&&cc===c)) continue;
    if (swapTrial([r,c],[rr,cc]).ok) out.push([rr,cc]);
  }
  return out;
}

function handleSwap(r,c,p) {
  const kind=game.activeKind,[firstColor,secondColor]=swapGroups(kind);
  const firstLabel=firstColor===game.turn?'내':'상대';
  const secondLabel=secondColor===game.turn?'내':'상대';
  const pickFirst=(rr,cc)=>{
    swapFirst=[rr,cc]; selected=[rr,cc]; targets=swapPartners(kind,rr,cc).map(to=>({to})); render();
    if (!targets.length) { swapFirst=null; selected=null; render(); return toast(inCheckNow()?'그 기물로는 어떤 교환을 해도 체크가 풀리지 않아요. 다른 기물을 골라 주세요.':'그 기물과 바꿀 수 있는 짝이 없어요. 다른 기물을 골라 주세요.'); }
    return toast(`표시된 ${secondLabel} 기물 중에서 바꿀 짝을 고르세요. 같은 기물을 다시 누르면 취소돼요.`);
  };
  if (!swapFirst) {
    if (p?.color!==firstColor || p.type==='K') return toast(`먼저 킹을 제외한 ${firstLabel} 기물을 골라 주세요.`);
    return pickFirst(r,c);
  }
  if (r===swapFirst[0]&&c===swapFirst[1]) { swapFirst=null; selected=null; targets=[]; render(); return toast('선택을 취소했어요. 다시 고르세요.'); }
  const partner=targets.some(t=>t.to[0]===r&&t.to[1]===c);
  if (!partner && p?.color===firstColor && p.type!=='K') return pickFirst(r,c);
  if (!p || p.color!==secondColor || p.type==='K') return toast(`킹을 제외한 ${secondLabel} 기물을 골라 주세요.`);
  const trial=swapTrial(swapFirst,[r,c]);
  if (!trial.ok) { swapFirst=null; selected=null; targets=[]; render(); return toast(trial.reason); }
  game.board=trial.board; swapFirst=null; targets=[];
  const message=kind==='ownSwap'?'⇆ 내 기물 두 개의 위치를 바꿨어요.':kind==='enemySwap'?'⥄ 상대 기물 두 개의 위치를 바꿨어요.':'⇄ 내 기물과 상대 기물의 위치를 바꿨어요.';
  finishTurn(message);
}

function handleChange(r,c,p) {
  if (p?.color!==game.turn || p.type==='K') return toast('킹을 제외한 내 기물을 골라 주세요.');
  choose('기물 교체','바꿀 기물을 고르세요.',[['♛','퀸','Q'],['♜','룩','R'],['♝','비숍','B'],['♞','나이트','N'],['♟','폰','P']],type=>{
    const before=p.type; p.type=type;
    if (ChessRules.inCheck(game.board,game.turn,game.meta)) { p.type=before; return toast('그 교체는 킹을 체크 상태로 만들어요.'); }
    if (ChessRules.hasStrandedPawn(game.board,game.meta)) { p.type=before; return toast('승격 줄에 있는 기물은 폰으로 바꿀 수 없어요.'); }
    finishTurn(`♕ ${before} 기물을 ${type} 기물로 바꿨어요.`);
  });
}

function shuffledBoard(source) {
  const board=ChessRules.copyBoard(source);
  for(const color of ['w','b']){
    const spots=[];const pieces=[];
    for(let r=0;r<8;r++)for(let c=0;c<8;c++){const p=board[r][c];if(p?.color===color&&p.type!=='K'){spots.push([r,c]);pieces.push(p);board[r][c]=null;}}
    for(let i=pieces.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pieces[i],pieces[j]]=[pieces[j],pieces[i]];}
    spots.forEach(([r,c],i)=>board[r][c]=pieces[i]);
  }
  return board;
}

// 내 킹이 안전하고 승격 줄에 폰이 없는 배치가 나올 때까지 다시 섞는다.
function shufflePieces() {
  const wasInCheck=ChessRules.inCheck(game.board,game.turn,game.meta);
  let board=null;
  for(let attempt=0;attempt<300&&!board;attempt++){
    const trial=shuffledBoard(game.board);
    if(!ChessRules.inCheck(trial,game.turn,game.meta)&&!ChessRules.hasStrandedPawn(trial,game.meta))board=trial;
  }
  if (!board && wasInCheck) {
    addLog('⤨ 어떻게 섞어도 체크를 해소할 수 없었어요.');
    return endGame(`${colorName(ChessRules.opposite(game.turn))} 승리 · 대혼란으로 체크를 해소하지 못해 카드 체크메이트`);
  }
  if (!board) return finishTurn('⤨ 안전하게 섞을 수 있는 배치가 없어 기물이 그대로 남았어요.');
  game.board=board;
  const opponent=ChessRules.opposite(game.turn);
  finishTurn(`⤨ 킹을 제외한 양쪽 군대의 기물 위치를 모두 섞었어요.${ChessRules.inCheck(game.board,opponent,game.meta)?' 상대 킹 체크!':''}`);
}

function colorReverse() {
  game.board=ChessRules.reverseColors(game.board); game.meta={colorReversed:!game.meta.colorReversed,enPassant:null};
  game.drawn=false; game.cardId=null; game.activeKind=null; game.movesLeft=0;
  addLog('◐ 양쪽 군대 전체를 맞바꿨어요. 카드를 쓴 플레이어가 새 군대로 한 번 더 행동합니다.'); evaluateCurrentTurn(); render(); notifyState();
}

function finishTurn(message) {
  addLog(message); game.drawn=false; game.cardId=null; game.activeKind=null; game.movesLeft=0; selected=null; targets=[]; swapFirst=null; forcedPawnSquare=null;
  game.turn=ChessRules.opposite(game.turn);
  evaluateCurrentTurn(); render(); notifyState();
}

function evaluateCurrentTurn() {
  const s=ChessRules.status(game.board,game.turn,game.meta);
  if (s.reason==='stalemate') endGame('무승부 · 스테일메이트');
}
function endGame(result) { hiddenResult=''; celebratedResult=''; game.over=true; game.result=result; game.drawn=false; game.activeKind=null; addLog(`🏆 ${result}`); render(); notifyState(); }

function resultHeading(result) {
  if (result.includes('흰색 승리')) return '🏆 흰색이 승리했어요!';
  if (result.includes('검은색 승리')) return '🏆 검은색이 승리했어요!';
  if (result.includes('무승부')) return '🤝 무승부예요';
  return '🏁 게임이 끝났어요';
}

function playResultEffect(result) {
  const layer=document.querySelector('#resultEffects'); layer.innerHTML='';
  const draw=result.includes('무승부');
  const colors=draw?['#d5ded0','#9ba99a','#f1ead9']:['#d5aa55','#f4d77c','#9eb889','#ffffff','#c96758'];
  const count=draw?30:56;
  for(let i=0;i<count;i++) {
    const bit=document.createElement('i'); bit.className='confetti';
    bit.style.setProperty('--x',`${Math.random()*100}vw`);
    bit.style.setProperty('--drift',`${Math.random()*30-15}vw`);
    bit.style.setProperty('--delay',`${Math.random()*.55}s`);
    bit.style.setProperty('--duration',`${1.9+Math.random()*1.4}s`);
    bit.style.setProperty('--spin',`${360+Math.random()*720}deg`);
    bit.style.setProperty('--color',colors[i%colors.length]);
    bit.style.setProperty('--size',`${6+Math.random()*7}px`);
    layer.appendChild(bit);
  }
  setTimeout(()=>{if(celebratedResult===game.result)layer.innerHTML=''},3600);
}

function choose(title,text,options,callback) {
  document.querySelector('#modalTitle').textContent=title; document.querySelector('#modalText').textContent=text;
  const box=document.querySelector('#modalChoices'); box.innerHTML='';
  options.forEach(([icon,label,value])=>{const b=document.createElement('button');b.className='choice';b.textContent=icon;b.title=label;b.onclick=()=>{document.querySelector('#modal').classList.remove('open');callback(value)};box.appendChild(b)});
  document.querySelector('#modal').classList.add('open');
}

function render() {
  const boardEl=document.querySelector('#board'); boardEl.innerHTML='';
  for(let vr=0;vr<8;vr++)for(let vc=0;vc<8;vc++){
    const r=orient?7-vr:vr,c=orient?7-vc:vc,p=game.board[r][c]; const b=document.createElement('button');
    b.className=`sq ${(r+c)%2?'dark':'light'}`;
    if(selected?.[0]===r&&selected?.[1]===c)b.classList.add('selected');
    if(targets.some(m=>m.to[0]===r&&m.to[1]===c))b.classList.add(p?'capture':'target');
    if(p)b.innerHTML=`<span class="piece ${p.color==='w'?'white':'black'}">${symbols[p.type]}</span>`;
    b.onclick=()=>clickSquare(r,c); boardEl.appendChild(b);
  }
  const status=ChessRules.status(game.board,game.turn,game.meta);
  document.querySelector('#turnLabel').textContent=game.over?game.result:`${colorName(game.turn)} 차례 · ${status.check?'체크 · ':''}${game.drawn?(game.activeKind?'효과 진행':'카드 사용'):'카드 뽑기'}`;
  document.querySelector('#p1Color').textContent=`· ${game.ownerByColor.w==='w'?'White':'Black'}`; document.querySelector('#p2Color').textContent=`· ${game.ownerByColor.w==='b'?'White':'Black'}`;
  document.querySelector('#deckCount').textContent=`DRAW · ${game.deck}`;
  const card=activeCard(), area=document.querySelector('#cardArea'); area.className=card?'card':'empty'; area.innerHTML=card?`<span class="icon">${card.icon}</span><strong>${card.name}</strong><small>${card.desc} · ${ChessCards.percentLabel(card)}</small>`:'카드를 뽑으면 효과가 공개돼요.';
  const myTurn=canPlayerInteract();
  document.querySelector('#cardState').textContent=card?'1 CARD':'READY'; document.querySelector('#draw').disabled=game.drawn||game.over||!myTurn;
  const use=document.querySelector('#useCard'); use.disabled=!game.drawn||!!game.activeKind||game.over||!myTurn; use.textContent=!myTurn?'상대 차례예요':!game.drawn?'카드를 먼저 뽑으세요':game.activeKind?'효과 진행 중':'카드 사용하기';
  document.querySelector('#boardHint').textContent=game.over?game.result:!myTurn?'상대의 행동을 기다리는 중이에요.':selected?`${colorName(game.board[selected[0]][selected[1]].color)} ${game.board[selected[0]][selected[1]].type} · ${swapFirst?`바꿀 수 있는 짝 ${targets.length}개`:`가능한 수 ${targets.length}개`}`:game.activeKind?effectHelp(game.activeKind):game.drawn?'공개된 카드를 사용하세요.':(status.check?'체크를 해소해야 합니다.':'카드를 뽑으세요.');
  const resultOverlay=document.querySelector('#resultOverlay');
  if (game.over && game.result && hiddenResult!==game.result) {
    document.querySelector('#resultTitle').textContent=resultHeading(game.result);
    document.querySelector('#resultDetail').textContent=game.result;
    resultOverlay.classList.add('open');
    if (celebratedResult!==game.result) { celebratedResult=game.result; playResultEffect(game.result); }
  } else resultOverlay.classList.remove('open');
}

document.querySelector('#draw').onclick=drawCard; document.querySelector('#useCard').onclick=useCard;
document.querySelector('#flip').onclick=()=>{orient=!orient;render()}; document.querySelector('#newGame').onclick=()=>{if(confirm('새 게임을 시작할까요?'))freshGame()};
document.querySelector('#modalClose').onclick=()=>document.querySelector('#modal').classList.remove('open');
document.querySelector('#resultClose').onclick=()=>{hiddenResult=game.result;document.querySelector('#resultOverlay').classList.remove('open')};
function renderOdds() {
  const move=cards.find(c=>c.id==='move'), rarest=Math.min(...cards.filter(c=>c.id!=='move').map(ChessCards.percent));
  document.querySelector('#odds').innerHTML=`<strong>한 수 이동 ${ChessCards.percentLabel(move)}</strong><br>특수 카드 ${Math.round((100-ChessCards.percent(move))*10)/10}%<br>가장 드문 카드 ${rarest}%`;
}
renderOdds();
freshGame();

if (location.pathname === '/debug-play.html') {
  document.querySelector('.online').style.display='none';
  const lab=document.createElement('section');
  lab.style.cssText='display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:14px;padding:13px 14px;background:#fff6dc;border:1px solid #e3c982;border-radius:13px;font-size:12px';
  lab.innerHTML='<strong>디버그 카드 선택</strong>' + cards.map(card=>`<button class="pill" data-debug-card="${card.id}">${card.icon} ${card.name} ${ChessCards.percentLabel(card)}</button>`).join('') + '<button class="pill" id="debugCheck">카드 체크메이트 배치</button><button class="pill" id="debugDoubleCheck">더블 체크 탈출 배치</button><button class="pill" id="debugNoPawn">폰 없음 배치</button><button class="pill" id="debugVictory">승리 화면 테스트</button><button class="pill" id="debugReset">판 초기화</button><a class="ghost" href="/debug.html">규칙 테스트로</a>';
  document.querySelector('.top').after(lab);
  const forceCard=id=>{
    const card=cards.find(item=>item.id===id); if(!card)return;
    game.over=false;game.result='';game.drawn=true;game.cardId=card.id;game.activeKind=null;game.movesLeft=0;selected=null;targets=[];swapFirst=null;forcedPawnSquare=null;
    addLog(`🧪 디버그: 「${card.name}」 카드를 선택했어요.`);render();
  };
  lab.querySelectorAll('[data-debug-card]').forEach(button=>button.onclick=()=>forceCard(button.dataset.debugCard));
  lab.querySelector('#debugReset').onclick=freshGame;
  lab.querySelector('#debugNoPawn').onclick=()=>{
    game.board=Array.from({length:8},()=>Array(8).fill(null));
    game.board[7][4]={color:'w',type:'K',hasMoved:false};game.board[0][4]={color:'b',type:'K',hasMoved:false};
    game.turn='w';game.meta={colorReversed:false,enPassant:null};game.ownerByColor={w:'w',b:'b'};game.over=false;game.result='';game.drawn=false;game.cardId=null;game.activeKind=null;game.movesLeft=0;selected=null;targets=[];swapFirst=null;forcedPawnSquare=null;hiddenResult='';celebratedResult='';
    addLog('🧪 폰 없음 배치: 폰 두 번 이동 카드를 사용하면 한 수 이동으로 자동 전환됩니다.');forceCard('pawnTwice');
  };
  lab.querySelector('#debugDoubleCheck').onclick=()=>{
    game.board=Array.from({length:8},()=>Array(8).fill(null));
    game.board[7][4]={color:'w',type:'K',hasMoved:false};game.board[7][0]={color:'w',type:'R',hasMoved:false};game.board[0][0]={color:'b',type:'K',hasMoved:false};game.board[0][4]={color:'b',type:'R',hasMoved:true};
    game.turn='w';game.meta={colorReversed:false,enPassant:null};game.ownerByColor={w:'w',b:'b'};game.over=false;game.result='';game.drawn=false;game.cardId=null;game.activeKind=null;game.movesLeft=0;selected=null;targets=[];swapFirst=null;forcedPawnSquare=null;hiddenResult='';celebratedResult='';
    addLog('🧪 더블 체크 탈출: 첫 이동은 체크를 남겨도 되며, 두 번째 이동까지 끝나면 반드시 체크가 해소되어야 합니다.');forceCard('double');
  };
  lab.querySelector('#debugVictory').onclick=()=>endGame('흰색 승리 · 디버그 승리 화면');
  lab.querySelector('#debugCheck').onclick=()=>{
    game.board=Array.from({length:8},()=>Array(8).fill(null));
    game.board[7][4]={color:'w',type:'K',hasMoved:false};game.board[0][0]={color:'b',type:'K',hasMoved:false};game.board[0][3]={color:'b',type:'R',hasMoved:true};game.board[0][4]={color:'b',type:'R',hasMoved:true};game.board[0][5]={color:'b',type:'R',hasMoved:true};
    game.turn='w';game.meta={colorReversed:false,enPassant:null};game.ownerByColor={w:'w',b:'b'};game.over=false;game.result='';game.drawn=false;game.cardId=null;game.activeKind=null;game.movesLeft=0;selected=null;targets=[];swapFirst=null;forcedPawnSquare=null;
    addLog('🧪 카드 체크메이트 배치: 일반 킹 이동은 모두 막혔지만 거리 두 배 킹은 안전한 두 칸 밖으로 탈출할 수 있어요.');render();
  };
  forceCard(new URLSearchParams(location.search).get('card')||'move');
}
