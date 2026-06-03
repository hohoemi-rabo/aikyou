# 02 — データモデル (Supabase)

## 目的

唯一のテーブル `playthroughs` を作成し、`state` の型と初期値を定義する。

## 背景

継続性は `state` JSONB が担う。テーブルは **1つだけ**。RLS・認証は設定しない（自分専用）。

## テーブル定義（REQUIREMENTS.md §5）

```
playthroughs
- id            uuid pk default gen_random_uuid()
- title         text
- game_version  text          // 例: "ファミコン版(FC)" ← 必須・重要
- state         jsonb
- created_at    timestamptz default now()
- updated_at    timestamptz default now()
```

## `state` の扱い

- 構造は**緩く**扱う（AI が追記しても壊れない）。固定スキーマにしない。
- 必須キーは `party` / `location` / `next_goals` の3つ。
- 任意キー例：`progress` / `notes`。

## 対象ファイル

- Supabase 上のマイグレーション（`apply_migration` もしくは SQL）
- `src/types/playthrough.ts`（`Playthrough` / `PlaythroughState` の型）
- `src/lib/initial-state.ts`（新規作成時の初期 state を返す関数）

## Todo

- [ ] `playthroughs` テーブルを作成（上記スキーマ。`gen_random_uuid()` / `now()` のデフォルト付き）
- [ ] `PlaythroughState` 型を定義（必須 `party`/`location`/`next_goals`、`[key: string]: unknown` で追加フィールドを許容）
- [ ] `Playthrough` 行の型を定義（`id`/`title`/`game_version`/`state`/`created_at`/`updated_at`）
- [ ] `createInitialState()` を実装（空に近い初期 state。party 空配列・location 仮置き・next_goals 空配列など）
- [ ] RLS・認証を**設定しない**ことを明示的に確認（意図的な非設定）

## 完了条件

- テーブルに対し insert/select がサーバ側クライアントから成功する。
- 型が `state` の緩いスキーマを表現できている。

## 参照

- CLAUDE.md「Core architecture 1」/ REQUIREMENTS.md §5
