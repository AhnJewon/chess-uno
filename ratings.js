// 빠른 매칭 랭킹(Elo). 브라우저가 만든 플레이어 ID로 기록을 쌓고 JSON 파일에 저장한다.
const fs = require('fs');
const path = require('path');

const START_RATING = 1000;
const K = 32;
const ID_PATTERN = /^[A-Za-z0-9]{16,40}$/;

function expected(a, b) { return 1 / (1 + 10 ** ((b - a) / 400)); }

// score: 1 이김, 0.5 무승부, 0 짐
function eloDelta(rating, opponent, score) { return Math.round(K * (score - expected(rating, opponent))); }

// 시즌은 한국 시간 기준 달("2026-09"). 매달 1일 0시에 새 시즌이 시작된다.
function seasonOf(time) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit' }).formatToParts(time).map(p => [p.type, p.value]));
  return `${parts.year}-${parts.month}`;
}
const seasonLabel = season => { const [y, m] = season.split('-'); return `${y}년 ${Number(m)}월 시즌`; };

function createStore(file, options = {}) {
  const now = options.now || Date.now;
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

  // 달이 바뀌었으면 지난 시즌 상위 10명을 보관하고 모두 1000점으로 새로 시작한다.
  function rollover() {
    const current = seasonOf(now());
    if (data.season === current) return;
    if (data.season && Object.keys(data.players).length) {
      data.history = data.history || {};
      data.history[data.season] = ranked().slice(0, 10).map(([, p], i) => ({ rank: i + 1, name: p.name, rating: p.rating, wins: p.wins, losses: p.losses, draws: p.draws }));
      data.players = {};
    }
    data.season = current;
    save();
  }

  function seasonInfo() {
    rollover();
    const past = Object.keys(data.history || {}).sort();
    const last = past[past.length - 1];
    return { season: data.season, label: seasonLabel(data.season), last: last ? { season: last, label: seasonLabel(last), top: data.history[last].slice(0, 3) } : null };
  }

  // winner: 'a' | 'b' | 'draw'. 결과로 두 사람의 레이팅 변화를 돌려준다.
  function recordGame(a, b, winner) {
    rollover();
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
    rollover();
    return ranked().slice(0, limit).map(([, p], i) => ({ rank: i + 1, name: p.name, rating: p.rating, games: p.games, wins: p.wins, losses: p.losses, draws: p.draws }));
  }

  function stats(id) {
    rollover();
    if (!ID_PATTERN.test(String(id || ''))) return null;
    const list = ranked(), index = list.findIndex(([pid]) => pid === id);
    const p = data.players[id];
    if (!p) return { rank: null, total: list.length, rating: START_RATING, games: 0, wins: 0, losses: 0, draws: 0 };
    return { rank: index >= 0 ? index + 1 : null, total: list.length, name: p.name, rating: p.rating, games: p.games, wins: p.wins, losses: p.losses, draws: p.draws };
  }

  return { recordGame, leaderboard, stats, seasonInfo, flush: () => { clearTimeout(timer); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(data)); } };
}

module.exports = { createStore, seasonOf, eloDelta, isPlayerId: id => ID_PATTERN.test(String(id || '')), START_RATING };
