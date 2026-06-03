import { NextResponse } from "next/server";
import { getAnthropic, MODEL_CHAT } from "@/lib/anthropic";
import { getSupabase } from "@/lib/supabase";
import { buildSystemBlocks } from "@/lib/prompt";
import type { ChatMessage } from "@/types/chat";
import type { Playthrough } from "@/types/playthrough";

// process.cwd() でのファイル読込・Anthropic SDK のため Node ランタイム必須。
export const runtime = "nodejs";
// AI 応答はキャッシュしない。
export const dynamic = "force-dynamic";

interface ChatRequest {
  playthroughId?: string;
  messages?: ChatMessage[];
}

export async function POST(req: Request) {
  let body: ChatRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエスト本文が不正です。" }, { status: 400 });
  }

  const { playthroughId, messages } = body;
  if (!playthroughId || !Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "playthroughId と messages（1件以上）が必要です。" },
      { status: 400 },
    );
  }

  // DB から対象プレイスルーを取得。
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("playthroughs")
    .select("title, game_version, state")
    .eq("id", playthroughId)
    .single<Pick<Playthrough, "title" | "game_version" | "state">>();

  if (error || !data) {
    return NextResponse.json(
      { error: `プレイスルーが見つかりません: ${error?.message ?? playthroughId}` },
      { status: 404 },
    );
  }

  // システムプロンプト（不変ナレッジ＋現在 state）を組み立てて Claude に投げる。
  const system = await buildSystemBlocks({
    title: data.title,
    game_version: data.game_version,
    state: data.state,
  });

  const anthropic = getAnthropic();
  const claudeStream = anthropic.messages.stream({
    model: MODEL_CHAT,
    max_tokens: 1024,
    system,
    messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  // テキスト差分を逐次クライアントへ流す（1文字ずつ表示するため）。
  const encoder = new TextEncoder();
  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const event of claudeStream) {
          if (
            event.type === "content_block_delta" &&
            event.delta.type === "text_delta"
          ) {
            controller.enqueue(encoder.encode(event.delta.text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new Response(responseStream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}
