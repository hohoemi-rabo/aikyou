# SPEC.md — あいきょう / AI Kyou 現状仕様書（As-Built）

> このドキュメントは **現在実装されている仕様（as-built）** を記述したものです。
> 「何を作りたいか（意図）」の正本は引き続き [`REQUIREMENTS.md`](./REQUIREMENTS.md) です。
> REQUIREMENTS.md は Phase 1（MVP）時点の指示書で、**AIモデル・音声・スコープが現状と一部食い違って**います（§13 の差分表を参照）。
> 実装の詳しい背景・設計判断は [`CLAUDE.md`](./CLAUDE.md) に集約しています。
>
> 基準: 最新コミット `ab9473c`（2026-06-21）時点。

---

## 1. 概要

- 「**AIと会話しながら昔のゲーム（Phase 1: ファミコン版ドラゴンクエスト3）をする**」ための**自分専用ツール**。最終成果物は YouTube 動画。
- 1人用。認証・マルチユーザー・デプロイは無し。**開発者の PC でローカル実行**する前提。
- 核となる考え方は2つ（不変）：
  1. **セッションをまたぐ継続性は `state`(JSON) だけが担う**（会話履歴は継続性に使わない）。
  2. **攻略知識はプロンプトに丸ごと注入**する（RAG・検索は使わない）。

---

## 2. 技術スタック

| 領域 | 採用 | バージョン |
|------|------|------|
| フレームワーク | Next.js（App Router・Turbopack） | 15.5.19 |
| UI | React | 19.1.0 |
| 言語 | TypeScript（strict） | ^5 |
| スタイル | Tailwind CSS | ^3.4.17 |
| DB | Supabase（`@supabase/supabase-js`） | ^2.107.0 |
| AI SDK | **Google Gen AI SDK（`@google/genai`）** | ^2.8.0 |
| 音声合成 | Google Cloud Text-to-Speech（**REST 直叩き・SDK 不使用**） | — |
| Lint | ESLint（flat config） | ^9 |

- パスエイリアス `@/*` → `src/*`。
- テストランナーは未導入。デプロイは対象外（ローカル専用）。
- Supabase の **RLS・認証は意図的に未設定**（ローカル単一ユーザー）。

---

## 3. AIモデル構成 ★REQUIREMENTS.md から変更

AIプロバイダは **Anthropic(Claude) から Google Gemini に移行済み**。Gemini Developer API（Google AI Studio のキー・無料枠あり）を使う。モデルIDとクライアントは `src/lib/gemini.ts` に集約。

| エンドポイント | モデル | 理由 |
|------|------|------|
| `POST /api/chat` | **`gemini-2.5-flash`** | 約40kトークンのナレッジ参照が要るため、参照力の高い Flash。Flash-Lite では宝箱と鍵の対応などを取り違えた |
| `POST /api/end-session` | **`gemini-2.5-flash-lite`** | 会話の要約＋JSON化が主でナレッジ参照不要。安価な Lite で十分 |
| `POST /api/export-log` | `gemini-2.5-flash`（`MODEL_CHAT` を流用） | 1セッション1回でコスト影響は誤差 |

- **thinking 無効**（`thinkingConfig.thinkingBudget: 0`）… テンポ優先。
- **`safetySettings` は全カテゴリ `BLOCK_NONE`** … 戦闘・モンスター討伐などゲーム内容が安全フィルタで空応答になるのを防ぐ。
- **一時エラーの自動リトライ**（`withRetry`）… 503 UNAVAILABLE / 429 / 500 / timeout を指数バックオフで最大3回（0.6s→1.2s→2.4s）。恒久エラー（キー不正・400 等）は即時に投げる。chat / end-session / export-log の3つすべてに適用。
- コストを最優先したい場合は `MODEL_CHAT` を Flash-Lite に戻せばよい（精度とのトレードオフ）。

### APIキー（いずれもサーバ専用・クライアントに出さない）
- `GEMINI_API_KEY` … Gemini 全呼び出し（AI Studio の無料枠キーをそのまま使える）。
- `GOOGLE_TTS_API_KEY` … 読み上げ（`/api/tts`）用。
- すべて Next.js API Route 内の `process.env` でのみ参照。`NEXT_PUBLIC_` は付けない。

---

## 4. 音声（STT / TTS）★REQUIREMENTS.md から変更（旧「やらないこと」→ 実装済み）

### 入力（STT）: ブラウザ標準 Web Speech API
- `src/hooks/useSpeech.ts` に閉じる。追加のキー・クラウド不要。Chrome / Edge 前提。
- マイクボタンで開始／停止。話した内容を入力欄へ反映。無音をはさんでも録り続ける（`continuous`、`onend` で自動再開）。
- 致命的エラー（権限拒否・デバイス無し・ネットワーク）は画面に表示。非対応ブラウザではボタンを無効表示。
- **送信すると自動でマイク OFF**（つけっぱなし防止）。

### 出力（TTS）: Google Cloud Text-to-Speech（REST）
- `src/app/api/tts/route.ts` が REST で `text:synthesize` を叩き、base64 mp3 を返す（SDK 不使用）。
- クライアント側 `src/hooks/useTts.ts` が**文単位の逐次再生キュー**を持つ。ストリーミング中に文末（。！？!?改行）が確定するたび mp3 を生成して順番に再生。
- **選べるボイス**（`src/types/tts.ts`・いずれも同じ Cloud TTS API／キー・各エンジン月100万字まで無料枠）：
  - **WaveNet**: 女性B（明るめ・既定）／女性A（落ち着き）／男性C（低め）／男性D（標準）
  - **Neural2**: 女性B／男性C／男性D
  - **Chirp3-HD**（最も自然）: 女性Aoede／女性Kore／男性Charon／男性Puck
  - 既定ボイスは先頭の `ja-JP-Wavenet-B`。
- **Gemini-TTS** は有料（Vertex AI 有効化が必要）のため設定（`GEMINI_VOICE`）だけ残しドロップダウンからは除外。`lib/tts.ts` は対応済みで、復活させたいときは一覧に push するだけ。
- **読み上げ ON/OFF の既定は ON**（つけ忘れ防止）。ただし保存値があればそちらを優先。

---

## 5. データモデル（Supabase）

RLS・認証は未設定（ローカル単一ユーザー）。

### `playthroughs`
| カラム | 型 | 備考 |
|------|------|------|
| id | uuid (pk) | `gen_random_uuid()` |
| title | text | 例: "ドラゴンクエスト3" |
| game_version | text | 例: "ファミコン版（1988）" ← 必須・版の正しさを担保 |
| state | jsonb | 下記。継続性の心臓部 |
| **persona** | jsonb | 相棒のキャラ設定（Phase 2 で追加） |
| created_at / updated_at | timestamptz | |

### `messages`（Phase 2 で追加）
| カラム | 型 | 備考 |
|------|------|------|
| id | uuid (pk) | |
| playthrough_id | uuid (fk → playthroughs, on delete cascade) | |
| role | text | `user` / `assistant` |
| content | text | |
| created_at | timestamptz | |

- 会話ログは**ふりかえり表示・動画用ログ出力のためだけ**に保存する。**継続性には使わない**（チャットへ再生せず、state 再構築にも使わない）。

### `state` の構造（緩いスキーマ）
```jsonc
{
  "party": [ { "name": "勇者", "job": "勇者", "level": 22 }, ... ],
  "location": "ポルトガ",
  "progress": "（日本語の短い文章）",
  "next_goals": ["テドンへ向かう", ...],
  "notes": "（日本語の短い文章）",
  "last_session_summary": "（前回の会話の要約・3〜6文）"
}
```
- 必須キーは `party` / `location` / `next_goals` の3つ。それ以外は緩く扱い、AI が追記・入れ子化しても壊れないよう描画は防御的に行う。
- **パーティの職業は `job` キーが正**。ただし過去データで AI が `class` キーで入れた例があるため、表示側（あらすじ・プロンプト）は `job ?? class` を読む。名前＝職業が重複するときは片方だけ表示。
- `last_session_summary` は `end-session` が毎回その回ぶんで上書きし、再開時に `/api/chat` が **【前回のあらすじ】** ブロックとして相棒へ渡す。

### `persona` の構造（緩いスキーマ）
```jsonc
{ "name": "ナビ", "tone": "明るくフランクなタメ口", "personality": "面倒見がよい" }
```

---

## 6. APIエンドポイント

すべて `src/app/api/<name>/route.ts`・`runtime = "nodejs"`・`dynamic = "force-dynamic"`。

### `POST /api/chat`（ストリーミング）
- 入力 `{ playthroughId, messages }`。DB から `state` + `persona` を読み、`buildSystemInstruction` でシステムプロンプトを組む。
- `generateContentStream` の `chunk.text` を `ReadableStream`（`text/plain; charset=utf-8`）でそのまま返す。会話履歴は `contents` に Gemini のロール（`user` / **`model`**）で渡す。
- ストリーム生成は await して try/catch で包み、混雑等は `withRetry` のうえ最終的にクリーンな JSON 502 を返す（壊れたパイプにしない）。
- 応答完了後、ユーザー発言＋相棒応答を `messages` テーブルへ保存（ベストエフォート・失敗してもチャットは成立）。

### `POST /api/end-session`（継続性の更新）
- 入力 `{ playthroughId, messages }`。現在の `state` ＋ 今回の会話全文を渡し、**新しい state JSON だけ**を生成させる（新しい `last_session_summary` 込み）。
- `responseMimeType: "application/json"` でコードフェンス無しの JSON を得るが、防御的にパース（フェンス除去 → `JSON.parse`）。失敗時は**旧 state を維持**してエラーを画面に出す。
- 成功時に `state` と `updated_at` を更新。**継続性はユーザーが明示的にセッション終了したときだけ更新**される。
- パーティは `name` / `job` / `level` キーで表し、**転職があれば `job` を更新**するよう指示（`class` 等の別キーを使わない）。

### `POST /api/export-log`（動画用ログ）
- 入力 `{ playthroughId, messages }`。会話を YouTube 概要欄向けテキスト（タイトル案／概要／ハイライト／次回予告）に整形して返す。

### `POST /api/tts`
- 入力 `{ text, voice }`。Google Cloud TTS から base64 mp3 を返す（Gemini ではない）。

---

## 7. プロンプト設計（`src/lib/prompt.ts`）

`buildSystemInstruction` が **1本の `systemInstruction` 文字列**を返す。Gemini 2.5 の**暗黙キャッシュ**（自動・`cache_control` 不要）が先頭の安定プレフィックスに効くよう、順序を固定する：

1. **システム指示 ＋ ペルソナ ＋ 連結ナレッジ**（プレイスルー内で不変・キャッシュの主対象）
2. **【前回のあらすじ】**（再開時のみ）＋ 現在の `state`
3. 返信前の短いリマインダー

会話履歴は `contents` 側に渡す。`state` は `end-session` でしか変わらないので、1プレイ session 中は `systemInstruction` がバイト一致し、40kトークンのナレッジを含むプレフィックスがキャッシュされ続ける。

### 相棒の振る舞いルール（プロンプトで強制）
- **版の正しさ**: 必ず `game_version`（FC・1988）の仕様で答える。SFC/GBC/スマホ/HD-2D リメイクの情報を混ぜない。
- **ナレッジが正**: 攻略の事実（鍵・宝箱・場所・数値・手順）は注入ナレッジを正とし、自分の記憶で上書きしない。複数項目の突き合わせはナレッジを照合してから答える。前提が成り立たない質問（例：その鍵で開く宝箱が無い）には「無い」とはっきり言う。
- **厳格な 1問1答**: こちらから質問を返さない。**挨拶・雑談でも**「調子はどう？」等を付けず、言い切りで終える（会話を続けるのはプレイヤーの役目）。
- **読み上げ前提**: Markdown 装飾記号・箇条書き記号を使わず、話し言葉の普通の文章で答える。
- `⚠️要確認` の情報は事実として断定しない。

---

## 8. 攻略ナレッジ（`knowledge/dq3-fc/`）

- 職業・町・ダンジョン等で分割した markdown 約48ファイル＋メタ情報 `_ai-notes.md`。**リポジトリ直下**（`public/` でも `src/` でもない）に置き、サーバ側で `path.join(process.cwd(), 'knowledge', 'dq3-fc')` から読む。
- 全ファイルを読み、**ファイル名で決定的にソート**し、`_ai-notes.md` を先頭に固定して1文字列に連結。結果はモジュールスコープにメモリキャッシュ（毎リクエスト読み直さない）。
- ファイル名は ASCII（ハイフン）。日本語タイトルは各ファイル1行目の `# 見出し` で保持。
- 鍵の対応関係（とうぞくのかぎ＜まほうのかぎ＜さいごのかぎ）など、混同しやすい点は `_ai-notes.md` と該当ファイルに明記済み。

---

## 9. 画面・機能

### 9.1 プレイスルー一覧（`/`）
- 一覧表示と新規作成。

### 9.2 セッション画面（`/play/[id]`・`session-client.tsx`）
- **前回までのあらすじ**: 現在の `state` を整形表示（パーティ／現在地／進行／次の目標／メモ）。
- **チャット**: テキスト入力＋送信（Enter 送信）、マイク（STT）ボタン、応答を1文字ずつ表示（ストリーミング）。会話履歴はそのセッション中だけクライアントメモリに保持。
- **声の設定**: 読み上げ ON/OFF、ボイス選択。
- **動画用ログ**: 生成してコピー。
- **セッション終了して保存**: `end-session` を叩き、新 state であらすじを更新。保存中はオーバーレイで操作をロック（中断防止）。
- **自動スクロール**: 新しい発言・ストリーミング追記で常に最下部へ追従。ユーザーが上にスクロールして読んでいる間は追従を停止（near-bottom 判定）。

### 9.3 録画モード（OBS 録画用）
- トグル ON で会話以外（上部ナビ・ペルソナ・あらすじ・声設定・動画用ログ）を隠し、全幅化、チャットを縦に拡大（`min-h-[75vh]`）。
- **文字サイズ 小/中/大**（`text-base`/`text-lg`/`text-2xl`）を切替（録画モード時のみ適用。通常表示は `text-sm` のまま）。
- ボタンは緑（録画中は赤＝「通常表示に戻す」）。
- 想定構成: OBS 1インスタンス・1シーンに「エミュレーター」と「あいきょう（ブラウザソースで `localhost` 指定）」を横並び。

### 9.4 マップ表示（録画モード時のみ）
- **🗺 マップ**ボタンでチャットに**重ねて**地図を表示。**タブで2枚を1枚ずつ切替**（地上世界／アレフガルド）、「閉じる ×」で戻る。
- 透過 PNG（黒文字＋クリーム色の陸地）が読めるよう**背景は白**。`object-contain` で枠にフィット。
- 画像は `public/maps/`（`map1.png` / `map2.png`）。**画像バイナリは gitignore**（DQ3 マップは著作物のためリポジトリに再配布しない）。`.gitkeep` でフォルダだけ追跡。

### 9.5 ふりかえり（`/play/[id]/log`）
- `messages` テーブルの会話ログを閲覧。

---

## 10. 状態の永続化（localStorage・プレイスルー単位）

| キー | 内容 | 既定 |
|------|------|------|
| `aikyou:voice:<id>` | 選択ボイス | 先頭の WaveNet |
| `aikyou:voiceOutput:<id>` | 読み上げ ON/OFF | **ON**（保存値優先） |
| `aikyou:recording:<id>` | 録画モード ON/OFF | OFF |
| `aikyou:fontSize:<id>` | 録画時の文字サイズ | 中（`lg`） |

- SSR を避け、マウント後に読み込み、復元後にのみ書き戻す。マップの開閉状態は永続化しない（既定は閉）。

---

## 11. 信頼性・エラー方針

- 外部 AI 呼び出しは一時エラーを `withRetry`（指数バックオフ）で自動再試行。
- エラーは握りつぶさず**画面に表示**（開発者が直接デバッグする）。
- `end-session` の保存失敗時は**旧 state を維持**して継続性を壊さない。会話履歴保存（`messages`）はベストエフォート。

---

## 12. スコープ

### 実装済み（Phase 1 ＋ Phase 2）
プレイスルー管理／state による継続性／ナレッジ全注入＋暗黙キャッシュ／ストリーミング会話／ペルソナ／会話履歴保存＆ふりかえり／動画用ログ出力／音声入力(STT)・読み上げ(TTS)／録画モード（文字サイズ・自動スクロール・マイク自動OFF）／マップ表示。

### 対象外（新規要件なしには実装しない）
- ❌ リトリーバル / RAG / 埋め込み検索（ナレッジは全注入のまま）
- ❌ 複数ゲーム対応 / ナレッジ差し替え UI（DQ3-FC 専用）
- ❌ 認証・マルチユーザー
- ❌ デプロイ・公開

---

## 13. REQUIREMENTS.md との主な差分

| 項目 | REQUIREMENTS.md（意図・MVP時点） | 現状（as-built） |
|------|------|------|
| AIプロバイダ | Anthropic Claude（`@anthropic-ai/sdk`） | **Google Gemini（`@google/genai`）** |
| モデル | 全エンドポイント Claude Haiku 4.5 | **chat=gemini-2.5-flash / end-session=gemini-2.5-flash-lite** |
| APIキー | `ANTHROPIC_API_KEY` | **`GEMINI_API_KEY`**（＋ `GOOGLE_TTS_API_KEY`） |
| 音声(STT/TTS) | 「やらないこと」 | **実装済み**（Web Speech / Google Cloud TTS） |
| ペルソナ設定 | 「やらないこと」 | **実装済み**（`persona` jsonb ＋ 編集UI） |
| 動画用ログ出力 | 「やらないこと」 | **実装済み**（`/api/export-log`） |
| 会話履歴の保存 | 「やらないこと」 | **実装済み**（`messages` テーブル・ふりかえり/ログ用のみ） |
| ストリーミング | 記載なし | **実装済み** |
| プロンプトキャッシュ | Claude の明示キャッシュ（`cache_control`） | **Gemini の暗黙キャッシュ**（マーカー不要） |
| 録画モード / マップ表示 | 記載なし | **実装済み**（OBS 録画用） |
| DBテーブル | `playthroughs` 1つ | `playthroughs`（＋`persona`）＋ `messages` |

> REQUIREMENTS.md の §3/§7（モデル）・§4.1〜4.2（スコープ）は上表のとおり古くなっています。意図の正本としては残しつつ、実装の現況は本ファイルを参照してください。
