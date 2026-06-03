# 01 — 基盤・SDKクライアント

## 目的

依存パッケージを追加し、環境変数と Supabase / Anthropic のサーバ側クライアントを用意する。以降のチケットの土台。

## 背景

`package.json` には現状 `next` / `react` のみ。`@anthropic-ai/sdk` と `@supabase/supabase-js` は未インストール。Next.js は 15.5.x（App Router）。

## 対象ファイル

- `package.json`（依存追加）
- `.env.local`（git 管理外）/ `.env.example`（コミット用の雛形）
- `src/lib/supabase.ts`（サーバ用クライアント）
- `src/lib/anthropic.ts`（Anthropic クライアント＋モデル定数）

## Todo

- [×] `@anthropic-ai/sdk` と `@supabase/supabase-js` を `npm install` で追加（lockファイルもコミット）
- [×] `.env.example` を作成：`ANTHROPIC_API_KEY` / `SUPABASE_URL` / `SUPABASE_ANON_KEY` を記載
- [×] `.env.local` を用意し、`.gitignore` に含まれていることを確認（秘密値はコミットしない）
- [×] `src/lib/anthropic.ts`：`Anthropic` クライアントを生成し、`MODEL_CHAT = 'claude-haiku-4-5-20251001'`、`MODEL_END_SESSION` 定数（既定 Haiku、必要時 Sonnet）をエクスポート
- [×] `src/lib/supabase.ts`：`process.env` から URL/Key を読むサーバ専用クライアントを生成（`NEXT_PUBLIC_` を付けない）
- [×] 秘密情報がクライアントバンドルに混入しないこと（クライアントコンポーネントから import しない）を確認

## 完了条件

- `npm run dev` が起動し、上記クライアントを import するだけでビルドが通る。
- 環境変数未設定時に分かりやすいエラーが出る（握りつぶさない）。

## 参照

- CLAUDE.md「Stack」「Next.js App Router の作法」/ REQUIREMENTS.md §3
