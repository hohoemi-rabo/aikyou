# 00 — 開発チケット一覧・全体方針

「あいきょう / AI Kyou」Phase 1 (MVP) の実装チケット索引。詳細仕様は [`REQUIREMENTS.md`](../REQUIREMENTS.md)、実装規約は [`CLAUDE.md`](../CLAUDE.md) を参照（こちらが優先）。

## Todo の運用ルール

- 各チケットの Todo は `- [ ]`（未完）で記述する。
- 完了したら `- [ ]` を **`- [×]`** に書き換える（`- [x]` ではなく全角の `×`）。
- チケット内の全 Todo が `- [×]` になったらそのチケットは完了。

## チケット一覧と推奨実装順

依存関係の浅い順に並べてある。上から進めるのが安全。

| No. | チケット | 概要 |
|-----|----------|------|
| 01 | [基盤・SDKクライアント](./01-setup-and-clients.md) | 依存追加・環境変数・Supabase / Anthropic クライアント |
| 02 | [データモデル (Supabase)](./02-data-model-supabase.md) | `playthroughs` テーブル・型定義・初期 state |
| 03 | [攻略ナレッジ読み込み](./03-knowledge-loader.md) | `knowledge/dq3-fc/` 全件連結・決定的ソート・メモリキャッシュ |
| 04 | [システムプロンプト構築](./04-system-prompt.md) | state 整形＋ナレッジ＋プロンプトキャッシュの順序固定 |
| 05 | [POST /api/chat](./05-api-chat.md) | 会話エンドポイント |
| 06 | [POST /api/end-session](./06-api-end-session.md) | state 更新（防御的 JSON パース） |
| 07 | [プレイスルー一覧・新規作成 (`/`)](./07-playthrough-list.md) | 一覧表示・新規作成 |
| 08 | [セッション画面 (`/play/[id]`)](./08-session-screen.md) | あらすじ表示＋チャット UI |

## 全体の前提（CLAUDE.md / REQUIREMENTS.md より）

- **自分専用ツール。** 認証なし・マルチユーザーなし・デプロイなし（ローカルで動けばよい）。
- **継続性は `state` JSON が担う。** 会話履歴はセッション中のクライアントメモリのみ（リロードで消えてよい）。
- **モデルは Claude Haiku 4.5** (`claude-haiku-4-5-20251001`)。例外: `/api/end-session` のみ JSON 崩れが頻発する場合に Sonnet 4.6 (`claude-sonnet-4-6`) へ引き上げ可。
- **`ANTHROPIC_API_KEY` はサーバ専用。** Anthropic 呼び出しは必ず API Route 経由。`NEXT_PUBLIC_` を付けない。
- **攻略ナレッジはプロンプトに丸ごと貼る。** RAG・検索・埋め込みは作らない。
- **FC版(1988)の内容のみ。** SFC/GBC/スマホ/HD-2D の情報を混ぜない。
- **エラーは握りつぶさず画面に出す。**

## やらないこと（先読み実装禁止 / REQUIREMENTS.md §4.2・§9）

認証・STT/TTS・ペルソナ設定UI・YouTubeログ書き出し・複数ゲーム汎用化・RAG/ベクトルDB・凝ったデザイン/アニメ/レスポンシブ・会話履歴の全文DB保存。
