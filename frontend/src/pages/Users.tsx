import { useState } from "react";
import { useTranslation } from "react-i18next";
import { KeyRound, Plus, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction, useGet, useList } from "../lib/hooks";
import { dateTime } from "../lib/format";
import { Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Select, Table } from "../components/ui";

const ROLES = ["owner", "manager", "accountant", "cashier", "inventory"];
type Catalog = { groups: { key: string; capabilities: string[] }[]; roles: Record<string, string[]> };
type U = {
  id?: number; username: string; full_name: string; role: string; language: string; phone?: string; is_active: boolean;
  password?: string; last_login?: string | null; custom_capabilities: string[] | null; role_defaults?: string[]; capabilities?: string[];
};

export default function Users() {
  const { t } = useTranslation();
  const { user: me } = useAuth();
  const { data } = useList<U>("/users/", { page_size: 200 });
  const catalog = useGet<Catalog>("/auth/capabilities/").data;
  const [u, setU] = useState<U | null>(null);
  const isOwner = me?.role === "owner";

  const save = useAction(() => {
    const body: Record<string, unknown> = { ...u };
    if (!body.password) delete body.password;
    for (const k of ["role_defaults", "capabilities", "last_login", "display_name"]) delete body[k];
    if (u!.role === "owner") body.custom_capabilities = null;
    return u!.id ? api.patch(`/users/${u!.id}/`, body) : api.post("/users/", body);
  }, { success: t("common.saved"), invalidate: [["/users/"]], onSuccess: () => setU(null) });

  const effective = (x: U) => x.role === "owner" ? null : (x.custom_capabilities ?? catalog?.roles[x.role] ?? []);

  return (
    <div className="space-y-5">
      <PageHeader title={t("users.title")} actions={
        <Button variant="gold" icon={<Plus className="size-4" />}
          onClick={() => setU({ username: "", full_name: "", role: "cashier", language: "ar", is_active: true, password: "", custom_capabilities: null })}>{t("users.new")}</Button>} />
      <Card bodyClass="p-0">
        <Table head={[t("auth.username"), t("users.fullName"), t("users.role"), t("perm.title"), t("users.lastLogin"), t("common.status"), ""]} empty={data?.results.length === 0}>
          {data?.results.map((x) => {
            const caps = effective(x);
            return (
              <tr key={x.id}>
                <td className="font-mono">{x.username}</td><td>{x.full_name}</td>
                <td><Badge tone="gold">{t(`users.roles.${x.role}`)}</Badge></td>
                <td className="text-xs">
                  {caps === null ? <Badge tone="green">{t("common.all")}</Badge> : (
                    <span className="inline-flex items-center gap-1.5">
                      <Badge tone={x.custom_capabilities ? "blue" : "gray"}>{x.custom_capabilities ? t("perm.customized") : t("perm.defaults")}</Badge>
                      {t("perm.summary", { count: caps.length })}
                    </span>
                  )}
                </td>
                <td className="text-xs">{dateTime(x.last_login)}</td>
                <td>{x.is_active ? <Badge tone="green">{t("common.active")}</Badge> : <Badge tone="red">{t("common.inactive")}</Badge>}</td>
                <td>{(isOwner || x.role !== "owner") && <Button size="sm" variant="ghost" icon={<ShieldCheck className="size-4" />} onClick={() => setU({ ...x, password: "" })}>{t("common.edit")}</Button>}</td>
              </tr>
            );
          })}
        </Table>
      </Card>

      <Modal wide open={!!u} onClose={() => setU(null)} title={u?.id ? `${u.username} — ${t("perm.title")}` : t("users.new")}
        footer={<><Button variant="secondary" onClick={() => setU(null)}>{t("common.cancel")}</Button>
          <Button loading={save.isPending} disabled={!u?.username || (!u?.id && !u?.password)} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button></>}>
        {u && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Field label={t("auth.username")}><Input value={u.username} disabled={!!u.id} dir="ltr" onChange={(e) => setU({ ...u, username: e.target.value.trim() })} /></Field>
              <Field label={t("users.fullName")}><Input value={u.full_name} onChange={(e) => setU({ ...u, full_name: e.target.value })} /></Field>
              <Field label={t("users.role")}>
                <Select value={u.role} onChange={(e) => setU({ ...u, role: e.target.value, custom_capabilities: null })}>
                  {ROLES.filter((r) => isOwner || r !== "owner").map((r) => <option key={r} value={r}>{t(`users.roles.${r}`)}</option>)}
                </Select>
              </Field>
              <Field label={t("common.phone")}><Input value={u.phone ?? ""} onChange={(e) => setU({ ...u, phone: e.target.value })} /></Field>
              <Field label={t("auth.language")}><Select value={u.language} onChange={(e) => setU({ ...u, language: e.target.value })}><option value="ar">العربية</option><option value="en">English</option></Select></Field>
              <Field label={u.id ? `${t("auth.newPassword")} (${t("common.optional")})` : t("auth.password")}>
                <div className="relative"><KeyRound className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <Input type="password" autoComplete="new-password" className="ps-9" value={u.password ?? ""} onChange={(e) => setU({ ...u, password: e.target.value })} /></div>
              </Field>
              <Checkbox label={t("common.active")} checked={u.is_active} disabled={u.id === me?.id} onChange={(e) => setU({ ...u, is_active: e.target.checked })} />
            </div>
            {u.role !== "owner" && catalog && <ScreensEditor u={u} setU={setU} catalog={catalog} myCaps={me?.capabilities ?? []} isOwner={isOwner} />}
          </div>
        )}
      </Modal>
    </div>
  );
}

function ScreensEditor({ u, setU, catalog, myCaps, isOwner }:
  { u: U; setU(u: U): void; catalog: Catalog; myCaps: string[]; isOwner: boolean }) {
  const { t } = useTranslation();
  const custom = u.custom_capabilities !== null;
  const caps = new Set(u.custom_capabilities ?? catalog.roles[u.role] ?? []);
  const grantable = (c: string) => isOwner || myCaps.includes(c);
  const toggle = (c: string, on: boolean) => {
    const next = new Set(caps);
    if (on) next.add(c); else next.delete(c);
    setU({ ...u, custom_capabilities: [...next].sort() });
  };
  return (
    <div className="rounded-xl border border-slate-200">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 bg-slate-50 px-4 py-3">
        <div>
          <div className="text-sm font-bold text-navy-900">{t("perm.title")}</div>
          <div className="text-xs text-slate-500">{t("perm.hint")}</div>
        </div>
        <div className="flex gap-1 rounded-lg bg-white p-1 ring-1 ring-slate-200">
          <button type="button" onClick={() => setU({ ...u, custom_capabilities: null })}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${!custom ? "bg-navy-900 text-gold-300" : "text-slate-600"}`}>{t("perm.roleDefaults")}</button>
          <button type="button" onClick={() => setU({ ...u, custom_capabilities: [...caps].sort() })}
            className={`rounded-md px-3 py-1.5 text-xs font-semibold ${custom ? "bg-navy-900 text-gold-300" : "text-slate-600"}`}>{t("perm.custom")}</button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-4 p-4 sm:grid-cols-2">
        {catalog.groups.map((g) => (
          <fieldset key={g.key} className="rounded-lg border border-slate-100 p-3">
            <legend className="px-1 text-xs font-bold text-gold-600">{t(`perm.groups.${g.key}`)}</legend>
            <div className="space-y-1.5">
              {g.capabilities.map((c) => (
                <div key={c}>
                  <Checkbox label={<span className={!grantable(c) ? "text-slate-400" : ""}>{t(`perm.caps.${c}`, { defaultValue: c })}</span>}
                    checked={caps.has(c)} disabled={!custom || !grantable(c)} onChange={(e) => toggle(c, e.target.checked)} />
                </div>
              ))}
            </div>
          </fieldset>
        ))}
      </div>
      {custom && (
        <div className="flex gap-2 border-t border-slate-100 px-4 py-2">
          <Button size="sm" variant="ghost" onClick={() => setU({ ...u, custom_capabilities: catalog.groups.flatMap((g) => g.capabilities).filter(grantable).sort() })}>{t("perm.selectAll")}</Button>
          <Button size="sm" variant="ghost" onClick={() => setU({ ...u, custom_capabilities: [] })}>{t("perm.clear")}</Button>
        </div>
      )}
    </div>
  );
}
