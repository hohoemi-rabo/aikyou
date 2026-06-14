import { NextResponse } from "next/server";
import { getGemini, MODEL_CHAT, SAFETY_SETTINGS } from "@/lib/gemini";
import { getSupabase } from "@/lib/supabase";
import type { ChatMessage } from "@/types/chat";
import type { Playthrough } from "@/types/playthrough";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface ExportRequest {
  playthroughId?: string;
  messages?: ChatMessage[];
}

export async function POST(req: Request) {
  let body: ExportRequest;
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

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("playthroughs")
    .select("title, game_version")
    .eq("id", playthroughId)
    .single<Pick<Playthrough, "title" | "game_version">>();

  if (error || !data) {
    return NextResponse.json(
      { error: `プレイスルーが見つかりません: ${error?.message ?? playthroughId}` },
      { status: 404 },
    );
  }

  const transcript = messages
    .map((m) => `${m.role === "user" ? "プレイヤー" : "相棒"}: ${m.content}`)
    .join("\n");

  const system =
    `あなたはゲーム実況YouTuberの編集アシスタントです。「${data.title}（${data.game_version}）」を` +
    "AIの相棒と会話しながらプレイした今回のセッションの会話ログを渡します。" +
    "これをYouTube動画の概要欄・字幕に貼れる日本語テキストに整形してください。" +
    "次の構成で出力する：(1) 動画タイトル案を2〜3個、(2) 2〜3文の概要、" +
    "(3) 今回のハイライトを箇条書き（起きた出来事・進展）、(4) 次回予告（次の目標）。" +
    "マークダウンの見出しと箇条書きを使い、視聴者が読んで分かる自然な日本語にする。" +
    "ネタバレ配慮や誇張は不要、事実ベースで簡潔に。";

  const ai = getGemini();
  let log: string;
  try {
    const response = await ai.models.generateContent({
      model: MODEL_CHAT,
      contents: `【今回のプレイ会話】\n${transcript}`,
      config: {
        systemInstruction: system,
        maxOutputTokens: 1500,
        thinkingConfig: { thinkingBudget: 0 },
        safetySettings: SAFETY_SETTINGS,
      },
    });
    log = response.text ?? "";
  } catch (e) {
    return NextResponse.json(
      { error: `ログ生成に失敗しました: ${e instanceof Error ? e.message : String(e)}` },
      { status: 502 },
    );
  }

  return NextResponse.json({ log });
}
