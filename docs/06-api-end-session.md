# 06 — POST /api/end-session

## 目的

継続性の心臓部。今回の会話を踏まえた**新しい state（JSON）を AI に生成させ**、防御的にパースして DB 更新する。

## 依存

01・02・03・04・05。

## 仕様（REQUIREMENTS.md §7.2）

- **入力**：`{ playthroughId, messages }`。
- 「現在の state」＋「今回の会話全文」を渡し、**新しい state だけを JSON で出力**させる。
- プロンプト指示：前回と同じ JSON 構造で、**出力は JSON のみ・前置き/説明/コードフェンス禁止**。
- **防御的パース**：```json フェンスが付いたら除去 → `JSON.parse` → 失敗時は**旧 state を維持しエラーを画面表示**。
- 成功したら `state` と `updated_at` を DB 更新。

## モデル方針

- 既定は Haiku 4.5。**JSON 崩れが頻発する場合のみ** この `/api/end-session` だけ Sonnet 4.6（`claude-sonnet-4-6`）へ引き上げ可（1セッション1回でコスト影響は誤差）。chat 側は Haiku のまま。

## 対象ファイル

- `src/app/api/end-session/route.ts`

## Todo

- [ ] `POST` を実装、`runtime='nodejs'` / `dynamic='force-dynamic'` を設定
- [ ] `{ playthroughId, messages }` を受け取りバリデーション
- [ ] DB から現在の `state` を取得
- [ ] 「JSON のみ出力」指示のプロンプトで Claude に新 state を生成させる
- [ ] 応答から ```json フェンスを除去 → `JSON.parse`
- [ ] パース失敗時：旧 state を維持し、エラー内容を返して画面に出す（握りつぶさない）
- [ ] パース成功時：`state` と `updated_at` を DB 更新し、新 state を返す
- [ ] 必須キー（`party`/`location`/`next_goals`）の欠落を最低限チェック（緩く・落ちない程度に）

## 完了条件

- セッション終了で state が会話内容を反映して更新される。
- JSON 崩れ時もアプリが落ちず、旧 state が保持されエラーが見える。

## 参照

- CLAUDE.md「Core architecture 1」/ REQUIREMENTS.md §7.2
