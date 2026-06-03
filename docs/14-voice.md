# 14 — 音声 STT/TTS

## 目的

声で話しかけ（STT）、相棒の返事を読み上げる（TTS）。ブラウザ標準 Web Speech API を使う（追加APIキー・コストなし）。

## 実装（クライアントのみ）

- **`src/types/speech.d.ts`**：`SpeechRecognition`/`webkitSpeechRecognition` の最小型宣言（標準 lib に無いため）。
- **`src/hooks/useSpeech.ts`**（`"use client"`）：
  - STT：`webkitSpeechRecognition`（`lang='ja-JP'`、`interimResults=false`）。確定テキストをコールバックで返す。
  - TTS：`speechSynthesis` + `SpeechSynthesisUtterance`（`lang='ja-JP'`）。
  - 対応可否は `useEffect` 後に判定（SSRハイドレーション不一致を回避）。
- **`session-client.tsx`**：🎤 ボタン（録音→入力欄へ反映）、「相棒の返事を読み上げる」トグル（ON時はストリーム完了後に読み上げ）。非対応ブラウザは無効表示＋案内。

## Todo

- [×] `speech.d.ts` 型宣言を追加
- [×] `useSpeech` フックを実装（STT/TTS・対応検出・クリーンアップ）
- [×] セッション画面に🎤ボタン・読み上げトグルを統合
- [×] 非対応ブラウザでの無効化・案内表示
- [×] Chrome/Edge で実機の音声入力・読み上げを目視確認（※ブラウザ依存のため手動）

## 完了条件

- Chrome/Edge で🎤録音→テキスト化→送信、相棒応答の読み上げが動く。非対応環境では無効表示になる。

## 補足

- Web Speech API の対応ブラウザは主に Chrome/Edge。Firefox等は STT 非対応の場合がある（その場合キーボード入力で利用）。
- マイク権限の許可がOS/ブラウザ側で必要。
