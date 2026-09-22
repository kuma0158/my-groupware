# 社内グループウェア

スケジュール・ToDo(カンバン)・インフォメーション(社内お知らせ)・伝言/在席をひとつにまとめた、小規模チーム向けの社内グループウェアです。
ログイン後はウィジェットを自由に並べ替えられるポータル画面が開き、各機能の画面へ移動できます。

- バックエンド: Python / FastAPI + SQLAlchemy(SQLite)
- フロントエンド: Next.js 15(App Router)/ React 19 / TypeScript(UI ライブラリなし・素の CSS)
- 認証: JWT を HttpOnly Cookie で保持
- テスト: pytest(API 結合テスト)、Playwright(E2E)
- 付属: ローカル AI エージェントの雛形(`agent/`、Azure OpenAI 対応)

---

## 目次

1. [システム構成](#システム構成)
2. [機能](#機能)
3. [セットアップと起動](#セットアップと起動)
4. [テスト](#テスト)
5. [ディレクトリ構成](#ディレクトリ構成)
6. [API 一覧](#api-一覧)
7. [データモデル](#データモデル)
8. [認証と権限](#認証と権限)
9. [画面の見た目(テーマとカラースキーム)](#画面の見た目テーマとカラースキーム)
10. [カスタマイズの入口](#カスタマイズの入口)
11. [AI エージェント(agent/)](#ai-エージェントagent)
12. [運用上の注意](#運用上の注意)
13. [本番公開前のチェック](#本番公開前のチェック)
14. [関連ドキュメント](#関連ドキュメント)

---

## システム構成

```
ブラウザ
  │  http://localhost:3000(画面も API も同一オリジン)
  ▼
Next.js(frontend/ ポート 3000)
  │  /api/* を rewrites で転送(next.config.mjs の BACKEND_URL)
  │  サーバーコンポーネントからはクッキーを付けて直接呼ぶ(lib/server-api.ts)
  ▼
FastAPI(backend/ ポート 8000)
  │  SQLAlchemy
  ▼
SQLite(backend/app.db)
```

- ブラウザは常に Next.js の `/api/*` を呼ぶため、CORS を意識せずにクッキーが送られます。
- テーブルはバックエンド起動時(`app/main.py` の `lifespan`)に作成され、既存 DB は自動で移行されます(何度起動しても安全)。

## 機能

### アカウント
- 新規登録(名前・部署つき)/ ログイン / ログアウト
- **最初に登録した人がパワーユーザー**になり、以降の登録者は一般ユーザー

### ポータル(`/dashboard`)
- ウィジェット(カード)を横 4 列に並べる(幅 900px 以下は 2 列、720px 以下は 1 列)
- ドラッグ(スマホは長押し)で並べ替え、追加・削除・幅(1 列 / 2 列)の切り替え。配置はユーザーごとにサーバーへ保存
- カード本文のクリックで各画面へ移動(並べ替えは見出し部分から)
- ウィジェットの種類: 件数(予定・ToDo・お知らせ・伝言)、今日の予定、未完了の ToDo、最新のお知らせ、未対応の伝言、在席ボード、メモ、時計

### スケジュール(`/dashboard/schedule`)
- 月表示・週表示(時間軸つき)の切り替え
- 予定の追加・編集はモーダル。時刻は 15 分刻みで選択、所要時間ボタンつき
- 自分の予定はドラッグで移動(日時が一緒に変わる)。非公開設定あり
- 他人の予定は読み取り専用(サーバー側でも 403)

### ToDo(`/dashboard/todos`)
- Trello 風のカンバンボード。列(初期は「未着手 / 進行中 / 完了」)は**全員で共有**
- 列の追加・名前変更・削除・並べ替え(最大 12 列。完了列と未完了列はそれぞれ 1 つ以上必要)
- カードはドラッグ(スマホは 350ms 長押し)で移動、クリックで詳細(件名・メモ・期限・担当者・列)を編集
- 登録者は他のユーザーへ共有できる。共有された人は見る・動かす・直すことができる(削除と共有の変更は登録者のみ)
- 見えるのは「自分が登録した / 自分が担当 / 共有された」ToDo のみ

### インフォメーション(`/dashboard/notices`)
- 社内お知らせの投稿・削除、上部固定、既読管理(自分が書いたお知らせは常に既読扱い)

### 伝言・在席(`/dashboard/office`)
- 自分の在席状況とひとことの更新、メンバーの在席一覧
- 他の人への伝言メモ(モーダルで入力)、対応済みの記録

### 上部ナビゲーション
- ToDo・お知らせ・伝言の新着バッジ。60 秒ごとと画面移動時に更新し、既読・対応済みなどの操作直後にも即時更新

### 設定(`/dashboard/settings`、上部の歯車アイコン)
- プロフィール: 名前・部署の変更、パスワードの変更
- カラースキーム: 暖色 / 中間色(標準) / 寒色 / ダークモード。アカウントごとに保存され、端末をまたいで同じ
- ユーザー管理(パワーユーザーのみ): 権限(パワーユーザー / 一般ユーザー)の変更、有効/無効の切り替え

## セットアップと起動

### 必要なもの
- Python 3.11 以上
- Node.js 20 以上(npm)

### 1. バックエンド(FastAPI) — http://localhost:8000

```bash
cd backend
python -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements-dev.txt
cp .env.example .env             # 初回のみ。SECRET_KEY は必ず書き換える
uvicorn app.main:app --reload --port 8000
```

API ドキュメント(Swagger UI): http://localhost:8000/docs

`backend/.env` の項目:

| 変数 | 既定値 | 説明 |
|---|---|---|
| `DATABASE_URL` | `sqlite:///./app.db` | DB の接続先 |
| `SECRET_KEY` | `change-me` | JWT の署名鍵。推測されない値にする |
| `ACCESS_TOKEN_EXPIRE_MINUTES` | `1440` | ログインの有効期間(分) |
| `COOKIE_SECURE` | `false` | HTTPS 公開時は `true` |
| `FRONTEND_ORIGIN` | `http://localhost:3000` | フロントエンドのオリジン(CORS) |
| `ALLOW_REGISTRATION` | `true` | `false` で、最初の 1 人以外の新規登録を止める(公開後の社内専用運用向け) |

### 2. フロントエンド(Next.js) — http://localhost:3000

```bash
cd frontend
npm install
cp .env.example .env.local       # 任意。BACKEND_URL を変えるときだけ
npm run dev
```

| 変数 | 既定値 | 説明 |
|---|---|---|
| `BACKEND_URL` | `http://127.0.0.1:8000` | FastAPI の転送先(ビルド時に確定) |

### 3. 使い始める

ブラウザで http://localhost:3000 を開き、「新規登録」からアカウントを作成します。
最初のアカウントがパワーユーザーになります。伝言や担当者・共有を試すには 2 人以上登録すると分かりやすいです。

## テスト

### バックエンド(API 結合テスト / pytest)

```bash
cd backend
pytest -q                         # Windows: .venv\Scripts\python.exe -m pytest -q
```

テストは `backend/tests/` にあり、機能ごと(認証・ポータル・スケジュール・ToDo・カンバン・お知らせ・在席/伝言・設定)に分かれています。

### E2E テスト(Playwright / ブラウザ操作)

新規登録 / ログイン / ログアウト / スケジュール / ToDo / お知らせ / 在席・伝言 / 設定 を実ブラウザで通しで検証します。

```bash
cd e2e
npm install
npx playwright install chromium   # 初回のみ(ブラウザ本体の導入)
npm test                          # 画面を見ながら: npm run test:headed / 結果: npm run report
```

Playwright が以下を自動で起動します(`playwright.config.ts` の `webServer`):

- **バックエンド**: `scripts/start-backend.cjs` が毎回まっさらな SQLite(`e2e/.e2e/e2e.db`)で uvicorn を起動
- **フロントエンド**: `frontend` の `npm run dev`

> 同じポート(8000 / 3000)でサーバーが動いているとそれを再利用し、開発用 DB にテスト用ユーザーが溜まります。
> **E2E は開発用バックエンドを停止してから実行してください。**

テストの追加は `e2e/tests/*.spec.ts` へ、共通ヘルパーは `e2e/tests/helpers.ts` へ。

## ディレクトリ構成

```
backend/                FastAPI
  app/
    main.py             アプリ本体・CORS・ルーター登録・起動時の DB 作成/移行
    config.py           環境変数(.env)
    database.py         SQLAlchemy(SQLite)
    models.py           テーブル定義
    schemas.py          入出力の型(Pydantic)
    security.py         パスワードハッシュ(bcrypt)・JWT
    deps.py             ログイン中ユーザーの取得、パワーユーザーの確認(PowerUser)
    accounts.py         権限・配色の定義、既存 DB の自動移行
    board.py            ToDo カンバンの列・カード配置、既存 DB の自動移行
    widgets.py          ウィジェットの種類と初期配置
    crud.py             一覧・件数の取り出し(ポータルと各画面で共用)。ToDo の可視条件は todo_visible()
    routers/
      auth.py           登録・ログイン・ログアウト・プロフィール・パスワード
      admin.py          ユーザー管理(パワーユーザーのみ)
      dashboard.py      ポータルのまとめ取得・レイアウト保存・バッジ件数
      schedule.py       予定
      todos.py          ToDo(移動・共有)
      todo_columns.py   カンバンの列
      notices.py        お知らせ
      office.py         在席・伝言
  tests/                pytest
  requirements.txt / requirements-dev.txt / .env.example

frontend/               Next.js
  src/
    middleware.ts       /dashboard のクッキー簡易ガード
    app/
      login, register   認証画面
      dashboard/        ポータル(layout で認証確認・配色の適用)
        schedule, todos, notices, office, settings   各機能の画面
      globals.css       全スタイル(テーマ・カラースキーム・カンバンなど)
      layout.tsx        テーマの選択(THEME)
    components/         WidgetBoard, TopNav, ScheduleCalendar, EventForm, TimeRange, Modal,
                        TodoBoard, TodoDetail, NoticeBoard, OfficeBoard, SettingsView, AuthForm ほか
    lib/
      api.ts            ブラウザ用 API クライアント
      server-api.ts     サーバー用 API クライアント(クッキー転送)
      widgets.tsx       ウィジェットの登録表(表示部品もここ)
      useWidgetDrag.ts  ポータルのドラッグ/長押し処理
      badges.ts         バッジの即時更新(refreshBadges)
      time.ts, types.ts

e2e/                    Playwright の E2E テスト
agent/                  ローカル AI エージェントの雛形
.vscode/                エージェントのデバッグ起動設定(tasks.json / launch.json)
HANDOVER.md             変更の経緯と引き継ぎ事項
```

## API 一覧

すべて `/api` 配下。認証が必要なものはログイン時のクッキーで判定します。詳細な型は http://localhost:8000/docs を参照してください。

### 認証・アカウント(`/api/auth`)
| メソッド | パス | 内容 |
|---|---|---|
| POST | `/api/auth/register` | 新規登録(ログイン状態になる) |
| POST | `/api/auth/login` | ログイン |
| POST | `/api/auth/logout` | ログアウト |
| GET | `/api/auth/me` | ログイン中のユーザー |
| PATCH | `/api/auth/me` | 名前・部署・カラースキームの変更 |
| POST | `/api/auth/password` | パスワード変更(現在のパスワードが必要) |

### ユーザー管理(`/api/admin`、パワーユーザーのみ)
| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/admin/users` | ユーザー一覧 |
| PATCH | `/api/admin/users/{id}` | 権限・有効/無効の変更 |

### ポータル(`/api/dashboard`)
| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/dashboard/summary` | ポータル用のまとめ取得(重いので定期取得には使わない) |
| GET | `/api/dashboard/badges` | バッジ件数 `{todos, notices, messages}`(軽量) |
| GET / PUT | `/api/dashboard/layout` | ウィジェット配置の取得・保存 |

### スケジュール(`/api/schedule`)
| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/schedule/range?start=&end=` | 期間内の予定(最大 62 日) |
| GET | `/api/schedule/week` | 週の予定(旧 API。画面からは未使用) |
| POST | `/api/schedule` | 予定の追加 |
| PATCH | `/api/schedule/{id}` | 予定の変更(編集・ドラッグ移動。自分の予定のみ) |
| DELETE | `/api/schedule/{id}` | 予定の削除 |

### ToDo(`/api/todos`、`/api/todo-columns`)
| メソッド | パス | 内容 |
|---|---|---|
| GET / POST | `/api/todos` | 一覧・追加 |
| PATCH | `/api/todos/{id}` | 内容の変更 |
| POST | `/api/todos/{id}/move` | 列・位置の移動(`column_id`, `before_id`) |
| PUT | `/api/todos/{id}/shares` | 共有先の設定(登録者のみ) |
| DELETE | `/api/todos/{id}` | 削除(登録者のみ) |
| GET / POST | `/api/todo-columns` | 列の一覧・追加 |
| PUT | `/api/todo-columns/order` | 列の並べ替え |
| PATCH / DELETE | `/api/todo-columns/{id}` | 列の変更・削除 |

### お知らせ(`/api/notices`)
| メソッド | パス | 内容 |
|---|---|---|
| GET / POST | `/api/notices` | 一覧・投稿 |
| POST | `/api/notices/{id}/read` | 既読にする |
| DELETE | `/api/notices/{id}` | 削除 |

### 在席・伝言
| メソッド | パス | 内容 |
|---|---|---|
| GET | `/api/members` | メンバーと在席状況 |
| PUT | `/api/presence` | 自分の在席状況の更新 |
| GET / POST | `/api/messages` | 自分宛ての伝言の一覧・伝言を残す |
| POST | `/api/messages/{id}/handled` | 対応済みにする |

## データモデル

| テーブル | モデル | 内容 |
|---|---|---|
| `users` | `User` | ユーザー。権限(`role`: `power` / `user`)、配色(`color_scheme`)、有効/無効、在席状況 |
| `dashboard_layouts` | `DashboardLayout` | ユーザーごとのウィジェット配置 |
| `events` | `Event` | 予定(日付・開始/終了時刻・場所・メモ・非公開) |
| `todo_columns` | `TodoColumn` | カンバンの列(全員共通。`is_done` で完了列) |
| `todos` | `Todo` | ToDo(担当者・期限・メモ・`column_id`・`position`)。`done` は常に「完了列にあるか」と一致 |
| `todo_shares` | `TodoShare` | ToDo の共有先(`todo_id` と `user_id` の組) |
| `notices` | `Notice` | お知らせ(上部固定つき) |
| `notice_reads` | `NoticeRead` | お知らせの既読記録 |
| `messages` | `Message` | 伝言(宛先・対応済み) |

マイグレーションツールは使っていません。列の追加などは起動時に `accounts.py` / `board.py` が自動で行います。

## 認証と権限

- ログインすると FastAPI が JWT を **HttpOnly Cookie** にセットします。JavaScript からは読めません。
- `frontend/src/middleware.ts` はクッキーの有無だけを見る簡易ガードで、正式な確認は `dashboard/layout.tsx` が `/api/auth/me` で行います。
- 権限は 2 種類:
  - **パワーユーザー**: ユーザー管理ができる。常に 1 人以上必要(最後の 1 人は降格・無効化できない)
  - **一般ユーザー**: それ以外のすべての機能を使える
- 自分自身は無効にできません。無効なユーザーはログインできません。
- 権限で制限しているのは今のところユーザー管理だけです。制限を足すときは `deps.py` の `PowerUser` を使います。

## 画面の見た目(テーマとカラースキーム)

**テーマ**は書体・角丸などを決める全員共通の設定で、`frontend/src/app/layout.tsx` の `THEME` を書き換えて選びます。

| テーマ | 見た目 | 向いている用途 |
|---|---|---|
| `instrument`(既定) | 計器盤。冷たいグレーと深緑。影とグラデーションを使わず、罫線と面で構造を見せる | 業務システム、管理画面全般 |
| `blueprint` | 方眼。薄い方眼紙の背景と青インク。パネル左上に製図の目印 | 設計・製造・建設系 |

テーマを足すときは `globals.css` の `[data-theme="..."]` ブロックをコピーして値を変えます。

**カラースキーム**は各ユーザーが設定画面で選ぶ色合い(暖色・中間色・寒色・ダークモード)です。中間色がテーマの色そのままです。`globals.css` 末尾の `.shell[data-scheme=...]` ブロックで色を差し替えています(ログイン画面は常に標準色)。

## カスタマイズの入口

| やりたいこと | 場所 |
|---|---|
| メニューの項目・アイコン・バッジ | `frontend/src/components/TopNav.tsx` の `NAV` 配列(更新間隔は `POLL_MS`) |
| ウィジェットの追加 | `backend/app/widgets.py` と `frontend/src/lib/widgets.tsx` の両方に同じ type を足す |
| ポータルの数値 | `backend/app/routers/dashboard.py` |
| ポータルの列数 | `globals.css` の `.board` |
| カードの色 | `globals.css` の `.widget[data-widget-type="..."] { --accent: ... }` |
| カンバンの列色 | `globals.css` の `.kb-col[data-tone=...]` |
| 週表示の高さ・ドラッグの刻み | `ScheduleCalendar.tsx` の `HOUR_PX` / `SNAP_MIN` |
| 時刻選択の刻み・所要時間ボタン | `TimeRange.tsx` の `STEP` / `DURATIONS` |
| 月表示の 1 日あたりの件数 | `ScheduleCalendar.tsx` の `MONTH_CHIPS` |
| ToDo の見える範囲 | `backend/app/crud.py` の `todo_visible()`(ここだけ直す) |
| 共有された人の編集可否 | `backend/app/routers/todos.py` の `_editable` の `allow_shared` |
| カラースキームの追加 | `accounts.py` の `SCHEMES`、`types.ts` の `ColorScheme`、`SettingsView.tsx` の `SCHEMES`、`globals.css` の `.shell[data-scheme=...]` の 4 か所 |
| バッジの種類の追加 | `NAV` の `badge`、`schemas.py` の `BadgeOut`、`crud.py` の `badge_counts()` |
| 件数が変わる操作の後にバッジを更新 | 操作の直後に `lib/badges.ts` の `refreshBadges()` を呼ぶ |

> `crud.py` の `badge_counts()` と各一覧(`todos_for` / `notices_for` / `messages_for`)は同じ条件で数えています。片方だけ直すとバッジと一覧がずれます。

## AI エージェント(agent/)

グループウェア本体とは独立した、ローカル AI エージェントの雛形です。

```bash
cd agent
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python agent.py --prompt "今日チームがやるべきことを 3 つ挙げて"
```

- 環境変数 `AZURE_OPENAI_ENDPOINT` / `AZURE_OPENAI_API_KEY` / `AZURE_OPENAI_CHAT_DEPLOYMENT` を設定すると Azure OpenAI で応答します(任意: `AZURE_OPENAI_API_VERSION`、`MODEL_NAME`)。
- 未設定のときは固定の応答を返すので、設定なしでも動作確認できます。
- VS Code では「Debug Groupware Agent」(`.vscode/launch.json`)で debugpy(ポート 5679)にアタッチしてデバッグできます。

詳細は `agent/README.md` を参照してください。

## 運用上の注意

- **コードを変えたらバックエンドを再起動する。** `--reload` なしで起動していると古いコードのまま動き、新しい API が無く 405(Method Not Allowed)や項目不足のエラーになります。開発中は `--reload` 付きで起動してください。
- **`app.db` を空にする・消すときは、必ずバックエンドを停止してから。** テーブルは起動時に作られるため、動かしたまま消すと API が 500 を返します(停止 → 削除 → 起動)。
- 既存の `app.db` は起動時に自動で移行されます(カンバン用の項目・共有テーブル・権限と配色の項目)。パワーユーザーが居なければ、最古の有効ユーザーが昇格します。
- Next.js はポート 3000 が使用中だと黙って 3001 で起動します。起動ログの URL を確認してください。
- `frontend/next.config.mjs` の転送先(`BACKEND_URL`)はビルド時に確定します。変更したら `npm run build` をやり直します。
- 他人の予定は編集・移動できません。テストデータが他ユーザー名義で残っていると、動かないのが不具合に見えることがあります。
- ToDo のバッジの「見た分」はブラウザの localStorage に保存しているため端末ごとです。他のユーザーの画面へのバッジ反映は、60 秒ごとまたは画面移動時です。

## 本番公開前のチェック

- `backend/.env` の `SECRET_KEY` を推測されない値にする
- HTTPS 化して `COOKIE_SECURE=true` にする
- `FRONTEND_ORIGIN` / `BACKEND_URL` を本番の URL に合わせ、`npm run build` → `npm run start` で起動する
- 同時利用が増えるなら SQLite から PostgreSQL / MySQL への切り替えと、Alembic によるマイグレーション管理を検討する
- `ALLOW_REGISTRATION=false` で新規登録を止める(全員の登録後)
- 開発用の DB バックアップ(`backend/app.db.bak-*`)や動作確認用ユーザーを持ち込まない
