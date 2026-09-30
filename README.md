# 체스 UNO

카드를 뽑고, 카드에 적힌 효과대로 체스를 두는 2인 온라인 대전 웹게임.

- 운영: https://chess.inno505.duckdns.org
- 규칙·카드 디버그: https://chess.inno505.duckdns.org/debug.html

## 구성

| 파일 | 역할 |
| --- | --- |
| `chess-rules.js` | 체스 규칙 엔진 (체크·캐슬링·앙파상·승격, 거리 두 배, 더블 액션 판정) |
| `game.js` / `game.html` | 카드 덱·효과·보드 UI |
| `multiplayer-v3.js` | 닉네임, 빠른 매칭, 공개 방 목록, 방 코드, 관전 |
| `server.js` | Express + Socket.IO 방 서버 |
| `debug.html` / `debug.js` | 브라우저 규칙 테스트, 카드 골라 쓰기(`/debug-play.html?card=<id>`) |
| `test/` | `node --test` 규칙 테스트 |
| `legacy/` | 초기 단일 파일 프로토타입 (배포 안 함) |

## 실행

```bash
npm install
npm start          # http://localhost:3000
npm test
```

## 배포

Proxmox Docker LXC에서 `compose.test.yaml`(포트 3211)로 먼저 확인한 뒤 `compose.yaml`(포트 3210, Nginx Proxy Manager 뒤)에 반영한다.
정적 파일은 `?v=` 쿼리로 캐시를 끊으니 JS를 고치면 `game.html`/`debug.html`의 버전 값도 올린다. 새 JS 파일을 추가하면 `Dockerfile`의 `COPY` 목록에도 넣는다.
