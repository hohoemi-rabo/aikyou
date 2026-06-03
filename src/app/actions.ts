"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSupabase } from "@/lib/supabase";
import { createInitialState } from "@/lib/initial-state";
import type { Persona } from "@/types/playthrough";

/** 入力から空文字を除いたペルソナを組み立てる（任意項目）。 */
function buildPersona(name: string, tone: string): Persona {
  const persona: Persona = {};
  if (name) persona.name = name;
  if (tone) persona.tone = tone;
  return persona;
}

/**
 * 新規プレイスルーを作成し、そのままセッション画面へ遷移する。
 * 一覧画面の作成フォームから Server Action として呼ばれる。
 */
export async function createPlaythrough(formData: FormData) {
  const title = String(formData.get("title") ?? "").trim();
  const gameVersion = String(formData.get("game_version") ?? "").trim();
  const personaName = String(formData.get("persona_name") ?? "").trim();
  const personaTone = String(formData.get("persona_tone") ?? "").trim();

  if (!title || !gameVersion) {
    throw new Error("タイトルとゲームバージョンは必須です。");
  }

  const supabase = getSupabase();
  const { data, error } = await supabase
    .from("playthroughs")
    .insert({
      title,
      game_version: gameVersion,
      state: createInitialState(),
      persona: buildPersona(personaName, personaTone),
    })
    .select("id")
    .single<{ id: string }>();

  if (error || !data) {
    throw new Error(`プレイスルーの作成に失敗しました: ${error?.message ?? "unknown"}`);
  }

  redirect(`/play/${data.id}`);
}

/**
 * 相棒のペルソナ（名前・口調・性格）を更新する。
 * セッション画面の「相棒の設定」から呼ばれる。
 */
export async function updatePersona(id: string, persona: Persona) {
  if (!id) throw new Error("id が必要です。");

  const supabase = getSupabase();
  const { error } = await supabase
    .from("playthroughs")
    .update({ persona, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    throw new Error(`ペルソナの保存に失敗しました: ${error.message}`);
  }

  revalidatePath(`/play/${id}`);
}
