import { DEFAULT_TTS_VOICE, getVoice } from "@/types/tts";

/**
 * Google Cloud Text-to-Speech をサーバ側で呼ぶ。WaveNet（無料枠）と
 * Gemini-TTS（プレビュー）を同じ text:synthesize エンドポイントで使い分ける。
 * API キーはサーバ専用環境変数 GOOGLE_TTS_API_KEY からのみ読む（クライアントに出さない）。
 * SDK は使わず REST + fetch で叩く（依存を増やさない）。
 *
 * 注意：Gemini-TTS は API キー認証が許可されていない場合がある。その際は HTTP 401/403
 * が返るので（画面に出る）、サービスアカウント認証への切替を検討する。
 *
 * @returns mp3 音声の base64 文字列（Google がそのまま base64 で返す）。
 */
export async function synthesizeSpeech(
  text: string,
  voiceId: string = DEFAULT_TTS_VOICE,
): Promise<string> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_TTS_API_KEY が設定されていません。.env.local に設定してください。",
    );
  }

  // 未知の id は既定（WaveNet）に丸める（外部入力の検証）。
  const v = getVoice(voiceId);

  // voice：Gemini のときだけ modelName を足す。
  const voice: Record<string, string> = { languageCode: "ja-JP", name: v.voiceName };
  if (v.modelName) voice.modelName = v.modelName;

  // input：Gemini のときだけ口調指示 prompt を足す（WaveNet は text のみ）。
  const input: Record<string, string> = { text };
  if (v.modelName && v.prompt) input.prompt = v.prompt;

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        input,
        voice,
        audioConfig: { audioEncoding: "MP3" },
      }),
    },
  );

  if (!res.ok) {
    // エラーは握りつぶさず、原因が分かる形で投げる（画面に出す方針）。
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Google TTS 呼び出しに失敗しました（HTTP ${res.status}）: ${detail.slice(0, 300)}`,
    );
  }

  const data = (await res.json()) as { audioContent?: string };
  if (!data.audioContent) {
    throw new Error("Google TTS から音声データが返りませんでした。");
  }
  return data.audioContent;
}
