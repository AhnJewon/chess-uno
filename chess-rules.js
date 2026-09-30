(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChessRules = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const inside = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
  const opposite = color => color === 'w' ? 'b' : 'w';
  const copyBoard = board => board.map(row => row.map(piece => piece ? { ...piece } : null));
  const direction = (color, reversed = false) => color === 'w' ? (reversed ? 1 : -1) : (reversed ? -1 : 1);
  const homeRow = (color, reversed = false) => color === 'w' ? (reversed ? 0 : 7) : (reversed ? 7 : 0);
  const pawnStartRow = (color, reversed = false) => color === 'w' ? (reversed ? 1 : 6) : (reversed ? 6 : 1);
  const promotionRow = (color, reversed = false) => direction(color, reversed) < 0 ? 0 : 7;
  const pawnPlacementAllowed = (row, color, reversed = false) => direction(color, reversed) < 0 ? row >= 4 : row <= 3;

  function initialBoard() {
    const board = Array.from({ length: 8 }, () => Array(8).fill(null));
    const back = ['R', 'N', 'B', 'Q', 'K', 'B', 'N', 'R'];
    for (let c = 0; c < 8; c++) {
      board[0][c] = { color: 'b', type: back[c], hasMoved: false };
      board[1][c] = { color: 'b', type: 'P', hasMoved: false };
      board[6][c] = { color: 'w', type: 'P', hasMoved: false };
      board[7][c] = { color: 'w', type: back[c], hasMoved: false };
    }
    return board;
  }

  function findKing(board, color) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      if (board[r][c]?.color === color && board[r][c]?.type === 'K') return [r, c];
    }
    return null;
  }

  function squareAttacked(board, r, c, byColor, meta = {}) {
    const reversed = !!meta.colorReversed;
    const pawnRow = r - direction(byColor, reversed);
    for (const dc of [-1, 1]) if (inside(pawnRow, c + dc) && board[pawnRow][c + dc]?.color === byColor && board[pawnRow][c + dc]?.type === 'P') return true;
    for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
      const rr = r + dr, cc = c + dc;
      if (inside(rr, cc) && board[rr][cc]?.color === byColor && board[rr][cc]?.type === 'N') return true;
    }
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      if (!dr && !dc) continue;
      const rr = r + dr, cc = c + dc;
      if (inside(rr, cc) && board[rr][cc]?.color === byColor && board[rr][cc]?.type === 'K') return true;
    }
    const scan = (directions, types) => {
      for (const [dr, dc] of directions) for (let n = 1; n < 8; n++) {
        const rr = r + dr * n, cc = c + dc * n;
        if (!inside(rr, cc)) break;
        const p = board[rr][cc];
        if (!p) continue;
        if (p.color === byColor && types.includes(p.type)) return true;
        break;
      }
      return false;
    };
    return scan([[1,0],[-1,0],[0,1],[0,-1]], ['R','Q']) || scan([[1,1],[1,-1],[-1,1],[-1,-1]], ['B','Q']);
  }

  function inCheck(board, color, meta = {}) {
    const king = findKing(board, color);
    return !king || squareAttacked(board, king[0], king[1], opposite(color), meta);
  }

  function pseudoMoves(board, r, c, meta = {}, includeCastle = true) {
    const p = board[r]?.[c];
    if (!p) return [];
    const out = [];
    const add = (rr, cc, extra = {}) => {
      if (!inside(rr, cc) || board[rr][cc]?.color === p.color || board[rr][cc]?.type === 'K') return false;
      out.push({ from: [r, c], to: [rr, cc], ...extra });
      return !board[rr][cc];
    };
    const ray = (dr, dc) => { for (let n = 1; n < 8; n++) if (!add(r + dr * n, c + dc * n)) break; };
    if (p.type === 'P') {
      const d = direction(p.color, !!meta.colorReversed);
      if (inside(r + d, c) && !board[r + d][c]) {
        add(r + d, c, r + d === promotionRow(p.color, !!meta.colorReversed) ? { promotion: true } : {});
        if (r === pawnStartRow(p.color, !!meta.colorReversed) && !p.hasMoved && !board[r + 2 * d][c]) add(r + 2 * d, c, { doublePawn: true });
      }
      for (const dc of [-1, 1]) {
        const rr = r + d, cc = c + dc;
        if (!inside(rr, cc)) continue;
        if (board[rr][cc] && board[rr][cc].color !== p.color && board[rr][cc].type !== 'K') add(rr, cc, rr === promotionRow(p.color, !!meta.colorReversed) ? { promotion: true } : {});
        else if (meta.enPassant && meta.enPassant.r === rr && meta.enPassant.c === cc && meta.enPassant.color !== p.color) add(rr, cc, { enPassant: true });
      }
    } else if (p.type === 'N') {
      for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) add(r + dr, c + dc);
    } else if (p.type === 'K') {
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) if (dr || dc) add(r + dr, c + dc);
      if (includeCastle && !p.hasMoved && r === homeRow(p.color, !!meta.colorReversed) && c === 4 && !inCheck(board, p.color, meta)) {
        for (const side of [{ rookC: 7, path: [5,6], kingC: 6 }, { rookC: 0, path: [3,2,1], kingC: 2 }]) {
          const rook = board[r][side.rookC];
          if (!rook || rook.color !== p.color || rook.type !== 'R' || rook.hasMoved || side.path.some(cc => board[r][cc])) continue;
          const crossed = side.kingC === 6 ? [5,6] : [3,2];
          if (crossed.some(cc => squareAttacked(board, r, cc, opposite(p.color), meta))) continue;
          out.push({ from: [r,c], to: [r,side.kingC], castle: side.kingC === 6 ? 'king' : 'queen' });
        }
      }
    } else {
      if (p.type === 'R' || p.type === 'Q') for (const d of [[1,0],[-1,0],[0,1],[0,-1]]) ray(...d);
      if (p.type === 'B' || p.type === 'Q') for (const d of [[1,1],[1,-1],[-1,1],[-1,-1]]) ray(...d);
    }
    return out;
  }

  function applyMove(board, move, meta = {}, promotion = 'Q') {
    const next = copyBoard(board);
    const nextMeta = { colorReversed: !!meta.colorReversed, enPassant: null };
    const [fr, fc] = move.from, [tr, tc] = move.to;
    const piece = next[fr][fc];
    if (!piece) throw new Error('출발 칸에 기물이 없습니다.');
    next[fr][fc] = null;
    if (move.enPassant) next[fr][tc] = null;
    next[tr][tc] = { ...piece, hasMoved: true };
    if (move.castle) {
      const rookFrom = move.castle === 'king' ? 7 : 0;
      const rookTo = move.castle === 'king' ? 5 : 3;
      next[tr][rookTo] = { ...next[tr][rookFrom], hasMoved: true };
      next[tr][rookFrom] = null;
    }
    if (piece.type === 'P' && move.doublePawn) nextMeta.enPassant = { r: (fr + tr) / 2, c: fc, color: piece.color };
    if (piece.type === 'P' && tr === promotionRow(piece.color, !!meta.colorReversed)) next[tr][tc].type = ['Q','R','B','N'].includes(promotion) ? promotion : 'Q';
    return { board: next, meta: nextMeta };
  }

  function legalMoves(board, r, c, meta = {}) {
    const p = board[r]?.[c];
    if (!p) return [];
    return pseudoMoves(board, r, c, meta).filter(move => !inCheck(applyMove(board, move, meta).board, p.color, applyMove(board, move, meta).meta));
  }

  function doubleFirstMoves(board, r, c, meta = {}) {
    const p = board[r]?.[c];
    if (!p) return [];
    return pseudoMoves(board, r, c, meta).filter(move => {
      const applied = applyMove(board, move, meta);
      return allLegalMoves(applied.board, p.color, applied.meta).length > 0;
    });
  }

  function distanceMoves(board, r, c, meta = {}) {
    const p = board[r]?.[c];
    if (!p) return [];
    if (['R','B','Q'].includes(p.type)) return legalMoves(board, r, c, meta);
    const candidates = [];
    const add = (rr, cc) => {
      if (!inside(rr, cc) || board[rr][cc]?.color === p.color || board[rr][cc]?.type === 'K') return;
      candidates.push({ from:[r,c], to:[rr,cc], distanceDouble:true });
    };
    if (p.type === 'P') {
      const d=direction(p.color,!!meta.colorReversed);
      const forward=steps=>{
        const tr=r+d*steps;
        if(!inside(tr,c))return;
        for(let n=1;n<=steps;n++)if(board[r+d*n][c])return;
        candidates.push({from:[r,c],to:[tr,c],distanceDouble:true,...(tr===promotionRow(p.color,!!meta.colorReversed)?{promotion:true}:{})});
      };
      forward(2);
      if(r===pawnStartRow(p.color,!!meta.colorReversed)&&!p.hasMoved)forward(4);
      for(const dc of [-2,2]){
        const tr=r+d*2,tc=c+dc,target=board[tr]?.[tc];
        if(inside(tr,tc)&&target&&target.color!==p.color&&target.type!=='K')candidates.push({from:[r,c],to:[tr,tc],distanceDouble:true,...(tr===promotionRow(p.color,!!meta.colorReversed)?{promotion:true}:{})});
      }
    } else if (p.type === 'N') {
      for (const [dr,dc] of [[-4,-2],[-4,2],[-2,-4],[-2,4],[2,-4],[2,4],[4,-2],[4,2]]) add(r+dr,c+dc);
    } else if (p.type === 'K') {
      for (let dr=-1;dr<=1;dr++) for (let dc=-1;dc<=1;dc++) {
        if (!dr&&!dc) continue;
        add(r+dr*2,c+dc*2);
      }
    }
    // 평소 이동도 그대로 허용하고, 두 배 거리 수를 선택지로 더한다. 같은 칸이면 평소 수(캐슬링·앙파상 표시 포함)를 남긴다.
    const normal = legalMoves(board, r, c, meta);
    const doubled = candidates.filter(move => {
      if (normal.some(n => n.to[0] === move.to[0] && n.to[1] === move.to[1])) return false;
      const applied=applyMove(board,move,meta);
      return !inCheck(applied.board,p.color,applied.meta);
    });
    return [...normal, ...doubled];
  }

  function allLegalMoves(board, color, meta = {}) {
    const all = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c]?.color === color) all.push(...legalMoves(board, r, c, meta));
    return all;
  }

  function allDoubleFirstMoves(board, color, meta = {}) {
    const all = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c]?.color === color) all.push(...doubleFirstMoves(board, r, c, meta));
    return all;
  }

  function status(board, color, meta = {}) {
    const check = inCheck(board, color, meta);
    const moves = allLegalMoves(board, color, meta);
    if (!moves.length) return { over: true, reason: check ? 'checkmate' : 'stalemate', check, winner: check ? opposite(color) : null };
    return { over: false, reason: check ? 'check' : 'playing', check, winner: null };
  }

  // 카드 효과(자리 바꾸기·교체·대혼란)로 폰이 자기 승격 줄에 놓이면 승격도 이동도 못 하는 폰이 된다.
  function hasStrandedPawn(board, meta = {}) {
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (p?.type === 'P' && r === promotionRow(p.color, !!meta.colorReversed)) return true;
    }
    return false;
  }

  function reverseColors(board) {
    return board.map(row => row.map(piece => piece ? { ...piece, color: opposite(piece.color) } : null));
  }

  return { initialBoard, copyBoard, opposite, direction, homeRow, pawnStartRow, promotionRow, pawnPlacementAllowed, findKing, squareAttacked, inCheck, pseudoMoves, legalMoves, doubleFirstMoves, distanceMoves, allLegalMoves, allDoubleFirstMoves, applyMove, status, hasStrandedPawn, reverseColors };
});
