# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

「あいきょう / AI Kyou」— a **single-user companion AI** for playing retro games (Phase 1 target: Famicom Dragon Quest 3) while talking to an AI partner. The real deliverable is a YouTube video of "playing an old game while chatting with an AI," not a public web service. There is one user (the developer); no auth, no multi-tenancy.

**Status:** Phase 1 (MVP) is complete, and four Phase 2 features are now built — AI persona, conversation-history persistence, YouTube log export, and voice (STT/TTS). See `docs/09-phase2-overview.md`. **`REQUIREMENTS.md` remains the source of truth for intent**, but its §4.2 "やらないこと" list is no longer a blanket constraint: the Phase 2 items listed there have been deliberately implemented. Still **out of scope**: retrieval/RAG and multi-game support (see Scope discipline below).

## Commands

```bash
npm run dev      # Next.js dev server (Turbopack) at http://localhost:3000
npm run build    # production build (Turbopack)
npm run start    # serve the production build
npm run lint     # ESLint (flat config: eslint.config.mjs)
```

No test runner is configured yet. Deployment is out of scope — this only needs to run locally on the developer's PC.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v3 · Supabase (`@supabase/...`) · Google Gen AI SDK (`@google/genai`). Google Cloud Text-to-Speech is called over **REST (no SDK)** for voice. Path alias `@/*` → `src/*`.

- **Models:** the three AI endpoints (`/api/chat`, `/api/end-session`, `/api/export-log`) use **Gemini 2.5 Flash-Lite** (`gemini-2.5-flash-lite`) via the Gemini Developer API (AI Studio key, has a free tier). Chosen for cost (free tier + cheapest tier). The only sanctioned exception: `/api/end-session` may be raised to `gemini-2.5-flash` if state JSON output is unreliable (it runs once per session, so cost is negligible). Chat stays on Flash-Lite. Model ids + the client live in `src/lib/gemini.ts`. Thinking is disabled (`thinkingConfig.thinkingBudget: 0`) for tempo, and `safetySettings` are set to `BLOCK_NONE` so game content (battles, monsters) isn't filtered to an empty reply. (`/api/tts` is not a Gemini endpoint — it calls Google Cloud TTS.)
- **API keys (both server-side only, never exposed to the client):** `GEMINI_API_KEY` for all Gemini calls; `GOOGLE_TTS_API_KEY` for the read-aloud voice via `/api/tts`. All go through Next.js API Routes.
- Supabase RLS and auth are intentionally **not** configured (local/limited environment).

## Core architecture (the two ideas that matter)

### 1. Continuity lives in `state`, not chat history

RPGs span many sessions. **Cross-session continuity is carried entirely by a single `state` JSON blob** — this is still the load-bearing idea. The live chat keeps history in client memory for the current session; conversation is *also* persisted to a `messages` table (Phase 2), but only for review/log export, **not** for continuity. The `messages` table is never replayed into the chat or used to rebuild state.

- Supabase tables (RLS/auth intentionally off, local single-user):
  - **`playthroughs`** — `id`, `title`, `game_version`, `state jsonb`, **`persona jsonb`** (Phase 2), timestamps. `game_version` is required and load-bearing (see below).
  - **`messages`** (Phase 2) — `id`, `playthrough_id` (FK → `playthroughs`, `on delete cascade`), `role`, `content`, `created_at`. Conversation log for the ふりかえり view and log export.
- `state` holds `party / location / progress / next_goals / notes` plus **`last_session_summary`** — a short Japanese recap of the previous session, written by `end-session` and rolled (overwritten) each session. It rides inside the loose `state` JSON (no dedicated column / no migration), and on resume `/api/chat` injects it as a **`【前回のあらすじ】`** prompt block so the partner continues naturally instead of re-explaining. `formatState` only renders the known keys, so the summary is not double-emitted into the chat prompt. Treat the schema **loosely** — the AI may add fields (and may return strings as nested objects); don't enforce a rigid shape and render defensively. Required keys: `party`, `location`, `next_goals`.
- `persona` (`name / tone / personality`, also loose) is the relationship-defining AI character; it's injected into the cached system instructions per playthrough.
- **`POST /api/chat`** — loads `state` + `persona`, builds the system prompt, **streams** the reply (`ReadableStream` over `generateContentStream` chunks; `chunk.text`). Conversation history is passed as `contents` with Gemini roles (`user` / **`model`**, not `assistant`). Stream creation is awaited and wrapped in try/catch so quota/rate errors return a clean JSON 502 instead of a broken pipe. After the stream completes it persists the user message + assistant reply to `messages` (best-effort: a save failure is logged, never breaks the reply).
- **`POST /api/end-session`** — sends current `state` + the full session conversation and asks Gemini to emit **only the new state JSON**, including a fresh **`last_session_summary`** (this session's recap, for next time). Uses `responseMimeType: 'application/json'` so output has no code fences, but parse defensively anyway (`stripJsonFences` + `JSON.parse`); on failure keep the old state and surface the error. On success, update `state` + `updated_at`. (Continuity only updates when the user actually ends the session.)
- **`POST /api/export-log`** (Phase 2) — formats the session conversation into a YouTube-ready summary (title ideas / overview / highlights / next-up) for copy-paste.
- **`POST /api/tts`** (Phase 2) — receives one sentence (`{ text, voice }`) and returns base64 mp3 from Google Cloud TTS (WaveNet / Neural2 / Chirp3-HD) for the partner's read-aloud voice. Not a Gemini endpoint; see the voice notes below.

### 2. Knowledge is injected wholesale into the prompt, with caching

The Gemini API does **not** open URLs. "Making the AI aware" of strategy knowledge means literally pasting the text into the system prompt. No RAG, no retrieval, no embeddings.

- Strategy knowledge lives in **`knowledge/dq3-fc/`** (~48 markdown files split by job/town/dungeon/etc., plus `_ai-notes.md` for meta-guidance). This is at the **repo root, not `public/` and not `src/`** — `public/` would expose it via URL; it must be read server-side only via `path.join(process.cwd(), 'knowledge', 'dq3-fc')`.
- Read **all** `.md` files and concatenate into one string. **Sort by filename deterministically** (`readdir` order is OS-dependent) and pin **`_ai-notes.md` first**. Deterministic order is what makes prompt caching hit. Cache the concatenated result in memory; don't re-read files per request.
- **Prompt order matters for caching** (concatenated knowledge ≈ 40k tokens). Gemini 2.5 does **implicit caching** automatically — no `cache_control` markers, no cache objects to manage; it just discounts the stable request *prefix*. So `buildSystemInstruction` (`src/lib/prompt.ts`) returns **one `systemInstruction` string** ordered: (1) system instructions + **persona** + concatenated knowledge — stable per playthrough, **keep it at the very front**; (2) the **`【前回のあらすじ】`** summary block (only when resuming) + current `state`; (3) a short pre-reply reminder. The session conversation is passed separately as `contents`. `state` only changes on `end-session`, so within one play session the whole `systemInstruction` is byte-identical across requests → the prefix (including the 40k knowledge) stays cached. Don't reorder 1, and don't fold the growing conversation into `systemInstruction`.
- Knowledge filenames must be **ASCII** (hyphenated). Japanese filenames break across WSL2/Windows/Git encoding normalization. The Japanese title is kept as the first-line `# heading` inside each file — the AI identifies content by heading.

## Content correctness constraint

All game content must match the **Famicom (FC) 1988** version — never mix in SFC/GBC/mobile/HD-2D remake facts (jobs, spells, dungeon layouts differ by version). `game_version` exists to enforce this in the system prompt. `knowledge/dq3-fc/_ai-notes.md` documents the FC-specific gotchas (no personality system, no Pachisi, battery-backup saves, etc.) and items flagged `⚠️要確認` are unverified and must not be stated as fact.

## Next.js App Router の作法 (15.5.x)

このプロジェクトの構成（Route Handler にサーバー処理を集約し、クライアントから fetch する）に直結する範囲のベストプラクティス。出典は context7 の Next.js 公式ドキュメント。

- **Route Handler は `src/app/api/<name>/route.ts`** に置き、`POST`/`GET` を named export する。リクエスト本文は `await req.json()`、応答は `NextResponse.json(...)`（`next/server`）。Gemini 呼び出し・Supabase アクセス・`knowledge/` のファイル読込はすべてここに閉じ込める。
- **Route Handler は Server Components から呼ばない。** Server Component は自分のコードを直接実行すればよく、自分の API を fetch すると余計なサーバーラウンドトリップになる。Route Handler は「クライアント（`"use client"`）からの呼び出し口」と割り切る。`/api/chat` と `/api/end-session` はチャット UI（クライアント）から叩く前提。
- **`export const runtime = 'nodejs'` を Route Handler に明示する。** `process.cwd()` でのファイル読込・Node の `fs`/`path`・Gen AI SDK は Edge ランタイムでは動かない。Edge はミドルウェア専用と考える。
- **AI 応答はキャッシュさせない。** Route Handler の `POST` は既定で動的だが、意図を明示するため `export const dynamic = 'force-dynamic'` を付け、外部 fetch を使う箇所では `cache: 'no-store'` を指定する。逆に **`knowledge/` の連結結果はリクエストをまたいでメモリにキャッシュ**する（Next のキャッシュ機構ではなくモジュールスコープの変数で）。
- **環境変数はサーバー専用に保つ。** `GEMINI_API_KEY` などの秘密情報に `NEXT_PUBLIC_` を付けない（付けるとクライアントバンドルに焼き込まれる）。秘密値は Route Handler / Server Component 内の `process.env` でのみ参照する。
- **Server Components を既定にし、`"use client"` は最小限に。** クライアント側 JS とバンドルサイズを抑えるため、`"use client"` は状態やイベントを持つ末端コンポーネントだけに付ける。MVP のチャット入力欄まわりが該当する。
- **チャット応答はストリーミング実装済み（Phase 2）。** `/api/chat` は `ai.models.generateContentStream(...)` の `chunk.text` を `ReadableStream`（`text/plain; charset=utf-8`）でそのまま返し、クライアントは `res.body.getReader()` ＋ `TextDecoder({ stream: true })` で1文字ずつ表示する（マルチバイト境界は TextDecoder が吸収）。`loading.tsx` / `<Suspense>` は引き続き任意。
- **音声入力（STT）は Web Speech API（ブラウザ標準・クライアントのみ）。** `src/hooks/useSpeech.ts` に閉じる。型は標準 lib に無いため `src/types/speech.d.ts` で最小宣言。対応可否は `useEffect` 後に判定（SSR ハイドレーション不一致回避）。Chrome/Edge 前提、非対応時は無効表示。エラーは握りつぶさず `sttError` で画面表示。
- **読み上げ（TTS）は Google Cloud Text-to-Speech。** API キー（`GOOGLE_TTS_API_KEY`、サーバ専用）で `src/app/api/tts/route.ts` から REST 呼び出し（SDK 不使用・依存を増やさない）。クライアント側は `src/hooks/useTts.ts` が**文単位の逐次再生キュー**を持ち、チャットのストリーミング中に文末（。！？!?改行）が確定するたび `/api/tts` で mp3 を生成して順番に再生する。ボイスは `src/types/tts.ts` の一覧から画面で切替：**WaveNet / Neural2 / Chirp3-HD**（いずれも同じ `text:synthesize` エンドポイント・同じ API キー、各エンジン月100万字まで無料枠）。`TtsVoice` は `voiceName` ＋任意の `modelName`/`prompt` を持ち、`synthesizeSpeech` が1経路で出し分ける。**Gemini-TTS** は有料（Vertex AI 有効化が必要・`modelName` に Gemini モデルを指定し `input.prompt` で口調指示）のため、設定だけ `GEMINI_VOICE` として残しドロップダウンからは外している。選んだ声と読み上げ ON/OFF は **localStorage にプレイスルー単位で保存**（`aikyou:voice:<id>` / `aikyou:voiceOutput:<id>`）し、再開時に復元する（SSR を避けマウント後に読み込み、復元後にのみ書き戻す）。読み上げ ON/OFF の**既定値は ON**（つけ忘れ防止）だが、保存値があればそちらを優先するので、ユーザーが切った選択は再開後も維持される。

- **録画モード（OBS 録画用）。** YouTube 用にエミュレーター画面と横並びで録る前提のため、`src/app/play/[id]/session-client.tsx` に**録画モード**トグルがある。ON にすると会話以外（上部ナビ・ペルソナ・あらすじ・声設定・動画用ログ）を隠し、`<main>` を全幅化、チャットを縦に広げ（`min-h-[75vh]`）、吹き出しの文字を**小/中/大（`text-base`/`text-lg`/`text-2xl`）**で切替できる。通常表示時の見た目・文字サイズ（`text-sm`）は変えず、サイズは録画モード時だけ適用する。録画モードボタンは緑（録画中は赤＝「通常表示に戻す」）。録画 ON/OFF と文字サイズも **localStorage にプレイスルー単位で保存**（`aikyou:recording:<id>` / `aikyou:fontSize:<id>`）し、声設定と同じ復元フローに乗せている。OBS 側はインスタンス1つ・1シーンに2ソースを並べる構成を想定し、あいきょうは**ブラウザソースで `localhost` を直接指定**して縦長の枠に収める（録画モードの文字サイズはこの枠幅に合わせるためのもの）。

## Scope discipline

**Still out of scope** — do not implement without a fresh request: **retrieval/RAG / embeddings** (knowledge stays whole-prompt injected) and **multi-game support / knowledge-swap UI** (DQ3-FC only). Also unchanged: no auth/multi-tenancy, no deployment.

Already shipped (Phase 2, no longer "やらないこと"): voice STT/TTS, AI persona, YouTube log export, conversation-history persistence, response streaming. New scope beyond the above gets cut as a fresh requirement. Errors should surface on screen rather than being swallowed — the developer debugs them directly.

## Development tickets & Todo convention

Implementation work is split into numbered tickets under **`docs/`** (`docs/00-overview.md` is the index and recommended build order). Phase 1 is `docs/01-08`; Phase 2 is `docs/09-14` (overview in `docs/09-phase2-overview.md`). Read the relevant ticket before implementing that feature; tickets reference the authoritative `REQUIREMENTS.md` sections.

Each ticket also tracks its own Todo list. The convention:

- Open items are written as `- [ ]`.
- When an item is **done, rewrite `- [ ]` as `- [×]`** (full-width `×`, not `- [x]`).
- A ticket is complete once all its Todos are `- [×]`.

Keep these checkboxes up to date as work progresses — they are the single source of truth for what's left.

## Notes

- `.mcp.json` is gitignored (it holds local MCP server config / secrets) — do not commit it.
- The knowledge `.md` files contain text derived from external strategy sites; use them as server-side input data only, do not publish or redistribute the raw files. What's served to the user is the AI's response, not the source data.
