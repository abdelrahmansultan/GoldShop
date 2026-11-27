import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useList } from "../lib/hooks";
import { dateTime } from "../lib/format";
import { Card, Input, PageHeader, Pagination, Table } from "../components/ui";

export default function Audit() {
  const { t } = useTranslation();
  const [f, setF] = useState({ search: "", action__startswith: "", created_at__date: "" });
  const [page, setPage] = useState(1);
  const params = Object.fromEntries(Object.entries({ ...f, page }).filter(([, v]) => v !== ""));
  const { data } = useList<any>("/audit-log/", params);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => { setF({ ...f, [k]: e.target.value }); setPage(1); };
  return (
    <div className="space-y-5">
      <PageHeader title={t("audit.title")} />
      <Card bodyClass="p-0">
        <div className="grid grid-cols-1 gap-3 border-b border-slate-100 p-4 sm:grid-cols-3">
          <Input placeholder={`${t("common.search")}…`} value={f.search} onChange={set("search")} />
          <Input placeholder={`${t("audit.action")} (sale., price., adjustment.)`} dir="ltr" value={f.action__startswith} onChange={set("action__startswith")} />
          <Input type="date" value={f.created_at__date} onChange={set("created_at__date")} />
        </div>
        <Table head={[t("common.date"), t("common.user"), t("audit.action"), t("audit.entity"), t("common.description"), t("audit.ip")]} empty={data?.results.length === 0}>
          {data?.results.map((a) => (
            <tr key={a.id}><td className="text-xs">{dateTime(a.created_at)}</td><td className="text-xs">{a.user_name ?? "system"}</td>
              <td className="font-mono text-xs">{a.action}</td><td className="text-xs">{a.entity} #{a.entity_id}</td>
              <td className="max-w-md text-xs" title={JSON.stringify(a.data)}>{a.summary}</td><td className="font-mono text-xs">{a.ip_address}</td></tr>
          ))}
        </Table>
        {data && <Pagination page={page} count={data.count} onPage={setPage} />}
      </Card>
    </div>
  );
}
