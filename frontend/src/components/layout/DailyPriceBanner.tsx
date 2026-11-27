import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { useAuth } from "../../lib/auth";
import { useGet } from "../../lib/hooks";

type Board = { rows: { karat: { code: string }; price: { effective_at: string } | null; is_stale: boolean }[] };

/** Shown on every screen while today's gold prices are missing or outdated. */
export function DailyPriceBanner() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const nav = useNavigate();
  const { data } = useGet<Board>("/price-board/");
  if (!data || !data.rows.some((r) => r.is_stale)) return null;
  const manager = can("prices.manage");
  return (
    <div className="no-print flex flex-wrap items-center gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2.5 text-sm text-amber-900 sm:px-6">
      <AlertTriangle className="size-4 shrink-0 text-amber-600" />
      <span className="flex-1">{manager ? t("prices2.notToday") : t("prices2.notTodayCashier")}</span>
      {manager && (
        <button type="button" onClick={() => nav("/prices?enter=1")}
          className="rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700">{t("prices2.enterNow")}</button>
      )}
    </div>
  );
}
