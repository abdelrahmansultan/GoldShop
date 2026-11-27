"""
Gold calculation engine.

Pure-Python, Decimal-only, framework-independent. Every monetary and weight
figure in the application is produced by this package so that invoices,
previews, reports and tests all agree to the piastre and the milligram.

Rules:
  * Inputs are converted to Decimal from str/int/Decimal only. Floats are
    rejected: binary floating point cannot represent prices like 3,215.35.
  * Intermediate math runs at full Decimal precision (28 significant digits).
  * Weights are rounded to 0.001 g, money to 0.01 EGP, ROUND_HALF_UP, and
    only at defined points (line results), never mid-formula.
"""

from .engine import (  # noqa: F401
    EngineError,
    MakingChargeType,
    SaleLineInput,
    SaleLineResult,
    OldGoldInput,
    OldGoldResult,
    InvoiceTotals,
    to_decimal,
    q_money,
    q_weight,
    net_weight,
    pure_gold_weight,
    convert_weight,
    price_for_karat,
    calculate_sale_line,
    calculate_old_gold,
    calculate_invoice_totals,
    inventory_value,
)
