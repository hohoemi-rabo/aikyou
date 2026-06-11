// Google Cloud Text-to-Speech のボイス定義。秘密情報を含まないため
// クライアント（ボイス切替UI）とサーバ（/api/tts）の両方から import してよい。
//
// 2種類のエンジンを同じ text:synthesize エンドポイントで使い分ける：
//  - WaveNet（無料枠 月100万字）… voice.name に ja-JP-Wavenet-* を指定
//  - Gemini-TTS（プレビュー・有料）… voice.modelName に Gemini モデル、name に
//    Gemini ボイス名（Kore 等）を指定し、input.prompt で口調を指示できる

export interface TtsVoice {
  /** 画面・保存用の一意キー。 */
  id: string;
  /** 画面に出す表示名。 */
  label: string;
  /** Google TTS の voice.name（ja-JP-Wavenet-B / Kore など）。 */
  voiceName: string;
  /** Gemini-TTS のときだけ指定するモデル名。未指定なら通常の WaveNet。 */
  modelName?: string;
  /** Gemini-TTS の口調指示（任意・Gemini のときのみ有効）。 */
  prompt?: string;
}

/**
 * Gemini-TTS のモデル。preview のため仕様変更・廃止の可能性あり。
 * 不安定なら安定版の "gemini-2.5-flash-tts" に差し替える。
 */
export const GEMINI_TTS_MODEL = "gemini-3.1-flash-tts-preview";

/**
 * 選択できるボイス一覧。WaveNet と Neural2（どちらも月100万字まで無料・別枠）を
 * 聞き比べ用に並べる。先頭をデフォルトとして使う。
 *
 * Gemini-TTS（下の GEMINI_VOICE）は Vertex AI 有効化＝有料になるため、今は外している。
 * 使いたくなったら GEMINI_VOICE を末尾に加えるだけで復活できる（lib/tts.ts は対応済み）。
 */
export const TTS_VOICES: TtsVoice[] = [
  // WaveNet（無料枠 月100万字）
  { id: "ja-JP-Wavenet-B", label: "女性B（明るめ／WaveNet）", voiceName: "ja-JP-Wavenet-B" },
  { id: "ja-JP-Wavenet-A", label: "女性A（落ち着き／WaveNet）", voiceName: "ja-JP-Wavenet-A" },
  { id: "ja-JP-Wavenet-C", label: "男性C（低め／WaveNet）", voiceName: "ja-JP-Wavenet-C" },
  { id: "ja-JP-Wavenet-D", label: "男性D（標準／WaveNet）", voiceName: "ja-JP-Wavenet-D" },
  // Neural2（WaveNet の後継・より滑らか／無料枠 月100万字・WaveNet とは別枠）
  { id: "ja-JP-Neural2-B", label: "女性B（明るめ／Neural2）", voiceName: "ja-JP-Neural2-B" },
  { id: "ja-JP-Neural2-C", label: "男性C（低め／Neural2）", voiceName: "ja-JP-Neural2-C" },
  { id: "ja-JP-Neural2-D", label: "男性D（標準／Neural2）", voiceName: "ja-JP-Neural2-D" },
  // Chirp3-HD（最新・最も自然／無料枠 月100万字。同じ Cloud TTS API・キーで使える）
  { id: "ja-JP-Chirp3-HD-Aoede", label: "女性Aoede（Chirp3-HD）", voiceName: "ja-JP-Chirp3-HD-Aoede" },
  { id: "ja-JP-Chirp3-HD-Kore", label: "女性Kore（Chirp3-HD）", voiceName: "ja-JP-Chirp3-HD-Kore" },
  { id: "ja-JP-Chirp3-HD-Charon", label: "男性Charon（Chirp3-HD）", voiceName: "ja-JP-Chirp3-HD-Charon" },
  { id: "ja-JP-Chirp3-HD-Puck", label: "男性Puck（Chirp3-HD）", voiceName: "ja-JP-Chirp3-HD-Puck" },
];

/**
 * Gemini-TTS（プレビュー・有料・要 Vertex AI 有効化）。
 * 復活させるときは TTS_VOICES に push する。口調を prompt で指示できるのが利点。
 */
export const GEMINI_VOICE: TtsVoice = {
  id: "gemini-kore",
  label: "Gemini（Kore・プレビュー）",
  voiceName: "Kore",
  modelName: GEMINI_TTS_MODEL,
  prompt: "親しみやすい先輩ゲーマーの相棒として、明るく自然な日本語で話して。",
};

export const DEFAULT_TTS_VOICE = TTS_VOICES[0].id;

/** id からボイス定義を引く。未知なら既定（WaveNet）に丸める。 */
export function getVoice(id: string): TtsVoice {
  return (
    TTS_VOICES.find((v) => v.id === id) ??
    TTS_VOICES.find((v) => v.id === DEFAULT_TTS_VOICE)!
  );
}

/** 既知のボイスかどうか（不正な voice 指定をルートで弾くため）。 */
export function isKnownVoice(id: string): boolean {
  return TTS_VOICES.some((v) => v.id === id);
}
