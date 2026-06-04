import { NextResponse } from "next/server";
import { synthesizeSpeech } from "@/lib/tts";

// Anthropic と同じく Node ランタイム必須（fetch でのサーバ側外部呼び出し・環境変数）。
export const runtime = "nodejs";
// 音声生成はキャッシュしない。
export const dynamic = "force-dynamic";

interface TtsRequest {
  text?: string;
  voice?: string;
}

// 1リクエストあたりの文字数上限（逐次再生で1文ずつ来る前提。暴発防止）。
const MAX_CHARS = 500;

export async function POST(req: Request) {
  let body: TtsRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエスト本文が不正です。" }, { status: 400 });
  }

  const text = body.text?.trim();
  if (!text) {
    return NextResponse.json({ error: "text が必要です。" }, { status: 400 });
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `text が長すぎます（${MAX_CHARS}文字以内）。` },
      { status: 400 },
    );
  }

  try {
    const audio = await synthesizeSpeech(text, body.voice);
    return NextResponse.json({ audio });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
