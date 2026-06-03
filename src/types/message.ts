/**
 * messages テーブルの1行（会話履歴の永続化レコード）。
 */
export interface Message {
  id: string;
  playthrough_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}
