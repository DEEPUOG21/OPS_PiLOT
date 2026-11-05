export const num = (n: number | null | undefined) =>
  n == null
    ? "N/A"
    : new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 1,
        notation: n >= 10000 ? "compact" : "standard",
      }).format(n);
export const ms = (n: number | null | undefined) =>
  n == null
    ? "N/A"
    : n >= 1000
      ? `${(n / 1000).toFixed(2)} s`
      : `${n.toFixed(n < 10 ? 2 : 0)} ms`;
export const money = (n: number | null | undefined) =>
  n == null ? "N/A" : `$${n.toFixed(n < 0.01 ? 6 : 4)}`;
export const pct = (n: number | null | undefined) =>
  n == null ? "N/A" : `${(n * 100).toFixed(1)}%`;
export const date = (s: string) =>
  new Date(s).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
export const label = (s: string) =>
  s.replaceAll("_", " ").replace(/^./, (x) => x.toUpperCase());
