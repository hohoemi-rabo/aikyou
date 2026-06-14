import { GoogleGenAI, HarmCategory, HarmBlockThreshold } from "@google/genai";

/**
 * 会話（/api/chat）用モデル。Gemini 2.5 Flash。
 * Flash-Lite だと約40kトークンのナレッジ（宝箱と鍵の対応など）を取り違える
 * ＝攻略の事実誤答が出たため、参照力の高い Flash に上げている。
 * コスト最優先で多少の不正確さを許すなら "gemini-2.5-flash-lite" に戻してよい。
 */
export const MODEL_CHAT = "gemini-2.5-flash";

/**
 * state 更新（/api/end-session）用モデル。
 * 会話の要約＋JSON化が主でナレッジ参照は不要なため Flash-Lite で十分。
 * JSON 出力が崩れる頻度が高ければ "gemini-2.5-flash" に上げてよい（1セッション1回でコスト影響は誤差）。
 */
export const MODEL_END_SESSION = "gemini-2.5-flash-lite";

/**
 * ゲーム内容（戦闘・モンスター討伐など）が安全フィルタで弾かれて
 * 空応答になるのを防ぐため、ブロックを全カテゴリ無効にする。
 * 1人用ローカル環境で外部公開しないため許容できる。
 */
export const SAFETY_SETTINGS = [
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
];

let client: GoogleGenAI | null = null;

/**
 * Google Gen AI クライアントをサーバ側でのみ生成・再利用する。
 * API キーはサーバ専用環境変数 GEMINI_API_KEY からのみ読む（クライアントに出さない）。
 * AI Studio の無料枠キーをそのまま使える。
 */
export function getGemini(): GoogleGenAI {
  if (client) return client;

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "GEMINI_API_KEY が設定されていません。.env.local に設定してください。",
    );
  }

  client = new GoogleGenAI({ apiKey });
  return client;
}
