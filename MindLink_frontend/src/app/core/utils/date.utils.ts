/**
 * Returns today's date as a 'YYYY-MM-DD' string (local time), suitable for
 * binding to the `min`/`max` attributes of `<input type="date">`.
 */
export function todayDateString(): string {
  const now = new Date();
  const year  = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day   = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}
