import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * 攻略ナレッジのディレクトリ（プロジェクト直下）。
 * public/ でも src/ でもなくルート直下に置き、サーバ側からのみ読む。
 */
const KNOWLEDGE_DIR = path.join(process.cwd(), "knowledge", "dq3-fc");

/** AI 向けメタ情報。常に先頭に固定する。 */
const PINNED_FIRST = "_ai-notes.md";

/** 連結結果のメモリキャッシュ（リクエストをまたいで再利用）。 */
let cache: string | null = null;

/**
 * knowledge/dq3-fc/ 内の .md を全件読み込み、決定的な順序で1つの文字列に連結して返す。
 *
 * - ファイル名で昇順ソートしたうえで _ai-notes.md を先頭に固定する。
 *   readdir の返却順は OS 依存のため、順序を固定しないとプロンプトキャッシュが効かない。
 * - 連結結果はモジュールスコープにキャッシュし、2回目以降はファイル I/O を行わない。
 * - 読み込み失敗は握りつぶさず throw する。
 */
export async function loadKnowledge(): Promise<string> {
  if (cache !== null) return cache;

  const entries = await readdir(KNOWLEDGE_DIR);
  const mdFiles = entries.filter((name) => name.endsWith(".md")).sort();

  // _ai-notes.md を先頭へ移動（存在する場合）。
  const ordered = [
    ...mdFiles.filter((name) => name === PINNED_FIRST),
    ...mdFiles.filter((name) => name !== PINNED_FIRST),
  ];

  if (ordered.length === 0) {
    throw new Error(`攻略ナレッジが見つかりません: ${KNOWLEDGE_DIR}`);
  }

  const sections = await Promise.all(
    ordered.map(async (name) => {
      const content = await readFile(path.join(KNOWLEDGE_DIR, name), "utf-8");
      // ファイル境界が分かるよう区切りを入れる（AI は本文1行目の見出しで内容を識別する）。
      return `<!-- ${name} -->\n${content.trim()}`;
    }),
  );

  cache = sections.join("\n\n---\n\n");
  return cache;
}
