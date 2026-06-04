"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * ブラウザ標準 Web Speech API による音声入力(STT)・読み上げ(TTS)。
 * 追加の API キーやクラウドは使わない。非対応ブラウザでは supported が false になる。
 */
/** SpeechRecognition の error コードを、原因の分かる日本語メッセージに変換する。 */
function sttErrorMessage(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "マイクの使用が許可されていません。ブラウザのアドレスバー左のアイコンからマイクを「許可」にしてください。";
    case "audio-capture":
      return "マイクが見つかりません。デバイスの接続と OS のマイク設定を確認してください。";
    case "no-speech":
      return "音声が聞き取れませんでした。もう一度マイクを押して話してください。";
    case "network":
      return "音声認識サーバーに接続できませんでした（ネットワーク要・オフライン不可）。接続を確認してください。";
    case "aborted":
      return "音声入力が中断されました。";
    default:
      return `音声入力でエラーが発生しました（${code}）。`;
  }
}

export function useSpeech() {
  const [sttSupported, setSttSupported] = useState(false);
  const [ttsSupported, setTtsSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [sttError, setSttError] = useState<string | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  // SSR とのハイドレーション不一致を避けるため、対応可否はマウント後に判定する。
  useEffect(() => {
    setSttSupported(Boolean(window.SpeechRecognition || window.webkitSpeechRecognition));
    setTtsSupported("speechSynthesis" in window);
  }, []);

  const startListening = useCallback((onFinal: (text: string) => void) => {
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Ctor) {
      setSttError("このブラウザは音声入力に対応していません（Chrome / Edge を使ってください）。");
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "ja-JP";
    recognition.interimResults = false;
    recognition.continuous = false;

    recognition.onresult = (event) => {
      let text = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) text += result[0].transcript;
      }
      if (text) onFinal(text);
    };
    // エラーは握りつぶさず、原因が分かる日本語メッセージにして surface する。
    recognition.onerror = (event) => {
      setListening(false);
      setSttError(sttErrorMessage(event.error));
    };
    recognition.onend = () => setListening(false);

    recognitionRef.current = recognition;
    setSttError(null);
    setListening(true);
    // start() は権限拒否や二重起動で同期的に例外を投げることがあるため握る。
    try {
      recognition.start();
    } catch (e) {
      setListening(false);
      setSttError(
        `音声入力を開始できませんでした：${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setListening(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!text || !("speechSynthesis" in window)) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ja-JP";
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      window.speechSynthesis.speak(utterance);
    },
    [],
  );

  const cancelSpeak = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  // アンマウント時に読み上げを止める。
  useEffect(() => {
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    };
  }, []);

  return {
    sttSupported,
    ttsSupported,
    listening,
    speaking,
    sttError,
    startListening,
    stopListening,
    speak,
    cancelSpeak,
  };
}
