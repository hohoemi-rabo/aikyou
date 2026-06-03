"use server";

import { redirect } from "next/navigation";
import { getSupabase } from "@/lib/supabase";
import { createInitialState } from "@/lib/initial-state";

/**
 * 新規プレイスルーを作成し、そのままセッション画面へ遷移する。
 * 一覧画面の作成フォームから Server Action として呼ばれる。
 */
export async function createPlaythrough(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const gameVersion = String(formData.get("game_version") ?? "").trim();

  if (!title || !gameVersion) {
    throw new Error("タイトルとゲームバージョンは必須です。");
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("playthroughs")
    .insert({ title, game_version: gameVersion, state: createInitialState() })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(`プレイスルーの作成に失敗しました: ${error?.message ?? "unknown"}`);
  }

  redirect(`/play/${data.id}`);
}
