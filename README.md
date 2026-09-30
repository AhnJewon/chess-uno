# 체스 UNO

카드를 뽑고, 카드에 적힌 효과대로 체스를 두는 2인 온라인 대전 웹게임.

- 운영: https://chess.inno505.duckdns.org
- 규칙·카드 디버그: https://chess.inno505.duckdns.org/debug.html

## 구성

| 파일 | 역할 |
| --- | --- |
| `chess-rules.js` | 체스 규칙 엔진 (체크·캐슬링·앙파상·승격, 거리 두 배, 더블 액션 판정) |
| `cards.js` | 카드 목록과 기본 확률, 방 만들기 프리셋, 방장 확률 검증(normalizeWeights), 체크 중 한 수 이동으로 바뀌는 카드 |
| `game.js` / `game.html` | 카드 효과·보드 UI, 플레이 방법 팝업(첫 방문 시 자동, 카드 목록은 cards.js에서 생성) |
| `multiplayer-v3.js` | 닉네임, 빠른 매칭, 공개 방 목록, 방 코드, 관전, 채팅, 새 게임 제안·수락, 항복 |
| `server.js` | Express + Socket.IO 방 서버 (방별 채팅 60개 보관, 진행 중인 판 되돌리기 거부) |
| `ratings.js` | 빠른 매칭 랭킹(Elo, K=32, 1000점 시작). 매달 1일 0시(KST)에 시즌 초기화, 지난 시즌 상위 10명 보관. 도커 볼륨의 `/app/data/ratings.json`에 저장 |
| `debug.html` / `debug.js` | 브라우저 규칙 테스트, 카드 골라 쓰기(`/debug-play.html?card=<id>`) |
| `test/` | `node --test` 규칙·레이팅 테스트 |
| `legacy/` | 초기 단일 파일 프로토타입 (배포 안 함) |

## 실행

```bash
npm install
npm start          # http://localhost:3000
npm test
```

## 배포

```bash
./deploy.sh test   # 스테이징 http://192.168.50.104:3211
./deploy.sh prod   # 운영 (기존 운영본은 /opt/stacks/chess-uno-backup-<시각> 으로 백업)
```

Proxmox 호스트(192.168.50.188)에 SSH 키로 접속해 LXC 100 안의 docker compose 스택을 다시 빌드한다. compose 파일도 이 저장소 것이 올라간다. 랭킹 데이터는 운영(`chess-uno_chess-uno-data`)과 스테이징(`chess-uno-test_chess-uno-test-data`) 볼륨이 따로라 재배포해도 남는다. 스테이징에서 먼저 확인한 뒤 운영에 반영한다.

카드 확률은 `cards.js`의 `weight`만 고치면 게임 화면과 디버그 페이지의 %가 같이 바뀐다.
정적 파일은 `?v=` 쿼리로 캐시를 끊으니 JS를 고치면 `game.html`/`debug.html`의 버전 값도 올린다. 새 JS 파일을 추가하면 `Dockerfile`의 `COPY` 목록에도 넣는다.
