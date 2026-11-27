import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode,
  type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import { Loader2, X, Inbox, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "react-i18next";

type Variant = "primary" | "gold" | "secondary" | "danger" | "ghost";
const variants: Record<Variant, string> = {
  primary: "bg-navy-900 text-white hover:bg-navy-800 shadow-sm",
  gold: "bg-gold-400 text-navy-950 hover:bg-gold-300 shadow-sm",
  secondary: "bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 shadow-sm",
  danger: "bg-red-600 text-white hover:bg-red-700 shadow-sm",
  ghost: "text-slate-600 hover:bg-slate-100",
};

export function Button({ variant = "primary", loading, icon, className = "", children, size = "md", ...p }:
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; loading?: boolean; icon?: ReactNode; size?: "sm" | "md" | "lg" }) {
  const sz = size === "sm" ? "px-2.5 py-1.5 text-xs" : size === "lg" ? "px-5 py-3 text-base" : "px-4 py-2 text-sm";
  return (
    <button type="button" {...p} disabled={p.disabled || loading}
      className={`inline-flex items-center justify-center gap-2 rounded-lg font-semibold transition disabled:cursor-not-allowed disabled:opacity-50 ${sz} ${variants[variant]} ${className}`}>
      {loading ? <Loader2 className="size-4 animate-spin" /> : icon}
      {children}
    </button>
  );
}

export function Card({ title, actions, children, className = "", bodyClass = "p-4" }:
  { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-bold text-navy-900">{title}</h2>
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        </header>
      )}
      <div className={bodyClass}>{children}</div>
    </section>
  );
}

export function Field({ label, error, hint, children, className = "" }:
  { label?: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      {label && <span className="label">{label}</span>}
      {children}
      {hint && !error && <span className="mt-1 block text-xs text-slate-500">{hint}</span>}
      {error && <span className="mt-1 block text-xs font-medium text-red-600">{error}</span>}
    </label>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = "", ...p }, ref) => <input ref={ref} {...p} className={`input ${className}`} />);

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = "", ...p }, ref) => <textarea ref={ref} rows={3} {...p} className={`input ${className}`} />);

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(
  ({ className = "", children, ...p }, ref) => <select ref={ref} {...p} className={`input ${className}`}>{children}</select>);

export function Checkbox({ label, ...p }: InputHTMLAttributes<HTMLInputElement> & { label: ReactNode }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-700">
      <input type="checkbox" {...p} className="size-4 rounded border-slate-300 accent-gold-500" />
      {label}
    </label>
  );
}

const badgeTones = {
  green: "bg-emerald-50 text-emerald-700 ring-emerald-200", red: "bg-red-50 text-red-700 ring-red-200",
  amber: "bg-amber-50 text-amber-800 ring-amber-200", blue: "bg-sky-50 text-sky-700 ring-sky-200",
  gray: "bg-slate-100 text-slate-600 ring-slate-200", gold: "bg-gold-50 text-gold-600 ring-gold-200",
};
export function Badge({ tone = "gray", children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${badgeTones[tone]}`}>{children}</span>;
}

export function Stat({ label, value, sub, icon, tone = "navy" }:
  { label: ReactNode; value: ReactNode; sub?: ReactNode; icon?: ReactNode; tone?: "navy" | "gold" | "green" | "red" }) {
  const tones = { navy: "bg-navy-900 text-gold-300", gold: "bg-gold-100 text-gold-600", green: "bg-emerald-50 text-emerald-600", red: "bg-red-50 text-red-600" };
  return (
    <div className="card flex items-start gap-3 p-4">
      {icon && <div className={`grid size-10 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>{icon}</div>}
      <div className="min-w-0">
        <div className="text-xs font-semibold text-slate-500">{label}</div>
        <div className="num mt-1 truncate text-lg font-bold text-navy-900 text-start">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-slate-500">{sub}</div>}
      </div>
    </div>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="no-print mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-xl font-bold text-navy-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
      </div>
      <div className="flex flex-wrap items-center gap-2">{actions}</div>
    </div>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return <div className={`grid place-items-center p-8 text-slate-400 ${className}`}><Loader2 className="size-6 animate-spin" /></div>;
}

export function Empty({ text }: { text?: ReactNode }) {
  const { t } = useTranslation();
  return <div className="flex flex-col items-center gap-2 p-10 text-sm text-slate-400"><Inbox className="size-8" />{text ?? t("common.noData")}</div>;
}

export function Modal({ open, onClose, title, children, footer, wide }:
  { open: boolean; onClose(): void; title: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="no-print fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy-950/50 p-4 pt-[8vh]" onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}
        className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl bg-white shadow-2xl`}>
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          <h3 className="font-bold text-navy-900">{title}</h3>
          <button type="button" onClick={onClose} className="rounded p-1 text-slate-400 hover:bg-slate-100" aria-label="close"><X className="size-4" /></button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-slate-100 px-5 py-3">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({ open, onClose, onConfirm, title, message, danger, loading, children }:
  { open: boolean; onClose(): void; onConfirm(): void; title: ReactNode; message: ReactNode; danger?: boolean; loading?: boolean; children?: ReactNode }) {
  const { t } = useTranslation();
  return (
    <Modal open={open} onClose={onClose} title={title}
      footer={<>
        <Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button>
        <Button variant={danger ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{t("common.confirm")}</Button>
      </>}>
      <p className="text-sm text-slate-600">{message}</p>
      {children}
    </Modal>
  );
}

export function Pagination({ page, count, pageSize = 25, onPage }: { page: number; count: number; pageSize?: number; onPage(p: number): void }) {
  const { t, i18n } = useTranslation();
  const pages = Math.max(1, Math.ceil(count / pageSize));
  const rtl = i18n.language === "ar";
  if (count <= pageSize) return <div className="px-4 py-2 text-xs text-slate-500">{t("common.records", { count })}</div>;
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
      <span>{t("common.records", { count })}</span>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" disabled={page <= 1} onClick={() => onPage(page - 1)} icon={rtl ? <ChevronRight className="size-3" /> : <ChevronLeft className="size-3" />}>{t("common.previous")}</Button>
        <span>{t("common.page", { page, pages })}</span>
        <Button size="sm" variant="secondary" disabled={page >= pages} onClick={() => onPage(page + 1)}>{t("common.next")}{rtl ? <ChevronLeft className="size-3" /> : <ChevronRight className="size-3" />}</Button>
      </div>
    </div>
  );
}

export function Table({ head, children, empty }: { head: ReactNode[]; children: ReactNode; empty?: boolean }) {
  return (
    <div className="overflow-x-auto">
      <table className="table">
        <thead><tr>{head.map((h, i) => <th key={i}>{h}</th>)}</tr></thead>
        <tbody>{children}</tbody>
      </table>
      {empty && <Empty />}
    </div>
  );
}
