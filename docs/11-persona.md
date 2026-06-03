# 11 — AIペルソナ

## 目的

相棒AIに名前・口調・性格を持たせ、会話に反映する。プレイスルー毎にDB保存。

## 実装

- **`src/lib/prompt.ts`**：`formatPersona(persona)` を追加し、`buildSystemBlocks` の引数に `persona` を追加。ペルソナ説明文を **block1（キャッシュ対象の指示文）冒頭**に差し込む（プレイスルー毎に安定なのでキャッシュと両立）。未設定時は既定挙動。
- **`src/app/api/chat/route.ts`**：DBから `persona` も取得し `buildSystemBlocks` に渡す。
- **編集UI**：
  - 作成フォーム（`src/app/page.tsx`＋`actions.ts` `createPlaythrough`）に名前・口調の任意入力。
  - セッション画面（`session-client.tsx`）に「相棒の設定」開閉パネル（名前/口調/性格）。保存は `actions.ts` の `updatePersona(id, persona)` Server Action。

## Todo

- [×] `formatPersona` 実装、`buildSystemBlocks` に persona 注入
- [×] `/api/chat` で persona を取得して渡す
- [×] 作成フォームに persona 任意入力を追加
- [×] `updatePersona` Server Action を追加
- [×] セッション画面に「相棒の設定」編集パネルを追加
- [×] 実APIでペルソナ反映を確認（名前・口調が応答に出る）

## 完了条件

- 設定した名前・口調・性格が AI の応答に反映される（検証済み：「ナビ」がタメ口で応答）。
