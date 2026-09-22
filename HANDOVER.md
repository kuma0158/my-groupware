# 引き継ぎ書

- システムの全体像・起動手順・API 一覧・データモデル・カスタマイズの入口は `README.md` を見ること。
- この文書の前半「0. 現在の状態」は、2026-09-21 時点の**全体のまとめ**。まずここを読めば引き継げる。
- 後半は日付ごとの**変更履歴**（何をなぜ変えたか・決めごと）。細部を調べるときに見る。

---

# 0. 現在の状態（2026-09-21 時点）

## 0-1. システムの概要

社内グループウェア。FastAPI（`backend/`、ポート 8000）＋ Next.js（`frontend/`、ポート 3000）＋ SQLite（`backend/app.db`）。認証は HttpOnly Cookie の JWT。

| 機能 | 画面 | 状態 |
|---|---|---|
| 新規登録・ログイン・ログアウト | `/login` `/register` | 完成。最初の登録者がパワーユーザー |
| ポータル（ウィジェット） | `/dashboard` | 完成。4 列、ドラッグ/長押しで並べ替え、ユーザーごとに保存 |
| スケジュール | `/dashboard/schedule` | 月・週表示、モーダルで追加・編集、自分の予定のドラッグ移動 |
| ToDo | `/dashboard/todos` | カンバン（列は全員共有）、詳細の小窓、他ユーザーへの共有 |
| インフォメーション | `/dashboard/notices` | 投稿・上部固定・既読。自分の投稿は既読扱い |
| 伝言・在席 | `/dashboard/office` | 在席更新、伝言（モーダル）、対応済み |
| 上部ナビ・バッジ | 全画面 | ToDo・お知らせ・伝言の件数。60 秒ごと＋操作直後に更新 |
| 設定 | `/dashboard/settings` | プロフィール、パスワード、カラースキーム 4 種、ユーザー管理（パワーユーザーのみ） |
| AI エージェント雛形 | `agent/` | 本体とは独立。Azure OpenAI 未設定時は固定応答 |

## 0-2. リポジトリ（git）

- 2026-09-21 に `git init`。既定ブランチは `main`。作成者は `shino <shinoabe@gmail.com>`（**このリポジトリだけの設定**＝`--local`）。
- コミット履歴:
  - `9e02d1b` Initial commit
  - `413c884` push対象を削除（`.gitignore` に `e2e` を追加）
  - `c962798` e2e ディレクトリを git の管理から外す
  - この引き継ぎ書の更新（未コミットなら、次にコミットする）
- **git で管理しているもの**: `backend/`（app・tests・requirements*.txt・`.env.example`）、`frontend/`（src・設定・package*.json・`.env.example`）、`agent/`、`.vscode/`、`README.md`、`HANDOVER.md`、`.gitignore`。
- **管理していないもの**（`.gitignore` で除外）:
  - 秘密情報: `.env` / `.env.*`（`.env.example` は管理する）
  - DB とバックアップ: `*.db`、`backend/app.db*`（`app.db.bak-*` を含む）
  - 依存パッケージ・キャッシュ・生成物: `.venv/`、`node_modules/`、`.next/`、`__pycache__/`、`.pytest_cache/`、`*.tsbuildinfo`、`next-env.d.ts`
  - **`e2e/` ディレクトリ全体**（手元には残っている。git からだけ外した）
  - `*.skill`（雛形生成用のスキルパッケージ。システム本体ではない）、`*.md.html`
- 改行コード: Windows の git 設定で、取り出し時に CRLF になる（`git add` で「LF will be replaced by CRLF」の警告が出る）。他 OS の人と共同開発するなら `.gitattributes` で LF に揃えるとよい。**未対応。**

## 0-3. GitHub

- **まだ上げていない（ユーザーの指示で中断）。** リモートは未登録、リポジトリも未作成。
- GitHub CLI（`gh` v2.101.0）は winget で導入済み（`C:\Program Files\GitHub CLI\gh.exe`）。**ログインはまだ。**
- 再開する手順（公開範囲は Public の予定だった）:
  ```bash
  gh auth login --web --git-protocol https     # ブラウザで認証（対話が必要）
  gh repo create my-groupware --public --source=. --remote=origin --push
  ```
- push 前に確認したこと: コミット内に API キー・トークン・秘密鍵は無い。
  ただし `HANDOVER.md` に**動作確認用アカウントのパスワード**（`Check12345`、手元の開発用 DB にだけ存在）が書かれている。Public にするなら消すか伏せるのが無難。

## 0-3b. VPS への公開

- 手順書は `docs/deploy.md`（Ubuntu + Caddy + systemd + SQLite）。設定ファイルの実物は `deploy/`（systemd・Caddyfile・`.env` 見本・`backup.sh`・`update.sh`）。**実際の VPS での通し確認は未実施。**
- **CoreDesk（2026-09-21 に `H:\dev\CoreDesk` へコピーした版）で、VPS 対応のコードを入れた。** 元の `my-groupware` 側には入っていない。
  - `ALLOW_REGISTRATION`（既定 `true`）: `false` で、最初の 1 人以外の新規登録を 403 にする（`config.py`・`routers/auth.py`）。
  - 起動時の確認: `COOKIE_SECURE=true` で `SECRET_KEY` が `change-me` または 32 文字未満なら、バックエンドは起動しない（`main.py`）。
  - `.vscode/tasks.json` の絶対パスを `${workspaceFolder}` に直した。
  - テスト 2 件を追加（`tests/test_settings.py`）。pytest は 83 件成功。
- 公開直後は、自分で先に新規登録してパワーユーザーになり、全員の登録後に `ALLOW_REGISTRATION=false` にして再起動する。

## 0-4. テスト

### Cloudflare Tunnel 対応（2026-09-21、CoreDesk）

- Windows 用の公開起動: `deploy/windows/coredesk.cmd Build` / `Backend` / `Frontend`。
- 詳細: `docs/cloudflare-tunnel-setup.md`。既存の `/api/*` rewrites を維持し、Next.js は127.0.0.1:3000、FastAPI は127.0.0.1:8000で待ち受ける。
- 公開起動では Secure Cookie、公開オリジン、新規登録停止をプロセス環境変数で設定。既存 `.env` と DB は維持する。
- `middleware.ts` は `PUBLIC_ORIGIN` を使い、未認証時に内部の localhost へリダイレクトされる問題を修正。
- 本番ビルドは `.next-tunnel/`。検証は `deploy/windows/smoke_test.py`（専用ポート、一時DB、`.next-tunnel-smoke/`）で実施。
- pytest 83件成功。公開ホスト名でのAPI転送、Secure Cookie、認証付き6画面、登録停止、ログアウト・ログインのローカル統合検証成功。
- 2026-09-21 15:23 JST: ユーザーが Tunnel を設定した後、公開URL `https://coredesk.shinobuabe.com` を Chromium で検証済み。ローカルと公開URLの health、ログイン、認証付き6画面、再読込時の認証維持、ログアウト、未認証APIの401、ログイン画面へのリダイレクトが成功。JavaScriptエラー・静的ファイルのHTTPエラーなし。
- Next.js (127.0.0.1:3000) と FastAPI (127.0.0.1:8000) は公開用スクリプトで稼働中。Cloudflare 管理画面の DNS・Access ポリシー自体は未監査。
- ローカル検証記録: `e2e/test-results/public-tunnel/report.json` と画面PNG。再確認用 `e2e/verify-public-tunnel.cjs` とともに Git 管理外。

### 以前の確認記録

- pytest: 81 件（`backend/tests/`）。`cd backend && .venv\Scripts\python.exe -m pytest -q`
- E2E（Playwright）: 22 件（`e2e/tests/`）。**`e2e/` は git 管理外になったので、clone した人の手元には無い。** 流すときは開発用バックエンド（8000）を止めてから。
- `tsc` はエラーなし（設定の追加時点）。
- 件数は最後に確認した時点のもの。今回（README・.gitignore・git の作業）はコード変更がないため、テストは流していない。

## 0-5. ドキュメント

- `README.md`: 2026-09-21 にシステム全体の説明として書き直した（構成図・機能・起動・環境変数・API 一覧・データモデル・権限・テーマ・カスタマイズの入口・エージェント・運用上の注意・本番公開前のチェック）。
- **README の「E2E テスト」の節は、`e2e/` を git から外したため、clone した人には当てはまらない。** 消すか、「手元にだけある」旨に書き換えるか、判断待ち。
- `README.md.html`（README の HTML 書き出し）は除外対象。古い内容のままの可能性がある。
- `agent/README.md`: エージェントの使い方（英語）。

## 0-6. 残っている課題・未確認（全体のまとめ）

判断が必要なもの:
- README の E2E の節の扱い（上記 0-5）。
- `.vscode/tasks.json` に絶対パス `h:/dev/my-groupware/agent/.venv/...` が書かれている。他の環境では動かない。`${workspaceFolder}` に直すか、`.vscode/` を管理から外すか。
- GitHub への公開の再開と、公開範囲（Public / Private）の最終判断。
- `HANDOVER.md` 内の動作確認用パスワードの扱い（上記 0-3）。

未確認（ブラウザ・実機）:
- スマホ実機（iOS / Android）での長押しドラッグ（ポータル・カンバン・スケジュール）。
- 各カラースキーム（特にダークモード）とポータル 4 列の見た目。
- 伝言のモーダル化、バッジの即時更新、自分のお知らせの既読扱いの画面表示。
- ToDo 共有の画面操作。E2E に共有のテストが無い。
- 他人の予定の読み取り専用表示、バッジの 60 秒ごとの自動更新、モーダルの背景クリックで閉じる動作。

改善案:
- ToDo の操作（完了など）の後に `refreshBadges()` を呼んでいない。
- 他ユーザーの画面へバッジを即時に届けるには SSE / WebSocket が要る。
- 完了列のカードは全件表示。増えたら古いものを畳む仕組みが要る。
- カード新規作成時は件名だけ。担当者・期限は作成後に詳細から。
- 予定の繰り返し登録、参加者の指定は未実装。
- 列の色は並び順で決まる。列ごとに固定するなら `todo_columns` に色の項目が要る。
- 本番化するなら PostgreSQL / MySQL と Alembic の導入を検討。

手元の後片付け候補（どれも git 管理外。消すかは任意）:
- `backend/app.db.bak-20260920-190031`、`backend/app.db.bak-before-kanban-20260921-090329`（移行前の DB バックアップ）。
- 開発用 DB の動作確認用ユーザー（`check-other@example.com` / `check-me@example.com`）と、E2E で溜まったテスト用アカウント。

## 0-7. 運用上の注意（特によく起きること）

- **コードを変えたらバックエンドを再起動する。** 古いコードのまま動いていて、405 や項目不足のエラーになったことが複数回ある。開発中は `uvicorn app.main:app --reload --port 8000`。`--reload` を止めるときは親子両方のプロセスを終了する。
- `app.db` を消す・空にするときは、バックエンドを止めてから（テーブルは起動時に作られる）。既存 DB は起動時に自動で移行される。
- Next.js は 3000 が塞がっていると黙って 3001 で起動する。起動ログの URL を確認する。
- `crud.py` のバッジ件数（`badge_counts()`）と各一覧は同じ条件で数えている。片方だけ直さない。ToDo の見える範囲は `todo_visible()` だけを直す。

---

# 変更履歴

以下は日付ごとの記録。当時の状態で書いているため、上の「0. 現在の状態」と食い違う箇所は、上を正とする。

---

# 引き継ぎ書（2026-09-20 追加分）

`README.md` の内容に対して、この日に追加・変更した分をまとめる。

---

## 1. 追加した機能の一覧

| 機能 | 場所 | 概要 |
|---|---|---|
| カレンダー表示（月・週） | `components/ScheduleCalendar.tsx` | 週は時間軸つき、月は 7 列。切り替えボタンつき |
| 予定のドラッグ移動 | 同上 | 自分の予定だけ。時刻も一緒に変わる |
| 予定の追加・編集モーダル | `components/Modal.tsx`, `components/EventForm.tsx` | 画面中央に開く |
| 時刻の入力 | `components/TimeRange.tsx` | 15 分刻みの選択と所要時間ボタン |
| ポータルのカード配色 | `app/globals.css` | 種類ごとに色、角丸 |
| カードから各画面へ遷移 | `components/WidgetBoard.tsx` | 本文クリックで移動。並べ替えは見出しから |
| 上部ナビゲーション | `components/TopNav.tsx` | 旧 `Sidebar.tsx` を置き換え。アイコン表示 |
| 新着バッジ | `TopNav.tsx` + `/api/dashboard/badges` | ToDo・お知らせ・伝言の件数 |

---

## 2. バックエンドの変更

### 追加した API

- `GET /api/schedule/range?start=&end=`
  期間内の予定を返す。月表示・週表示の両方がこれを使う。期間の上限は 62 日（`MAX_RANGE_DAYS`）。
  既存の `/api/schedule/week` は残してあるが、画面からは使っていない。

- `PATCH /api/schedule/{id}`
  自分の予定を変更する。**ドラッグ移動と編集フォームの両方がこれを使う。**
  送られた項目だけ書き換える。件名・日付・開始/終了時刻・場所・メモ・非公開に対応。
  時刻と場所は空文字を送ると消える。件名は空にできない（422）。
  他人の予定は 403、存在しない予定は 404、終了が開始より前なら 400。

- `GET /api/dashboard/badges`
  `{"todos": n, "notices": n, "messages": n}` を返すだけの軽い API。
  メニューのバッジ用で、画面から繰り返し呼ぶ。
  **既存の `/api/dashboard/summary` を定期取得に使ってはいけない。** あちらは予定・ToDo・メンバー一覧まで全部返すため重い。

### 変更したファイル

- `app/crud.py` — `badge_counts()` を追加。件数を数える条件は各画面の一覧処理（`todos_for` / `notices_for` / `messages_for`）と揃えてある。**片方だけ直すとバッジと一覧がずれるので注意。**
- `app/schemas.py` — `EventPatch`、`BadgeOut` を追加。
- `app/routers/schedule.py` — `range` と `update`（PATCH）を追加。
- `app/routers/dashboard.py` — `badges` を追加。

### テスト

`pytest` は 49 件すべて成功する。追加したのは `test_schedule.py` と `test_dashboard.py`。

```bash
cd backend && .venv\Scripts\python.exe -m pytest -q
```

---

## 3. フロントエンドの変更

### 新しいファイル

- `components/ScheduleCalendar.tsx` — 旧 `ScheduleWeek.tsx` を置き換え。
- `components/EventForm.tsx` — 予定の入力フォーム。`event` を渡すと編集、渡さないと新規。
- `components/TimeRange.tsx` — 開始〜終了の選択。開始を変えると終了が同じ長さだけずれる。
- `components/Modal.tsx` — 中央に開く小窓。標準の `<dialog>` を使っているので Esc と背景クリックで閉じる。
- `components/TopNav.tsx` — 上部メニュー。旧 `Sidebar.tsx` は削除した。
- `lib/time.ts` — `"HH:MM"` と分数の変換。

### 削除したファイル

- `components/Sidebar.tsx`
- `components/ScheduleWeek.tsx`
- `components/EventAddForm.tsx`（`EventForm.tsx` に統合）

### 変更した主なもの

- `lib/api.ts` — `rangeEvents` / `patchEvent` / `badges` を追加。`weekEvents` と `moveEvent` は廃止。
- `lib/widgets.tsx` — `WidgetDef` に `href`（クリック時の遷移先）を追加。
- `lib/useWidgetDrag.ts` — `[data-drag-handle]` の中から押したときだけドラッグを始めるようにした。
- `app/dashboard/schedule/page.tsx` — `/auth/me` も取得して `meId` を渡す（自分の予定かの判定に使う）。

---

## 4. カスタマイズの入口（追加分）

- **メニューの項目とアイコン**: `components/TopNav.tsx` 先頭の `NAV` 配列。1 件足すだけで増える。アイコンは SVG を直接書いている（外部ライブラリなし）。
- **バッジを出す項目**: 同じく `NAV` の `badge` に `"todos" | "notices" | "messages"` を書く。新しい種類を足すときは `BadgeOut` と `badge_counts()` にも追加する。
- **バッジの更新間隔**: `TopNav.tsx` の `POLL_MS`（既定 60 秒）。
- **ポータルのカード色**: `app/globals.css` の `.widget[data-widget-type="..."] { --accent: #xxxxxx; }`。1 種類 1 行。地色と文字色は `--accent` から自動で作る。
- **カードの角丸**: `--widget-radius`（テーマブロック内）。
- **カードの遷移先**: `lib/widgets.tsx` の `href`。省略すると遷移しない（メモ・時計がそれ）。
- **週表示の 1 時間の高さ**: `ScheduleCalendar.tsx` の `HOUR_PX`。
- **ドラッグの時刻の刻み**: 同じく `SNAP_MIN`（既定 15 分）。
- **時刻選択の刻みと所要時間ボタン**: `TimeRange.tsx` の `STEP` と `DURATIONS`。

---

## 5. 引き継ぐ上での注意点

### app.db を空にしたら、必ずバックエンドを再起動する

テーブルは起動時に作られる（`app/main.py` の `lifespan`）。
動かしたまま `app.db` を消す・空にすると、テーブルが無い状態で動き続けて API が 500 を返す。

手順は「バックエンド停止 → `app.db` 削除 → 起動」の順。

なお `backend/app.db.bak-20260920-190031` は初期化前のバックアップ。不要なら消してよい。

### ポート 3000 が塞がっていると 3001 で起動する

Next.js は 3000 が使用中だと黙って 3001 に切り替える。
`http://localhost:3000` を開いても繋がらず「Failed to fetch」に見えるので、**起動ログに出た URL を必ず確認すること。**

### 他人の予定は編集も移動もできない

サーバー側で 403 を返す。画面側も、自分の予定は緑＋掴めるカーソル、他人の予定は灰色＋名前つきで表示し、動かそうとすると理由を出すようにしてある。
**テストデータが他ユーザー名義で大量に残っていると、動かないのが不具合に見える。** 実際にこの日、その勘違いが起きた。

### E2E テストのセレクタ

`e2e/tests/auth.spec.ts` が `.sidebar` を使っていたので `.topbar` に直した。
今後メニューの作りを変えるときは、`e2e/tests/` の locator も一緒に見ること。

E2E テストはユーザーを毎回新規登録するため、**流すたびに `users` テーブルが増える。**
この日、約 50 件のテスト用アカウントが溜まって画面が読めなくなった。定期的に `app.db` を作り直すか、後片付けを入れること。

---

## 6. 未確認の項目

動作確認は開発用サーバー上のブラウザで行った。次は確認できていない。

- スマホ幅（狭い画面）での上部メニューの横スクロールと、カードの長押しドラッグ
- 予定のドラッグ移動（編集フォーム追加後の再確認）。API は共通で `pytest` は通っている
- 他人の予定を読み取り専用で表示する画面（他ユーザーが居ないため未再現）
- バッジの 60 秒ごとの自動更新（画面移動時の更新は確認済み）
- モーダルの背景クリックで閉じる動作

## 7. 残っている改善案

- バッジは画面移動と 60 秒ごとにしか更新しない。ToDo 画面で完了にしても、その画面に居る間は数が変わらない。操作のたびに数え直す仕組みを入れると自然になる。
- 予定の繰り返し登録、参加者の指定は未実装。
- 月表示は 1 日あたり 3 件まで表示し、超えた分は「ほか N 件」。件数は `MONTH_CHIPS` で変えられる。

---

# 追加分（2026-09-21）: ToDo のカンバン化

ToDo 画面を、Trello のような列つきのカンバンボードに置き換えた。旧 `TodoList.tsx` は削除済み。

## 仕様（決めたこと）

- 列は自由に追加・名前変更・削除・並べ替えできる。初期は「未着手 / 進行中 / 完了」の 3 列。
- **列は全員で共有**する（ログインしていれば誰でも列を変えられる）。人ごとに列を分けたい場合は設計を変える必要がある。
- ボードに並ぶのは、今まで通り「自分が担当、または自分が登録した」ToDo だけ。
- 「完了列」（`is_done`）に入ったカードは `done=true` になる。**`done` は常に「完了列にあるか」と一致させる**（バッジ・ポータルの件数・既存の完了判定がそのまま使えるため）。
- 完了列と未完了の列は、それぞれ最低 1 つ残す（削除・種類の変更は 400）。列は 12 個まで。
- 列を削除すると、中のカードは「同じ種類（完了/未完了）でいちばん左の列」の末尾へ移る。
- カードをクリックすると中央の小窓で詳細を開く（件名・メモ・期限・担当者・列・削除）。ドラッグできない環境でも、ここの「列」で動かせる。

## バックエンド

- 新規 `app/board.py`: 列の初期作成・既存 DB への項目追加・カードの配置（`place`）。
- 新規 `app/routers/todo_columns.py`: `GET/POST /api/todo-columns`、`PATCH/DELETE /api/todo-columns/{id}`、`PUT /api/todo-columns/order`。
- `app/routers/todos.py`: `POST /api/todos/{id}/move`（`column_id` と `before_id`）を追加。`PATCH` は `note` と `column_id` に対応し、`due_on` は null で消せる。`done` だけを送る従来の使い方も動く（完了列/未完了の列の末尾へ移る）。
- `Todo` に `column_id` と `position` を追加。`TodoOut` にも含まれる。
- カードの位置は index ではなく **`before_id`（手前のカードの id）で送る**。同じ列に他人の ToDo（自分には見えない）が居ても、並びがずれないようにするため。
- **既存の app.db は起動時に自動で移行される**（`app/main.py` の `lifespan` → `board.upgrade_schema` と `board.seed_and_backfill`）。項目の追加と、既存 ToDo の列への振り分け（完了済みは「完了」列）を行う。何度起動しても安全。
- pytest は 65 件（`tests/test_todo_board.py` に 16 件を追加）。

## フロントエンド

- 新規 `components/TodoBoard.tsx`（盤面・ドラッグ・列の操作）と `components/TodoDetail.tsx`（詳細フォーム）。`app/dashboard/todos/page.tsx` を差し替え。
- ドラッグは Pointer Events で自前実装（HTML5 のドラッグ&ドロップはスマホで動かないため）。PC はマウス、スマホは 350ms 長押し。長押し前に動いたらスクロール扱い。端に近づくと自動スクロール。
- 落とす場所の目印（`.kb-slot`）は高さを持たせていない。高さを持たせると並びがずれて、判定が揺れる。
- 列の並べ替えはドラッグではなく、列メニューの「左へ / 右へ移動」。
- 見た目は `app/globals.css` 末尾の「ToDo カンバン」ブロック。

## 併せて直したもの（スケジュール画面・小窓）

- スマホで他人の予定の上からスクロールすると、「動かせません」が出てしまう問題。
- スマホで自分の予定の上から画面をスクロールできない問題（`touch-action: none` をやめ、長押しでつかんだ後だけスクロールを止める）。
- 小窓（`Modal.tsx`）で、文字を選択しながら枠の外で離すと閉じて入力が消える問題。開いたとき件名欄にフォーカスが当たらない問題。
- E2E: `todos.spec.ts` を新画面用に書き直し、`schedule.spec.ts` の予定移動テストを直した（落とす位置が画面外で、確認内容も常に失敗する内容だった）。E2E は 17 件すべて成功。

## 注意点・未確認

- **E2E を流すときは、開発用バックエンド（ポート 8000）を止めておく。** 動いていると E2E がそれを使い回し、開発用 DB にテスト用ユーザーが溜まる。止めておけば E2E 専用の使い捨て DB で起動する。
- 完了列のカードは全件を表示する。件数が増えたら「古い完了を畳む」仕組みが要る。
- カードを新規作成するときは件名だけ入力できる。担当者や期限は、作成後に詳細を開いて設定する。
- 実機のスマホ（iOS / Android）での長押しドラッグは未確認。タッチ操作の再現環境でのみ確認した。
- 開発用 DB に、動作確認用のユーザー（`check-other@example.com` / `check-me@example.com`、パスワード `Check12345`）とスケジュールの予定が残っている。不要なら消してよい。
- 移行前の DB は `backend/app.db.bak-before-kanban-20260921-090329` に残してある。不要なら消してよい。

---

# 追加分（2026-09-21 続き）: カンバンの見た目・バッジ・ToDo の共有

## カンバンの見た目

- カード（`.kb-card`）とドラッグ中のカード（`.kb-ghost`）は角丸 10px。
- 列は緑・青・赤の 3 色で色分けする。`TodoBoard.tsx` が列に `data-tone` を付け、`globals.css` の `.kb-col[data-tone=...]` が `--kb-accent` を決める。
  - 完了列: 緑（テーマの `--success`）。
  - 未完了の列: 左から 赤（`--danger`）→ 青（`--kb-blue`）→ 濃い赤 → 濃い青 の 4 色を繰り返す。
- 色は「列の並び順」で決まる。列の並べ替えで色も入れ替わる。列ごとに色を固定したい場合は、`todo_columns` に色の項目を足す必要がある。

## ToDo のバッジ（`TopNav.tsx`）

- ToDo 画面に移った瞬間にバッジを消す。以後は「開いた時点の件数」を超えて増えた分だけ出す（完了して減ったら、見た分も減らす）。
- 見た分は localStorage（`todos-seen-<ユーザーid>`）に保存している。**端末ごと**なので、別の端末ではその端末で ToDo を一度開くまで出る。
- お知らせ・伝言は今まで通り（既読・対応済みで減る）。

## ToDo の共有

### 見える範囲

- 自分が登録した、自分が担当、または共有された ToDo だけが見える。ボード・ポータルの件数・メニューのバッジで同じ条件。条件は `crud.py` の `todo_visible()` にまとめてある。**変えるときはここだけ直す。**
- 他人のカードを直接 API で編集しようとすると 403。

### 共有の仕組み

- 新テーブル `todo_shares`（`TodoShare`: `todo_id` と `user_id` の組）。`create_all` で自動作成されるので、既存の app.db も再起動すれば足りる。
- `PUT /api/todos/{id}/shares` に `{"user_ids": [...]}` を送ると、その一覧が新しい共有先になる（外せば見えなくなる）。**共有を変えられるのは登録した人だけ**（他は 403）。自分自身は無視する。存在しない・無効なユーザーは 400。
- 共有された人は、カードを見る・動かす・内容を直すことができる。**削除はできない**（`_editable(..., allow_shared=False)`）。
- `TodoOut` に `shared_with`（共有先のユーザー id の配列）を追加した。カードを削除すると共有の記録も消す。
- 画面: 詳細の「共有」欄（登録者だけ「共有する」ボタン）でユーザーをチェックして「共有を保存」。共有中のカードには「共有」チップが出る。

### テスト

- pytest は 69 件（`tests/test_todo_board.py` に共有の 4 件を追加）。全件成功。

## 注意点・未確認

- **バックエンドは `--reload` なしで起動されていることがある。** コードを変えたら再起動すること。共有の追加直後、古いバックエンドが動いたままで `shared_with` が返らず、ToDo の詳細画面がエラーになった。今は新しいコードで再起動済み（ポート 8000、バックグラウンド起動）。
- 共有まわりの画面操作（ブラウザ）と E2E は未確認。E2E には共有のテストがまだ無い。
- 「担当者に指定された」だけでもカードは見える（従来どおり）。担当に指定された人には見せない仕様にしたい場合は `todo_visible()` を変える。
- 共有された人に閲覧だけを許したい場合は、`todos.py` の `_editable` の `allow_shared` の扱いを変える。
- README.md は古いまま（`TodoList`・週表示の記述が残り、カンバン・月表示・共有が載っていない）。

---

# 追加分（2026-09-21 さらに続き）: 伝言のモーダル化・バッジの即時更新・自分のお知らせの既読扱い

## 伝言・在席（`OfficeBoard.tsx`）

- 他のユーザーへの伝言フォームを、一覧の下に出す形から `Modal.tsx` のモーダル表示に変えた。在席一覧の「伝言」ボタンで開く。
- Esc・背景クリック・✕・「やめる」で閉じる。送信に成功すると閉じる。
- 送信失敗のエラーはモーダルの中に出す。閉じたとき・開き直したときはエラーを消す。
- E2E（`office.spec.ts`）は「伝言」「伝言を残す」のボタン名で操作しているので、そのままで動く想定。**流して確認はしていない。**

## バッジの即時更新

- 新規 `lib/badges.ts`。`refreshBadges()` を呼ぶと、`TopNav.tsx` がバッジ用 API（`/api/dashboard/badges`）を今すぐ呼び直す（`window` のカスタムイベント `badges:refresh` 経由）。
- 呼んでいる場所: お知らせの投稿・既読（開いたとき）・削除（`NoticeBoard.tsx`）、伝言の「対応済みにする」（`OfficeBoard.tsx`）。件数が変わる操作を足すときは、その直後に `refreshBadges()` を呼ぶ。
- **他のユーザーの画面へは即時に届かない。** そちらは従来どおり 60 秒ごと（`POLL_MS`）か画面移動で更新される。即時にしたい場合はサーバーからの通知（SSE / WebSocket）が要る。
- ToDo の操作（完了など）にはまだ `refreshBadges()` を入れていない。改善案として残っている。

## 自分が書いたお知らせは既読扱い

- 自分が書いたお知らせは、常に既読として扱う。他人のお知らせは従来どおり、開くまで未読。
- 変更は `crud.py` の `notices_for`（`unread` の判定）と `badge_counts`（件数）。投稿の返り値（`routers/notices.py`）も `unread=False`。
- 判定は問い合わせ側で行うので、**データの移行は不要**。過去に自分が書いた分も既読になる。
- ポータルの「未読のお知らせ」の数も、自分が書いた分を除く（同じ `notices_for` を使っているため）。
- 上のバッジの即時更新は、自分の投稿ではバッジが付かなくなる（自分の分は数えないため）。バッジが付くのは他人の投稿を見に来たユーザー側。
- テスト: `test_notices.py`（自分の投稿は最初から既読）、`test_dashboard.py`（バッジは自分の分を数えず、他人の分は読むまで数える。集計のテストはお知らせを別ユーザーが書く形に修正）。pytest は 69 件すべて成功。

## 併せて

- `README.md` を現状に合わせて更新した（スケジュールの月・週表示、ToDo カンバンと共有、バッジ、構成、注意点）。

## 注意点・未確認

- **バックエンドは `--reload` なしで起動されている。** コードを変えたら再起動すること。今回も、古いコードのまま動いていたため「自分のお知らせは既読」が画面に出なかった。開発中は `uvicorn app.main:app --reload --port 8000` で起動すると手間がない。現在は新しいコードで再起動済み（ポート 8000、バックグラウンド起動）。
- 上記 3 件は tsc / pytest までの確認で、**ブラウザでの表示確認は未実施。**

---

# 追加分（2026-09-21 さらに続き）: 設定（プロフィール・権限・カラースキーム）

上部メニューのユーザー名の左に、歯車アイコン＋「設定」を追加した（`TopNav.tsx`）。遷移先は `/dashboard/settings`（`SettingsView.tsx`）。タブは「プロフィール」「カラースキーム」「ユーザー管理」（パワーユーザーだけに表示）。

## 権限
- `users.role`: `power`（パワーユーザー）/ `user`（一般ユーザー）。**最初に登録した人が power**。既存 DB は起動時に自動で列が追加され、power が居なければ最古の有効ユーザーが昇格する（`app/accounts.py`）。
- power ができること: ユーザー一覧、権限の変更、有効/無効の切り替え（`/api/admin/users`、`PATCH /api/admin/users/{id}`）。一般ユーザーは 403。
- 守っていること: power は常に 1 人以上（最後の 1 人は降格・無効化できない）。自分自身は無効にできない。無効なユーザーはログインできない。
- **権限で制限しているのはユーザー管理だけ。** ToDo の列の編集などは従来どおり全員ができる。制限を足すときは `deps.py` の `PowerUser` を使う。

## プロフィール
- `PATCH /api/auth/me`（名前・部署・配色。権限とメールは変えられない）、`POST /api/auth/password`（現在のパスワードが必要）。

## カラースキーム
- `users.color_scheme`: `warm`（暖色）/ `neutral`（中間色・従来の色）/ `cool`（寒色）/ `dark`（ダークモード）。ユーザーごとにサーバーへ保存するので端末をまたいで同じ。
- 反映は `dashboard/layout.tsx` が `.shell` に付ける `data-scheme`。`globals.css` 末尾の `.shell[data-scheme=...]` が色の変数とカードの色を差し替える。設定で変更すると `router.refresh()` で即反映。
- 色を調整するときはそのブロックの値を直す。ログイン画面は常に標準色。

- ダークモードは `color-scheme: dark` で入力欄・選択肢・スクロールバーも暗くする。小窓（`.modal`）は `<dialog>` の既定色を避けるため `color: var(--text)` を指定している。
- スキームを足すときは、`accounts.py` の `SCHEMES`、`types.ts` の `ColorScheme`、`SettingsView.tsx` の `SCHEMES`、`globals.css` の `.shell[data-scheme=...]` の 4 か所を揃える。

## ポータルのカード
- `.board` は横 4 列固定（`globals.css`）。幅 900px 以下は 2 列、720px 以下は 1 列。幅を 2 倍にしたカードは 2 列分を使う。

## テストと確認状況
- pytest 81 件（`tests/test_settings.py` に 12 件）、E2E 22 件（`e2e/tests/settings.spec.ts` に 5 件を追加）、tsc エラーなし。既存 DB のコピーで自動移行も確認。
- E2E の「ユーザー管理」テストは、最初の登録者が誰になるか決まらないため、パワーユーザーの場合と一般ユーザーの場合で確認内容を分けている。パワーユーザーの操作は pytest で確認している。
- 並列実行の負荷で、新規登録が終わらず落ちるテストが 1 回だけあった（再実行で成功）。再発したら `--workers=1` で切り分ける。
- **ブラウザでの見た目（各配色、特にダークモード、ポータルの 4 列）は未確認。**

## 注意点
- **バックエンドは今は `--reload` 付きで起動している**（ポート 8000、非表示ウィンドウ）。E2E を流す前には止めること。止めるときは `--reload` の親プロセスと子プロセスの両方を終了する。
- 稼働中のバックエンドが古いコードのままだと、新しい API が無く 405（Method Not Allowed）になる。カラースキームの選択で実際に起きた。
