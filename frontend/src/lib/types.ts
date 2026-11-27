export interface Karat { id: number; code: string; name_ar: string; name_en: string; purity: string; is_active: boolean; sort_order: number }
export interface GoldPrice { id: number; karat: number; karat_code: string; buy_price: string; sell_price: string; prev_buy?: string | null; prev_sell?: string | null; buy_change: string | null; sell_change: string | null; source: number; source_name: string; effective_at: string; entered_by_name: string | null; note: string; created_at: string }
export interface Lookup { id: number; code: string; name_ar: string; name_en: string; is_active: boolean }
export interface Product {
  id: number; code: string; barcode: string; name: string; name_en: string; category: number; category_name_ar: string; category_name_en: string;
  jewelry_type: number | null; jewelry_type_name_ar: string | null; jewelry_type_name_en: string | null; karat: number; karat_code: string;
  tracking: "piece" | "quantity"; gross_weight: string; stone_weight: string; net_weight: string; quantity_on_hand: number; reorder_level: number;
  pricing_mode: "by_weight" | "fixed"; making_charge_type: "per_gram" | "fixed" | "percent"; making_charge_value: string; stones_value: string;
  selling_price: string | null; purchase_cost?: string; supplier: number | null; supplier_name: string | null; purchase_date: string | null;
  description: string; image: string | null; status: string; created_at: string;
}
export interface Party { id: number; name: string; phone: string; national_id: string; address: string; notes: string; is_active: boolean; balance: string; credit_limit?: string; tax_registration_no?: string }
export interface MoneyAccount { id: number; name: string; kind: "cash" | "bank"; bank_name: string; account_number: string; is_default: boolean; is_active: boolean; balance?: string }
