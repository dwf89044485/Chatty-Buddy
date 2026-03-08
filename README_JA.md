<img src="docs/icon-readme.png" width="32" height="32" alt="CodePilot" style="vertical-align: middle; margin-right: 8px;" /> CodePilot
===

**Claude Code の統合デスクトップクライアント** -- マルチプロバイダー対応、MCP 拡張、カスタムスキル、クロスプラットフォーム Bridge、プロジェクトを理解するアシスタントワークスペース。

[![GitHub release](https://img.shields.io/github/v/release/op7418/CodePilot)](https://github.com/op7418/CodePilot/releases)
[![Platform](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-lightgrey)](https://github.com/op7418/CodePilot/releases)
[![License](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

[English](./README.md) | [中文文档](./README_CN.md)

![CodePilot](docs/screenshot.png)

---

[ダウンロード](#プラットフォームとインストール) | [クイックスタート](#クイックスタート) | [ドキュメント](#ドキュメント) | [コントリビュート](#コントリビュート) | [コミュニティ](#コミュニティ)

---

## Why CodePilot

**Multi-provider, one interface.** Connect to Anthropic, OpenRouter, Bedrock, Vertex, or any custom endpoint. Switch providers and models mid-conversation without losing context.

**MCP + Skills extensibility.** Add MCP servers (stdio / sse / http) with runtime status monitoring. Define reusable prompt-based skills and invoke them as slash commands. Browse community skills from skills.sh.

**Control from anywhere.** Bridge connects CodePilot to Telegram, Feishu, Discord, and QQ. Send a message from your phone, get the response on your desktop.

**An assistant that knows your project.** The .assistant workspace stores persona files, onboarding flows, daily check-ins, and persistent memory.

**Built for daily use.** Pause, resume, and rewind sessions. Split-screen dual conversations. Token usage tracking. CLI session import. Dark and light themes.

---

## クイックスタート

### パス A: リリース版をダウンロード（ほとんどのユーザー向け）

1. Claude Code CLI をインストール: `npm install -g @anthropic-ai/claude-code`
2. 認証: `claude login`
3. [Releases](https://github.com/op7418/CodePilot/releases) ページからプラットフォームに合ったインストーラーをダウンロード
4. CodePilot を起動

### パス B: ソースからビルド（開発者向け）

| 前提条件 | 最小バージョン |
|---|---|
| Node.js | 18+ |
| Claude Code CLI | インストール済みおよび認証済み |
| npm | 9+ (Node 18 に付属) |

```bash
git clone https://github.com/op7418/CodePilot.git
cd CodePilot
npm install
npm run dev              # ブラウザモード http://localhost:3000
# -- または --
npm run electron:dev     # フルデスクトップアプリ
```

---

## 初回起動

1. **Claude を認証** -- ターミナルで `claude login` を実行。
2. **プロバイダーを設定** -- 設定 > Providers で API キーを追加するか、CLI のデフォルト認証を使用。
3. **会話を作成** -- 作業ディレクトリ、モード（Code / Plan / Ask）、モデルを選択。
4. **Assistant Workspace を設定**（任意）-- .assistant ディレクトリで Onboarding、デイリーチェックイン、ペルソナファイルを有効化。
5. **MCP サーバーを追加**（任意）-- エクステンションページで外部ツールやサービスを接続。

---

## コア機能

### 会話とコーディング

| 機能 | 詳細 |
|---|---|
| インタラクションモード | Code / Plan / Ask |
| 推論レベル | Low / Medium / High / Max + Thinking モード |
| 権限制御 | Default / Full Access、アクション単位の承認 |
| セッション制御 | 一時停止、再開、チェックポイントへの巻き戻し、アーカイブ |
| モデル切り替え | 会話中にモデルを変更 |
| スプリットスクリーン | 2 つのセッションを並べて表示 |
| 添付ファイル | ファイルと画像、マルチモーダルビジョン対応 |
| スラッシュコマンド | /help /clear /cost /compact /doctor /review など |

### 拡張と統合

| 機能 | 詳細 |
|---|---|
| プロバイダー | Anthropic / OpenRouter / Bedrock / Vertex / カスタムエンドポイント |
| MCP サーバー | stdio / sse / http、ランタイム状態監視 |
| スキル | カスタム / プロジェクト / グローバルスキル、skills.sh マーケットプレイス |
| Bridge | Telegram / Feishu / Discord / QQ リモート制御 |
| CLI インポート | Claude Code CLI .jsonl セッション履歴のインポート |
| 画像生成 | Gemini / Anthropic 画像生成、バッチタスク、ギャラリー |

### データとワークスペース

| 機能 | 詳細 |
|---|---|
| Assistant Workspace | .assistant ディレクトリ、ペルソナ、Onboarding、チェックイン、メモリ |
| ファイルブラウザ | プロジェクトファイルツリー、シンタックスハイライトプレビュー |
| 使用量分析 | トークン数、コスト見積もり、日次使用量チャート |
| ローカルストレージ | SQLite（WAL モード）、全データはローカルに保存 |
| i18n | English + Chinese |
| テーマ | ダーク / ライト、ワンクリック切り替え |

---

## プラットフォームとインストール

| プラットフォーム | フォーマット | アーキテクチャ |
|---|---|---|
| macOS | .dmg | arm64 (Apple Silicon) + x64 (Intel) |
| Windows | .exe (NSIS) | x64 + arm64 |
| Linux | .AppImage / .deb / .rpm | x64 + arm64 |

[Releases](https://github.com/op7418/CodePilot/releases) ページからダウンロードしてください。

CodePilot はまだコード署名されていないため、初回起動時に OS がセキュリティ警告を表示します。

<details>
<summary>macOS:「Apple はこのソフトウェアを確認できません」</summary>

**オプション 1** -- Finder で `CodePilot.app` を右クリック > 開く > 確認。

**オプション 2** -- システム設定 > プライバシーとセキュリティ > セキュリティまでスクロール >「このまま開く」をクリック。

**オプション 3** -- ターミナルで実行:
```bash
xattr -cr /Applications/CodePilot.app
```
</details>

<details>
<summary>Windows: SmartScreen がインストーラーをブロック</summary>

**オプション 1** -- SmartScreen ダイアログで「詳細情報」をクリック、次に「実行を続ける」。

**オプション 2** -- 設定 > アプリ > 詳細アプリ設定 > アプリインストール制御をどこからでも許可に設定。
</details>

---

## ドキュメント

- [ARCHITECTURE.md](./ARCHITECTURE.md) -- アーキテクチャ、テックスタック、ディレクトリ構成、データフロー
- [docs/handover/](./docs/handover/) -- 設計決定、引き継ぎドキュメント
- [docs/exec-plans/](./docs/exec-plans/) -- 実行計画、技術的負債トラッカー

---

## コミュニティ

- [GitHub Issues](https://github.com/op7418/CodePilot/issues) -- バグ報告と機能リクエスト
- [GitHub Discussions](https://github.com/op7418/CodePilot/discussions) -- 質問と一般的なディスカッション

---

## コントリビュート

1. リポジトリをフォークしてフィーチャーブランチを作成
2. `npm install` と `npm run electron:dev` でローカル開発
3. PR を開く前に `npm run test` を実行
4. `main` に対して明確な説明付きの PR を提出

PR はフォーカスを保つ -- 1 つのフィーチャーまたは修正ごとに 1 つの PR。

<details>
<summary>開発コマンド</summary>

```bash
npm run dev                    # Next.js 開発サーバー（ブラウザ）
npm run electron:dev           # フル Electron アプリ（開発モード）
npm run build                  # 本番ビルド
npm run electron:build         # Electron 配布ファイルをビルド
npm run electron:pack:mac      # macOS DMG (arm64 + x64)
npm run electron:pack:win      # Windows NSIS インストーラー
npm run electron:pack:linux    # Linux AppImage, deb, rpm
```

**CI/CD:** `v*` タグをプッシュすると、全プラットフォームビルドが自動的にトリガーされ、GitHub Release が作成されます。

**メモ:**
- Electron は `127.0.0.1` 上で Next.js スタンドアロンサーバーをフォークし、ランダムなフリーポートで接続
- チャットデータは `~/.codepilot/codepilot.db`（開発モード: `./data/`）に保存
- SQLite は WAL モードを使用し、同時読み込みが高速
</details>

---

## ライセンス

MIT
