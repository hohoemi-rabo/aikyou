/**
 * セッション中の会話1件。履歴はクライアントのメモリにのみ保持する
 * （リロードで消えてよい。継続性は state が担う）。
 */
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}
