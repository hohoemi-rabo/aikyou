import { NextResponse } from "next/server";
import { getGemini, MODEL_END_SESSION, SAFETY_SETTINGS, withRetry } from "@/lib/gemini";
import { getSupabase } from "@/lib/supabase";
import type { ChatMessage } from "@/types/chat";
import type { Playthrough, PlaythroughState } from "@/types/playthrough";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

interface EndSessionRequest {
  playthroughId?: string;
  messages?: ChatMessage[];
}

/** ```json フェンスや前後の余計な文字を取り除いて JSON 本体だけにする。 */
function stripJsonFences(text: string): string {
  let t = text.trim();
  // ```json ... ``` / ``` ... ``` を除去。
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) t = fence[1].trim();
  // 念のため最初の { から最後の } までを抜き出す。
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    t = t.slice(first, last + 1);
  }
  return t;
}

export async function POST(req: Request) {
  let body: EndSessionRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "リクエスト本文が不正です。" }, { status: 400 });
  }

  const { playthroughId, messages } = body;
  if (!playthroughId || !Array.isArray(messages)) {
    return NextResponse.json(
      { error: "playthroughId と messages が必要です。" },
      { status: 400 },
    );
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("playthroughs")
    .select("state")
    .eq("id", playthroughId)
    .single<Pick<Playthrough, "state">>();

  if (error || !data) {
    return NextResponse.json(
      { error: `プレイスルーが見つかりません: ${error?.message ?? playthroughId}` },
      { status: 404 },
    );
  }

  const oldState = data.state;

  // 会話が空ならそのまま現状維持で返す（無駄に AI を呼ばない）。
  if (messages.length === 0) {
    return NextResponse.json({ state: oldState, updated: false });
  }

  const transcript = messages
    .map((m) => `${m.role === "user" ? "プレイヤー" : "相棒"}: ${m.content}`)
    .join("\n");

  const system =
    "あなたはRPGのプレイ状況を更新する記録係です。" +
    "前回の状態と今回の会話をもとに、今回の進展を反映した『新しい状態』を出力します。" +
    "前回と同じJSON構造（party/location/progress/next_goals/notes など）を保ち、" +
    "分かった範囲で更新してください。" +
    "progress と notes は、入れ子のオブジェクトにせず、日本語の短い文章（文字列）で書くこと。" +
    "location は地名の文字列、next_goals は短い日本語文字列の配列にすること。" +
    "パーティの各メンバーは name（名前）/ job（職業）/ level（レベル）のキーで表すこと。" +
    "職業は必ず job キーに入れる（class など別のキー名は使わない）。" +
    "会話で転職（例：僧侶→賢者）があったら、その人物の job を新しい職業に更新すること。" +
    "さらに last_session_summary というキーに、『今回の会話』の要約を日本語3〜6文の文章（文字列）で入れること。" +
    "これは次回プレイ開始時に相棒へ『前回のあらすじ』として渡されるので、" +
    "今回どこまで進んだか・何があったか・印象的なやりとりが伝わるように書く。" +
    "前回の要約は引き継がず、今回ぶんで上書きすること。" +
    "出力はJSONのみ。前置き・説明・コードフェンスは一切付けないこと。";

  const userContent =
    `【前回までの状態】\n${JSON.stringify(oldState, null, 2)}\n\n` +
    `【今回のプレイ会話】\n${transcript}`;

  const ai = getGemini();
  let raw: string;
  try {
    // 進行の保存は重要なので、一時的な過負荷（503 等）は自動リトライする。
    const response = await withRetry(() =>
      ai.models.generateContent({
        model: MODEL_END_SESSION,
        contents: userContent,
        config: {
          systemInstruction: system,
          maxOutputTokens: 2048,
          // JSON だけを返させる（コードフェンスや前置きが付かない）。
          responseMimeType: "application/json",
          thinkingConfig: { thinkingBudget: 0 },
          safetySettings: SAFETY_SETTINGS,
        },
      }),
    );
    raw = response.text ?? "";
  } catch (e) {
    return NextResponse.json(
      {
        error: `state 更新の生成に失敗しました（旧stateを維持）: ${
          e instanceof Error ? e.message : String(e)
        }`,
        state: oldState,
        updated: false,
      },
      { status: 502 },
    );
  }

  // 防御的パース：失敗時は旧 state を維持し、エラーを画面に出す。
  let newState: PlaythroughState;
  try {
    newState = JSON.parse(stripJsonFences(raw)) as PlaythroughState;
  } catch (e) {
    return NextResponse.json(
      {
        error: `新しい状態のJSON解析に失敗しました（旧stateを維持）: ${
          e instanceof Error ? e.message : String(e)
        }`,
        raw,
        state: oldState,
        updated: false,
      },
      { status: 502 },
    );
  }

  // 必須キーの最低限チェック（緩く・落とさない）。
  if (!Array.isArray(newState.party) || typeof newState.location !== "string") {
    return NextResponse.json(
      {
        error: "生成された状態に必須キー（party/location）が不足しています（旧stateを維持）。",
        raw,
        state: oldState,
        updated: false,
      },
      { status: 502 },
    );
  }

  const { error: updateError } = await supabase
    .from("playthroughs")
    .update({ state: newState, updated_at: new Date().toISOString() })
    .eq("id", playthroughId);

  if (updateError) {
    return NextResponse.json(
      { error: `state の保存に失敗しました: ${updateError.message}`, state: oldState, updated: false },
      { status: 500 },
    );
  }

  return NextResponse.json({ state: newState, updated: true });
}
