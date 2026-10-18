export type DatePref = "locale" | "iso" | "dmy" | "mdy";
let datePref: DatePref = "locale";
export const setDatePref = (p: DatePref) => { datePref = p; };

const pad = (n: number) => String(n).padStart(2, "0");
function parse(value: string): Date | null {
  const d = new Date(value.length === 10 ? value + "T00:00:00" : value);
  return isNaN(d.getTime()) ? null : d;
}

/** Date-only values (YYYY-MM-DD) are never shifted by timezone. */
export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const d = parse(value);
  if (!d) return value;
  const [y, m, day] = [d.getFullYear(), pad(d.getMonth() + 1), pad(d.getDate())];
  if (datePref === "iso") return `${y}-${m}-${day}`;
  if (datePref === "dmy") return `${day}/${m}/${y}`;
  if (datePref === "mdy") return `${m}/${day}/${y}`;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function formatTime(value: string | null | undefined): string {
  const d = value ? parse(value) : null;
  return d ? d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }) : "";
}

export const formatDateTime = (value: string | null | undefined) =>
  value ? `${formatDate(value)}, ${formatTime(value)}` : "—";

export function money(value: string | null | undefined, currency: string | null | undefined): string {
  if (value == null || value === "") return "—";
  if (!currency) return value;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(value));
  } catch {
    return `${currency} ${Number(value).toFixed(2)}`;
  }
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString(undefined, { month: "short", year: "2-digit" });
}
