export type TimeOfDay = 'day' | 'night';

const KEY = 'midnight_skyway_time_of_day';

export function loadTimeOfDay(): TimeOfDay {
  try {
    return localStorage.getItem(KEY) === 'day' ? 'day' : 'night';
  } catch {
    return 'night';
  }
}

export function saveTimeOfDay(t: TimeOfDay): void {
  try {
    localStorage.setItem(KEY, t);
  } catch { /* storage unavailable */ }
}
