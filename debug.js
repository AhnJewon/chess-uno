const S={K:'♚',Q:'♛',R:'♜',B:'♝',N:'♞',P:'♟'};
document.getElementById('cardbuttons').innerHTML=ChessCards.cards.map(c=>`<a href="/debug-play.html?card=${c.id}"><b>${c.icon}</b>${c.name} · ${ChessCards.percentLabel(c)}</a>`).join('');
const empty=()=>Array.from({length:8},()=>Array(8).fill(null));
const p=(color,type,extra={})=>({color,type,hasMoved:false,...extra});
const has=(moves,r,c,key)=>moves.some(m=>m.to[0]===r&&m.to[1]===c&&(!key||m[key]));
function renderBoard(board){return `<div class="board">${board.flatMap((row,r)=>row.map((piece,c)=>`<div class="sq ${(r+c)%2?'dark':'light'}">${piece?`<span class="${piece.color==='w'?'white':'black'}">${S[piece.type]}</span>`:''}</div>`)).join('')}</div>`}
function scenarios(){
 const initial=ChessRules.initialBoard();
 const reversed=empty();reversed[0][4]=p('b','K');reversed[7][4]=p('w','K');reversed[1][2]=p('w','P');reversed[6][3]=p('b','P');
 const pin=empty();pin[7][4]=p('w','K');pin[6][4]=p('w','R');pin[0][4]=p('b','R');pin[0][0]=p('b','K');
 const castle=empty();castle[7][4]=p('w','K');castle[7][7]=p('w','R');castle[0][4]=p('b','K');
 const ep=empty();ep[7][4]=p('w','K');ep[0][4]=p('b','K');ep[3][4]=p('w','P',{hasMoved:true});ep[1][5]=p('b','P');const dbl=ChessRules.legalMoves(ep,1,5,{}).find(m=>m.doublePawn);const after=ChessRules.applyMove(ep,dbl,{});
 const promo=empty();promo[7][4]=p('w','K');promo[0][4]=p('b','K');promo[1][0]=p('w','P',{hasMoved:true});
 const mate=empty();mate[0][0]=p('b','K');mate[1][1]=p('w','Q');mate[2][2]=p('w','K');
 const stale=empty();stale[0][0]=p('b','K');stale[1][2]=p('w','Q');stale[2][1]=p('w','K');
 const distance=empty();distance[7][4]=p('w','K');distance[0][4]=p('b','K');distance[6][1]=p('w','N');distance[5][5]=p('w','R');distance[4][4]=p('w','P',{hasMoved:true});distance[2][6]=p('b','N');
 const blockedDistance=empty();blockedDistance[7][4]=p('w','K');blockedDistance[0][0]=p('b','K');blockedDistance[6][4]=p('w','P');blockedDistance[0][2]=p('b','R');
 const cardMate=empty();cardMate[7][4]=p('w','K');cardMate[0][0]=p('b','K');cardMate[0][3]=p('b','R');cardMate[0][4]=p('b','R');cardMate[0][5]=p('b','R');
 const armies=ChessRules.initialBoard();const swappedArmies=ChessRules.reverseColors(armies);
 return [
  ['초기 합법 수','초기 흰색의 합법 수는 20개',initial,()=>ChessRules.allLegalMoves(initial,'w',{}).length===20],
  ['색반전 폰 방향','위쪽 흰 폰은 아래로, 아래쪽 검은 폰은 위로',reversed,()=>has(ChessRules.legalMoves(reversed,1,2,{colorReversed:true}),2,2)&&has(ChessRules.legalMoves(reversed,6,3,{colorReversed:true}),5,3)],
  ['핀과 체크 보호','룩이 옆으로 움직여 킹을 노출할 수 없음',pin,()=>!has(ChessRules.legalMoves(pin,6,4,{}),6,5)],
  ['캐슬링','조건을 만족하면 킹사이드 캐슬링 가능',castle,()=>ChessRules.legalMoves(castle,7,4,{}).some(m=>m.castle==='king')],
  ['앙파상','상대 폰의 두 칸 전진 직후에만 가능',after.board,()=>ChessRules.legalMoves(after.board,3,4,after.meta).some(m=>m.enPassant)],
  ['폰 승격','마지막 랭크에서 승격 수가 생성됨',promo,()=>ChessRules.legalMoves(promo,1,0,{}).some(m=>m.promotion)],
  ['체크메이트','합법 수가 없고 체크면 체크메이트',mate,()=>ChessRules.status(mate,'b',{}).reason==='checkmate'],
  ['스테일메이트','합법 수가 없고 체크가 아니면 무승부',stale,()=>ChessRules.status(stale,'b',{}).reason==='stalemate'],
  ['이동 거리 두 배','폰은 두 칸 전진·잡기, 나이트는 4×2칸, 룩은 원래 합법 이동을 사용',distance,()=>has(ChessRules.distanceMoves(distance,4,4,{}),2,4)&&has(ChessRules.distanceMoves(distance,4,4,{}),2,6)&&has(ChessRules.distanceMoves(distance,6,1,{}),2,3)&&ChessRules.distanceMoves(distance,5,5,{}).length===ChessRules.legalMoves(distance,5,5,{}).length],
  ['두 배 킹 도약','킹은 중간 칸을 뛰어넘지만 공격받는 도착 칸에는 갈 수 없음',blockedDistance,()=>has(ChessRules.distanceMoves(blockedDistance,7,4,{}),5,4)&&!has(ChessRules.distanceMoves(blockedDistance,7,4,{}),7,2)],
  ['카드 체크메이트 탈출','일반 체크메이트 자리도 거리 두 배 킹으로 탈출 가능',cardMate,()=>ChessRules.status(cardMate,'w',{}).reason==='checkmate'&&has(ChessRules.distanceMoves(cardMate,7,4,{}),7,2)],
  ['군대 전체 반전','보드의 모든 흰 기물과 검은 기물이 서로 뒤바뀜',swappedArmies,()=>swappedArmies[7][4].color==='b'&&swappedArmies[0][4].color==='w'],
  ['폰 추가 진영 제한','일반 흰 폰은 아래쪽 절반, 반전된 흰 폰은 위쪽 절반에만 추가 가능',empty(),()=>ChessRules.pawnPlacementAllowed(4,'w',false)&&!ChessRules.pawnPlacementAllowed(3,'w',false)&&ChessRules.pawnPlacementAllowed(3,'w',true)&&!ChessRules.pawnPlacementAllowed(4,'w',true)]
 ];
}
function run(){const root=document.querySelector('#cases');root.innerHTML='';let passed=0;const list=scenarios();list.forEach(([name,desc,board,test])=>{let ok=false,error='';try{ok=!!test()}catch(e){error=e.message}if(ok)passed++;const el=document.createElement('article');el.className='case';el.innerHTML=`<h2>${name}</h2><p>${desc}</p>${renderBoard(board)}<div class="result ${ok?'ok':'fail'}">${ok?'✓ 통과':'✕ 실패'} ${error}</div>`;root.appendChild(el)});const all=passed===list.length;document.querySelector('#summary').innerHTML=`<strong class="${all?'ok':'fail'}">${passed}/${list.length} 테스트 ${all?'통과':'통과'}</strong><br><small>${all?'운영 반영 가능한 규칙 상태입니다.':'실패 항목을 수정한 뒤 운영에 반영하세요.'}</small>`;}
document.querySelector('#run').onclick=run;run();
