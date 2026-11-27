import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { api } from "../lib/api";
import { useAction, useList } from "../lib/hooks";
import { dateTime } from "../lib/format";
import { Badge, Button, Card, Checkbox, Field, Input, Modal, PageHeader, Select, Table } from "../components/ui";

const ROLES = ["owner", "manager", "accountant", "cashier", "inventory"];

export default function Users() {
  const { t } = useTranslation();
  const { data } = useList<any>("/users/", { page_size: 200 });
  const [u, setU] = useState<any>(null);
  const save = useAction(() => {
    const body = { ...u };
    if (!body.password) delete body.password;
    return u.id ? api.patch(`/users/${u.id}/`, body) : api.post("/users/", body);
  }, { success: t("common.saved"), invalidate: [["/users/"]], onSuccess: () => setU(null) });
  return (
    <div className="space-y-5">
      <PageHeader title={t("users.title")} actions={<Button variant="gold" icon={<Plus className="size-4" />} onClick={() => setU({ username: "", full_name: "", role: "cashier", language: "ar", is_active: true, password: "" })}>{t("users.new")}</Button>} />
      <Card bodyClass="p-0">
        <Table head={[t("auth.username"), t("users.fullName"), t("users.role"), t("common.phone"), t("users.lastLogin"), t("common.status"), ""]} empty={data?.results.length === 0}>
          {data?.results.map((x) => (
            <tr key={x.id}><td className="font-mono">{x.username}</td><td>{x.full_name}</td><td><Badge tone="gold">{t(`users.roles.${x.role}`)}</Badge></td>
              <td>{x.phone}</td><td className="text-xs">{dateTime(x.last_login)}</td><td>{x.is_active ? <Badge tone="green">{t("common.active")}</Badge> : <Badge tone="red">{t("common.inactive")}</Badge>}</td>
              <td><Button size="sm" variant="ghost" onClick={() => setU({ ...x, password: "" })}>{t("common.edit")}</Button></td></tr>
          ))}
        </Table>
      </Card>
      <Modal open={!!u} onClose={() => setU(null)} title={u?.id ? u.username : t("users.new")}
        footer={<><Button variant="secondary" onClick={() => setU(null)}>{t("common.cancel")}</Button><Button loading={save.isPending} disabled={!u?.username || (!u?.id && !u?.password)} onClick={() => save.mutate(undefined)}>{t("common.save")}</Button></>}>
        {u && <div className="grid grid-cols-2 gap-3">
          <Field label={t("auth.username")}><Input value={u.username} disabled={!!u.id} onChange={(e) => setU({ ...u, username: e.target.value })} dir="ltr" /></Field>
          <Field label={t("users.fullName")}><Input value={u.full_name} onChange={(e) => setU({ ...u, full_name: e.target.value })} /></Field>
          <Field label={t("users.role")}><Select value={u.role} onChange={(e) => setU({ ...u, role: e.target.value })}>{ROLES.map((r) => <option key={r} value={r}>{t(`users.roles.${r}`)}</option>)}</Select></Field>
          <Field label={t("auth.language")}><Select value={u.language} onChange={(e) => setU({ ...u, language: e.target.value })}><option value="ar">العربية</option><option value="en">English</option></Select></Field>
          <Field label={t("common.phone")}><Input value={u.phone ?? ""} onChange={(e) => setU({ ...u, phone: e.target.value })} /></Field>
          <Field label={u.id ? `${t("auth.newPassword")} (${t("common.optional")})` : t("auth.password")}><Input type="password" autoComplete="new-password" value={u.password} onChange={(e) => setU({ ...u, password: e.target.value })} /></Field>
          <Checkbox label={t("common.active")} checked={u.is_active} onChange={(e) => setU({ ...u, is_active: e.target.checked })} />
        </div>}
      </Modal>
    </div>
  );
}
