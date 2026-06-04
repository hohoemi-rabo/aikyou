// Google Cloud Text-to-Speech のボイス定義。秘密情報を含まないため
// クライアント（ボイス切替UI）とサーバ（/api/tts）の両方から import してよい。

export interface TtsVoice {
  /** Google TTS のボイス名（languageCode は ja-JP 固定）。 */
  id: string;
  /** 画面に出す表示名。 */
  label: string;
}

/**
 * 日本語 WaveNet ボイス一覧。WaveNet は月100万字まで無料枠内。
 * 先頭をデフォルトとして使う。
 */
export const TTS_VOICES: TtsVoice[] = [
  { id: "ja-JP-Wavenet-B", label: "女性B（明るめ）" },
  { id: "ja-JP-Wavenet-A", label: "女性A（落ち着き）" },
  { id: "ja-JP-Wavenet-C", label: "男性C（低め）" },
  { id: "ja-JP-Wavenet-D", label: "男性D（標準）" },
];

export const DEFAULT_TTS_VOICE = TTS_VOICES[0].id;

/** 既知のボイスかどうか（不正な voice 指定をルートで弾くため）。 */
export function isKnownVoice(id: string): boolean {
  return TTS_VOICES.some((v) => v.id === id);
}
