import type { TapeId, TapeRecipe } from './tapes'

/**
 * Grok Build locked desks (chat dump 2026-09-17).
 * BTC Live cash ON. NG / CU / GLD paper (Live cash OFF) with bots ON.
 * Host desk-state wins after the first user toggle.
 */
export const GROK_BUILD_RECIPES: Record<TapeId, TapeRecipe> = {
  btc: { contracts: 30, botOn: true, liveOn: true, armFromMin: 8, armToMin: 3, through: 40, centLo: 69, centHi: 89 },
  ng: { contracts: 30, botOn: true, liveOn: false, armFromMin: 8, armToMin: 0.45, through: 0.002, centLo: 34, centHi: 89 },
  cu: { contracts: 30, botOn: true, liveOn: false, armFromMin: 9, armToMin: 0.45, through: 0.002, centLo: 34, centHi: 89 },
  gld: { contracts: 30, botOn: true, liveOn: false, armFromMin: 10, armToMin: 3, through: 2, centLo: 34, centHi: 89 },
  wti: { contracts: 1, botOn: true, liveOn: false, armFromMin: 8, armToMin: 0.45, through: 0.05, centLo: 34, centHi: 89 },
  slv: { contracts: 1, botOn: true, liveOn: false, armFromMin: 10, armToMin: 3, through: 0.05, centLo: 34, centHi: 89 },
}

/**
 * Print-cash alternate Cory approved when Grok BTC 8→3 / $40 / 69¢ sat all day.
 * Not factory gold. Host desk-state may keep these after a write.
 */
export const PRINT_CASH_RECIPES: Record<TapeId, TapeRecipe> = {
  btc: { contracts: 20, botOn: true, liveOn: true, armFromMin: 12, armToMin: 0.5, through: 15, centLo: 45, centHi: 89 },
  ng: { contracts: 15, botOn: true, liveOn: true, armFromMin: 12, armToMin: 0.45, through: 0.001, centLo: 34, centHi: 89 },
  cu: { contracts: 15, botOn: true, liveOn: true, armFromMin: 12, armToMin: 0.45, through: 0.001, centLo: 34, centHi: 89 },
  gld: { ...GROK_BUILD_RECIPES.gld },
  wti: { ...GROK_BUILD_RECIPES.wti },
  slv: { ...GROK_BUILD_RECIPES.slv },
}
