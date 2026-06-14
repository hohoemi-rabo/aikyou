import { NextResponse } from "next/server";
import { getGemini, MODEL_CHAT, SAFETY_SETTINGS } from "@/lib/gemini";
import { getSupabase } from "@/lib/supabase";
import { buildSystemInstruction } from "@/lib/prompt";
import type { ChatMessage } from "@/types/chat";
import type { Playthrough } from "@/types/playthrough";

// process.cwd() でのファイル読込・Gen AI SDK のため Node ランタイム必須。
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
    .select("title, game_version, state, persona")
    .eq("id", playthroughId)
    .single<Pick<Playthrough, "title" | "game_version" | "state" | "persona">>();

  if (error || !data) {
    return NextResponse.json(
      { error: `プレイスルーが見つかりません: ${error?.message ?? playthroughId}` },
      { status: 404 },
    );
  }

  // システムプロンプト（不変ナレッジ＋ペルソナ＋現在 state）を組み立てて Gemini に投げる。
  const systemInstruction = await buildSystemInstruction({
    title: data.title,
    game_version: data.game_version,
    state: data.state,
    persona: data.persona,
  });

  // Gemini は role が "user" / "model"（assistant ではない）。
  const contents = messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));

  // ストリーム生成はここで await し、失敗（残高・レート制限等）はきれいな JSON エラーで返す。
  const ai = getGemini();
  let geminiStream;
  try {
    geminiStream = await ai.models.generateContentStream({
      model: MODEL_CHAT,
      contents,
      config: {
        systemInstruction,
        maxOutputTokens: 1024,
        // Flash-Lite は既定で thinking 無効だが、テンポ最優先のため明示的に切る。
        thinkingConfig: { thinkingBudget: 0 },
        safetySettings: SAFETY_SETTINGS,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: `AI応答の生成に失敗しました: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  // 今回のユーザー発言（履歴の末尾）。応答完了後に DB へ保存する。
  const lastUser = messages[messages.length - 1];

  // テキスト差分を逐次クライアントへ流す（1文字ずつ表示するため）。
  const encoder = new TextEncoder();
  const responseStream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let full = "";
      try {
        for await (const chunk of geminiStream) {
          const text = chunk.text;
          if (text) {
            full += text;
            controller.enqueue(encoder.encode(text));
          }
        }
        controller.close();
      } catch (err) {
        controller.error(err);
        return;
      }

      // ふりかえり用に会話を永続化。失敗してもチャット応答は成立させる
      // （履歴保存はベストエフォート。継続性は state が担うため致命的でない）。
      try {
        const rows = [
          { playthrough_id: playthroughId, role: lastUser.role, content: lastUser.content },
          { playthrough_id: playthroughId, role: "assistant", content: full },
        ];
        const { error: insertError } = await supabase.from("messages").insert(rows);
        if (insertError) {
          console.error("[chat] 会話履歴の保存に失敗:", insertError.message);
        }
      } catch (e) {
        console.error("[chat] 会話履歴の保存中に例外:", e);
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
