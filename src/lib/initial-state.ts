import type { PlaythroughState } from "@/types/playthrough";

/**
 * 新規プレイスルー作成時の、空に近い初期 state を返す。
 * 必須キー（party / location / next_goals）を最低限満たす。
 * 以降の中身はセッションを重ねるごとに AI が更新していく。
 */
export function createInitialState(): PlaythroughState {
  return {
    party: [],
    location: "",
    next_goals: [],
  };
}
