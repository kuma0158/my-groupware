#!/usr/bin/env bash
# SQLite を安全にバックアップし、14 日より古いものを消す。cron から呼ぶ: 0 3 * * * groupware /opt/groupware/app/deploy/backup.sh
set -euo pipefail
DB="${DB:-/var/lib/groupware/app.db}"
DEST="${DEST:-/var/lib/groupware}"
sqlite3 "$DB" ".backup '$DEST/backup-$(date +%F).db'"
find "$DEST" -name 'backup-*.db' -mtime +14 -delete
