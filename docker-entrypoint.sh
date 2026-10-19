#!/bin/sh
# data 폴더 권한을 맞춘 뒤 PUID/PGID 사용자로 서버를 실행한다.
# (시놀로지처럼 바인드 마운트 폴더 주인이 제각각인 환경 대비)
set -e

PUID="${PUID:-1000}"
PGID="${PGID:-1000}"
DATA_DIR="${DATA_DIR:-/data}"

if [ "$(id -u)" = "0" ]; then
  mkdir -p "$DATA_DIR/uploads"
  chown -R "$PUID:$PGID" "$DATA_DIR" || echo "경고: $DATA_DIR 주인을 $PUID:$PGID 로 바꾸지 못했어요."
  if [ "$PUID" = "0" ]; then
    exec "$@"
  fi
  exec su-exec "$PUID:$PGID" "$@"
fi

exec "$@"
