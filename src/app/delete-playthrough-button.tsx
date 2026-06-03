"use client";

import { useState, useTransition } from "react";
import { deletePlaythrough } from "./actions";

/**
 * 一覧の各行に置く削除ボタン。取り消せない操作のため確認ダイアログを挟む。
 */
export default function DeletePlaythroughButton({
  id,
  title,
}: {
  id: string;
  title: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onDelete() {
    if (!window.confirm(`「${title}」を削除しますか？\nこの操作は取り消せません（会話履歴も削除されます）。`)) {
      return;
    }
    setError(null);
    startTransition(async () => {
      try {
        await deletePlaythrough(id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    });
  }

  return (
    <button
      onClick={onDelete}
      disabled={pending}
      title={error ?? "削除"}
      aria-label={`${title} を削除`}
      className={`shrink-0 px-3 py-3 text-sm hover:text-red-400 disabled:opacity-50 ${
        error ? "text-red-400" : "text-slate-500"
      }`}
    >
      {pending ? "削除中…" : "削除"}
    </button>
  );
}
