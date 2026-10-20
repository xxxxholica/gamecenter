/** Keep stage IDs stable: backdrop delivery formats are resolved by the renderer. */
export const FIGHTER_STAGES = [
  'pagoda_moonlight.jpg', 'rooftop_sunset.jpg', 'cyber_dojo.jpg', 'metro_city.jpg',
] as const;
export type FighterStage = typeof FIGHTER_STAGES[number];

/** Uniform selection from all choices except the immediately preceding one. */
export function chooseDifferent<T>(choices: readonly T[], previous: T | null, random = Math.random): T {
  if (!choices.length) throw new Error('At least one choice is required');
  const available = choices.filter(value => value !== previous);
  const pool = available.length ? available : choices;
  return pool[Math.min(pool.length - 1, Math.max(0, Math.floor(random() * pool.length)))];
}
