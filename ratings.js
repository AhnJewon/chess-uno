// 빠른 매칭 랭킹(Elo). 브라우저가 만든 플레이어 ID로 기록을 쌓고 JSON 파일에 저장한다.
const fs = require('fs');
const path = require('path');

const START_RATING = 1000;
const K = 32;
const ID_PATTERN = /^[A-Za-z0-9]{16,40}$/;

function expected(a, b) { return 1 / (1 + 10 ** ((b - a) / 400)); }

// score: 1 이김, 0.5 무승부, 0 짐
function eloDelta(rating, opponent, score) { return Math.round(K * (score - expected(rating, opponent))); }

function createStore(file) {
  let data = { players: {} };
  try { data = JSON.parse(fs.readFileSync(file, 'utf8')); if (!data.players) data.players = {}; } catch {}
  let timer = null;

  const save = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file + '.tmp', JSON.stringify(data));
        fs.renameSync(file + '.tmp', file);
      } catch (error) { console.error('ratings save failed', error.message); }
    }, 200);
  };

  const player = (id, name) => {
    if (!data.players[id]) data.players[id] = { name: name || '플레이어', rating: START_RATING, games: 0, wins: 0, losses: 0, draws: 0 };
    if (name) data.players[id].name = name;
    return data.players[id];
  };

  // winner: 'a' | 'b' | 'draw'. 결과로 두 사람의 레이팅 변화를 돌려준다.
  function recordGame(a, b, winner) {
    const pa = player(a.id, a.name), pb = player(b.id, b.name);
    const scoreA = winner === 'a' ? 1 : winner === 'draw' ? 0.5 : 0;
    const da = eloDelta(pa.rating, pb.rating, scoreA), db = eloDelta(pb.rating, pa.rating, 1 - scoreA);
    const change = (p, delta, score) => {
      const before = p.rating;
      p.rating += delta; p.games += 1; p.updatedAt = Date.now();
      if (score === 1) p.wins += 1; else if (score === 0) p.losses += 1; else p.draws += 1;
      return { before, after: p.rating, delta };
    };
    const result = { a: change(pa, da, scoreA), b: change(pb, db, 1 - scoreA) };
    save();
    return result;
  }

  function ranked() {
    return Object.entries(data.players)
      .filter(([, p]) => p.games > 0)
      .sort((x, y) => y[1].rating - x[1].rating || y[1].wins - x[1].wins || y[1].games - x[1].games);
  }

  function leaderboard(limit = 20) {
    return ranked().slice(0, limit).map(([, p], i) => ({ rank: i + 1, name: p.name, rating: p.rating, games: p.games, wins: p.wins, losses: p.losses, draws: p.draws }));
  }

  function stats(id) {
    if (!ID_PATTERN.test(String(id || ''))) return null;
    const list = ranked(), index = list.findIndex(([pid]) => pid === id);
    const p = data.players[id];
    if (!p) return { rank: null, total: list.length, rating: START_RATING, games: 0, wins: 0, losses: 0, draws: 0 };
    return { rank: index >= 0 ? index + 1 : null, total: list.length, name: p.name, rating: p.rating, games: p.games, wins: p.wins, losses: p.losses, draws: p.draws };
  }

  return { recordGame, leaderboard, stats, flush: () => { clearTimeout(timer); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); } };
}

module.exports = { createStore, eloDelta, isPlayerId: id => ID_PATTERN.test(String(id || '')), START_RATING };
