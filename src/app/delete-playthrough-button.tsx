"use client";

import { useEffect, useState, useTransition } from "react";
import { deletePlaythrough } from "./actions";

/**
 * 一覧の各行に置く削除ボタン。取り消せない操作のため、
 * ブラウザ標準の confirm ではなくアプリ内の確認モーダルを挟む。
 */
export default function DeletePlaythroughButton({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // モーダル表示中は Escape で閉じ、背面スクロールを止める。
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, pending]);

  function confirmDelete() {
    setError(null);
    startTransition(async () => {
      try {
        await deletePlaythrough(id);
        // 成功時は revalidate で一覧から消える。モーダルは閉じる。
        setOpen(false);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <>
      <button
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
        aria-label={`${title} を削除`}
        title="削除"
        className="shrink-0 px-3 py-3 text-sm text-slate-500 hover:text-red-400"
      >
        削除
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby={`delete-title-${id}`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => {
            if (!pending) setOpen(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-sm rounded-xl border border-slate-700 bg-slate-800 p-5 shadow-2xl"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-950 text-lg"
              >
                🗑️
              </span>
              <div className="min-w-0">
                <h2 id={`delete-title-${id}`} className="font-semibold text-slate-100">
                  プレイスルーを削除
                </h2>
                <p className="mt-1 text-sm text-slate-400">
                  <span className="font-medium text-slate-200">「{title}」</span>{" "}
                  を削除します。この操作は取り消せません。会話履歴もすべて削除されます。
                </p>
              </div>
            </div>

            {error && (
              <p className="mt-3 rounded border border-red-800 bg-red-950 p-2 text-xs text-red-300">
                {error}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded border border-slate-600 px-4 py-2 text-sm text-slate-200 hover:bg-slate-700 disabled:opacity-50"
              >
                キャンセル
              </button>
              <button
                onClick={confirmDelete}
                disabled={pending}
                className="rounded bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
              >
                {pending ? "削除中…" : "削除する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
