const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Formats a unix-seconds timestamp in the classic imageboard style: MM/DD/YY(Day)HH:MM:SS */
export function fmtDate(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: '2-digit' })
    + '(' + DAYS[d.getDay()] + ')'
    + d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
}

/** Formats a remaining-seconds value as a compact countdown, e.g. `17d 4h left`,
 *  `3h 12m left`, `45s left`, or `expired`. */
export function formatCountdown(secondsLeft: number): string {
  if (secondsLeft <= 0) return 'expired';
  const d = Math.floor(secondsLeft / 86400);
  const h = Math.floor((secondsLeft % 86400) / 3600);
  const m = Math.floor((secondsLeft % 3600) / 60);
  const s = Math.floor(secondsLeft % 60);
  if (d > 0) return `${d}d ${h}h left`;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${s}s left`;
  return `${s}s left`;
}

export type CountdownSeverity = 'normal' | 'soon' | 'critical' | 'expired';

/** Severity bucket for coloring the countdown: `normal` (>1d), `soon` (<1d),
 *  `critical` (<1h), `expired`. */
export function countdownSeverity(secondsLeft: number): CountdownSeverity {
  if (secondsLeft <= 0) return 'expired';
  if (secondsLeft < 3600) return 'critical';
  if (secondsLeft < 86400) return 'soon';
  return 'normal';
}
