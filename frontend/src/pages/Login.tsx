import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Gem, Languages } from "lucide-react";
import { useAuth } from "../lib/auth";
import { errorMessage } from "../lib/api";
import { Button, Field, Input } from "../components/ui";

export default function Login() {
  const { t, i18n } = useTranslation();
  const { login } = useAuth();
  const [u, setU] = useState("");
  const [p, setP] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await login(u, p); } catch (x) {
      const m = errorMessage(x);
      setErr(m === "network" ? t("errors.network") : (x as { response?: { status: number } }).response?.status === 401 ? t("auth.invalid") : m);
    } finally { setBusy(false); }
  };
  return (
    <div className="grid min-h-screen place-items-center bg-gradient-to-br from-navy-950 via-navy-900 to-navy-800 p-4">
      <button type="button" onClick={() => i18n.changeLanguage(i18n.language === "ar" ? "en" : "ar")}
        className="absolute top-4 end-4 flex items-center gap-1 rounded-lg px-3 py-2 text-sm text-gold-200 hover:bg-white/10">
        <Languages className="size-4" />{i18n.language === "ar" ? "English" : "العربية"}
      </button>
      <form onSubmit={submit} className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-2xl">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <div className="grid size-14 place-items-center rounded-2xl bg-gradient-to-br from-gold-300 to-gold-500 text-navy-950 shadow-lg"><Gem className="size-7" /></div>
          <div><h1 className="text-lg font-bold text-navy-900">{t("app.name")}</h1><p className="text-sm text-slate-500">{t("auth.title")}</p></div>
        </div>
        <div className="space-y-4">
          <Field label={t("auth.username")}><Input autoFocus autoComplete="username" value={u} onChange={(e) => setU(e.target.value)} required /></Field>
          <Field label={t("auth.password")}><Input type="password" autoComplete="current-password" value={p} onChange={(e) => setP(e.target.value)} required /></Field>
          {err && <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}
          <Button type="submit" variant="gold" size="lg" className="w-full" loading={busy}>{t("auth.submit")}</Button>
        </div>
      </form>
    </div>
  );
}
