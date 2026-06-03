# 07 — プレイスルー一覧・新規作成 (`/`)

## 目的

トップ画面。プレイスルー一覧の表示と新規作成。

## 依存

01・02。

## 仕様（REQUIREMENTS.md §6.1）

- `playthroughs` を一覧表示（`title` / `location`（state内）/ `updated_at`）。
- 一覧から選ぶとセッション画面 `/play/[id]` へ遷移。
- **新規作成**：`title` と `game_version` を入力し、空に近い初期 state（02 の `createInitialState()`）で1件作成 → セッション画面へ。

## 対象ファイル

- `src/app/page.tsx`（一覧。Server Component でデータ取得が基本）
- 新規作成フォーム（`"use client"` の末端コンポーネント）
- 作成処理（Server Action もしくは `/api/playthroughs` のような薄い Route Handler。MVP は最小構成で）

## App Router 規約（CLAUDE.md）

- 一覧の取得は Server Component で行う（バンドル削減）。
- `"use client"` は入力フォーム等のインタラクティブな末端のみ。
- デザインは最小限（PC で動けばよい。凝った装飾・レスポンシブは作らない）。

## Todo

- [ ] `/`（Server Component）で `playthroughs` を `updated_at` 降順取得し一覧表示（title / location / updated_at）
- [ ] 各行から `/play/[id]` へのリンク
- [ ] 新規作成フォーム（title・game_version 入力）を末端のクライアントコンポーネントで実装
- [ ] 作成処理：`createInitialState()` で初期 state を作り insert → 作成した id の `/play/[id]` へ遷移
- [ ] 一覧が空のときの表示を用意
- [ ] エラーは画面に表示（握りつぶさない）

## 完了条件

- 新規作成 → 一覧に出る → クリックでセッション画面へ遷移、までが通る。

## 参照

- CLAUDE.md「Next.js App Router の作法」/ REQUIREMENTS.md §6.1
