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
      <h1 className="text-2xl font-bold">あいきょう</h1>
      <p className="mt-1 text-sm text-gray-500">
        レトロゲーム実況の相棒AI — プレイスルーを選んで続きを遊ぶ
      </p>

      {error && (
        <p className="mt-6 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">
          一覧の取得に失敗しました: {error.message}
        </p>
      )}

      {/* 新規作成 */}
      <form action={createPlaythrough} className="mt-8 space-y-3 rounded-lg border p-4">
        <h2 className="font-semibold">新規プレイスルー</h2>
        <div className="flex flex-col gap-1">
          <label htmlFor="title" className="text-sm text-gray-600">
            ゲームタイトル
          </label>
          <input
            id="title"
            name="title"
            required
            placeholder="ドラゴンクエスト3"
            className="rounded border px-3 py-2"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="game_version" className="text-sm text-gray-600">
            ゲームバージョン
          </label>
          <input
            id="game_version"
            name="game_version"
            required
            defaultValue="ファミコン版(FC)"
            className="rounded border px-3 py-2"
          />
        </div>
        <button
          type="submit"
          className="rounded bg-black px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          作成して始める
        </button>
      </form>

      {/* 一覧 */}
      <section className="mt-8">
        <h2 className="font-semibold">プレイスルー一覧</h2>
        {playthroughs.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">
            まだありません。上のフォームから作成してください。
          </p>
        ) : (
          <ul className="mt-3 divide-y rounded-lg border">
            {playthroughs.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/play/${p.id}`}
                  className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{p.title}</span>
                    <span className="block truncate text-sm text-gray-500">
                      {p.game_version} ／ {p.state?.location || "現在地未設定"}
                    </span>
                  </span>
                  <time className="shrink-0 text-xs text-gray-400">
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
