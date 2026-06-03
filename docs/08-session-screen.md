# 08 — セッション画面 (`/play/[id]`)

## 目的

実況の主画面。「前回までのあらすじ」表示＋チャット UI＋「セッション終了」。

## 依存

01・02・05・06・07。

## 仕様（REQUIREMENTS.md §6.2）

- **あらすじ表示**：現在の `state` を読みやすく整形（パーティ／現在地／次の目標／メモ）して画面上部に表示。
- **チャット**（中央）：
  - 入力欄＋送信。送信で `/api/chat` を叩き、応答を表示。
  - 会話履歴は**そのセッション中だけクライアントのメモリに保持**（リロードで消えてよい。継続性は state が担う）。
  - HTML の `<form>` ではなく **onClick / onChange** で処理する。
- **セッション終了ボタン**：`/api/end-session` を叩き、返ってきた新 state を保存 → あらすじ表示を更新。

## 対象ファイル

- `src/app/play/[id]/page.tsx`（id から state を取得して初期表示。Server Component）
- チャット＋あらすじのクライアントコンポーネント（`"use client"`）

## App Router 規約（CLAUDE.md）

- 初期 state 取得は Server Component（または直接 DB）で。チャットの状態管理は末端のクライアントコンポーネント。
- Route Handler（`/api/chat`・`/api/end-session`）はクライアントから fetch する。

## Todo

- [×] `/play/[id]` で対象 `playthrough` を取得（無ければエラー/404 表示）
- [×] あらすじ表示：state を整形して上部に表示（パーティ／現在地／次の目標／メモ）
- [×] チャット UI：入力欄＋送信ボタン（`<form>` を使わず onClick / onChange）
- [×] 送信で `/api/chat` を呼び、`messages` をクライアントメモリで保持・追記・表示
- [×] 送信中のローディング表示・連打防止
- [×] 「セッション終了」ボタンで `/api/end-session` を呼び、新 state を受け取りあらすじを更新
- [×] API エラーを画面に表示（握りつぶさない）
- [×] リロードで会話が消えること・state は残ることを確認（仕様どおり）

## 完了条件（= MVP 完成条件 / REQUIREMENTS.md §1）

- DQ3(FC) をプレイしながら AI と自然に会話できる。
- 中断・再開しても AI が前回の続き（パーティ・現在地・次の目標）を覚えている。
- 一連の操作が PC 上で開発者ひとりで完結する。

## 参照

- CLAUDE.md「Core architecture」「Next.js App Router の作法」/ REQUIREMENTS.md §6.2・§1
