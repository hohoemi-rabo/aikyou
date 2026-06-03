# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

「あいきょう / AI Kyou」— a **single-user companion AI** for playing retro games (Phase 1 target: Famicom Dragon Quest 3) while talking to an AI partner. The real deliverable is a YouTube video of "playing an old game while chatting with an AI," not a public web service. There is one user (the developer); no auth, no multi-tenancy.

The codebase is currently a near-empty `create-next-app` scaffold. **`REQUIREMENTS.md` is the source of truth** for what to build — read it before implementing. It is a Phase 1 (MVP) implementation spec, and its "やらないこと (things NOT to do)" list is a hard constraint.

## Commands

```bash
npm run dev      # Next.js dev server (Turbopack) at http://localhost:3000
npm run build    # production build (Turbopack)
npm run start    # serve the production build
npm run lint     # ESLint (flat config: eslint.config.mjs)
```

No test runner is configured yet. Deployment is out of scope — this only needs to run locally on the developer's PC.

## Stack

Next.js 15 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v3 · Supabase (`@supabase/...`) · Anthropic SDK (`@anthropic-ai/sdk`). Path alias `@/*` → `src/*`.

- **Models:** all endpoints use **Claude Haiku 4.5** (`claude-haiku-4-5-20251001`). The only sanctioned exception: `/api/end-session` may be raised to Sonnet 4.6 (`claude-sonnet-4-6`) if state JSON output is unreliable (it runs once per session, so cost is negligible). Chat stays on Haiku.
- **API key:** `ANTHROPIC_API_KEY`, server-side only — never expose to the client. All Anthropic calls go through Next.js API Routes.
- Supabase RLS and auth are intentionally **not** configured (local/limited environment).

## Core architecture (the two ideas that matter)

### 1. Continuity lives in `state`, not chat history

RPGs span many sessions. Conversation history is held **only in client memory for the current session** (it's fine for it to vanish on reload). Cross-session continuity is carried entirely by a single `state` JSON blob.

- One Supabase table: **`playthroughs`** (`id`, `title`, `game_version`, `state jsonb`, timestamps). No other tables. `game_version` is required and load-bearing (see below).
- `state` holds `party / location / progress / next_goals / notes`. Treat the schema **loosely** — the AI may add fields; don't enforce a rigid shape. Required keys: `party`, `location`, `next_goals`.
- **`POST /api/chat`** — server loads `state` from DB, builds the system prompt, returns the AI's text reply.
- **`POST /api/end-session`** — server sends current `state` + the full session conversation and asks Claude to emit **only the new state JSON**. Parse defensively: strip ```json fences, `JSON.parse`, and on failure keep the old state and surface the error. On success, update `state` + `updated_at`.

### 2. Knowledge is injected wholesale into the prompt, with caching

The Claude API does **not** open URLs. "Making the AI aware" of strategy knowledge means literally pasting the text into the system prompt. No RAG, no retrieval, no embeddings.

- Strategy knowledge lives in **`knowledge/dq3-fc/`** (~48 markdown files split by job/town/dungeon/etc., plus `_ai-notes.md` for meta-guidance). This is at the **repo root, not `public/` and not `src/`** — `public/` would expose it via URL; it must be read server-side only via `path.join(process.cwd(), 'knowledge', 'dq3-fc')`.
- Read **all** `.md` files and concatenate into one string. **Sort by filename deterministically** (`readdir` order is OS-dependent) and pin **`_ai-notes.md` first**. Deterministic order is what makes prompt caching hit. Cache the concatenated result in memory; don't re-read files per request.
- **Prompt cache is effectively required** (concatenated knowledge ≈ 40k tokens). Order the prompt as: (1) system instructions + concatenated knowledge — invariant, **this is the cache target, keep it at the very front**; (2) current `state`; (3) session conversation. Don't reorder 1.
- Knowledge filenames must be **ASCII** (hyphenated). Japanese filenames break across WSL2/Windows/Git encoding normalization. The Japanese title is kept as the first-line `# heading` inside each file — the AI identifies content by heading.

## Content correctness constraint

All game content must match the **Famicom (FC) 1988** version — never mix in SFC/GBC/mobile/HD-2D remake facts (jobs, spells, dungeon layouts differ by version). `game_version` exists to enforce this in the system prompt. `knowledge/dq3-fc/_ai-notes.md` documents the FC-specific gotchas (no personality system, no Pachisi, battery-backup saves, etc.) and items flagged `⚠️要確認` are unverified and must not be stated as fact.

## Next.js App Router の作法 (15.5.x)

このプロジェクトの構成（Route Handler にサーバー処理を集約し、クライアントから fetch する）に直結する範囲のベストプラクティス。出典は context7 の Next.js 公式ドキュメント。

- **Route Handler は `src/app/api/<name>/route.ts`** に置き、`POST`/`GET` を named export する。リクエスト本文は `await req.json()`、応答は `NextResponse.json(...)`（`next/server`）。Anthropic 呼び出し・Supabase アクセス・`knowledge/` のファイル読込はすべてここに閉じ込める。
- **Route Handler は Server Components から呼ばない。** Server Component は自分のコードを直接実行すればよく、自分の API を fetch すると余計なサーバーラウンドトリップになる。Route Handler は「クライアント（`"use client"`）からの呼び出し口」と割り切る。`/api/chat` と `/api/end-session` はチャット UI（クライアント）から叩く前提。
- **`export const runtime = 'nodejs'` を Route Handler に明示する。** `process.cwd()` でのファイル読込・Node の `fs`/`path`・Anthropic SDK は Edge ランタイムでは動かない。Edge はミドルウェア専用と考える。
- **AI 応答はキャッシュさせない。** Route Handler の `POST` は既定で動的だが、意図を明示するため `export const dynamic = 'force-dynamic'` を付け、外部 fetch を使う箇所では `cache: 'no-store'` を指定する。逆に **`knowledge/` の連結結果はリクエストをまたいでメモリにキャッシュ**する（Next のキャッシュ機構ではなくモジュールスコープの変数で）。
- **環境変数はサーバー専用に保つ。** `ANTHROPIC_API_KEY` などの秘密情報に `NEXT_PUBLIC_` を付けない（付けるとクライアントバンドルに焼き込まれる）。秘密値は Route Handler / Server Component 内の `process.env` でのみ参照する。
- **Server Components を既定にし、`"use client"` は最小限に。** クライアント側 JS とバンドルサイズを抑えるため、`"use client"` は状態やイベントを持つ末端コンポーネントだけに付ける。MVP のチャット入力欄まわりが該当する。
- **ストリーミングと `loading.tsx` / `<Suspense>` は MVP では任意。** 凝った UI 演出は Phase 2 スコープ（§4.2 の「やらないこと」）。チャット応答のストリーミングを入れる場合のみ Route Handler から `ReadableStream` / Anthropic の stream を返す。

## Scope discipline

Do **not** pre-implement Phase 2 items (retrieval/RAG, voice STT/TTS, AI persona UI, YouTube log export, multi-game support, conversation history persistence, auth, responsive/animation polish). See REQUIREMENTS.md §4.2 and §9. Build the MVP; new requirements get cut separately once it works. Errors should surface on screen rather than being swallowed — the developer debugs them directly.

## Notes

- `.mcp.json` is gitignored (it holds local MCP server config / secrets) — do not commit it.
- The knowledge `.md` files contain text derived from external strategy sites; use them as server-side input data only, do not publish or redistribute the raw files. What's served to the user is the AI's response, not the source data.
