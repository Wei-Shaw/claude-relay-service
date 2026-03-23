# Claude Relay Service

> [!CAUTION]
> **セキュリティアップデート**: v1.1.248以下には、管理パネルへの不正アクセスを許す重大な管理者認証バイパス脆弱性が含まれています。
>
> **直ちにv1.1.249以上にアップデートしてください**。または次世代プロジェクト **[CRS 2.0 (sub2api)](https://github.com/Wei-Shaw/sub2api)** への移行をご検討ください。

<div align="center">

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![Redis](https://img.shields.io/badge/Redis-6+-red.svg)](https://redis.io/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue.svg)](https://www.docker.com/)

**🔐 マルチアカウント管理対応のセルフホスト型 Claude API リレーサービス**

[中文文档](README.md) • [English](README_EN.md) • [プレビュー](https://demo.pincc.ai/admin-next/login) • [Telegram チャンネル](https://t.me/claude_relay_service)

</div>

---

## ⭐ 役に立ったら Star をお願いします！

> オープンソースの維持は大変です。あなたの Star が更新を続けるモチベーションになります 🚀
> 最新情報は [Telegram チャンネル](https://t.me/claude_relay_service) をご覧ください

---

## ⚠️ 重要な注意事項

**本プロジェクトを使用する前に必ずお読みください：**

🚨 **利用規約リスク**: 本プロジェクトの使用は Anthropic の利用規約に違反する可能性があります。使用前に Anthropic のユーザー規約を十分にお読みください。本プロジェクトの使用によるすべてのリスクはユーザー自身が負うものとします。

📖 **免責事項**: 本プロジェクトは技術的な学習・研究目的のみに提供されています。本プロジェクトの使用によるアカウント停止、サービス中断、その他の損害について、作者は一切の責任を負いません。

## 🤔 このプロジェクトはあなたに適していますか？

- 🌍 **地域制限**: お住まいの地域から Claude Code サービスに直接アクセスできませんか？
- 🔒 **プライバシーの懸念**: サードパーティのミラーサービスが会話内容を記録・漏洩することが心配ですか？
- 👥 **コスト分担**: 友人と Claude Code Max のサブスクリプション費用を分担したいですか？
- ⚡ **安定性の問題**: サードパーティのミラーサイトが頻繁にダウンし、効率に影響していませんか？

これらの悩みがある方には、本プロジェクトが適しているかもしれません。

### 適しているケース

✅ **友人とのコスト分担**: 3〜5人の友人で Claude Code Max サブスクリプションを共有し、Opus を自由に利用
✅ **プライバシー重視**: サードパーティのミラーに会話内容を見られたくない
✅ **技術好き**: 基本的な技術スキルがあり、自分で構築・メンテナンスする意欲がある
✅ **安定性が必要**: 長期的に安定した Claude アクセスが必要で、ミラーサイトに制限されたくない
✅ **地域制限**: Claude 公式サービスに直接アクセスできない

### 適していないケース

❌ **完全な初心者**: 技術がまったくわからず、サーバーの購入方法も知らない
❌ **たまに使う程度**: 月に数回しか使わないなら、手間をかける価値がない
❌ **登録の問題**: 自分で Claude アカウントを登録できない
❌ **支払いの問題**: Claude Code を購読する支払い方法がない

**プライバシー要件が低く、気軽に Claude を体験したいだけの一般ユーザーであれば、信頼できるミラーサイトを利用する方が適しています。**

---

## 💭 なぜ自分で構築するのか？

### 既存ミラーサイトの潜在的な問題

- 🕵️ **プライバシーリスク**: 会話内容が他者に完全に見える状態になり、機密情報の漏洩につながる
- 🐌 **パフォーマンスの不安定さ**: 利用者が多いと遅くなり、ピーク時には頻繁にクラッシュする
- 💰 **料金の不透明さ**: 実際のコストがわからない

### セルフホスティングのメリット

- 🔐 **データセキュリティ**: すべての API リクエストが自分のサーバーのみを経由し、Anthropic API に直接接続
- ⚡ **制御可能なパフォーマンス**: 少人数での利用なので、Max $200 プランで Opus をほぼ自由に利用可能
- 💰 **コストの透明性**: トークン使用量が明確に把握でき、公式価格で具体的なコストを算出
- 📊 **完全なモニタリング**: 使用統計、コスト分析、パフォーマンス監視がすべて利用可能

---

## 🚀 主な機能

> 📸 **[インターフェースプレビューはこちら](docs/preview.md)** - Web 管理インターフェースの詳細なスクリーンショット

### 基本機能
- ✅ **マルチアカウント管理**: 複数の Claude アカウントを追加し、自動ローテーション
- ✅ **カスタム API キー**: 各ユーザーに独立したキーを割り当て
- ✅ **使用統計**: 各ユーザーのトークン使用量を詳細に記録

### 高度な機能
- 🔄 **スマート切り替え**: アカウントに問題が発生した場合、自動的に次のアカウントに切り替え
- 🚀 **パフォーマンス最適化**: コネクションプーリング、キャッシュによるレイテンシ削減
- 📊 **監視ダッシュボード**: Web インターフェースですべてのデータを確認
- 🛡️ **セキュリティ制御**: アクセス制限、レート制限
- 🌐 **プロキシ対応**: HTTP/SOCKS5 プロキシをサポート

---

## 📋 デプロイ要件

### ハードウェア要件（最小構成）
- **CPU**: 1コアで十分
- **メモリ**: 512MB（1GB推奨）
- **ストレージ**: 30GB の空き容量
- **ネットワーク**: Anthropic API にアクセス可能（米国リージョンのサーバー推奨）
- **推奨**: 2コア4GBあれば基本的に十分。回線品質の良いサーバーを選択してください（速度向上のため、プロキシ不使用またはサーバーIPへの直接接続を推奨）

### ソフトウェア要件
- **Node.js** 18 以上
- **Redis** 6 以上
- **OS**: Linux 推奨

### コスト目安
- **サーバー**: 軽量クラウドサーバー、月額 $5〜10
- **Claude サブスクリプション**: コスト分担方法による
- **その他**: ドメイン名（任意）

---

## 📦 手動デプロイ

### ステップ 1: 環境構築

**Ubuntu/Debian ユーザー：**
```bash
# Node.js のインストール
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Redis のインストール
sudo apt update
sudo apt install redis-server
sudo systemctl start redis-server
```

**CentOS/RHEL ユーザー：**
```bash
# Node.js のインストール
curl -fsSL https://rpm.nodesource.com/setup_18.x | sudo bash -
sudo yum install -y nodejs

# Redis のインストール
sudo yum install redis
sudo systemctl start redis
```

### ステップ 2: ダウンロードと設定

```bash
# プロジェクトのダウンロード
git clone https://github.com/Wei-Shaw/claude-relay-service.git
cd claude-relay-service

# 依存関係のインストール
npm install

# 設定ファイルのコピー（重要！）
cp config/config.example.js config/config.js
cp .env.example .env
```

### ステップ 3: 設定ファイルの編集

**`.env` ファイルの編集：**
```bash
# この2つのキーはランダムに生成してください（必ず控えておくこと）
JWT_SECRET=your-super-secret-key
ENCRYPTION_KEY=32文字の暗号化キーをランダムに入力

# Redis 設定
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

**`config/config.js` ファイルの編集：**
```javascript
module.exports = {
  server: {
    port: 3000,          // サービスポート（変更可能）
    host: '0.0.0.0'     // 変更しないでください
  },
  redis: {
    host: '127.0.0.1',  // Redis アドレス
    port: 6379          // Redis ポート
  },
  // その他の設定はデフォルトのまま
}
```

### ステップ 4: サービスの起動

```bash
# 初期化
npm run setup # 管理者アカウントのパスワード情報がランダムに生成され、data/init.json に保存されます

# サービスの起動
npm run service:start:daemon   # バックグラウンド実行（推奨）

# ステータスの確認
npm run service:status
```

---

## 🎮 使い方

### 1. 管理画面を開く

ブラウザでアクセス: `http://サーバーIP:3000/web`

デフォルトの管理者アカウント: data/init.json を確認してください

### 2. Claude アカウントの追加

このステップは非常に重要で、OAuth 認可が必要です：

1. 「Claude アカウント」タブをクリック
2. 複数アカウントが同一 IP を共有することによる BAN を心配する場合、オプションで静的プロキシ IP を設定可能
3. 「アカウント追加」をクリック
4. 「認可リンクを生成」をクリックすると新しいページが開きます
5. 新しいページで Claude のログインと認可を完了
6. 返された認可コードをコピー
7. ページに貼り付けて追加を完了

**注意**: 中国からの場合、このステップには VPN が必要な場合があります。

### 2.1 一時停止（503/5xx）とアカウントレベルの TTL オーバーライド

上流エラーが発生した場合、ルーターはアカウントを一時的に停止できます。グローバルのデフォルト値は `.env.example` で制御されます：

- `UPSTREAM_ERROR_503_TTL_SECONDS`
- `UPSTREAM_ERROR_5XX_TTL_SECONDS`
- `UPSTREAM_ERROR_OVERLOAD_TTL_SECONDS`
- `UPSTREAM_ERROR_AUTH_TTL_SECONDS`
- `UPSTREAM_ERROR_TIMEOUT_TTL_SECONDS`

**Claude 公式 OAuth アカウント**の場合、管理画面でアカウントごとにポリシーをオーバーライドできます：

- `このアカウントの一時クールダウンを無効にする`: このアカウントの 503/5xx 一時停止をスキップ
- `503 クールダウン秒数`: 空 = グローバルデフォルトに従う、`0` = このアカウントの 503 クールダウンを無効化
- `5xx クールダウン秒数`: 空 = グローバルデフォルトに従う、`0` = このアカウントの 5xx クールダウンを無効化

優先順位（高→低）：

1. アカウントレベルの「一時クールダウンを無効にする」
2. アカウントレベルの 503/5xx クールダウンオーバーライド
3. 呼び出し時のカスタム TTL（指定された場合）
4. グローバル環境変数のデフォルト TTL

アカウント一覧の「ルーティングブロック理由」には、エラータイプ、HTTP ステータス、合計クールダウン時間、残り時間、復帰時間が表示されます。「ステータスリセット」で異常状態をクリアし、ルーティング対象に復帰させることができます。

### 3. API キーの作成

各ユーザーにキーを割り当てます：

1. 「API キー」タブをクリック
2. 「新規キーを作成」をクリック
3. キーに名前を付ける（例：「田中さんのキー」）
4. 使用制限を設定（任意）
5. 保存し、生成されたキーをメモ

### 4. Claude Code と Gemini CLI の利用開始

公式 API を自分のサービスに置き換えて使用できます：

**Claude Code の環境変数設定：**

デフォルトでは標準の Claude アカウントプールを使用します：

```bash
export ANTHROPIC_BASE_URL="http://127.0.0.1:3000/api/" # サーバーのIPアドレスまたはドメインを入力
export ANTHROPIC_AUTH_TOKEN="管理画面で作成したAPIキー"
```

**VSCode Claude プラグインの設定：**

VSCode Claude プラグインを使用する場合、`~/.claude/config.json` に設定します：

```json
{
    "primaryApiKey": "crs"
}
```

ファイルが存在しない場合は手動で作成してください。Windows ユーザーのパスは `C:\Users\ユーザー名\.claude\config.json` です。

**Gemini CLI の環境変数設定：**

**方法1（推奨）: Gemini Assist API 経由**

各アカウントで1日1000リクエスト、1分間60リクエストの無料枠を利用できます。

```bash
CODE_ASSIST_ENDPOINT="http://127.0.0.1:3000/gemini"  # サーバーのIPアドレスまたはドメインを入力
GOOGLE_CLOUD_ACCESS_TOKEN="管理画面で作成したAPIキー"
GOOGLE_GENAI_USE_GCA="true"
GEMINI_MODEL="gemini-2.5-pro"
```

> **注意**: gemini-cli のコンソールに `Failed to fetch user info: 401 Unauthorized` と表示されますが、使用には影響しません。

**方法2: Gemini API 経由**

無料枠が非常に限られており、429 エラーが発生しやすいです。

```bash
GOOGLE_GEMINI_BASE_URL="http://127.0.0.1:3000/gemini"  # サーバーのIPアドレスまたはドメインを入力
GEMINI_API_KEY="管理画面で作成したAPIキー"
GEMINI_MODEL="gemini-2.5-pro"
```

**Claude Code の利用：**

```bash
claude
```

**Gemini CLI の利用：**

```bash
gemini
```

---

## 🔧 日常メンテナンス

### サービス管理

```bash
# サービスステータスの確認
npm run service:status

# ログの表示
npm run service:logs

# サービスの再起動
npm run service:restart:daemon

# サービスの停止
npm run service:stop
```

### 使用状況の監視

- **Web インターフェース**: `http://ドメイン:3000/web` - 使用統計の確認
- **ヘルスチェック**: `http://ドメイン:3000/health` - サービスの正常性確認
- **ログファイル**: `logs/` ディレクトリ内の各種ログファイル

### アップグレードガイド

新バージョンがリリースされた場合、以下の手順でサービスをアップグレードします：

```bash
# 1. プロジェクトディレクトリに移動
cd claude-relay-service

# 2. 最新コードを取得
git pull origin main

# package-lock.json のコンフリクトが発生した場合、リモート版を使用
git checkout --theirs package-lock.json
git add package-lock.json

# 3. 新しい依存関係のインストール（必要な場合）
npm install

# 4. サービスの再起動
npm run service:restart:daemon

# 5. サービスステータスの確認
npm run service:status
```

**重要な注意事項：**
- アップグレード前に重要な設定ファイル（.env、config/config.js）のバックアップを推奨
- 破壊的変更がないか変更ログを確認してください
- データベース構造の変更は必要に応じて自動的にマイグレーションされます

### よくある問題の解決

**Redis に接続できない場合：**
```bash
# Redis が実行中か確認
redis-cli ping

# PONG と返ってくれば正常
```

**OAuth 認可に失敗した場合：**
- プロキシ設定が正しいか確認
- claude.ai に正常にアクセスできることを確認
- ブラウザのキャッシュをクリアして再試行

**API リクエストが失敗した場合：**
- API キーが正しいか確認
- ログファイルでエラー情報を確認
- Claude アカウントのステータスが正常か確認

---

## 🛠️ 高度な使い方

### リバースプロキシデプロイガイド

本番環境では、自動 HTTPS、セキュリティヘッダー、パフォーマンス最適化のためにリバースプロキシの使用を推奨します。以下に一般的な2つのソリューションを紹介します：**Caddy** と **Nginx Proxy Manager (NPM)**。

---

## Caddy ソリューション

Caddy は HTTPS 証明書を自動管理する Web サーバーで、設定がシンプルかつ高性能です。Docker 環境を使用しないデプロイに最適です。

**1. Caddy のインストール**

```bash
# Ubuntu/Debian
sudo apt install -y debian-keyring debian-archive-keyring apt-transport-https
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update
sudo apt install caddy

# CentOS/RHEL/Fedora
sudo yum install yum-plugin-copr
sudo yum copr enable @caddy/caddy
sudo yum install caddy
```

**2. Caddy の設定**

`/etc/caddy/Caddyfile` を編集：

```caddy
your-domain.com {
    # ローカルサービスへのリバースプロキシ
    reverse_proxy 127.0.0.1:3000 {
        # ストリーミングレスポンス / SSE 対応
        flush_interval -1

        # 実際の IP を転送
        header_up X-Real-IP {remote_host}
        header_up X-Forwarded-For {remote_host}
        header_up X-Forwarded-Proto {scheme}

        # 長時間の読み書きタイムアウト設定
        transport http {
            read_timeout 300s
            write_timeout 300s
            dial_timeout 30s
        }
    }

    # セキュリティヘッダー
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains"
        X-Frame-Options "DENY"
        X-Content-Type-Options "nosniff"
        -Server
    }
}
```

**3. Caddy の起動**

```bash
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl start caddy
sudo systemctl enable caddy
sudo systemctl status caddy
```

**4. サービス設定**

Caddy が自動的に HTTPS を管理するため、サービスをローカルのみでリッスンするよう制限できます：

```javascript
// config/config.js
module.exports = {
  server: {
    port: 3000,
    host: '127.0.0.1' // ローカルのみでリッスン
  }
}
```

**Caddy の特徴**

* 🔒 ゼロ設定の証明書管理による自動 HTTPS
* 🛡️ モダンな TLS スイートによるセキュアなデフォルト設定
* ⚡ HTTP/2 とストリーミングのサポート
* 🔧 簡潔な設定ファイル、メンテナンスが容易

---

## Nginx Proxy Manager (NPM) ソリューション

Nginx Proxy Manager はグラフィカルインターフェースでリバースプロキシと HTTPS 証明書を管理します。Docker コンテナとしてデプロイされます。

**1. NPM で新しいプロキシホストを作成**

Details を以下のように設定します：

| 項目                  | 設定                        |
| --------------------- | --------------------------- |
| Domain Names          | relay.example.com           |
| Scheme                | http                        |
| Forward Hostname / IP | 192.168.0.1（Docker ホスト IP） |
| Forward Port          | 3000                        |
| Block Common Exploits | ☑️                          |
| Websockets Support    | ❌ **無効**                  |
| Cache Assets          | ❌ **無効**                  |
| Access List           | Publicly Accessible         |

> 注意：
> - Claude Relay Service が **`0.0.0.0`、コンテナ IP、またはホスト IP でリッスン**していることを確認し、NPM 内部ネットワーク接続を許可してください。
> - **Websockets Support と Cache Assets は必ず無効にしてください**。有効にすると SSE / ストリーミングレスポンスが失敗します。

**2. Custom locations**

内容不要、空のままにしてください。

**3. SSL 設定**

* **SSL Certificate**: 新しい SSL 証明書をリクエスト（Let's Encrypt）または既存の証明書を使用
* ☑️ **Force SSL**
* ☑️ **HTTP/2 Support**
* ☑️ **HSTS Enabled**
* ☑️ **HSTS Subdomains**

**4. 高度な設定**

Custom Nginx Configuration に以下を追加：

```nginx
# 実際のユーザー IP を転送
proxy_set_header X-Real-IP $remote_addr;
proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
proxy_set_header X-Forwarded-Proto $scheme;

# WebSocket / SSE ストリーミング対応
proxy_http_version 1.1;
proxy_set_header Upgrade $http_upgrade;
proxy_set_header Connection "upgrade";
proxy_buffering off;

# 長時間接続 / タイムアウト設定（AI チャットストリーミング用）
proxy_read_timeout 300s;
proxy_send_timeout 300s;
proxy_connect_timeout 30s;

# ---- セキュリティ設定 ----
# 厳格な HTTPS ポリシー（HSTS）
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;

# クリックジャッキングとコンテンツスニッフィングの防止
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;

# リファラー / パーミッション制限ポリシー
add_header Referrer-Policy "no-referrer-when-downgrade" always;
add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

# サーバー情報の非表示（Caddy の `-Server` に相当）
proxy_hide_header Server;

# ---- パフォーマンスチューニング ----
# リアルタイムレスポンス用のプロキシキャッシュ無効化（SSE / Streaming）
proxy_cache_bypass $http_upgrade;
proxy_no_cache $http_upgrade;
proxy_request_buffering off;
```

**5. 起動と確認**

* 保存後、NPM が自動的に Let's Encrypt 証明書をリクエストするのを待ちます（該当する場合）。
* ダッシュボードでプロキシホストのステータスが「Online」であることを確認します。
* `https://relay.example.com` にアクセスし、緑色の鍵アイコンが表示されれば HTTPS は正常に動作しています。

**NPM の特徴**

* 🔒 証明書の自動申請と更新
* 🔧 グラフィカルインターフェースで複数サービスの管理が容易
* ⚡ ネイティブ HTTP/2 / HTTPS サポート
* 🚀 Docker コンテナデプロイに最適

---

どちらのソリューションも本番デプロイに適しています。Docker 環境を使用する場合は **Nginx Proxy Manager がより便利**です。ソフトウェアを軽量かつ自動化したい場合は **Caddy がより良い選択**です。

---

## 💡 利用上の推奨事項

### アカウント管理
- **定期チェック**: 週に一度アカウントのステータスを確認し、異常があれば迅速に対処
- **適切な割り当て**: ユーザーごとに異なる API キーを割り当て、API キー別に使用状況を分析可能

### セキュリティに関する推奨事項
- **HTTPS の使用**: Caddy リバースプロキシ（自動 HTTPS）の使用を強く推奨し、データ転送のセキュリティを確保
- **定期バックアップ**: 重要な設定とデータのバックアップ
- **ログの監視**: 定期的に例外ログを確認
- **キーの更新**: JWT キーと暗号化キーを定期的に変更
- **ファイアウォール設定**: 必要なポート（80、443）のみ開放し、サービスの直接ポートは非公開に

---

## 🆘 問題が発生した場合

### セルフトラブルシューティング
1. **ログの確認**: `logs/` ディレクトリのログファイルを確認
2. **設定の確認**: 設定ファイルが正しく設定されているか確認
3. **接続テスト**: curl で API が正常か確認
4. **サービスの再起動**: 再起動で解決する場合もある

### サポートを求める
- **GitHub Issues**: 詳細なエラー情報を添えて投稿
- **ドキュメントの確認**: エラーメッセージとドキュメントを注意深く確認
- **コミュニティでの議論**: 同様の問題に遭遇した人がいないか確認

---

## 📄 ライセンス
本プロジェクトは [MIT ライセンス](LICENSE) の下で提供されています。

---

<div align="center">

**⭐ 役に立ったら Star をお願いします。それが作者にとって最大の励みです！**

**🤝 問題があれば Issues を投稿してください。改善提案の PR も大歓迎です**

</div>
