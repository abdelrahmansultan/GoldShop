import { useTranslation } from "react-i18next";
import { useAll } from "./hooks";
import type { Karat, Lookup, MoneyAccount } from "./types";

export function useLookups() {
  const karats = useAll<Karat>("/karats/");
  const categories = useAll<Lookup>("/categories/");
  const types = useAll<Lookup>("/jewelry-types/");
  return { karats: karats.data ?? [], categories: categories.data ?? [], types: types.data ?? [] };
}

export function useAccounts() {
  return useAll<MoneyAccount>("/accounts/").data ?? [];
}

/** Pick the localized name from an object with name_ar/name_en. */
export function useLocalName() {
  const { i18n } = useTranslation();
  return (o: { name_ar?: string | null; name_en?: string | null } | null | undefined) =>
    !o ? "—" : (i18n.language === "ar" ? o.name_ar || o.name_en : o.name_en || o.name_ar) ?? "—";
}

export const PAYMENT_METHODS = ["cash", "card", "bank_transfer", "instapay", "wallet", "cheque"] as const;
