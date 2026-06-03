import Anthropic from "@anthropic-ai/sdk";

/**
 * 会話（/api/chat）用モデル。テンポ重視で Haiku 4.5 固定。
 */
export const MODEL_CHAT = "claude-haiku-4-5-20251001";

/**
 * state 更新（/api/end-session）用モデル。
 * 既定は Haiku 4.5。JSON 出力が崩れる頻度が高ければ、ここだけ
 * Sonnet 4.6（"claude-sonnet-4-6"）に上げてよい（1セッション1回でコスト影響は誤差）。
 */
export const MODEL_END_SESSION = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;

/**
 * Anthropic クライアントをサーバ側でのみ生成・再利用する。
 * API キーはサーバ専用環境変数 ANTHROPIC_API_KEY からのみ読む（クライアントに出さない）。
 */
export function getAnthropic(): Anthropic {
  if (client) return client;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error(
      "ANTHROPIC_API_KEY が設定されていません。.env.local に設定してください。",
    );
  }

  client = new Anthropic({ apiKey });
  return client;
}
