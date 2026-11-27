import { useState } from "react";
import { useTranslation } from "react-i18next";
import { api } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { useAction } from "../../lib/hooks";
import { Button, Field, Input, Modal, Select } from "../ui";

export function ProfileModal({ open, onClose }: { open: boolean; onClose(): void }) {
  const { t, i18n } = useTranslation();
  const { user, refreshMe } = useAuth();
  const [pw, setPw] = useState({ old_password: "", new_password: "" });
  const lang = useAction((language: string) => api.patch("/auth/me/", { language }), {
    success: t("common.saved"), onSuccess: () => void refreshMe(),
  });
  const change = useAction(() => api.post("/auth/change-password/", pw), {
    success: t("common.saved"), onSuccess: () => setPw({ old_password: "", new_password: "" }),
  });
  return (
    <Modal open={open} onClose={onClose} title={t("auth.profile")}>
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <div className="font-semibold">{user?.display_name}</div>
          <div className="text-slate-500">{user?.username} · {t(`users.roles.${user?.role}`)}</div>
        </div>
        <Field label={t("auth.language")}>
          <Select value={i18n.language} onChange={(e) => { void i18n.changeLanguage(e.target.value); lang.mutate(e.target.value); }}>
            <option value="ar">العربية</option><option value="en">English</option>
          </Select>
        </Field>
        <form className="space-y-3 border-t border-slate-100 pt-4" onSubmit={(e) => { e.preventDefault(); change.mutate(undefined); }}>
          <div className="text-sm font-bold text-navy-900">{t("auth.changePassword")}</div>
          <Field label={t("auth.oldPassword")}><Input type="password" autoComplete="current-password" value={pw.old_password} onChange={(e) => setPw({ ...pw, old_password: e.target.value })} required /></Field>
          <Field label={t("auth.newPassword")}><Input type="password" autoComplete="new-password" minLength={8} value={pw.new_password} onChange={(e) => setPw({ ...pw, new_password: e.target.value })} required /></Field>
          <Button type="submit" loading={change.isPending}>{t("common.save")}</Button>
        </form>
      </div>
    </Modal>
  );
}
