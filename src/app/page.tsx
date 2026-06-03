import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import { createPlaythrough } from "./actions";
import type { Playthrough } from "@/types/playthrough";

// 一覧は常に最新を表示する（キャッシュしない）。
export const dynamic = "force-dynamic";

type Row = Pick<Playthrough, "id" | "title" | "game_version" | "state" | "updated_at">;

export default async function Home() {
  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("playthroughs")
    .select("id, title, game_version, state, updated_at")
    .order("updated_at", { ascending: false })
    .returns<Row[]>();

  const playthroughs = data ?? [];

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-bold text-slate-100">あいきょう</h1>
      <p className="mt-1 text-sm text-slate-400">
        レトロゲーム実況の相棒AI — プレイスルーを選んで続きを遊ぶ
      </p>

      {error && (
        <p className="mt-6 rounded border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          一覧の取得に失敗しました: {error.message}
        </p>
      )}

      {/* 新規作成 */}
      <form
        action={createPlaythrough}
        className="mt-8 space-y-3 rounded-lg border border-slate-700 bg-slate-800 p-4"
      >
        <h2 className="font-semibold text-slate-100">新規プレイスルー</h2>
        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="text-sm text-slate-300">
            ゲームタイトル
          </label>
          <input
            id="title"
            name="title"
            required
            placeholder="ドラゴンクエスト3"
            className="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="game_version" className="text-sm text-slate-300">
            ゲームバージョン
          </label>
          <input
            id="game_version"
            name="game_version"
            required
            defaultValue="ファミコン版(FC)"
            className="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <label htmlFor="persona_name" className="text-sm text-slate-300">
              相棒の名前（任意）
            </label>
            <input
              id="persona_name"
              name="persona_name"
              placeholder="例: ナビ"
              className="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label htmlFor="persona_tone" className="text-sm text-slate-300">
              口調（任意）
            </label>
            <input
              id="persona_tone"
              name="persona_tone"
              placeholder="例: 明るくフランクなタメ口"
              className="rounded border border-slate-600 bg-slate-900 px-3 py-2 text-slate-100 placeholder-slate-500"
            />
          </div>
        </div>
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
        >
          作成して始める
        </button>
      </form>

      {/* 一覧 */}
      <section className="mt-8">
        <h2 className="font-semibold text-slate-100">プレイスルー一覧</h2>
        {playthroughs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-400">
            まだありません。上のフォームから作成してください。
          </p>
        ) : (
          <ul className="mt-3 divide-y divide-slate-700 rounded-lg border border-slate-700 bg-slate-800">
            {playthroughs.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/play/${p.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-slate-700"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-slate-100">{p.title}</span>
                    <span className="block truncate text-sm text-slate-400">
                      {p.game_version} ／{" "}
                      {typeof p.state?.location === "string" && p.state.location
                        ? p.state.location
                        : "現在地未設定"}
                    </span>
                  </span>
                  <time className="shrink-0 text-xs text-slate-500">
                    {new Date(p.updated_at).toLocaleString("ja-JP")}
                  </time>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
