import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * Supabase クライアントをサーバ側でのみ生成・再利用する。
 *
 * 全アクセスがサーバ側（Server Component / Route Handler）のため anon キーで足りる。
 * RLS は意図的に無効（自分専用ツール）。秘密値はサーバ専用環境変数からのみ読み、
 * NEXT_PUBLIC_ は付けない（クライアントバンドルに焼き込まれるため）。
 */
export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    throw new Error(
      "SUPABASE_URL / SUPABASE_ANON_KEY が設定されていません。.env.local に設定してください。",
    );
  }

  client = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
