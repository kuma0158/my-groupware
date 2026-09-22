# CoreDesk: Windows + Cloudflare Tunnel

公開 URL: `https://coredesk.shinobuabe.com`

通信経路は Cloudflare Tunnel → `http://127.0.0.1:3000` (Next.js)
→ `http://127.0.0.1:8000` (FastAPI) → 既存の SQLite です。
ブラウザは同一オリジンの `/api/*` を呼び、`next.config.mjs` の rewrites が
転送します。Server Components は `server-api.ts` で Cookie を転送します。
`/backend` への変更、VPS、Caddy、Nginx、ルーターのポート開放は不要です。

## 1. 初回準備

プロジェクトルートで PowerShell を開きます。

```powershell
python -m venv backend/.venv
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.txt
Push-Location frontend
npm.cmd ci
Pop-Location
```

既存の `backend/.env` と DB を引き続き使用します。`.env` がない場合だけ
`backend/.env.example` をコピーしてください。`SECRET_KEY` は32文字以上の
ランダムな値が必要です。生成する場合は次の出力をローカルの `.env` に記入します。
既存の十分に強い鍵は変更不要です。鍵を変更すると既存のログインは無効になります。

```powershell
backend/.venv/Scripts/python.exe -c "import secrets; print(secrets.token_urlsafe(48))"
```

起動スクリプトは必ず `backend/` を作業ディレクトリとするため、既定の
`sqlite:///./app.db` は `backend/app.db` を指します。独自の `DATABASE_URL` は
そのまま使用します。既存データの削除や初期化はしません。通常どおり起動時の
既存スキーマ移行処理は実行されます。

## 2. 本番ビルドと起動

まずプロジェクトルートでビルドします。

```powershell
./deploy/windows/coredesk.cmd Build
```

次に PowerShell を2つ開き、それぞれプロジェクトルートで実行します。

```powershell
# ターミナル1
./deploy/windows/coredesk.cmd Backend
```

```powershell
# ターミナル2
./deploy/windows/coredesk.cmd Frontend
```

停止は各ターミナルで Ctrl+C。PC再起動後は両方を再実行します。
`.cmd` は専用 PowerShell プロセス内だけでスクリプト実行を許可します。
Windows 全体の実行ポリシーは変更しません。
公開用のビルド先は `.next-tunnel/` で、開発用の `.next/` と分けています。
このスクリプトは Windows サービスを登録しません。PCのスリープ中・停止中は
公開できません。cloudflared のサービス化だけではアプリ本体は自動起動しません。

起動時に設定する値:

- Next.js: `BACKEND_URL=http://127.0.0.1:8000`。ビルド時と起動時を揃えます。
- Next.js: `PUBLIC_ORIGIN=https://coredesk.shinobuabe.com`。未認証時のリダイレクトが
  内部の localhost を指さないよう、公開URLを指定します。
- FastAPI: `COOKIE_SECURE=true`、`FRONTEND_ORIGIN=https://coredesk.shinobuabe.com`。
- 新規登録: `ALLOW_REGISTRATION=false`。既存アカウントでログインできます。
- 招待するメンバーの登録中だけ `Backend -AllowRegistration` で起動できます。
  登録後は通常の `Backend` で起動し直してください。
- 最初の1人がまだ存在しない場合は、既存仕様により登録停止中でも登録可能です。
  Cloudflare Access のアクセス制限を設定してから初回登録してください。
- 両サーバーは `127.0.0.1` のみで待ち受け、FastAPI は `--reload` を使いません。
- FastAPI の転送ヘッダーは、同じPCの Next.js (`127.0.0.1`) からのみ信頼します。

`.env` 自体は上書きしません。これらは起動したプロセスの環境変数として設定し、
終了後は呼び出し元の環境を戻します。3000/8000 が使用中なら既存プロセスを確認して
停止してください。公開用では別ポートへ自動変更しません。

ローカル疎通確認:

```powershell
Invoke-RestMethod http://127.0.0.1:8000/api/health
Invoke-RestMethod http://127.0.0.1:3000/api/health
```

両方で `status: ok` を確認します。ログイン確認は公開 HTTPS URL で行います。
公開用の Secure Cookie は通常の HTTP 接続では送信されません。
ローカル開発は従来の `npm run dev` と `uvicorn app.main:app --reload` を使用します。

## 3. Cloudflare 側の設定

Cloudflare の管理画面で既存 Tunnel を確認し、なければ作成します。
Networking → Tunnels（画面によっては Zero Trust の Networks → Tunnels）から
Windows 用のコネクター導入手順を開いてください。

- Tunnel 名: `coredesk-tunnel`
- Published application のホスト名: `coredesk.shinobuabe.com`
- Service: **HTTP**、`127.0.0.1:3000`
- Path: 空欄（画面、API、静的ファイルをすべて同じ接続先へ）
- HTTP Host Header: 上書きせず、公開ホスト名を維持

Windows の cloudflared をインストールします。

```powershell
winget install --id Cloudflare.cloudflared -e
```

管理者の端末で、管理画面に表示される Windows サービス登録コマンドを実行します。

```text
cloudflared.exe service install <管理画面に表示されたTunnel Token>
```

Token はこの文書・ソースコード・Git・チャットへ記載しないでください。
既に cloudflared サービスがある場合は、その用途を確認してから接続設定を行い、
別用途のサービスを上書きしないでください。

管理画面で Tunnel が Healthy になることを確認します。
DNS は `coredesk` の CNAME が対象 Tunnel の `<UUID>.cfargotunnel.com` を指す
Proxied レコードになっていることを確認します。画面で自動作成済みなら追加不要です。
競合するレコードを確認し、既存の apex、`www`、他のサブドメインは変更しません。

試験公開では `coredesk.shinobuabe.com` 全体に Cloudflare Access の
Self-hosted application を設定し、許可したメールアドレス等だけにアクセスを
許可します。Access のログイン後、CoreDesk 自身のログインも必要です。
このホストの認証付き画面や `/api/*` に Cache Everything を適用しないでください。

## 4. 公開後の確認

- HTTPS URL からログイン画面が表示され、CSS・JavaScript が読み込まれる。
- `/api/health` が成功する（Access 利用時は先に Access にログイン）。
- 既存アカウントでログインし、画面遷移・再読み込みでもログインが維持される。
- 予定、ToDo、お知らせ、伝言、設定が表示される。
- ログアウト後は `/dashboard` にアクセスするとログインへ戻る。
- 登録停止中に2人目以降の新規登録が403になる。

502 はまず2つのローカル health URL と起動ログを確認します。
APIだけ失敗する場合は FastAPI と `BACKEND_URL` を確認し、ビルドをやり直します。
FastAPI の起動対象は **`app.main:app`** です。`main:app` ではありません。

## ローカルでの自動検証

開発用依存パッケージを入れ、次のコマンドを実行できます。
専用ポート13000/18000・一時DB・`.next-tunnel-smoke/` の本番ビルドを使って、
公開ホスト名の転送、Cookie、認証付き画面、登録制限、ログアウトを検証します。
起動したテスト用プロセスは終了時に停止します。既存DBは使用しません。

```powershell
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements-dev.txt
backend/.venv/Scripts/python.exe deploy/windows/smoke_test.py
```

実際の Cloudflare の DNS・Access・外部接続は別途「公開後の確認」が必要です。

## 参照

- [Cloudflare Tunnel 公式手順](https://developers.cloudflare.com/tunnel/get-started/)
- [Next.js 15 rewrites](https://nextjs.org/docs/15/app/api-reference/config/next-config-js/rewrites)
- [Next.js CLI](https://nextjs.org/docs/app/api-reference/cli/next)
