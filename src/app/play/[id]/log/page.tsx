import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import type { Playthrough } from "@/types/playthrough";
import type { Message } from "@/types/message";

export const dynamic = "force-dynamic";

export default async function LogPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = getSupabase();

  const [ptRes, msgRes] = await Promise.all([
    supabase
      .from("playthroughs")
      .select("title, game_version")
      .eq("id", id)
      .single<Pick<Playthrough, "title" | "game_version">>(),
    supabase
      .from("messages")
      .select("id, playthrough_id, role, content, created_at")
      .eq("playthrough_id", id)
      .order("created_at", { ascending: true })
      .returns<Message[]>(),
  ]);

  const playthrough = ptRes.data;
  const messages = msgRes.data ?? [];
  const loadError = ptRes.error ?? msgRes.error;

  return (
    <main className="mx-auto max-w-3xl px-6 py-8">
      <div className="flex items-center justify-between">
        <Link
          href={`/play/${id}`}
          className="text-sm text-slate-400 hover:text-slate-200 hover:underline"
        >
          ← セッションへ戻る
        </Link>
      </div>

      <header className="mt-4">
        <h1 className="text-xl font-bold text-slate-100">
          ふりかえり{playthrough ? `：${playthrough.title}` : ""}
        </h1>
        {playthrough && <p className="text-sm text-slate-400">{playthrough.game_version}</p>}
      </header>

      {loadError && (
        <p className="mt-6 rounded border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          ログの取得に失敗しました: {loadError.message}
        </p>
      )}

      {messages.length === 0 ? (
        <p className="mt-6 text-sm text-slate-400">
          まだ保存された会話はありません。セッションで話すとここに記録されます。
        </p>
      ) : (
        <ol className="mt-6 space-y-3">
          {messages.map((m) => (
            <li key={m.id} className={m.role === "user" ? "text-right" : "text-left"}>
              <span
                className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 text-sm ${
                  m.role === "user" ? "bg-blue-600 text-white" : "bg-slate-700 text-slate-100"
                }`}
              >
                {m.content}
              </span>
              <div className="mt-0.5 text-xs text-slate-500">
                {new Date(m.created_at).toLocaleString("ja-JP")}
              </div>
            </li>
          ))}
        </ol>
      )}
    </main>
  );
}
