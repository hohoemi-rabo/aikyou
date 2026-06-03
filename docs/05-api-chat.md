# 05 — POST /api/chat

## 目的

会話エンドポイント。`state` とナレッジを載せたシステムプロンプトで Claude に投げ、テキスト応答を返す。

## 依存

01（クライアント）・02（DB/型）・03（ナレッジ）・04（プロンプト）。

## 仕様（REQUIREMENTS.md §7.1）

- **入力**：`{ playthroughId, messages }`（messages はそのセッションの会話履歴）。
- サーバ側で DB から `state` を取得 → システムプロンプト組み立て → Claude へ。
- **出力**：AI のテキスト応答をそのまま返す。
- モデルは Haiku 4.5（`claude-haiku-4-5-20251001`）。

## 対象ファイル

- `src/app/api/chat/route.ts`

## App Router 規約（CLAUDE.md）

- `export const runtime = 'nodejs'` を明示（ファイル読込・Anthropic SDK のため）。
- `export const dynamic = 'force-dynamic'`（AI 応答はキャッシュしない）。
- `req.json()` で受け、`NextResponse.json()` で返す。Server Component からは呼ばない。

## Todo

- [×] `src/app/api/chat/route.ts` に `POST` を実装、`runtime='nodejs'` / `dynamic='force-dynamic'` を設定
- [×] `{ playthroughId, messages }` を受け取り、入力をバリデーション（不足時は 400）
- [×] DB から該当 `playthrough`（`title`/`game_version`/`state`）を取得（無ければ 404）
- [×] 04 の関数で system ブロック（ナレッジ＋state、cache 付き）を構築
- [×] Haiku 4.5 で `messages.create`、`messages` を会話履歴として渡す
- [×] AI のテキスト応答を JSON で返す
- [×] エラーは握りつぶさず、ステータス＋メッセージで返す（画面で確認できるように）

## 完了条件

- クライアントから messages を送ると state を踏まえた応答が返る。
- 版（FC）固定のルールが効いている（他版情報を出さない）。

## 参照

- CLAUDE.md「Core architecture」「Next.js App Router の作法」/ REQUIREMENTS.md §7.1
