# CoreDesk 開発・インフラ構築 引き継ぎ書

**引き継ぎ先：OpenAI Codex**
**作成日：2026年9月21日**
**対象：CoreDeskのCloudflare Tunnelによる試験公開**

---

## 1. 本書の目的

現在開発中のグループウェア「CoreDesk」を、Cloudflare Tunnelを利用してインターネットからアクセスできる状態にする。

本書は、ChatGPTとのこれまでの会話で決定した事項と、今後実施する作業をCodexに引き継ぐためのものである。

**最終的な目標は、以下のURLでCoreDeskを正常に利用できるようにすること。**

[https://coredesk.shinobuabe.com](https://coredesk.shinobuabe.com)

今回の作業は試験公開を目的とする。既存のシステム構成をできるだけ維持し、最小限の変更で公開できるようにする。

---

## 2. システム概要

### 2.1 システム名称

正式名称：**CoreDesk**

以前は「my-groupware」という仮称で開発していたが、現在はCoreDeskに名称を変更している。

ただし、GitHubのリポジトリ名やローカルのディレクトリ名が変更済みかどうかは未確認である。

Codexは、作業開始時に実際のリポジトリ名とディレクトリ構成を確認すること。

### 2.2 システムの目的

CoreDeskは、シンプルかつ必要最小限の機能を備えたグループウェアとして開発している。

多機能で複雑なグループウェアではなく、必要な機能を簡潔に提供することを基本方針としている。

現在実装されている具体的な機能や画面構成については、ソースコードを確認すること。

### 2.3 技術構成

現在判明している技術構成は以下のとおり。

| 項目       | 技術                      |
| -------- | ----------------------- |
| システム名称   | CoreDesk                |
| フロントエンド  | Next.js                 |
| バックエンド   | Python / FastAPI        |
| ASGIサーバー | Uvicorn                 |
| 開発OS     | Windows 11              |
| データベース   | 要確認                     |
| ソースコード管理 | GitHub                  |
| 外部公開方式   | Cloudflare Tunnel       |
| 公開ドメイン   | coredesk.shinobuabe.com |

Next.jsとFastAPIのバージョン、使用しているデータベース、認証方式、APIの実装については、現時点では確定していない。

必ず既存のソースコードを確認したうえで作業すること。

---

# 3. 現在の開発環境

## 3.1 ローカルディレクトリ

過去の開発環境では、以下のディレクトリを使用していた。

```text
H:\dev\my-groupware
```

ただし、CoreDeskへの名称変更後も同じディレクトリを使用しているかは未確認。

Codexは、現在開いているワークスペースを確認し、実際のプロジェクトルートを特定すること。

想定される構成は以下のとおり。

```text
CoreDesk/
│
├── frontend/
│   ├── package.json
│   ├── next.config.js
│   ├── src/
│   └── ...
│
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── ...
│
└── README.md
```

**上記は説明用の構成であり、実際のディレクトリ構成を示すものではない。**

既存のファイルやディレクトリを確認し、必要がなければ構成変更しないこと。

## 3.2 FastAPIの起動について

過去に以下のコマンドでFastAPIの起動を試みた。

```powershell
uvicorn main:app --reload
```

その際、以下のエラーが発生している。

```text
ERROR: Error loading ASGI app.
Could not import module "main".
```

この問題が現在も残っているかどうかは不明。

CodexはFastAPIのエントリーポイントを調査し、実際のディレクトリ構成に応じた正しい起動コマンドを確認すること。

例えば、エントリーポイントが`backend/main.py`に存在する場合、プロジェクトルートから次のように起動する構成が考えられる。

```powershell
uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

ただし、Pythonパッケージ構成や依存関係によって起動方法は異なる。

実際のコードに基づいて判断すること。

---

# 4. Cloudflareの設定情報

## 4.1 ドメイン情報

| 項目              | 設定内容                                                               |
| --------------- | ------------------------------------------------------------------ |
| 所有ドメイン          | shinobuabe.com                                                     |
| DNS管理           | Cloudflare                                                         |
| CoreDesk用サブドメイン | coredesk.shinobuabe.com                                            |
| 公開URL           | [https://coredesk.shinobuabe.com](https://coredesk.shinobuabe.com) |
| Cloudflareプラン   | Freeプランを利用する想定                                                     |

ドメインは取得済みであり、Cloudflareで管理している。

新たなドメインを取得する必要はない。

既存の`shinobuabe.com`のWebサイトやその他のサブドメインに影響を与えず、CoreDesk専用のサブドメインを追加する方針とする。

## 4.2 Cloudflare Tunnel

Cloudflare Tunnelを使用して、ローカルWindows PC上で稼働するCoreDeskをインターネットに公開する。

想定するTunnel名は以下のとおり。

```text
coredesk-tunnel
```

ただし、Tunnelはまだ作成済みと確認できていない。

Codexは、既存のTunnelが存在するか確認したうえで、新規作成の必要性を判断すること。

---

# 5. 目標とするインフラ構成

Next.jsをフロントエンド、FastAPIをバックエンドとして使用する。

外部からのアクセスはCloudflare Tunnelを経由してNext.jsへ転送し、API通信はNext.jsを経由してFastAPIへ転送する方式を第一候補とする。

```text
                   インターネット
                         │
                         │ HTTPS
                         ▼
          coredesk.shinobuabe.com
                         │
                         ▼
                ┌────────────────┐
                │   Cloudflare   │
                │                │
                │  DNS / HTTPS   │
                │      WAF       │
                └────────┬───────┘
                         │
                         ▼
                Cloudflare Tunnel
                         │
                         ▼
┌────────────────────────────────────────┐
│              Windows 11                │
│                                        │
│             cloudflared                │
│                  │                     │
│                  ▼                     │
│        ┌─────────────────────┐         │
│        │       Next.js       │         │
│        │                     │         │
│        │   127.0.0.1:3000    │         │
│        └──────────┬──────────┘         │
│                   │                    │
│                   │ API通信            │
│                   ▼                    │
│        ┌─────────────────────┐         │
│        │       FastAPI       │         │
│        │                     │         │
│        │   127.0.0.1:8000    │         │
│        └──────────┬──────────┘         │
│                   │                    │
│                   ▼                    │
│             データベース               │
│                                        │
└────────────────────────────────────────┘
```

この構成では、CaddyやNginxを追加する必要はない。

ただし、既存のNext.jsとFastAPIの通信方式によっては構成を調整すること。

---

# 6. Next.jsとFastAPIの接続方式

## 6.1 現在の実装を確認する

Codexは、まずNext.jsからFastAPIへの通信方式を調査すること。

特に以下を確認する。

1. Next.jsからFastAPIへアクセスしている箇所
2. APIのベースURLを管理している環境変数
3. Next.jsのAPI RoutesやRoute Handlersの使用状況
4. Server ActionsやServer ComponentsからのAPI呼び出し
5. FastAPIのルーティング構成
6. 認証・Cookie・セッションの管理方式

既存コードの確認前に、APIの接続方式を全面的に変更しないこと。

## 6.2 Next.js RewritesによるAPI転送

既存の構成と互換性がある場合は、Next.jsのRewrites機能を利用する。

例えば、ブラウザから次のURLへアクセスする。

```text
https://coredesk.shinobuabe.com/backend/users
```

Next.jsからローカルのFastAPIへ転送する。

```text
http://127.0.0.1:8000/api/users
```

設定例：

```javascript
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/backend/:path*",
        destination: "http://127.0.0.1:8000/api/:path*",
      },
    ];
  },
};

module.exports = nextConfig;
```

上記はあくまで参考例である。

実際のFastAPIのルーティングに応じて転送先を変更すること。

既存のNext.js側に`/backend`というパスが存在する場合は、競合しない別のパスを使用する。

### API接続時の重要事項

ブラウザから以下のようなURLへ直接アクセスする構成は避ける。

```javascript
fetch("http://localhost:8000/api/users");
```

外部ユーザーのブラウザでは、`localhost`がユーザー自身のPCを指すため、CoreDeskのバックエンドにアクセスできない。

Rewritesを利用する場合は、ブラウザから相対URLでアクセスする。

```javascript
fetch("/backend/users");
```

ただし、Next.jsのサーバー側で実行する処理は、ブラウザ側と通信条件が異なる。

Server ComponentsやServer ActionsなどからFastAPIを呼び出す場合は、サーバー側の環境変数を利用する方法も含めて、適切な実装を判断すること。

**既存の認証処理やAPI通信を壊さないことを優先する。**

---

# 7. Cloudflare Tunnelの設定方針

## 7.1 Tunnelの接続先

Next.jsが3000番ポートで稼働する場合、以下の設定とする。

| 設定項目         | 設定値                                            |
| ------------ | ---------------------------------------------- |
| Tunnel名      | coredesk-tunnel                                |
| Subdomain    | coredesk                                       |
| Domain       | shinobuabe.com                                 |
| Service Type | HTTP                                           |
| Service URL  | [http://127.0.0.1:3000](http://127.0.0.1:3000) |

最終的な公開URL：

```text
https://coredesk.shinobuabe.com
```

FastAPIの8000番ポートは原則として外部に直接公開しない。

Next.jsを経由してAPIへアクセスさせる。

## 7.2 DNS設定

Cloudflare Tunnelの公開ホスト名を登録した際に、必要なDNSレコードが自動作成されるか確認する。

想定するDNSレコード：

| Type  | Name     | Target                       |
| ----- | -------- | ---------------------------- |
| CNAME | coredesk | TunnelのUUID.cfargotunnel.com |

Proxy statusはProxiedとする。

既存のDNSレコードとの競合がないことを確認する。

`shinobuabe.com`および`www.shinobuabe.com`の既存設定は変更しないこと。

---

# 8. Windows側の設定

## 8.1 cloudflaredのインストール

Windowsに`cloudflared`がインストールされているか確認する。

未インストールの場合は、以下のコマンドを使用する。

```powershell
winget install --id Cloudflare.cloudflared -e
```

バージョン確認：

```powershell
cloudflared --version
```

## 8.2 Windowsサービスとしての登録

Cloudflareの管理画面でTunnelを作成した後、表示されるWindows用のサービス登録コマンドを使用する。

コマンド形式：

```powershell
cloudflared.exe service install <TUNNEL_TOKEN>
```

実際のトークンはCloudflareの管理画面で取得する。

**Tunnel Tokenなどの認証情報をソースコード、GitHubリポジトリ、ログ、引き継ぎ文書に保存しないこと。**

サービス登録後は、Cloudflareの管理画面でTunnelが正常に接続されていることを確認する。

---

# 9. セキュリティ要件

CoreDeskはグループウェアであり、ユーザー情報や業務上の情報を扱う可能性がある。

試験公開であっても、外部からのアクセスに対する基本的なセキュリティ対策が必要である。

## 9.1 Cloudflare Access

試験公開中は、Cloudflare Accessを利用して、許可したユーザーだけがCoreDeskへアクセスできるようにすることを推奨する。

対象ドメイン：

```text
coredesk.shinobuabe.com
```

公開URLを知っているだけではアクセスできない構成を目指す。

Cloudflare Accessを設定する場合は、CoreDeskの認証機能との競合がないか確認すること。

## 9.2 FastAPIの公開範囲

FastAPIは原則として以下のアドレスで起動する。

```text
127.0.0.1:8000
```

不要な外部公開を避けるため、特別な理由がない限り`0.0.0.0`で待ち受ける構成にはしない。

Next.jsとFastAPIが同一Windows PCで動作することを前提とする。

## 9.3 環境変数

`.env`などの環境設定ファイルを調査し、以下の情報がGitHubにコミットされていないことを確認する。

* データベースの認証情報
* APIキー
* セッションの署名用シークレット
* JWTの署名用シークレット
* Cloudflare Tunnel Token

必要に応じて`.gitignore`を確認すること。

既に機密情報が公開されていた場合は、単にファイルから削除するだけでなく、該当する認証情報の変更も検討する。

## 9.4 試験公開時の注意事項

本番運用を開始するまでは、原則としてテスト用データを使用する。

公開前には最低限、次の点を確認すること。

* 未認証ユーザーによる保護対象ページへのアクセスが制限されていること。
* 他のユーザーの情報を不正に取得できないこと。
* APIの認証処理が正常に動作すること。
* Next.jsの開発サーバーをそのまま一般公開する構成にしないこと。
* FastAPIの`--reload`オプションを本番相当の運用では使用しないこと。

---

# 10. コスト要件

今回の試験公開では、追加のインフラ費用を原則として発生させないことを目標とする。

| 項目                    | 月額追加費用 |
| --------------------- | -----: |
| Cloudflare Free       |     0円 |
| Cloudflare Tunnel     |     0円 |
| 独自ドメイン                |   取得済み |
| Next.js               |     0円 |
| FastAPI               |     0円 |
| VPS                   |     不要 |
| Caddy / Nginx         |     不要 |
| **追加のCloudflare利用料金** | **0円** |

ドメインの更新費用、Windows PCの電気代、既存のインターネット回線費用は別途発生する。

今回は有料サービスへの移行や新規契約を前提としないこと。

---

# 11. Codexに依頼する具体的な作業

以下の順序で作業を進めること。

### フェーズ1：既存システムの調査

まず、現在のCoreDeskの構成を確認する。

調査対象：

* プロジェクト全体のディレクトリ構成
* Next.jsのバージョンと起動方法
* FastAPIのバージョンと起動方法
* Next.jsとFastAPIの接続方式
* データベースの種類と接続方法
* 現在の認証方式
* 環境変数の設定
* 既存の起動スクリプト
* GitHubの管理対象ファイル

調査結果に基づき、既存システムをできるだけ変更せずにCloudflare Tunnelへ接続する方法を決定する。

### フェーズ2：ローカル環境の動作確認

Next.jsとFastAPIをそれぞれ起動し、正常に動作することを確認する。

想定するローカルURL：

```text
Next.js
http://127.0.0.1:3000

FastAPI
http://127.0.0.1:8000
```

確認項目：

1. CoreDeskのログイン画面が表示される。
2. Next.jsからFastAPIへ正常にAPIリクエストが送信される。
3. ログイン処理が正常に動作する。
4. データベースとの通信が正常に動作する。
5. 主要な画面が正常に表示される。

FastAPIの起動時に過去の`Could not import module "main"`エラーが再発した場合は、原因を特定して修正すること。

### フェーズ3：外部公開への対応

既存のAPI通信を確認し、必要に応じてNext.jsのRewritesや環境変数を調整する。

`coredesk.shinobuabe.com`でアクセスした場合にも、API通信が正常に動作する構成にする。

また、必要な場合はNext.jsのビルド設定やFastAPIのプロキシ関連設定を見直すこと。

特に認証Cookie、HTTPSへのリダイレクト、ホスト名の取り扱いに注意する。

### フェーズ4：Cloudflare Tunnelの構築

Cloudflareの設定を実施する。

Tunnel名：

```text
coredesk-tunnel
```

公開ホスト名：

```text
coredesk.shinobuabe.com
```

接続先：

```text
http://127.0.0.1:3000
```

Cloudflareの管理画面上での操作が必要な場合は、実施する操作と設定値を明確に提示すること。

Codex側からCloudflareを操作できない場合は、Windows側の設定ファイルやコマンドの準備を進め、Cloudflare側で必要な操作を区別して報告すること。

### フェーズ5：外部アクセスの動作確認

以下のURLにアクセスし、CoreDeskが正常に動作することを確認する。

```text
https://coredesk.shinobuabe.com
```

確認項目：

1. HTTPSで正常に接続できる。
2. Next.jsの画面が正常に表示される。
3. JavaScriptやCSSが正常に読み込まれる。
4. FastAPIとの通信が正常に動作する。
5. ログイン・ログアウトが正常に動作する。
6. ページ遷移後も画面が正常に表示される。
7. 未認証ユーザーへのアクセス制限が正常に機能する。

外部アクセス時に発生するエラーについては、ブラウザの開発者ツール、Next.js、FastAPI、cloudflaredの各ログを確認して原因を調査すること。

---

# 12. 作業上の制約

今回の作業は、CoreDeskの機能追加や大規模なリファクタリングを目的とするものではない。

以下の方針を守ること。

**既存機能の維持**

現在動作している機能を壊さないこと。

Cloudflare Tunnelへの対応に必要な範囲でのみ、既存コードを変更する。

**データベースの保護**

既存データベースの初期化やデータ削除は行わないこと。

マイグレーションが必要な場合は、事前に既存データへの影響を確認すること。

**既存ドメインの保護**

`shinobuabe.com`で稼働している既存Webサイトや、その他のサブドメインには影響を与えないこと。

CoreDesk専用のサブドメインのみを対象とする。

**GitHubへの反映**

変更対象のファイルと変更内容を明確にすること。

認証情報やローカル環境固有の秘密情報をコミットしないこと。

---

# 13. Codexに求める成果物

今回の作業が完了した段階で、以下を報告すること。

| 成果物          | 内容                        |
| ------------ | ------------------------- |
| システム構成の調査結果  | Next.js、FastAPI、DBの実際の構成  |
| 変更ファイル一覧     | 変更したファイルと変更理由             |
| 起動手順         | WindowsでCoreDeskを起動するコマンド |
| Cloudflare設定 | Tunnel、DNS、接続先の設定内容       |
| 動作確認結果       | ローカルおよび外部公開時の確認結果         |
| 未解決事項        | 残っている問題や必要な追加作業           |

必要に応じて、プロジェクト内にCloudflare Tunnelによる公開手順を記載したMarkdownファイルを作成すること。

想定するファイル名：

```text
docs/cloudflare-tunnel-setup.md
```

既に同等のドキュメントが存在する場合は、重複して作成する必要はない。

---

# 14. 現時点での進捗と未確認事項

ChatGPTとの会話では、Cloudflare Tunnelによる公開方針と目標構成を決定した。

ただし、実際の設定や実装については、以下の状態である。

| 項目                      | 現在の状態 |
| ----------------------- | ----- |
| CoreDeskの名称決定           | 完了    |
| Next.jsの採用              | 確定    |
| FastAPIの採用              | 確定    |
| 独自ドメインの取得               | 完了    |
| Cloudflareでのドメイン管理      | 確認済み  |
| 公開サブドメインの決定             | 完了    |
| ソースコードの構成確認             | 未実施   |
| Next.jsとFastAPIの接続方式の確認 | 未実施   |
| Cloudflare Tunnelの作成    | 未確認   |
| cloudflaredのインストール      | 未確認   |
| CloudflareのDNS設定        | 未確認   |
| 外部公開の動作確認               | 未実施   |

過去の会話で説明した設定例は、実際に適用・動作確認したものではない。

Codexは、設定が完了していると仮定せず、実際の開発環境を確認すること。

---

## 15. Codexへの最終指示

**CoreDeskを、既存のWindows 11開発環境からCloudflare Tunnel経由で公開できる状態にしてください。**

公開先は以下とします。

```text
https://coredesk.shinobuabe.com
```

フロントエンドはNext.js、バックエンドはFastAPIです。

まず既存のソースコードを調査し、Next.jsとFastAPIの実際のディレクトリ構成、起動方法、API通信方式を特定してください。

その後、既存コードへの変更を最小限に抑えながら、Cloudflare Tunnelで公開できるように設定してください。

Cloudflareの管理画面でユーザー自身が操作する必要がある場合は、設定項目と入力値を具体的に示してください。

作業は調査から着手し、ローカルでの動作確認、外部公開への対応、Cloudflare Tunnelの設定、外部アクセスの確認という順序で進めてください。

**今回の目的は、新しいインフラを構築し直すことではなく、現在開発しているCoreDeskを、追加の月額インフラ費用をかけずに試験公開することです。**

既存機能・データベース・認証機能を維持することを優先してください。

---

**以上が、Codexへの引き継ぎ内容です。**

この文書をCodexに渡し、CoreDeskのプロジェクトディレクトリを開いた状態で作業を開始すれば、これまでの会話内容を改めて説明することなく、既存コードの調査からCloudflare Tunnelによる公開作業へ進められます。
