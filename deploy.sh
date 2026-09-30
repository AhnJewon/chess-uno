#!/usr/bin/env bash
# 사용법: ./deploy.sh test   → 스테이징(3211)
#         ./deploy.sh prod   → 운영(3210). 기존 운영본은 백업 후 교체
# Proxmox 호스트에 SSH 키로 접속해 LXC 100 안의 docker compose 스택을 다시 빌드한다.
set -euo pipefail
cd "$(dirname "$0")"

HOST=root@192.168.50.188
CT=100
case "${1:-}" in
  test) DIR=/opt/stacks/chess-uno-test; COMPOSE="-f compose.test.yaml"; PORT=3211 ;;
  prod) DIR=/opt/stacks/chess-uno;      COMPOSE="";                     PORT=3210 ;;
  *) echo "usage: $0 test|prod" >&2; exit 1 ;;
esac

# Dockerfile이 COPY하는 파일 + 빌드에 필요한 파일. compose 파일은 서버 것을 그대로 둔다.
FILES="Dockerfile package.json $(sed -n 's/^COPY \(.*\) \.\/$/\1/p' Dockerfile | grep -v '^package.json$')"
for f in $FILES; do [ -f "$f" ] || { echo "missing $f" >&2; exit 1; }; done

STAMP=$(date +%Y%m%d-%H%M%S)
ARCHIVE=/tmp/chess-uno-$STAMP.tgz
tar czf - $FILES | ssh -o BatchMode=yes "$HOST" "cat > $ARCHIVE"

ssh -o BatchMode=yes "$HOST" "set -e
  pct push $CT $ARCHIVE $ARCHIVE && rm -f $ARCHIVE
  pct exec $CT -- sh -lc '
    set -e
    if [ \"$1\" = prod ]; then cp -a $DIR /opt/stacks/chess-uno-backup-$STAMP; fi
    tar xzf $ARCHIVE -C $DIR && rm -f $ARCHIVE
    cd $DIR && docker compose $COMPOSE up -d --build 2>&1 | tail -3
  '"

for i in 1 2 3 4 5 6 7 8 9 10; do
  if curl -fsS "http://192.168.50.104:$PORT/health" >/dev/null 2>&1; then echo "$1 배포 완료: http://192.168.50.104:$PORT"; exit 0; fi
  sleep 2
done
echo "health check 실패 (port $PORT)" >&2; exit 1
