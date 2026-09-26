/** 数值展示：保留至多 3 位小数并去掉多余的 0。 */
export function fmt(x: number): string {
  if (!Number.isFinite(x)) return '—';
  const v = Math.round(x * 1000) / 1000;
  return Object.is(v, -0) ? '0' : String(v);
}
