const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { createStore, eloDelta, isPlayerId } = require('../ratings');

const tmpFile = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'chess-uno-')), 'ratings.json');
const A = { id: 'a'.repeat(20), name: '앨리스' }, B = { id: 'b'.repeat(20), name: '밥' };

test('equal ratings move 16 points on a decisive game', () => {
  assert.equal(eloDelta(1000, 1000, 1), 16);
  assert.equal(eloDelta(1000, 1000, 0), -16);
  assert.equal(eloDelta(1000, 1000, 0.5), 0);
});

test('beating a stronger player gains more than beating a weaker one', () => {
  assert.ok(eloDelta(1000, 1200, 1) > eloDelta(1000, 800, 1));
});

test('recordGame updates both players and ranks the winner first', () => {
  const store = createStore(tmpFile());
  const change = store.recordGame(A, B, 'a');
  assert.deepEqual(change.a, { before: 1000, after: 1016, delta: 16 });
  assert.deepEqual(change.b, { before: 1000, after: 984, delta: -16 });
  const board = store.leaderboard();
  assert.equal(board[0].name, '앨리스');
  assert.equal(board[0].wins, 1);
  assert.equal(store.stats(B.id).rank, 2);
  assert.equal(store.stats(B.id).losses, 1);
});

test('ratings persist to disk and reload', () => {
  const file = tmpFile();
  const store = createStore(file);
  store.recordGame(A, B, 'draw');
  store.flush();
  const again = createStore(file);
  assert.equal(again.stats(A.id).draws, 1);
  assert.equal(again.stats(A.id).rating, 1000);
});

test('player ids must look like generated ids', () => {
  assert.ok(isPlayerId('abcDEF1234567890xyz'));
  assert.equal(isPlayerId('short'), false);
  assert.equal(isPlayerId('has spaces in it 123456'), false);
});

test('seasons follow Korean months and reset ratings, keeping last season top list', () => {
  const { seasonOf } = require('../ratings');
  assert.equal(seasonOf(Date.parse('2026-09-30T14:59:00Z')), '2026-09'); // 23:59 KST
  assert.equal(seasonOf(Date.parse('2026-09-30T15:00:00Z')), '2026-10'); // 00:00 KST
  let clock = Date.parse('2026-09-20T00:00:00Z');
  const store = createStore(tmpFile(), { now: () => clock });
  store.recordGame(A, B, 'a');
  assert.equal(store.seasonInfo().label, '2026년 9월 시즌');
  clock = Date.parse('2026-10-02T00:00:00Z');
  assert.equal(store.leaderboard().length, 0);
  assert.equal(store.stats(A.id).rating, 1000);
  const info = store.seasonInfo();
  assert.equal(info.label, '2026년 10월 시즌');
  assert.equal(info.last.label, '2026년 9월 시즌');
  assert.equal(info.last.top[0].name, '앨리스');
  assert.equal(info.last.top[0].rating, 1016);
});
