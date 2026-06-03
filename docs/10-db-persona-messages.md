# 10 — DB・型（フェーズ2基盤）

## 目的

ペルソナと会話履歴のためのスキーマを追加する。

## マイグレーション（Supabase `aikyou` / id `jzwkpevhvkdjddydwvug`）

- `playthroughs` に `persona jsonb not null default '{}'::jsonb` を追加（緩いスキーマ）。
- `messages` テーブル新設：`id uuid pk`／`playthrough_id uuid not null references playthroughs(id) on delete cascade`／`role text`／`content text`／`created_at timestamptz default now()`。`(playthrough_id, created_at)` index。RLS無効・`grant all to anon, authenticated`。

## 型

- `src/types/playthrough.ts`：`Persona`（`name?/tone?/personality?`＋`[key]:unknown`）を追加、`Playthrough` に `persona`。
- `src/types/message.ts`：`Message`（DB行）。

## Todo

- [×] `persona` 列を追加
- [×] `messages` テーブル＋index＋権限を作成（RLS無効）
- [×] `Persona` 型を追加し `Playthrough` に組み込み
- [×] `Message` 型を新規作成
- [×] insert→select／カスケード削除の疎通確認

## 完了条件

- `messages` への読み書きがサーバ側 anon キーで成功し、playthrough 削除で messages もカスケード削除される。
