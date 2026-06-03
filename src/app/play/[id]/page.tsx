import Link from "next/link";
import { getSupabase } from "@/lib/supabase";
import SessionClient from "./session-client";
import type { Playthrough } from "@/types/playthrough";

export const dynamic = "force-dynamic";

type Row = Pick<Playthrough, "id" | "title" | "game_version" | "state" | "persona">;

export default async function PlayPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("playthroughs")
    .select("id, title, game_version, state, persona")
    .eq("id", id)
    .single<Row>();

  if (error || !data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-200 hover:underline">
          ← 一覧へ戻る
        </Link>
        <p className="mt-6 rounded border border-red-800 bg-red-950 p-3 text-sm text-red-300">
          プレイスルーを読み込めませんでした: {error?.message ?? id}
        </p>
      </main>
    );
  }

  return (
    <SessionClient
      id={data.id}
      title={data.title}
      gameVersion={data.game_version}
      initialState={data.state}
      initialPersona={data.persona ?? {}}
    />
  );
}
