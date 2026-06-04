import { DEFAULT_TTS_VOICE, isKnownVoice } from "@/types/tts";

/**
 * Google Cloud Text-to-Speech（WaveNet）をサーバ側で呼ぶ。
 * API キーはサーバ専用環境変数 GOOGLE_TTS_API_KEY からのみ読む（クライアントに出さない）。
 * SDK は使わず REST + fetch で叩く（依存を増やさない・APIキー方式で軽量）。
 *
 * @returns mp3 音声の base64 文字列（Google がそのまま base64 で返す）。
 */
export async function synthesizeSpeech(
  text: string,
  voice: string = DEFAULT_TTS_VOICE,
): Promise<string> {
  const apiKey = process.env.GOOGLE_TTS_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GOOGLE_TTS_API_KEY が設定されていません。.env.local に設定してください。",
    );
  }

  // 不正なボイス名はデフォルトに丸める（外部入力の検証）。
  const voiceName = isKnownVoice(voice) ? voice : DEFAULT_TTS_VOICE;

  const res = await fetch(
    `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: JSON.stringify({
        input: { text },
        voice: { languageCode: "ja-JP", name: voiceName },
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
