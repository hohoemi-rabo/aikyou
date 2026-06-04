"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_TTS_VOICE } from "@/types/tts";

/**
 * 読み上げる前に Markdown の記号を取り除く。
 * モデルが装飾記号（**強調**、箇条書きの * など）を使っても「アスタリスク」等と
 * 発音させないための保険。表示側のテキストはそのままで、音声に渡す文字列だけ整える。
 */
function stripForSpeech(s: string): string {
  return s
    .replace(/`([^`]*)`/g, "$1") // インラインコード `x` → x
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1") // [表示](url) → 表示
    .replace(/[*_#>~`|]/g, "") // 装飾・箇条書き記号を除去
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Google Cloud TTS（WaveNet）による読み上げ。
 * 文単位で enqueue され、/api/tts で音声を生成して「順番に」再生する（逐次再生）。
 * API キーはサーバ専用のため、生成は必ず /api/tts 経由（このフックはキーに触れない）。
 */
export function useTts() {
  const [voice, setVoice] = useState(DEFAULT_TTS_VOICE);
  const [speaking, setSpeaking] = useState(false);
  const [ttsError, setTtsError] = useState<string | null>(null);

  const queueRef = useRef<string[]>([]);
  const processingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // 選択中ボイスを非同期ループ内から最新値で読むための参照。
  const voiceRef = useRef(voice);
  // 世代カウンタ。cancel のたびに +1 し、進行中の非同期処理を無効化する。
  const genRef = useRef(0);

  useEffect(() => {
    voiceRef.current = voice;
  }, [voice]);

  // base64 mp3 を再生し、再生完了（またはエラー）で解決する。
  const playAudio = useCallback((base64: string) => {
    return new Promise<void>((resolve) => {
      const audio = new Audio(`data:audio/mp3;base64,${base64}`);
      audioRef.current = audio;
      audio.onended = () => resolve();
      audio.onerror = () => resolve();
      audio.play().catch((e) => {
        // 自動再生がブロックされた等は握りつぶさず表示する。
        setTtsError(`音声を再生できませんでした：${e instanceof Error ? e.message : String(e)}`);
        resolve();
      });
    });
  }, []);

  const processQueue = useCallback(async () => {
    if (processingRef.current) return;
    processingRef.current = true;
    const gen = genRef.current;
    setSpeaking(true);
    try {
      while (queueRef.current.length > 0) {
        if (gen !== genRef.current) break; // cancel された
        const text = queueRef.current.shift()!;

        let audioContent: string;
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            cache: "no-store",
            body: JSON.stringify({ text, voice: voiceRef.current }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
          audioContent = data.audio as string;
        } catch (e) {
          // この文だけ失敗扱いにして次へ進む（読み上げ全体は止めない）。
          setTtsError(e instanceof Error ? e.message : String(e));
          continue;
        }

        if (gen !== genRef.current) break;
        await playAudio(audioContent);
      }
    } finally {
      // cancel 済みなら cancel 側のリセットを尊重し、ここでは触らない。
      if (gen === genRef.current) {
        processingRef.current = false;
        setSpeaking(false);
      }
    }
  }, [playAudio]);

  /** 文（や短い塊）を読み上げキューに追加する。 */
  const enqueue = useCallback(
    (text: string) => {
      const t = stripForSpeech(text);
      if (!t) return;
      setTtsError(null);
      queueRef.current.push(t);
      void processQueue();
    },
    [processQueue],
  );

  /** 再生中・キュー待ちをすべて止めてクリアする。 */
  const cancel = useCallback(() => {
    genRef.current += 1;
    queueRef.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    processingRef.current = false;
    setSpeaking(false);
  }, []);

  // アンマウント時に停止。
  useEffect(() => {
    return () => {
      genRef.current += 1;
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  return {
    voice,
    setVoice,
    speaking,
    ttsError,
    enqueue,
    cancel,
  };
}
