import i18n from "../i18n";

const loc = () => (i18n.language === "ar" ? "ar-EG" : "en-EG");

/** Display-only formatting. All arithmetic happens on the server in Decimal. */
export function money(v: string | number | null | undefined, opts: { currency?: boolean } = {}) {
  if (v === null || v === undefined || v === "") return "—";
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return String(v);
  const s = new Intl.NumberFormat(loc(), { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n);
  return opts.currency === false ? s : `${s} ${i18n.language === "ar" ? "ج.م" : "EGP"}`;
}

export function weight(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return `${new Intl.NumberFormat(loc(), { minimumFractionDigits: 3, maximumFractionDigits: 3 }).format(n)} ${i18n.language === "ar" ? "جم" : "g"}`;
}

export function num(v: string | number | null | undefined) {
  if (v === null || v === undefined || v === "") return "—";
  return new Intl.NumberFormat(loc()).format(Number(v));
}

export function dateTime(v: string | null | undefined) {
  if (!v) return "—";
  return new Intl.DateTimeFormat(loc(), { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Cairo" })
    .format(new Date(v));
}

export function date(v: string | null | undefined) {
  if (!v) return "—";
  return new Intl.DateTimeFormat(loc(), { dateStyle: "medium", timeZone: "Africa/Cairo" }).format(new Date(v));
}

export const todayISO = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(new Date());

/** Exact decimal-string comparison helpers for UI hints (no float math on money). */
export const isNegative = (v: string | null | undefined) => !!v && v.trim().startsWith("-");
export const isZero = (v: string | null | undefined) => !v || /^-?0+(\.0+)?$/.test(v.trim());

/** Exact addition of 2-decimal money strings using integer piastres (BigInt). */
export function addMoney(...vals: (string | number | null | undefined)[]): string {
  const toCents = (v: string | number) => {
    const s = String(v).trim() || "0";
    const neg = s.startsWith("-");
    const [i, f = ""] = s.replace(/^[-+]/, "").split(".");
    const c = BigInt(i || "0") * 100n + BigInt((f + "00").slice(0, 2));
    return neg ? -c : c;
  };
  const total = vals.reduce((acc, v) => acc + toCents(v ?? "0"), 0n);
  const neg = total < 0n;
  const abs = neg ? -total : total;
  return `${neg ? "-" : ""}${abs / 100n}.${String(abs % 100n).padStart(2, "0")}`;
}
