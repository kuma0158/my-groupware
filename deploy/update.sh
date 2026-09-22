#!/usr/bin/env bash
# 更新用。groupware ユーザーで実行後、管理者権限でサービスを再起動する:
#   sudo -u groupware /opt/groupware/app/deploy/update.sh
#   sudo systemctl restart groupware-backend groupware-frontend
set -euo pipefail
APP="${APP:-/opt/groupware/app}"
DB="${DB:-/var/lib/groupware/app.db}"

sqlite3 "$DB" ".backup '$(dirname "$DB")/before-update-$(date +%F-%H%M).db'"
cd "$APP"
git pull
"$APP/backend/.venv/bin/pip" install -r backend/requirements.txt
cd frontend
npm ci
BACKEND_URL="${BACKEND_URL:-http://127.0.0.1:8000}" npm run build
echo "完了。sudo systemctl restart groupware-backend groupware-frontend を実行してください"
