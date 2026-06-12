"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ChatMessage } from "@/types/chat";
import type { PlaythroughState, Persona } from "@/types/playthrough";
import { updatePersona } from "@/app/actions";
import { useSpeech } from "@/hooks/useSpeech";
import { useTts } from "@/hooks/useTts";
import { TTS_VOICES, isKnownVoice } from "@/types/tts";

/**
 * ストリーミング中のバッファから「文末（。！？!?改行）まで確定した文」を切り出す。
 * 残り（文末未確定の末尾）は rest として持ち越す。
 */
function takeSentences(buf: string): { sentences: string[]; rest: string } {
  const sentences: string[] = [];
  let start = 0;
  for (let i = 0; i < buf.length; i++) {
    const ch = buf[i];
    if (ch === "。" || ch === "！" || ch === "？" || ch === "!" || ch === "?" || ch === "\n") {
      const s = buf.slice(start, i + 1).trim();
      if (s) sentences.push(s);
      start = i + 1;
    }
  }
  return { sentences, rest: buf.slice(start) };
}

interface Props {
  id: string;
  title: string;
  gameVersion: string;
  initialState: PlaythroughState;
  initialPersona: Persona;
}

/** 録画モードのチャット文字サイズ。OBS の枠の大きさに合わせて切り替える。 */
type ChatFontSize = "base" | "lg" | "2xl";
const FONT_OPTIONS: { value: ChatFontSize; label: string }[] = [
  { value: "base", label: "小" },
  { value: "lg", label: "中" },
  { value: "2xl", label: "大" },
];
const FONT_CLASS: Record<ChatFontSize, string> = {
  base: "text-base",
  lg: "text-lg",
  "2xl": "text-2xl",
};
function isChatFontSize(v: string): v is ChatFontSize {
  return v === "base" || v === "lg" || v === "2xl";
}

export default function SessionClient({
  id,
  title,
  gameVersion,
  initialState,
  initialPersona,
}: Props) {
  // 会話履歴はこのセッション中だけクライアントのメモリに保持（リロードで消えてよい）。
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<PlaythroughState>(initialState);
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ペルソナ編集
  const [personaOpen, setPersonaOpen] = useState(false);
  const [persona, setPersona] = useState<Persona>(initialPersona);
  const [savingPersona, setSavingPersona] = useState(false);

  // 音声入力（STT）はブラウザ標準。出力（読み上げ）は Google TTS（useTts）。
  // 既定で ON（つけ忘れ防止）。localStorage に保存があればそれを優先して復元する。
  const [voiceOutput, setVoiceOutput] = useState(true);
  const { sttSupported, listening, sttError, startListening, stopListening } = useSpeech();
  const { voice, setVoice, ttsError, enqueue, cancel: cancelTts } = useTts();

  // 録画モード（会話だけを大きく表示）と文字サイズ。録画するときだけ ON にする。
  const [recording, setRecording] = useState(false);
  const [chatFontSize, setChatFontSize] = useState<ChatFontSize>("lg");

  // 声・読み上げON/OFF・録画設定はプレイスルーごとに localStorage で記憶し、再開時に復元する。
  // localStorage は SSR で参照できないため、マウント後（useEffect）に読み込む。
  const [voicePrefsLoaded, setVoicePrefsLoaded] = useState(false);
  const voiceKey = `aikyou:voice:${id}`;
  const voiceOutputKey = `aikyou:voiceOutput:${id}`;
  const recordingKey = `aikyou:recording:${id}`;
  const fontSizeKey = `aikyou:fontSize:${id}`;

  useEffect(() => {
    const savedVoice = localStorage.getItem(voiceKey);
    if (savedVoice && isKnownVoice(savedVoice)) setVoice(savedVoice);
    const savedOutput = localStorage.getItem(voiceOutputKey);
    if (savedOutput !== null) setVoiceOutput(savedOutput === "true");
    const savedRecording = localStorage.getItem(recordingKey);
    if (savedRecording !== null) setRecording(savedRecording === "true");
    const savedFontSize = localStorage.getItem(fontSizeKey);
    if (savedFontSize && isChatFontSize(savedFontSize)) setChatFontSize(savedFontSize);
    setVoicePrefsLoaded(true);
    // 復元は初回マウント時のみ（id 単位）。
  }, [voiceKey, voiceOutputKey, recordingKey, fontSizeKey, setVoice]);

  // 復元が済んでから保存する（初期値で上書きしないため）。
  useEffect(() => {
    if (voicePrefsLoaded) localStorage.setItem(voiceKey, voice);
  }, [voice, voiceKey, voicePrefsLoaded]);
  useEffect(() => {
    if (voicePrefsLoaded) localStorage.setItem(voiceOutputKey, String(voiceOutput));
  }, [voiceOutput, voiceOutputKey, voicePrefsLoaded]);
  useEffect(() => {
    if (voicePrefsLoaded) localStorage.setItem(recordingKey, String(recording));
  }, [recording, recordingKey, voicePrefsLoaded]);
  useEffect(() => {
    if (voicePrefsLoaded) localStorage.setItem(fontSizeKey, chatFontSize);
  }, [chatFontSize, fontSizeKey, voicePrefsLoaded]);

  // 冒険ログ出力
  const [exporting, setExporting] = useState(false);
  const [exportLog, setExportLog] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
    cancelTts();
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setInput("");
    setSending(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ playthroughId: id, messages: next }),
      });

      if (!res.ok) {
        // エラー時は JSON で返る。
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      if (!res.body) throw new Error("応答ストリームを取得できませんでした。");

      // 空の相棒メッセージを置いてから、届いた差分を1文字ずつ追記していく。
      setMessages([...next, { role: "assistant", content: "" }]);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      let ttsBuf = ""; // 読み上げ用：まだキュー投入していない末尾。
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        acc += chunk;
        setMessages([...next, { role: "assistant", content: acc }]);

        // 読み上げ ON なら、文末が確定するたびに文単位で逐次再生キューへ。
        if (voiceOutput) {
          ttsBuf += chunk;
          const { sentences, rest } = takeSentences(ttsBuf);
          sentences.forEach((s) => enqueue(s));
          ttsBuf = rest;
        }
      }

      // 最後に残った文末未確定ぶんも読み上げる。
      if (voiceOutput && ttsBuf.trim()) enqueue(ttsBuf.trim());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  }

  async function endSession() {
    if (ending) return;
    setError(null);
    setEnding(true);
    try {
      const res = await fetch("/api/end-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ playthroughId: id, messages }),
      });
      const data = await res.json();
      if (!res.ok) {
        // 失敗時もサーバは旧 state を返す。あらすじは更新せずエラーだけ出す。
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setState(data.state as PlaythroughState);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEnding(false);
    }
  }

  // 保存中（end-session 実行中）はタブを閉じる／リロードを警告して、保存の中断を防ぐ。
  useEffect(() => {
    if (!ending) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [ending]);

  async function savePersona() {
    setSavingPersona(true);
    setError(null);
    try {
      await updatePersona(id, persona);
      setPersonaOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingPersona(false);
    }
  }

  function toggleMic() {
    if (listening) {
      stopListening();
      return;
    }
    startListening((text) => setInput((prev) => (prev ? `${prev} ${text}` : text)));
  }

  async function generateLog() {
    if (exporting || messages.length === 0) return;
    setExporting(true);
    setError(null);
    setCopied(false);
    try {
      const res = await fetch("/api/export-log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ playthroughId: id, messages }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setExportLog(data.log as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setExporting(false);
    }
  }

  async function copyLog() {
    if (!exportLog) return;
    try {
      await navigator.clipboard.writeText(exportLog);
      setCopied(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  const personaLabel = persona.name ? `相棒：${persona.name}` : "相棒の設定";

  return (
    <main
      className={`mx-auto flex flex-col gap-4 px-6 py-8 ${
        recording ? "max-w-none" : "max-w-3xl"
      }`}
    >
      {/* 保存中は画面全体を覆って操作させない（保存の中断を防ぐ）。 */}
      {ending && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
          role="status"
          aria-live="polite"
          aria-busy="true"
        >
          <div className="flex items-center gap-3 rounded-lg border border-slate-600 bg-slate-800 px-6 py-4 text-slate-100 shadow-xl">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-slate-500 border-t-slate-100" />
            <span className="text-sm font-medium">保存中… そのままお待ちください</span>
          </div>
        </div>
      )}

      {!recording && (
        <div className="flex items-center justify-between">
          <Link
            href="/"
            aria-disabled={ending}
            onClick={(e) => {
              if (ending) e.preventDefault();
            }}
            className={`text-sm ${
              ending
                ? "pointer-events-none text-slate-600"
                : "text-slate-400 hover:text-slate-200 hover:underline"
            }`}
          >
            ← 一覧へ戻る
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href={`/play/${id}/log`}
              aria-disabled={ending}
              onClick={(e) => {
                if (ending) e.preventDefault();
              }}
              className={`rounded border border-slate-600 px-3 py-1.5 text-sm font-medium ${
                ending
                  ? "pointer-events-none text-slate-600 opacity-50"
                  : "text-slate-200 hover:bg-slate-800"
              }`}
            >
              ふりかえり
            </Link>
            <button
              onClick={endSession}
              disabled={ending}
              className="rounded border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
            >
              {ending ? "保存中…" : "セッション終了して保存"}
            </button>
          </div>
        </div>
      )}

      <header className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-bold text-slate-100">{title}</h1>
          {!recording && <p className="text-sm text-slate-400">{gameVersion}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {/* 録画モード中だけ文字サイズを切り替えられる（OBS の枠に合わせる）。 */}
          {recording && (
            <div className="flex items-center gap-1">
              <span className="text-xs text-slate-400">文字</span>
              {FONT_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setChatFontSize(opt.value)}
                  className={`rounded border px-2 py-1 text-sm ${
                    chatFontSize === opt.value
                      ? "border-blue-500 bg-blue-600 text-white"
                      : "border-slate-600 text-slate-200 hover:bg-slate-800"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          )}
          {!recording && (
            <button
              onClick={() => setPersonaOpen((v) => !v)}
              className="rounded border border-slate-600 px-3 py-1.5 text-sm text-slate-200 hover:bg-slate-800"
            >
              {personaLabel}
            </button>
          )}
          <button
            onClick={() => setRecording((v) => !v)}
            className={`rounded border px-3 py-1.5 text-sm font-medium ${
              recording
                ? "border-red-500 bg-red-600 text-white hover:bg-red-500"
                : "border-green-500 bg-green-600 text-white hover:bg-green-500"
            }`}
          >
            {recording ? "通常表示に戻す" : "録画モード"}
          </button>
        </div>
      </header>

      {/* 相棒（ペルソナ）の設定 */}
      {!recording && personaOpen && (
        <section className="space-y-3 rounded-lg border border-slate-700 bg-slate-800 p-4 text-sm">
          <h2 className="font-semibold text-slate-100">相棒の設定</h2>
          <div className="flex flex-col gap-1">
            <label className="text-slate-400">名前</label>
            <input
              value={persona.name ?? ""}
              onChange={(e) => setPersona({ ...persona, name: e.target.value })}
              placeholder="例: ナビ"
              className="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-slate-400">口調・話し方</label>
            <input
              value={persona.tone ?? ""}
              onChange={(e) => setPersona({ ...persona, tone: e.target.value })}
              placeholder="例: 明るくフランクなタメ口"
              className="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-slate-400">性格・キャラクター</label>
            <textarea
              value={persona.personality ?? ""}
              onChange={(e) => setPersona({ ...persona, personality: e.target.value })}
              placeholder="例: 面倒見がよく、たまにダジャレを言う"
              rows={2}
              className="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500"
            />
          </div>
          <button
            onClick={savePersona}
            disabled={savingPersona}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {savingPersona ? "保存中…" : "保存"}
          </button>
        </section>
      )}

      {/* 前回までのあらすじ */}
      {!recording && (
        <section className="rounded-lg border border-slate-700 bg-slate-800 p-4 text-sm">
          <h2 className="mb-2 font-semibold text-slate-100">前回までのあらすじ</h2>
          <Synopsis state={state} />
        </section>
      )}

      {error && (
        <p className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* チャット */}
      <section
        className={`flex flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800 p-4 ${
          recording ? "min-h-[75vh]" : "min-h-[40vh]"
        }`}
      >
        <div className="flex-1 space-y-3 overflow-y-auto">
          {messages.length === 0 ? (
            <p className="text-sm text-slate-400">
              相棒に話しかけてみましょう。会話はこのセッション中だけ保持されます。
            </p>
          ) : (
            messages.map((m, i) => (
              <div
                key={i}
                className={m.role === "user" ? "text-right" : "text-left"}
              >
                <span
                  className={`inline-block whitespace-pre-wrap rounded-lg px-3 py-2 leading-relaxed ${
                    recording ? FONT_CLASS[chatFontSize] : "text-sm"
                  } ${
                    m.role === "user"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-700 text-slate-100"
                  }`}
                >
                  {m.content}
                </span>
              </div>
            ))
          )}
          {sending && messages[messages.length - 1]?.role === "user" && (
            <p className="text-sm text-slate-400">相棒が考え中…</p>
          )}
        </div>

        <div className="flex gap-2">
          <button
            onClick={toggleMic}
            disabled={!sttSupported || sending}
            title={sttSupported ? "音声入力" : "このブラウザは音声入力に未対応です"}
            className={`rounded border px-3 py-2 text-sm disabled:opacity-40 ${
              listening
                ? "border-red-500 bg-red-600 text-white"
                : "border-slate-600 text-slate-200 hover:bg-slate-700"
            }`}
          >
            {listening ? "● 録音中" : "🎤"}
          </button>
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder="メッセージを入力（Enterで送信）"
            disabled={sending}
            className="flex-1 rounded border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100 placeholder-slate-500 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={sending || input.trim() === ""}
            className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            送信
          </button>
        </div>

        {/* 声まわりの設定は通常表示のときだけ。録画中は会話をすっきり見せる（設定は保持される）。 */}
        {!recording && (
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-400">
            <label className="flex items-center gap-1.5">
              <input
                type="checkbox"
                checked={voiceOutput}
                onChange={(e) => {
                  setVoiceOutput(e.target.checked);
                  if (!e.target.checked) cancelTts();
                }}
              />
              相棒の返事を読み上げる
            </label>

            <label className="flex items-center gap-1.5">
              <span>声</span>
              <select
                value={voice}
                onChange={(e) => {
                  setVoice(e.target.value);
                  cancelTts(); // 切替時は再生中の旧ボイスを止める。
                }}
                className="rounded border border-slate-600 bg-slate-900 px-2 py-1 text-slate-100"
              >
                {TTS_VOICES.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.label}
                  </option>
                ))}
              </select>
            </label>

            {!sttSupported && <span>※音声入力はChrome/Edgeで使えます</span>}
          </div>
        )}

        {(sttError || ttsError) && (
          <p className="rounded border border-amber-800 bg-amber-950 p-2 text-xs text-amber-300">
            {sttError ?? ttsError}
          </p>
        )}
      </section>

      {/* 冒険ログ（YouTube用）出力 */}
      {!recording && (
      <section className="space-y-3 rounded-lg border border-slate-700 bg-slate-800 p-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-slate-100">動画用ログ</h2>
          <button
            onClick={generateLog}
            disabled={exporting || messages.length === 0}
            className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {exporting ? "生成中…" : "動画用ログを生成"}
          </button>
        </div>
        {exportLog && (
          <div className="space-y-2">
            <div className="flex justify-end">
              <button
                onClick={copyLog}
                className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:bg-slate-700"
              >
                {copied ? "コピーしました" : "コピー"}
              </button>
            </div>
            <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded border border-slate-700 bg-slate-900 p-3 text-sm text-slate-100">
              {exportLog}
            </pre>
          </div>
        )}
      </section>
      )}
    </main>
  );
}

/**
 * state は緩いスキーマ（AI が文字列のはずの欄をオブジェクトや配列で返すことがある）。
 * 何が来ても React の子として描画できるよう、読める文字列へ安全に変換する。
 * （主にパーティ名など、1行に収めたい箇所で使う）
 */
function toText(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join("、");
  return Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => `${humanizeKey(k)}: ${toText(v)}`)
    .join(" / ");
}

/** AI が付けがちな英語キーを、読みやすい日本語ラベルに変換する。 */
const KEY_LABELS: Record<string, string> = {
  story_stage: "物語の段階",
  progress: "進行",
  party_planning: "パーティ編成",
  party: "パーティ",
  equipment_status: "装備状況",
  equipment: "装備",
  location: "現在地",
  level: "レベル",
  gold: "所持金",
  status: "状況",
  notes: "メモ",
  goal: "目標",
  goals: "目標",
  next_goals: "次の目標",
};

function humanizeKey(key: string): string {
  return KEY_LABELS[key] ?? key.replace(/_/g, " ");
}

/** 空（null / 空文字 / 空配列 / 空オブジェクト）かどうか。 */
function isEmptyValue(value: unknown): boolean {
  if (value == null || value === "") return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/**
 * どんな形の値でも見やすく描画する。
 * オブジェクトはキーを日本語ラベル化した「ラベル：値」のリストにする。
 */
function RenderValue({ value }: { value: unknown }) {
  if (isEmptyValue(value)) return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return <span className="whitespace-pre-wrap">{String(value)}</span>;
  }
  if (Array.isArray(value)) {
    return (
      <ul className="list-inside list-disc">
        {value.map((v, i) => (
          <li key={i}>
            <RenderValue value={v} />
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="space-y-1">
      {Object.entries(value as Record<string, unknown>).map(([k, v]) => (
        <li key={k}>
          <span className="text-slate-400">{humanizeKey(k)}：</span>
          <RenderValue value={v} />
        </li>
      ))}
    </ul>
  );
}

function Synopsis({ state }: { state: PlaythroughState }) {
  const party = Array.isArray(state.party) ? state.party : [];
  const goals = Array.isArray(state.next_goals) ? state.next_goals : [];

  return (
    <dl className="space-y-2">
      {!isEmptyValue(state.last_session_summary) && (
        <div>
          <dt className="font-medium text-slate-400">前回のあらすじ</dt>
          <dd>
            <RenderValue value={state.last_session_summary} />
          </dd>
        </div>
      )}
      <div>
        <dt className="font-medium text-slate-400">パーティ</dt>
        <dd>
          {party.length === 0 ? (
            "まだ編成されていません"
          ) : (
            <ul className="list-inside list-disc">
              {party.map((m, i) => (
                <li key={i}>
                  {toText(m.name) || "（名前未設定）"}
                  {m.job ? `／${toText(m.job)}` : ""}
                  {typeof m.level === "number" ? `／Lv.${m.level}` : ""}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-slate-400">現在地</dt>
        <dd>{isEmptyValue(state.location) ? "（未設定）" : <RenderValue value={state.location} />}</dd>
      </div>
      {!isEmptyValue(state.progress) && (
        <div>
          <dt className="font-medium text-slate-400">これまでの進行</dt>
          <dd>
            <RenderValue value={state.progress} />
          </dd>
        </div>
      )}
      <div>
        <dt className="font-medium text-slate-400">次の目標</dt>
        <dd>
          {goals.length === 0 ? (
            "（未設定）"
          ) : (
            <ul className="list-inside list-disc">
              {goals.map((g, i) => (
                <li key={i}>
                  <RenderValue value={g} />
                </li>
              ))}
            </ul>
          )}
        </dd>
      </div>
      {!isEmptyValue(state.notes) && (
        <div>
          <dt className="font-medium text-slate-400">メモ</dt>
          <dd>
            <RenderValue value={state.notes} />
          </dd>
        </div>
      )}
    </dl>
  );
}
