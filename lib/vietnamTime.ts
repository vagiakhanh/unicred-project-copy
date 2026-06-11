export const VN_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Format an ISO timestamp as dd/mm/yyyy in Vietnam time. */
export function formatDateVN(isoString?: string): string {
  if (!isoString) return 'Không giới hạn';
  const dateObj = new Date(isoString);
  if (isNaN(dateObj.getTime())) return 'Không giới hạn';
  return dateObj.toLocaleDateString('vi-VN', {
    timeZone: VN_TIMEZONE,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

/** Today's date as YYYY-MM-DD in Vietnam. */
export function todayVN(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: VN_TIMEZONE });
}

/** Add days to a YYYY-MM-DD date, interpreted in Vietnam time. */
export function addDaysVN(dateYmd: string, days: number): string {
  const base = new Date(`${dateYmd}T12:00:00+07:00`);
  base.setDate(base.getDate() + days);
  return base.toLocaleDateString('en-CA', { timeZone: VN_TIMEZONE });
}

/** Store deadline as end-of-day Vietnam time. */
export function deadlineToVNIso(dateYmd: string): string {
  return `${dateYmd}T23:59:59+07:00`;
}

/** Whether a YYYY-MM-DD deadline (end of VN day) is still in the future. */
export function isDeadlineInFutureVN(dateYmd: string): boolean {
  const deadline = new Date(deadlineToVNIso(dateYmd));
  const nowMs = Date.now();
  return deadline.getTime() >= nowMs;
}

/** Parse a database timestamp (which might lack timezone info) as UTC. */
export function parseUtcDate(isoString?: string): Date {
  if (!isoString) return new Date();
  let formatted = isoString.trim();
  // If it's a timezone-less string from PostgreSQL (e.g. 2026-06-08 15:00:00 or 2026-06-08T15:00:00)
  if (!formatted.endsWith('Z') && !formatted.includes('+') && !/-\d{2}:?\d{2}$/.test(formatted)) {
    formatted = formatted.replace(' ', 'T');
    formatted += 'Z';
  }
  return new Date(formatted);
}
