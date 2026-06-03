"use client";

import { useState } from "react";
import Link from "next/link";
import type { ChatMessage } from "@/types/chat";
import type { PlaythroughState } from "@/types/playthrough";

interface Props {
  id: string;
  title: string;
  gameVersion: string;
  initialState: PlaythroughState;
}

export default function SessionClient({ id, title, gameVersion, initialState }: Props) {
  // 会話履歴はこのセッション中だけクライアントのメモリに保持（リロードで消えてよい）。
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [state, setState] = useState<PlaythroughState>(initialState);
  const [sending, setSending] = useState(false);
  const [ending, setEnding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    const text = input.trim();
    if (!text || sending) return;

    setError(null);
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
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages([...next, { role: "assistant", content: acc }]);
      }
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

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 px-6 py-8">
      <div className="flex items-center justify-between">
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-200 hover:underline">
          ← 一覧へ戻る
        </Link>
        <button
          onClick={endSession}
          disabled={ending}
          className="rounded border border-slate-600 px-3 py-1.5 text-sm font-medium text-slate-200 hover:bg-slate-800 disabled:opacity-50"
        >
          {ending ? "保存中…" : "セッション終了して保存"}
        </button>
      </div>

      <header>
        <h1 className="text-xl font-bold text-slate-100">{title}</h1>
        <p className="text-sm text-slate-400">{gameVersion}</p>
      </header>

      {/* 前回までのあらすじ */}
      <section className="rounded-lg border border-slate-700 bg-slate-800 p-4 text-sm">
        <h2 className="mb-2 font-semibold text-slate-100">前回までのあらすじ</h2>
        <Synopsis state={state} />
      </section>

      {error && (
        <p className="rounded border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {/* チャット */}
      <section className="flex min-h-[40vh] flex-col gap-3 rounded-lg border border-slate-700 bg-slate-800 p-4">
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
                  className={`inline-block whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
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
      </section>
    </main>
  );
}

function Synopsis({ state }: { state: PlaythroughState }) {
  const party = Array.isArray(state.party) ? state.party : [];
  const goals = Array.isArray(state.next_goals) ? state.next_goals : [];

  return (
    <dl className="space-y-2">
      <div>
        <dt className="font-medium text-slate-400">パーティ</dt>
        <dd>
          {party.length === 0 ? (
            "まだ編成されていません"
          ) : (
            <ul className="list-inside list-disc">
              {party.map((m, i) => (
                <li key={i}>
                  {m.name ?? "（名前未設定）"}
                  {m.job ? `／${m.job}` : ""}
                  {typeof m.level === "number" ? `／Lv.${m.level}` : ""}
                </li>
              ))}
            </ul>
          )}
        </dd>
      </div>
      <div>
        <dt className="font-medium text-slate-400">現在地</dt>
        <dd>{state.location || "（未設定）"}</dd>
      </div>
      {state.progress && (
        <div>
          <dt className="font-medium text-slate-400">これまでの進行</dt>
          <dd>{state.progress}</dd>
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
                <li key={i}>{g}</li>
              ))}
            </ul>
          )}
        </dd>
      </div>
      {state.notes && (
        <div>
          <dt className="font-medium text-slate-400">メモ</dt>
          <dd>{state.notes}</dd>
        </div>
      )}
    </dl>
  );
}
