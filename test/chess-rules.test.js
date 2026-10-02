const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../chess-rules');

const empty = () => Array.from({ length: 8 }, () => Array(8).fill(null));
const piece = (color, type, extra = {}) => ({ color, type, hasMoved: false, ...extra });
const has = (moves, r, c, key) => moves.some(m => m.to[0] === r && m.to[1] === c && (!key || m[key]));

test('initial position has 20 legal moves', () => {
  assert.equal(R.allLegalMoves(R.initialBoard(), 'w', {}).length, 20);
});

test('pawn direction reverses after color reversal', () => {
  const b = empty(); b[0][4] = piece('b','K'); b[7][4] = piece('w','K'); b[1][2] = piece('w','P'); b[6][3] = piece('b','P');
  assert.ok(has(R.legalMoves(b, 1, 2, { colorReversed: true }), 2, 2));
  assert.ok(has(R.legalMoves(b, 6, 3, { colorReversed: true }), 5, 3));
});

test('color reversal swaps every army color', () => {
  const b = R.reverseColors(R.initialBoard());
  assert.equal(b[7][4].color, 'b');
  assert.equal(b[0][4].color, 'w');
});

test('added pawns are limited to their own half including reversed armies', () => {
  assert.equal(R.pawnPlacementAllowed(4, 'w', false), true);
  assert.equal(R.pawnPlacementAllowed(3, 'w', false), false);
  assert.equal(R.pawnPlacementAllowed(3, 'b', false), true);
  assert.equal(R.pawnPlacementAllowed(4, 'b', false), false);
  assert.equal(R.pawnPlacementAllowed(3, 'w', true), true);
  assert.equal(R.pawnPlacementAllowed(4, 'w', true), false);
});

test('pinned piece cannot expose its king', () => {
  const b = empty(); b[7][4] = piece('w','K'); b[6][4] = piece('w','R'); b[0][4] = piece('b','R'); b[0][0] = piece('b','K');
  assert.equal(has(R.legalMoves(b, 6, 4, {}), 6, 5), false);
});

test('king cannot move into check', () => {
  const b = empty(); b[7][4] = piece('w','K'); b[0][4] = piece('b','R'); b[0][0] = piece('b','K');
  assert.equal(has(R.legalMoves(b, 7, 4, {}), 6, 4), false);
});

test('castling moves king and rook and cannot cross attack', () => {
  const b = empty(); b[7][4] = piece('w','K'); b[7][7] = piece('w','R'); b[0][4] = piece('b','K');
  const castle = R.legalMoves(b, 7, 4, {}).find(m => m.castle === 'king');
  assert.ok(castle);
  const applied = R.applyMove(b, castle, {});
  assert.equal(applied.board[7][6].type, 'K'); assert.equal(applied.board[7][5].type, 'R');
  b[0][5] = piece('b','R');
  assert.equal(R.legalMoves(b, 7, 4, {}).some(m => m.castle === 'king'), false);
});

test('en passant is available for one reply', () => {
  const b = empty(); b[7][4] = piece('w','K'); b[0][4] = piece('b','K'); b[3][4] = piece('w','P',{hasMoved:true}); b[1][5] = piece('b','P');
  const double = R.legalMoves(b, 1, 5, {}).find(m => m.doublePawn);
  const after = R.applyMove(b, double, {});
  const ep = R.legalMoves(after.board, 3, 4, after.meta).find(m => m.enPassant);
  assert.ok(ep);
  assert.equal(R.applyMove(after.board, ep, after.meta).board[3][5], null);
});

test('pawn promotes on last rank', () => {
  const b = empty(); b[7][4] = piece('w','K'); b[0][4] = piece('b','K'); b[1][0] = piece('w','P',{hasMoved:true});
  const move = R.legalMoves(b, 1, 0, {}).find(m => m.promotion);
  assert.equal(R.applyMove(b, move, {}, 'N').board[0][0].type, 'N');
});

test('detects checkmate and stalemate', () => {
  const mate = empty(); mate[0][0] = piece('b','K'); mate[1][1] = piece('w','Q'); mate[2][2] = piece('w','K');
  assert.equal(R.status(mate, 'b', {}).reason, 'checkmate');
  const stale = empty(); stale[0][0] = piece('b','K'); stale[1][2] = piece('w','Q'); stale[2][1] = piece('w','K');
  assert.equal(R.status(stale, 'b', {}).reason, 'stalemate');
});

test('distance double adds doubled knight and king reach, keeps normal moves, leaves sliders unchanged', () => {
  const b = empty(); b[7][4] = piece('w','K'); b[0][4] = piece('b','K'); b[6][1] = piece('w','N'); b[5][5] = piece('w','R');
  assert.ok(has(R.distanceMoves(b,6,1,{}),2,3));
  assert.ok(has(R.distanceMoves(b,6,1,{}),4,2), 'normal knight move stays available');
  assert.ok(has(R.distanceMoves(b,7,4,{}),6,4), 'normal king step stays available');
  assert.equal(R.distanceMoves(b,5,5,{}).length,R.legalMoves(b,5,5,{}).length);
  assert.ok(has(R.distanceMoves(b,7,4,{}),5,4));
});

test('distance double lets a pawn advance or capture at doubled distance', () => {
  const b=empty();b[7][4]=piece('w','K');b[0][4]=piece('b','K');b[4][4]=piece('w','P',{hasMoved:true});b[2][6]=piece('b','N');
  assert.ok(has(R.distanceMoves(b,4,4,{}),2,4));
  assert.ok(has(R.distanceMoves(b,4,4,{}),2,6));
  b[3][4]=piece('w','N');
  assert.equal(has(R.distanceMoves(b,4,4,{}),2,4),false);
});

test('distance double can turn a starting pawn two-step into four squares', () => {
  const b=empty();b[7][4]=piece('w','K');b[0][4]=piece('b','K');b[6][0]=piece('w','P');
  assert.ok(has(R.distanceMoves(b,6,0,{}),4,0));
  assert.ok(has(R.distanceMoves(b,6,0,{}),2,0));
});

test('distance double king can jump the middle square but cannot land under attack', () => {
  const b = empty(); b[7][4]=piece('w','K'); b[0][0]=piece('b','K'); b[6][4]=piece('w','P');
  assert.ok(has(R.distanceMoves(b,7,4,{}),5,4));
  b[0][2]=piece('b','R');
  assert.equal(has(R.distanceMoves(b,7,4,{}),7,2),false);
});

test('distance double king can escape a standard chess checkmate position', () => {
  const b=empty();b[7][4]=piece('w','K');b[0][0]=piece('b','K');b[0][3]=piece('b','R');b[0][4]=piece('b','R');b[0][5]=piece('b','R');
  assert.equal(R.status(b,'w',{}).reason,'checkmate');
  assert.ok(has(R.distanceMoves(b,7,4,{}),7,2));
});

test('double action may leave check after its first move when a legal second escape exists', () => {
  const b=empty();b[7][4]=piece('w','K');b[0][0]=piece('b','K');b[0][4]=piece('b','R');b[7][0]=piece('w','R');
  assert.equal(R.inCheck(b,'w',{}),true);
  assert.equal(has(R.legalMoves(b,7,0,{}),6,0),false);
  const first=R.doubleFirstMoves(b,7,0,{}).find(m=>m.to[0]===6&&m.to[1]===0);
  assert.ok(first);
  const after=R.applyMove(b,first,{});
  assert.equal(R.inCheck(after.board,'w',after.meta),true);
  assert.ok(R.allLegalMoves(after.board,'w',after.meta).length>0);
});

test('stranded pawn detection follows each army promotion row, including reversal', () => {
  const b = empty();
  b[7][4] = piece('w', 'K'); b[0][0] = piece('b', 'K');
  b[0][3] = piece('w', 'P');
  assert.equal(R.hasStrandedPawn(b, {}), true);
  assert.equal(R.hasStrandedPawn(b, { colorReversed: true }), false);
  b[0][3] = null; b[7][2] = piece('b', 'P');
  assert.equal(R.hasStrandedPawn(b, {}), true);
  b[7][2] = null; b[6][2] = piece('b', 'P');
  assert.equal(R.hasStrandedPawn(b, {}), false);
});

test('card table sums to 100 and percentages come from weights', () => {
  const C = require('../cards');
  assert.equal(C.totalWeight(), 100);
  const move = C.cards.find(c => c.id === 'move');
  assert.equal(C.percentLabel(move), '50%');
  assert.equal(new Set(C.cards.map(c => c.id)).size, C.cards.length);
  assert.ok(!C.checkFallbackKinds.includes('skip'), 'skip must stay a penalty in check');
});

test('room weights are validated, clamped, and default when unchanged', () => {
  const C = require('../cards');
  assert.equal(C.normalizeWeights(C.defaultWeights()), null);
  assert.equal(C.normalizeWeights(Object.fromEntries(C.cards.map(c => [c.id, 0]))), null);
  const custom = C.normalizeWeights({ ...C.defaultWeights(), skip: 0, move: 500, wild: -3 });
  assert.equal(custom.skip, 0); assert.equal(custom.move, 100); assert.equal(custom.wild, 0);
  assert.equal(C.percent(C.cards.find(c => c.id === 'skip'), custom), 0);
  for (const preset of Object.values(C.presets)) assert.ok(C.totalWeight(preset.weights) > 0);
  assert.equal(C.totalWeight(C.presets.chaos.weights), 100);
  assert.equal(C.totalWeight(C.presets.orthodox.weights), 100);
});

test('double action first move cannot walk the king into an attacked square', () => {
  // 흰 킹 e1, 검은 퀸 f2(체크), 그 퀸을 지키는 검은 폰 g3
  const b = empty(); b[7][4] = piece('w','K'); b[6][5] = piece('b','Q'); b[5][6] = piece('b','P'); b[0][0] = piece('b','K');
  const kingFirst = R.doubleFirstMoves(b, 7, 4, {});
  assert.equal(has(kingFirst, 6, 5), false, 'Kxf2 lands on a square the pawn attacks');
  assert.equal(R.legalMoves(b, 7, 4, {}).some(m => m.to[0] === 6 && m.to[1] === 5), false);
});
