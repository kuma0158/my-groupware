# VPS デプロイ手順書

社内グループウェアを、VPS 1 台に独自ドメイン + HTTPS で公開するための手順書です。
作業を上から順に進め、各節の「確認」で動作を確かめてください。

設定ファイルの実物は、リポジトリの `deploy/` にあります(systemd の 2 ファイル、`Caddyfile`、`.env` の見本、`backup.sh`、`update.sh`)。この手順書の設定例と同じ内容なので、コピーして使えます。

- 対象 OS: Ubuntu 24.04 LTS(22.04 でも同様)
- 想定構成: Caddy(HTTPS)→ Next.js → FastAPI → SQLite、すべて同一サーバー
- この手順は、コードの実装(`backend/app/config.py`、`frontend/next.config.mjs` など)から組み立てたものです。実際の VPS での通し確認はまだしていません。初回の作業で食い違いがあれば、この文書を直してください。

---

## 0. 全体像

```
インターネット
   │ 80 / 443
   ▼
Caddy(HTTPS の終端・証明書の自動更新)
   │ 127.0.0.1:3000
   ▼
Next.js(画面。/api/* を FastAPI へ転送)
   │ 127.0.0.1:8000
   ▼
FastAPI(uvicorn、ワーカー 1 つ)
   │
   ▼
SQLite(/var/lib/groupware/app.db)
```

- 外に出すのは 80 と 443 だけです。Next.js と FastAPI は `127.0.0.1` で待ち受けます。
- ブラウザは `/api/*` を同じドメインで呼び、Next.js が FastAPI へ転送します。CORS の設定は要りません。
- uvicorn の**ワーカーは 1 つ**にします。SQLite の同時書き込みと、起動時の DB 移行が 1 プロセス前提のためです。

## 1. 事前に決めておくもの・用意するもの

- [ ] VPS(メモリ 2GB 以上を推奨。1GB では `next build` が失敗することがある)
- [ ] ドメイン名(以降 `example.com` と書く。実際の名前に置き換える)
- [ ] ドメインの A レコードを VPS の IP アドレスに向ける(反映まで数分〜数時間)
- [ ] VPS へ SSH で入れること(公開鍵認証を推奨)
- [ ] ソースの渡し方: GitHub 経由(`git clone`)か、`rsync` / `scp`
  - 2026-09-21 時点では GitHub へ未公開。公開する場合は `HANDOVER.md` の「0-3. GitHub」を参照
  - `e2e/` は git 管理外のため、clone しても入らない(本番には不要)

## 2. サーバーの初期設定

### 2-1. パッケージの導入

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install python3-venv python3-pip git ufw sqlite3 curl \
  debian-keyring debian-archive-keyring apt-transport-https gpg
```

Node.js 22(NodeSource):

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt -y install nodejs
node -v && npm -v && python3 --version
```

Caddy(公式の手順は https://caddyserver.com/docs/install の Debian/Ubuntu の項):

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt -y install caddy
```

### 2-2. ファイアウォール

SSH を閉じないよう、`enable` の前に必ず SSH を許可します。

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80
sudo ufw allow 443
sudo ufw enable
sudo ufw status
```

### 2-3. 実行用ユーザーと置き場所

```bash
sudo useradd -r -m -d /opt/groupware -s /bin/bash groupware
sudo mkdir -p /var/lib/groupware
sudo chown groupware: /var/lib/groupware
sudo chmod 700 /var/lib/groupware
```

DB は `/var/lib/groupware/` に置きます。ソースのフォルダの外に置くことで、`git pull` などで消える事故を防ぎます。

**確認:** `node -v` が v22 系、`python3 --version` が 3.11 以上であること。

## 3. ソースの配置

```bash
sudo -u groupware -i
cd /opt/groupware
git clone <リポジトリURL> app
cd app
```

GitHub を使わない場合は、手元の PC から送ります(`node_modules` や `.venv`、`.env`、`*.db` は送らない)。

```bash
rsync -av --exclude node_modules --exclude .venv --exclude .next --exclude '.env' \
  --exclude '*.db*' --exclude e2e --exclude __pycache__ \
  ./backend ./frontend user@example.com:/opt/groupware/app/
```

## 4. バックエンドの設定

```bash
cd /opt/groupware/app/backend
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
cp .env.example .env
chmod 600 .env
```

- 本番は `requirements.txt` を使います(`requirements-dev.txt` はテスト用)。
- 署名鍵を作ります。

```bash
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
```

`backend/.env` を次のように書き換えます。

```
DATABASE_URL=sqlite:////var/lib/groupware/app.db
SECRET_KEY=<上で作った文字列>
ACCESS_TOKEN_EXPIRE_MINUTES=1440
COOKIE_SECURE=true
FRONTEND_ORIGIN=https://example.com
ALLOW_REGISTRATION=true
```

見本は `deploy/backend.env.production.example` です。

| 項目 | 注意 |
|---|---|
| `DATABASE_URL` | `sqlite:////`(スラッシュ 4 つ)が絶対パスの書き方。スラッシュ 3 つだと相対パスになり、置き場所が変わる |
| `SECRET_KEY` | 必ず変更する。`COOKIE_SECURE=true` のときに初期値(`change-me`)や 32 文字未満だと、**バックエンドは起動を拒否する**。初期値の `change-me` のままだと、他人がログイン用のトークンを偽造できる。また、変えるとログイン中の全員がログアウトされる |
| `COOKIE_SECURE` | `true`。HTTPS でのみクッキーを送る。HTTP で開くとログインできなくなる |
| `ALLOW_REGISTRATION` | `false` にすると、**最初の 1 人以外の新規登録を止める**(403)。全員の登録が済んだら `false` にして、バックエンドを再起動する(8-2 参照) |
| `FRONTEND_ORIGIN` | 公開する URL(`https://example.com`)。末尾のスラッシュは付けない |

**確認(まだ常駐化していない状態で試す):**

```bash
.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
# 別の端末から: curl -s http://127.0.0.1:8000/docs | head -3
# 確認できたら Ctrl+C で止める
ls -l /var/lib/groupware/app.db      # 起動で DB が作られていること
```

## 5. フロントエンドのビルド

```bash
cd /opt/groupware/app/frontend
npm ci
BACKEND_URL=http://127.0.0.1:8000 npm run build
```

`BACKEND_URL` は**ビルド時に確定**します(`next.config.mjs` の rewrites)。値を変えたら、ビルドし直してください。

**確認:** `npm run build` がエラーなく終わり、`.next/` ができること。

ビルド中にメモリ不足で落ちる場合は、スワップを足します。

```bash
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
sudo mkswap /swapfile && sudo swapon /swapfile
```

## 6. systemd で常駐させる

`exit` で `groupware` ユーザーから戻り、管理者権限で作成します。

`/etc/systemd/system/groupware-backend.service`

```ini
[Unit]
Description=Groupware backend (FastAPI)
After=network.target

[Service]
User=groupware
WorkingDirectory=/opt/groupware/app/backend
ExecStart=/opt/groupware/app/backend/.venv/bin/uvicorn app.main:app --host 127.0.0.1 --port 8000
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

`/etc/systemd/system/groupware-frontend.service`

```ini
[Unit]
Description=Groupware frontend (Next.js)
After=network.target groupware-backend.service

[Service]
User=groupware
WorkingDirectory=/opt/groupware/app/frontend
Environment=NODE_ENV=production
Environment=BACKEND_URL=http://127.0.0.1:8000
ExecStart=/usr/bin/npm run start -- -p 3000 -H 127.0.0.1
Restart=always
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now groupware-backend groupware-frontend
sudo systemctl status groupware-backend groupware-frontend --no-pager
curl -sI http://127.0.0.1:3000/login | head -1     # HTTP/1.1 200 OK
```

## 7. Caddy で HTTPS 化

`/etc/caddy/Caddyfile` を次の内容にします。

```
example.com {
    reverse_proxy 127.0.0.1:3000
}
```

```bash
sudo systemctl reload caddy
sudo journalctl -u caddy --no-pager -n 30      # 証明書の取得に成功したか
```

**確認:** ブラウザで `https://example.com` を開き、ログイン画面が出ること。

証明書の取得に失敗するときは、ドメインの A レコード、ファイアウォールの 80/443、他のプログラムが 80/443 を使っていないか、を確認します。

## 8. 公開直後にやること(重要)

### 8-1. 管理者アカウントを先に作る

**最初に新規登録した人がパワーユーザー(管理者)になります。** 公開した直後に、自分で新規登録してください。他人に先に登録されると、その人が管理者になります。

### 8-2. 新規登録を止める

新規登録の画面と API(`POST /api/auth/register`)は、初期状態では**誰にでも開いています**。社内専用なら、全員の登録が済んだあとに止めます。

1. `backend/.env` の `ALLOW_REGISTRATION` を `false` にする
2. バックエンドを再起動する: `sudo systemctl restart groupware-backend`

- 止めたあとは、登録の API が 403(「新規登録は停止しています。管理者に依頼してください」)を返します。ログインには影響しません。
- ユーザーを追加するときは、いったん `true` に戻して再起動し、登録が済んだらまた `false` にします。
- 補足: 何もユーザーがいない状態(初回)だけは、`false` でも最初の 1 人を登録できます。
- IP 制限や VPN で、アクセスできる人を絞る方法も併用できます。

### 8-3. 動作確認

- [ ] 新規登録 → ダッシュボードが開く
- [ ] ログアウト → ログイン
- [ ] 予定・ToDo・お知らせ・伝言を 1 件ずつ作る
- [ ] 設定 → ユーザー管理が開く(パワーユーザーだけ)
- [ ] ブラウザを再読み込みしてもログインが保たれる(クッキーが有効)

## 9. バックアップ

SQLite は 1 ファイルです。稼働中でも安全にコピーできる `.backup` を使います。`deploy/backup.sh` がその処理です(`chmod +x` 済み)。cron には次の 1 行でも呼べます。

```
0 3 * * * groupware /opt/groupware/app/deploy/backup.sh
```

以下は、スクリプトを使わずに直接書く場合の例です。

`/etc/cron.d/groupware-backup`

```
0 3 * * * groupware sqlite3 /var/lib/groupware/app.db ".backup '/var/lib/groupware/backup-$(date +\%F).db'" && find /var/lib/groupware -name 'backup-*.db' -mtime +14 -delete
```

- 毎日 3 時に取り、14 日より古いものを消します。
- **同じ VPS の中だけでは、VPS が壊れたときに失われます。** 別のストレージや手元の PC にも定期的にコピーしてください。
- 復元するときは、バックエンドを止め、`app.db` を差し替えてから起動します。

```bash
sudo systemctl stop groupware-backend
sudo -u groupware cp /var/lib/groupware/backup-YYYY-MM-DD.db /var/lib/groupware/app.db
sudo systemctl start groupware-backend
```

## 10. 更新のしかた

`deploy/update.sh` を使うと、下の 1〜2 をまとめて実行できます(バックアップ → `git pull` → 依存の更新 → ビルド)。そのあと、3 の再起動だけ管理者権限で行います。

```bash
sudo -u groupware /opt/groupware/app/deploy/update.sh
sudo systemctl restart groupware-backend groupware-frontend
```

手で行う場合は次のとおりです。

```bash
# 1. 更新前にバックアップ
sudo -u groupware sqlite3 /var/lib/groupware/app.db ".backup '/var/lib/groupware/before-update-$(date +%F-%H%M).db'"

# 2. ソースの更新とビルド
sudo -u groupware -i
cd /opt/groupware/app && git pull
backend/.venv/bin/pip install -r backend/requirements.txt
(cd frontend && npm ci && BACKEND_URL=http://127.0.0.1:8000 npm run build)
exit

# 3. 再起動
sudo systemctl restart groupware-backend groupware-frontend
```

- **バックエンドは必ず再起動します。** コードを変えても再起動しないと、古いコードのまま動きます。
- DB の項目追加は、起動時に自動で移行されます(何度起動しても安全)。ただし、更新前のバックアップは取っておきます。

## 11. 運用の確認コマンド

```bash
sudo systemctl status groupware-backend groupware-frontend caddy --no-pager
sudo journalctl -u groupware-backend -f          # バックエンドのログ(Ctrl+C で終了)
sudo journalctl -u groupware-frontend -f         # フロントエンドのログ
sudo journalctl -u caddy -f                      # Caddy のログ
df -h /var/lib/groupware                         # 空き容量
```

## 12. うまくいかないとき

| 症状 | 原因の候補と対処 |
|---|---|
| `https://example.com` に繋がらない | A レコードが未反映、ファイアウォールが 80/443 を閉じている、Caddy が起動していない(`systemctl status caddy`) |
| ログインしても画面がログインに戻る | HTTP で開いている(`COOKIE_SECURE=true` のため)。必ず HTTPS で開く |
| 画面は出るが「Failed to fetch」や API エラー | バックエンドが止まっている、または `BACKEND_URL` を変えたのにビルドし直していない |
| API が 500 を返す | `journalctl -u groupware-backend` を見る。`/var/lib/groupware` の所有者が `groupware` か、`DATABASE_URL` の書き方(スラッシュ 4 つ)を確認 |
| API が 405 を返す | バックエンドが古いコードのまま。再起動する |
| `npm run build` が途中で落ちる | メモリ不足。スワップを足す(5 節)。または手元でビルドして `.next` を送る |
| 全員がログアウトされた | `SECRET_KEY` を変更した。正常な動作 |
| バックエンドが起動しない(`SECRET_KEY が初期値または短すぎます`) | `COOKIE_SECURE=true` のとき、`SECRET_KEY` を 32 文字以上の推測されない値にする |
| 登録済みのはずなのにパワーユーザーが居ない | 起動時に、居なければ最古の有効ユーザーが昇格する。バックエンドを再起動する |

## 13. 公開前の最終チェックリスト

- [ ] `SECRET_KEY` を推測されない値にした(`change-me` ではない)
- [ ] `COOKIE_SECURE=true` にし、HTTPS で開けている
- [ ] `backend/.env` の権限が `600` で、Git に入っていない
- [ ] 外から `:3000` と `:8000` に直接つながらない(`ufw status` で 80/443/SSH のみ)
- [ ] 自分でパワーユーザーを作った(8-1)
- [ ] 全員の登録が済んだら `ALLOW_REGISTRATION=false` にして再起動した(8-2)
- [ ] バックアップの cron を入れ、復元も 1 回試した(9 節)
- [ ] SSH はパスワード認証を切り、公開鍵だけにした(推奨)
- [ ] OS の自動セキュリティ更新を入れた(`sudo apt -y install unattended-upgrades`)
- [ ] 開発用のバックアップ・動作確認用アカウント(`Check12345` など)を持ち込んでいない

## 14. 将来の見直し候補

- 利用者・同時アクセスが増えたら、PostgreSQL などへの移行と Alembic の導入(今は起動時の自動移行)
- 新規登録の招待制・承認制(今は `ALLOW_REGISTRATION` で止める・開けるの 2 択)
- 他ユーザーの画面へバッジを即時に届ける仕組み(SSE / WebSocket)
- Docker(docker compose)化。環境の再現と更新が楽になる
- 監視(死活監視・ディスク容量の通知)
