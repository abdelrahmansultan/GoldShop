import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useTranslation } from "react-i18next";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useAction, useAll } from "../lib/hooks";
import type { Party, Product } from "../lib/types";
import { useLocalName, useLookups } from "../lib/useLookups";
import { Button, Field, Input, Modal, Select, Textarea } from "../components/ui";

const dec = (places: number) => z.string().trim().regex(new RegExp(`^\\d+(\\.\\d{1,${places}})?$`), "0.00");
const optDec = (places: number) => z.union([z.literal(""), dec(places)]);

const schema = z.object({
  code: z.string().max(40).optional(),
  barcode: z.string().max(64).optional(),
  name: z.string().trim().min(1),
  name_en: z.string().optional(),
  category: z.string().min(1),
  jewelry_type: z.string().optional(),
  karat: z.string().min(1),
  tracking: z.enum(["piece", "quantity"]),
  gross_weight: dec(3).refine((v) => Number(v) > 0, ">0"),
  stone_weight: dec(3),
  pricing_mode: z.enum(["by_weight", "fixed"]),
  making_charge_type: z.enum(["per_gram", "fixed", "percent"]),
  making_charge_value: dec(2),
  stones_value: dec(2),
  selling_price: optDec(2),
  purchase_cost: optDec(2),
  supplier: z.string().optional(),
  purchase_date: z.string().optional(),
  reorder_level: z.string().regex(/^\d*$/),
  opening_quantity: z.string().regex(/^\d*$/),
  description: z.string().optional(),
}).refine((v) => Number(v.stone_weight) <= Number(v.gross_weight), { path: ["stone_weight"], message: "≤ gross" })
  .refine((v) => v.pricing_mode !== "fixed" || (v.selling_price && Number(v.selling_price) > 0), { path: ["selling_price"], message: "required" })
  .refine((v) => v.tracking !== "piece" || Number(v.opening_quantity || 0) <= 1, { path: ["opening_quantity"], message: "≤ 1" });

type FormValues = z.infer<typeof schema>;

export default function ProductForm({ open, onClose, product, onSaved }:
  { open: boolean; onClose(): void; product?: Product; onSaved?(p: Product): void }) {
  const { t } = useTranslation();
  const ln = useLocalName();
  const { can } = useAuth();
  const { karats, categories, types } = useLookups();
  const suppliers = useAll<Party>("/suppliers/", {}, can("purchases.manage")).data ?? [];
  const editing = !!product;
  const { register, handleSubmit, reset, watch, formState: { errors } } = useForm<FormValues>({ resolver: zodResolver(schema) });

  useEffect(() => {
    if (!open) return;
    reset({
      code: product?.code ?? "", barcode: product?.barcode ?? "", name: product?.name ?? "", name_en: product?.name_en ?? "",
      category: String(product?.category ?? ""), jewelry_type: String(product?.jewelry_type ?? ""), karat: String(product?.karat ?? karats.find((k) => k.code === "21")?.id ?? ""),
      tracking: product?.tracking ?? "piece", gross_weight: product?.gross_weight ?? "", stone_weight: product?.stone_weight ?? "0",
      pricing_mode: product?.pricing_mode ?? "by_weight", making_charge_type: product?.making_charge_type ?? "per_gram",
      making_charge_value: product?.making_charge_value ?? "0", stones_value: product?.stones_value ?? "0",
      selling_price: product?.selling_price ?? "", purchase_cost: product?.purchase_cost ?? "", supplier: String(product?.supplier ?? ""),
      purchase_date: product?.purchase_date ?? "", reorder_level: String(product?.reorder_level ?? 0), opening_quantity: editing ? "0" : "1",
      description: product?.description ?? "",
    });
  }, [open, product, reset, karats, editing]);

  const save = useAction(async (v: FormValues) => {
    const body: Record<string, unknown> = {
      ...v, jewelry_type: v.jewelry_type || null, supplier: v.supplier || null, purchase_date: v.purchase_date || null,
      selling_price: v.selling_price || null, reorder_level: Number(v.reorder_level || 0), opening_quantity: Number(v.opening_quantity || 0),
    };
    if (!v.purchase_cost) delete body.purchase_cost;
    if (editing) {
      for (const f of ["gross_weight", "stone_weight", "karat", "tracking", "opening_quantity"]) delete body[f];
      return (await api.patch<Product>(`/products/${product!.id}/`, body)).data;
    }
    return (await api.post<Product>("/products/", body)).data;
  }, { invalidate: [["/products/"]], success: editing ? t("common.saved") : t("inv.created"), onSuccess: (p) => { onSaved?.(p); onClose(); } });

  const tracking = watch("tracking");
  const pricing = watch("pricing_mode");
  const e = (k: keyof FormValues) => errors[k]?.message as string | undefined;

  return (
    <Modal wide open={open} onClose={onClose} title={editing ? `${t("common.edit")} — ${product?.code}` : t("inv.newItem")}
      footer={<><Button variant="secondary" onClick={onClose}>{t("common.cancel")}</Button><Button variant="gold" loading={save.isPending} onClick={handleSubmit((v) => save.mutate(v))}>{t("common.save")}</Button></>}>
      <form className="grid grid-cols-1 gap-3 sm:grid-cols-3" onSubmit={(ev) => ev.preventDefault()}>
        <Field label={`${t("common.code")} (${t("common.optional")})`} error={e("code")}><Input {...register("code")} disabled={editing} /></Field>
        <Field label={t("inv.barcode")} error={e("barcode")}><Input {...register("barcode")} placeholder={t("common.optional")} /></Field>
        <Field label={t("inv.tracking")}><Select {...register("tracking")} disabled={editing}><option value="piece">{t("inv.piece")}</option><option value="quantity">{t("inv.quantityBased")}</option></Select></Field>
        <Field label={t("common.nameAr")} error={e("name")} className="sm:col-span-2"><Input {...register("name")} /></Field>
        <Field label={t("common.nameEn")}><Input {...register("name_en")} dir="ltr" /></Field>
        <Field label={t("inv.category")} error={e("category") && t("common.required")}><Select {...register("category")}><option value="" />{categories.filter((c) => c.is_active).map((c) => <option key={c.id} value={c.id}>{ln(c)}</option>)}</Select></Field>
        <Field label={t("inv.jewelryType")}><Select {...register("jewelry_type")}><option value="">—</option>{types.map((c) => <option key={c.id} value={c.id}>{ln(c)}</option>)}</Select></Field>
        <Field label={t("inv.karat")} error={e("karat") && t("common.required")}><Select {...register("karat")} disabled={editing}><option value="" />{karats.filter((k) => k.is_active).map((k) => <option key={k.id} value={k.id}>{ln(k)}</option>)}</Select></Field>
        <Field label={t("inv.gross")} error={e("gross_weight")} hint={editing ? t("inv.weightLocked") : undefined}><Input inputMode="decimal" className="num" {...register("gross_weight")} disabled={editing} /></Field>
        <Field label={t("inv.stone")} error={e("stone_weight")}><Input inputMode="decimal" className="num" {...register("stone_weight")} disabled={editing} /></Field>
        <Field label={t("inv.stonesValue")} error={e("stones_value")}><Input inputMode="decimal" className="num" {...register("stones_value")} /></Field>
        <Field label={t("inv.pricingMode")}><Select {...register("pricing_mode")}><option value="by_weight">{t("inv.byWeight")}</option><option value="fixed">{t("inv.fixed")}</option></Select></Field>
        {pricing === "by_weight" ? (<>
          <Field label={t("inv.makingType")}><Select {...register("making_charge_type")}><option value="per_gram">{t("inv.perGram")}</option><option value="fixed">{t("inv.perPiece")}</option><option value="percent">{t("inv.percent")}</option></Select></Field>
          <Field label={t("inv.makingValue")} error={e("making_charge_value")}><Input inputMode="decimal" className="num" {...register("making_charge_value")} /></Field>
        </>) : (
          <Field label={t("inv.sellingPrice")} error={e("selling_price")} className="sm:col-span-2"><Input inputMode="decimal" className="num" {...register("selling_price")} /></Field>
        )}
        {can("inventory.view_cost") && <Field label={t("inv.purchaseCost")} error={e("purchase_cost")}><Input inputMode="decimal" className="num" {...register("purchase_cost")} /></Field>}
        {can("purchases.manage") && <Field label={t("inv.supplier")}><Select {...register("supplier")}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>}
        <Field label={t("inv.purchaseDate")}><Input type="date" {...register("purchase_date")} /></Field>
        {!editing && <Field label={t("inv.openingQty")} error={e("opening_quantity")}><Input inputMode="numeric" className="num" {...register("opening_quantity")} /></Field>}
        {tracking === "quantity" && <Field label={t("inv.reorder")}><Input inputMode="numeric" className="num" {...register("reorder_level")} /></Field>}
        <Field label={t("common.description")} className="sm:col-span-3"><Textarea {...register("description")} /></Field>
      </form>
    </Modal>
  );
}
