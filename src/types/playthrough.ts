/**
 * パーティメンバー1人分。AI が追記する場合に備え、未知のフィールドも許容する。
 */
export interface PartyMember {
  name: string;
  job?: string;
  level?: number;
  [key: string]: unknown;
}

/**
 * プレイスルーの状態（継続性の心臓部）。
 *
 * スキーマは緩く扱う：必須は party / location / next_goals の3つだけで、
 * AI が他のフィールドを追記しても壊れないよう [key: string]: unknown を許容する。
 */
export interface PlaythroughState {
  party: PartyMember[];
  location: string;
  next_goals: string[];
  progress?: string;
  notes?: string;
  /**
   * 前回セッションの要約（日本語の短い文章）。end-session が毎回その回ぶんで
   * 上書きし、次回の続き開始時にチャットの【前回のあらすじ】として相棒へ渡す。
   */
  last_session_summary?: string;
  [key: string]: unknown;
}

/**
 * 相棒AIのペルソナ（名前・口調・性格など）。
 * state 同様に緩く扱い、未知のフィールドも許容する。
 */
export interface Persona {
  name?: string;
  tone?: string;
  personality?: string;
  [key: string]: unknown;
}

/**
 * playthroughs テーブルの1行。
 */
export interface Playthrough {
  id: string;
  title: string;
  game_version: string;
  state: PlaythroughState;
  persona: Persona;
  created_at: string;
  updated_at: string;
}
