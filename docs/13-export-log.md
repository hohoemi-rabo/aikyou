# 13 — 冒険ログのYouTube用出力

## 目的

そのセッションの会話を、動画概要欄/字幕に貼れる形に整形して出力する。

## 実装

- **`src/app/api/export-log/route.ts`** 新規（`runtime=nodejs`/`dynamic=force-dynamic`）：`{ playthroughId, messages }` を受け、Claude（Haiku）で **(1)動画タイトル案 (2)概要 (3)ハイライト (4)次回予告** を日本語マークダウンで生成して返す。
- **UI**（`session-client.tsx`）：「動画用ログを生成」ボタン → 結果を `<pre>` 表示＋クリップボードへコピー。

## Todo

- [×] `/api/export-log` を実装（タイトル案/概要/ハイライト/次回予告の整形）
- [×] セッション画面に生成ボタンと結果パネルを追加
- [×] コピー（`navigator.clipboard`）ボタンを追加
- [×] 実APIで整形テキスト生成を確認

## 完了条件

- ボタン押下で動画用テキストが生成され、コピーできる（検証済み）。
