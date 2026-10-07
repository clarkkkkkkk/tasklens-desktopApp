export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function parseLocalDate(value: string): Date {
  return new Date(`${value}T12:00:00`);
}
export function displayDate(
  value?: string,
  options: Intl.DateTimeFormatOptions = { weekday: 'short', month: 'short', day: 'numeric' },
): string {
  return value ? parseLocalDate(value).toLocaleDateString('en-US', options) : 'No date';
}
export function displayTime(value?: string): string {
  if (!value) return 'All day';
  const [h, m] = value.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}
export function monthCells(month: Date): (string | null)[] {
  const start = new Date(month.getFullYear(), month.getMonth(), 1);
  const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const cells: (string | null)[] = Array.from({ length: start.getDay() }, () => null);
  for (let day = 1; day <= count; day++)
    cells.push(localDate(new Date(month.getFullYear(), month.getMonth(), day)));
  while (cells.length % 7) cells.push(null);
  return cells;
}
