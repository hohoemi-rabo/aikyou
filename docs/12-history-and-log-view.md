# 12 — 会話履歴の保存＋ふりかえり

## 目的

会話を `messages` に永続化し、あとから時系列で振り返れるようにする。

## 実装

- **永続化**：`src/app/api/chat/route.ts` のストリーム完了後に、今回の **ユーザー発言（messages末尾）＋生成したアシスタント応答** を `messages` に insert。ベストエフォート（保存失敗時もチャット応答は成立、失敗は `console.error`）。
- **ふりかえり画面**：`src/app/play/[id]/log/page.tsx`（Server Component）で `messages` を `created_at` 昇順表示。セッション画面に「ふりかえり」リンクを追加。
- ライブのチャットは従来どおりセッション中メモリ保持（自動プリロードはしない）。

## Todo

- [×] `/api/chat` で応答完了後に user＋assistant を messages へ保存
- [×] 保存失敗をチャット応答に波及させない（ベストエフォート）
- [×] `/play/[id]/log` ふりかえり画面を作成（時系列表示）
- [×] セッション画面に「ふりかえり」導線を追加
- [×] 実APIで messages に行が増えることを確認

## 完了条件

- 会話後に `messages` へ2行（user/assistant）保存され、ふりかえり画面に時系列表示される（検証済み）。
