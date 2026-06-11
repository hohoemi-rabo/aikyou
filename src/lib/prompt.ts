import type Anthropic from "@anthropic-ai/sdk";
import type { PlaythroughState, Persona } from "@/types/playthrough";
import { loadKnowledge } from "@/lib/knowledge";

/**
 * ペルソナ（名前・口調・性格）をシステム指示に差し込む文章を作る。
 * 未設定なら空文字を返し、既定の「相棒」挙動のままにする。
 */
export function formatPersona(persona: Persona | undefined): string {
  if (!persona) return "";
  const lines: string[] = [];
  if (persona.name) lines.push(`- あなたの名前は「${persona.name}」。一人称や呼ばれ方もこれに合わせる。`);
  if (persona.tone) lines.push(`- 口調・話し方：${persona.tone}`);
  if (persona.personality) lines.push(`- 性格・キャラクター：${persona.personality}`);
  if (lines.length === 0) return "";
  return `\n【あなた（相棒）のキャラクター設定】\n${lines.join("\n")}\n`;
}

/**
 * state を人が読める文字列に整形する（システムプロンプトの「現在の状況」欄や
 * 画面のあらすじ表示で使う）。スキーマは緩いので、欠けていても落ちないようにする。
 */
export function formatState(state: PlaythroughState): string {
  const lines: string[] = [];

  const party = Array.isArray(state.party) ? state.party : [];
  if (party.length > 0) {
    lines.push("【パーティ】");
    for (const m of party) {
      const job = m.job ? `／${m.job}` : "";
      const level = typeof m.level === "number" ? `／Lv.${m.level}` : "";
      lines.push(`- ${m.name ?? "（名前未設定）"}${job}${level}`);
    }
  } else {
    lines.push("【パーティ】まだ編成されていません。");
  }

  lines.push("");
  lines.push(`【現在地】${state.location || "（未設定）"}`);

  if (state.progress) {
    lines.push("");
    lines.push(`【これまでの進行】${state.progress}`);
  }

  const goals = Array.isArray(state.next_goals) ? state.next_goals : [];
  lines.push("");
  if (goals.length > 0) {
    lines.push("【次の目標】");
    for (const g of goals) lines.push(`- ${g}`);
  } else {
    lines.push("【次の目標】（未設定）");
  }

  if (state.notes) {
    lines.push("");
    lines.push(`【メモ】${state.notes}`);
  }

  return lines.join("\n");
}

interface BuildSystemParams {
  title: string;
  game_version: string;
  state: PlaythroughState;
  persona?: Persona;
}

/**
 * Claude に渡す system ブロック配列を組み立てる。
 *
 * プロンプトキャッシュを効かせるため順序を固定する：
 *  1. システム指示 ＋ 連結ナレッジ（毎回不変）← cache_control: ephemeral を付与
 *  2. 現在の state（毎セッション変わる）← キャッシュ対象外
 *
 * 会話履歴は messages 側で渡す（ここには含めない）。
 */
export async function buildSystemBlocks({
  title,
  game_version,
  state,
  persona,
}: BuildSystemParams): Promise<Anthropic.TextBlockParam[]> {
  const knowledge = await loadKnowledge();
  const personaText = formatPersona(persona);

  const instructions = `あなたは「${title}（${game_version}）」を一緒に遊ぶ、少し詳しい先輩ゲーマー（相棒）です。
${personaText}
【絶対のルール】
- 必ず「${game_version}」の仕様で答えること。他の版（SFC/GBC/スマホ/HD-2Dリメイク等）の情報を混ぜないこと。職業・呪文・ダンジョン構成は版で異なるため、ここを間違えない。
- 返事は短く、会話のテンポを大事にする。基本は2〜4文くらいに収める。まず相手に言われたこと・聞かれたことへ的確に応じ、聞かれてもいない攻略情報・選択肢・次の手順までを一度に説明しない。続きが要るときは相手が聞いてくるので、そのとき一歩ずつ出す。
- 挨拶や雑談には、同じ温度で短く返す（挨拶に対していきなり攻略説明を始めない）。
- 基本は「1問1答」。プレイヤーの問いに答えたら、そこで止める。返事の最後に質問を付け足して会話を続けようとしない（「〜はどうする？」「〜は決めた？」等で締めない）。次にどうするかはプレイヤーが決めて聞いてくる。情報が足りなくても、聞き返すより当たり障りのない範囲で答えるか、必要なら一言添える程度にとどめる。
- 続きから始めるときは、【前回のあらすじ】があればそれを踏まえて自然に話を続ける。前回の出来事を一から説明し直さない。
- 「⚠️要確認」と記された情報は未確定なので、事実として断定しない。
- 返事は音声で読み上げられる。Markdown の装飾記号（* ** # \` ~ など）や箇条書きの記号を使わず、話し言葉の普通の文章で答えること。強調したいときも記号で囲まず言葉で表現する。

【攻略の参考知識（この版の情報）】
${knowledge}`;

  const blocks: Anthropic.TextBlockParam[] = [
    // 1. 不変部（システム指示＋ナレッジ）。先頭に固定し、ここをキャッシュ対象にする。
    { type: "text", text: instructions, cache_control: { type: "ephemeral" } },
  ];

  // 2. 可変部（キャッシュ対象外）。続きの場合は前回のあらすじを先に渡す。
  const summary =
    typeof state.last_session_summary === "string" ? state.last_session_summary.trim() : "";
  if (summary) {
    blocks.push({ type: "text", text: `【前回のあらすじ】\n${summary}` });
  }
  blocks.push({
    type: "text",
    text: `【現在の冒険の状況】\n${formatState(state)}`,
  });

  return blocks;
}
