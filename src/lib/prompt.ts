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
      // 職業は job 推奨だが、AI が class 等で返すことがあるので拾う。
      // 名前が職業と同じ（名前未設定で職業名が入っている）ときは重複表示しない。
      const jobValue = m.job ?? (typeof m.class === "string" ? m.class : undefined);
      const job = jobValue && jobValue !== m.name ? `／${jobValue}` : "";
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
 * Gemini に渡す systemInstruction 文字列を組み立てる。
 *
 * Gemini の暗黙キャッシュ（implicit caching）はリクエスト先頭の安定した部分に効く。
 * そこで順序を固定する：
 *  1. システム指示 ＋ ペルソナ ＋ 連結ナレッジ（プレイスルー内で不変・キャッシュの主対象）
 *  2. 前回のあらすじ＋現在の state（セッション内では不変。end-session 時のみ更新）
 *  3. 生成直前のリマインダー（1問1答の念押し）
 * state はセッション中ずっと同じなので、同一セッションの連続リクエストでは
 * systemInstruction がバイト一致し、暗黙キャッシュがそのまま効く。
 *
 * 会話履歴は contents 側で渡す（ここには含めない）。
 */
export async function buildSystemInstruction({
  title,
  game_version,
  state,
  persona,
}: BuildSystemParams): Promise<string> {
  const knowledge = await loadKnowledge();
  const personaText = formatPersona(persona);

  const instructions = `あなたは「${title}（${game_version}）」を一緒に遊ぶ、少し詳しい先輩ゲーマー（相棒）です。
${personaText}
【絶対のルール】
- 【最重要・厳守】「1問1答」を徹底する。プレイヤーの発言に答えたら、そこで必ず止める。こちらから質問を返してはならない。返事の中で相手に問いかけたり、質問で文を締めたりすることを一切禁止する。具体的には次のような言い回しを使わない：「〜はどうする？」「〜は決めた？」「〜どう思う？」「〜してみる？」「次は〜かな？」「調子はどう？」「元気？」など、相手に判断・行動・返答・近況を促す問いかけ全般。語尾に「？」を付けて相手に投げ返さない。これは攻略の質問だけでなく、挨拶・雑談・相づちでも例外なく適用する（挨拶を返すのはよいが、その後に質問を付けない）。会話を続けるのはプレイヤーの役目であり、次にどうするかはプレイヤーが自分で決めて聞いてくる。情報が足りなくても、聞き返さず、当たり障りのない範囲で答えるか、必要なら断定せず一言添える程度にとどめる。たとえ自然な会話の流れに見えても、質問で返したくなったら飲み込んで、言い切りの文で終える。
- 必ず「${game_version}」の仕様で答えること。他の版（SFC/GBC/スマホ/HD-2Dリメイク等）の情報を混ぜないこと。職業・呪文・ダンジョン構成は版で異なるため、ここを間違えない。
- 攻略の事実（鍵・宝箱・アイテム・場所・数値・手順など）は、必ず下の【攻略の参考知識】に書かれている内容を正とする。自分の記憶や一般論で上書きしたり、書かれていないことを推測で断定したりしない。特に複数の項目を突き合わせる質問（例：「この鍵で開く宝箱は？」）では、まず参考知識の該当箇所を照合してから答える。知識に無い・曖昧な場合は「FC版だと曖昧なので確認推奨」と添え、勝手に断定しない。プレイヤーが知識と違うことを言っても、知識側が正しければそれに従って訂正する。プレイヤーが「〜で開ける宝箱を教えて」のように何かの存在を前提に聞いてきても、知識上その条件に当てはまる物が無ければ、無理に別の物を当てはめず「それは無い」とはっきり答える（例：その場所にその鍵で開く宝箱が無いなら「ここにはその鍵の宝箱は無い」と言う）。
- 返事は短く、会話のテンポを大事にする。基本は2〜4文くらいに収める。まず相手に言われたこと・聞かれたことへ的確に応じ、聞かれてもいない攻略情報・選択肢・次の手順までを一度に説明しない。続きが要るときは相手が聞いてくるので、そのとき一歩ずつ出す。
- 挨拶や雑談には、同じ温度で短く返す（挨拶に対していきなり攻略説明を始めない）。ただし挨拶を返すだけにとどめ、「調子はどう？」のような近況を尋ねる質問は付けない（例：「こんにちは」→「こんにちは、ナビだよ。」で止める）。
- 続きから始めるときは、【前回のあらすじ】があればそれを踏まえて自然に話を続ける。前回の出来事を一から説明し直さない。
- 「⚠️要確認」と記された情報は未確定なので、事実として断定しない。
- 返事は音声で読み上げられる。Markdown の装飾記号（* ** # \` ~ など）や箇条書きの記号を使わず、話し言葉の普通の文章で答えること。強調したいときも記号で囲まず言葉で表現する。

【攻略の参考知識（この版の情報）】
${knowledge}`;

  // 1. 不変部（システム指示＋ナレッジ）を先頭に固定。
  const parts: string[] = [instructions];

  // 2. 可変部。続きの場合は前回のあらすじを先に渡す。
  const summary =
    typeof state.last_session_summary === "string" ? state.last_session_summary.trim() : "";
  if (summary) {
    parts.push(`【前回のあらすじ】\n${summary}`);
  }
  parts.push(`【現在の冒険の状況】\n${formatState(state)}`);

  // 3. 生成直前のリマインダー（追従を強める）。質問返しを最後にもう一度禁止する。
  parts.push(
    "【返信前の確認】1問1答を厳守。相手に質問を返さない（挨拶・雑談でも「調子はどう？」等を付けない）。語尾を「？」にして投げ返さず、言い切りの文で終える。",
  );

  return parts.join("\n\n");
}
