(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ChessCards = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  // weight는 상대값. 화면의 %는 여기서 계산하니 확률은 이 표만 고치면 된다.
  const cards = [
    { id:'move', icon:'♟', name:'한 수 이동', desc:'정식 체스 규칙으로 한 번 움직여요', kind:'move', weight:50 },
    { id:'distance', icon:'↟', name:'이동 거리 두 배', desc:'평소처럼 움직이거나, 폰·나이트·킹은 두 배 거리로도 움직일 수 있어요', kind:'distance', weight:11 },
    { id:'pawnTwice', icon:'♟²', name:'폰 두 번 이동', desc:'같은 폰으로 최대 두 번 연속 이동해요', kind:'pawnTwice', weight:8 },
    { id:'skip', icon:'⊘', name:'내 턴 스킵', desc:'이번 내 차례를 즉시 넘겨요. 체크 중에 뽑으면 패배해요', kind:'skip', weight:5 },
    { id:'ownSwap', icon:'⇆', name:'아군 자리 바꾸기', desc:'킹을 제외한 내 기물 두 개의 위치를 바꿔요', kind:'ownSwap', weight:5 },
    { id:'swap', icon:'⇄', name:'적과 자리 바꾸기', desc:'내 기물 하나와 상대 기물 하나의 위치를 바꿔요', kind:'swap', weight:3 },
    { id:'enemySwap', icon:'⥄', name:'적군 자리 바꾸기', desc:'킹을 제외한 상대 기물 두 개의 위치를 바꿔요', kind:'enemySwap', weight:3 },
    { id:'shuffle', icon:'⤨', name:'대혼란', desc:'킹을 제외한 양쪽 군대의 기물 위치를 섞어요. 내 킹이 안전한 배치가 나올 때까지 다시 섞어요', kind:'shuffle', weight:4 },
    { id:'addPawn', icon:'♟+', name:'폰 추가', desc:'내 군대가 시작한 쪽 4개 줄의 빈 칸에 폰 1개를 추가해요. 상대 진영에는 놓을 수 없고 군대 반전 시 허용 구역도 뒤집혀요', kind:'addPawn', weight:3 },
    { id:'change', icon:'♕', name:'기물 교체', desc:'킹을 제외한 내 기물 하나를 다른 기물로 바꿔요', kind:'change', weight:2 },
    { id:'double', icon:'×2', name:'더블 액션', desc:'정식 이동을 두 번 해요', kind:'double', weight:2 },
    { id:'color', icon:'◐', name:'군대 반전', desc:'양쪽 군대 전체를 맞바꾸고 한 번 더 행동해요', kind:'color', weight:2 },
    { id:'wild', icon:'★', name:'와일드', desc:'원하는 특수 카드 하나를 골라 사용해요', kind:'wild', weight:2 }
  ];

  // 체크 중에 뽑았는데 체크를 못 풀면 패배 대신 한 수 이동이 되는 카드. 스킵은 벌칙이라 여기 없다.
  const checkFallbackKinds = ['change', 'ownSwap', 'pawnTwice', 'addPawn'];

  // weights: 방장이 정한 { 카드id: 가중치 }. 없으면 위 표의 기본값.
  const weightOf = (card, weights) => weights && Number.isInteger(weights[card.id]) ? weights[card.id] : card.weight;
  const totalWeight = weights => cards.reduce((sum, card) => sum + weightOf(card, weights), 0);
  const percent = (card, weights) => { const total = totalWeight(weights); return total ? Math.round(weightOf(card, weights) / total * 1000) / 10 : 0; };
  const percentLabel = (card, weights) => `${percent(card, weights)}%`;
  const defaultWeights = () => Object.fromEntries(cards.map(card => [card.id, card.weight]));

  // 방 만들기 프리셋
  const presets = {
    classic: { label:'기본', weights: defaultWeights() },
    chaos: { label:'혼돈', weights: { move:20, distance:10, pawnTwice:8, skip:4, ownSwap:8, swap:8, enemySwap:8, shuffle:10, addPawn:5, change:5, double:6, color:4, wild:4 } },
    orthodox: { label:'정통에 가까움', weights: { move:80, distance:6, pawnTwice:5, skip:2, ownSwap:2, swap:1, enemySwap:1, shuffle:0, addPawn:1, change:0, double:1, color:0, wild:1 } },
    noSkip: { label:'스킵 없음', weights: { ...defaultWeights(), skip:0 } }
  };

  // 서버와 클라이언트가 같이 쓰는 검증. 0~100 정수만, 모두 0이면 거부. 기본값과 같으면 null(기본 확률).
  function normalizeWeights(input) {
    if (!input || typeof input !== 'object') return null;
    const out = {};
    for (const card of cards) {
      const value = Math.round(Number(input[card.id]));
      out[card.id] = Number.isFinite(value) ? Math.min(100, Math.max(0, value)) : card.weight;
    }
    if (!Object.values(out).some(v => v > 0)) return null;
    return cards.every(card => out[card.id] === card.weight) ? null : out;
  }

  return { cards, checkFallbackKinds, weightOf, totalWeight, percent, percentLabel, defaultWeights, presets, normalizeWeights };
});
