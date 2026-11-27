from __future__ import annotations

from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation, localcontext
from enum import Enum
from typing import Iterable

MONEY_Q = Decimal("0.01")
WEIGHT_Q = Decimal("0.001")
RATE_Q = Decimal("0.0001")
ZERO = Decimal("0")
ONE = Decimal("1")
HUNDRED = Decimal("100")


class EngineError(ValueError):
    """Raised for any invalid calculation input. Message is safe to show users."""


def to_decimal(value, name: str = "value") -> Decimal:
    if isinstance(value, float):
        raise EngineError(f"{name}: float values are not accepted; pass a string or Decimal")
    if isinstance(value, bool):
        raise EngineError(f"{name}: boolean is not a number")
    if value is None or value == "":
        return ZERO
    try:
        d = value if isinstance(value, Decimal) else Decimal(str(value).strip())
    except (InvalidOperation, ValueError) as exc:
        raise EngineError(f"{name}: '{value}' is not a valid number") from exc
    if not d.is_finite():
        raise EngineError(f"{name}: must be a finite number")
    return d


def q_money(value) -> Decimal:
    return to_decimal(value).quantize(MONEY_Q, rounding=ROUND_HALF_UP)


def q_weight(value) -> Decimal:
    return to_decimal(value).quantize(WEIGHT_Q, rounding=ROUND_HALF_UP)


def _non_negative(d: Decimal, name: str) -> Decimal:
    if d < 0:
        raise EngineError(f"{name}: cannot be negative")
    return d


def _purity(purity) -> Decimal:
    p = to_decimal(purity, "purity")
    if p <= 0 or p > 1:
        raise EngineError("purity: must be a fraction in (0, 1], e.g. 0.875 for 21K")
    return p


# ---------------------------------------------------------------- weights


def net_weight(gross_weight, stone_weight=ZERO) -> Decimal:
    """Net gold weight = gross weight - stones/non-gold parts."""
    g = _non_negative(to_decimal(gross_weight, "gross_weight"), "gross_weight")
    s = _non_negative(to_decimal(stone_weight, "stone_weight"), "stone_weight")
    if s > g:
        raise EngineError("stone_weight: cannot exceed gross weight")
    return q_weight(g - s)


def pure_gold_weight(weight, purity) -> Decimal:
    """Fine (24K-equivalent) gold contained in `weight` grams at `purity`."""
    w = _non_negative(to_decimal(weight, "weight"), "weight")
    return q_weight(w * _purity(purity))


def convert_weight(weight, from_purity, to_purity) -> Decimal:
    """Equivalent weight in another karat holding the same fine gold.

    e.g. 10 g of 18K (0.750) == 8.571 g of 21K (0.875).
    """
    w = _non_negative(to_decimal(weight, "weight"), "weight")
    return q_weight(w * _purity(from_purity) / _purity(to_purity))


def price_for_karat(reference_price, reference_purity, target_purity) -> Decimal:
    """Derive a per-gram price for a karat from a reference karat's price
    (proportional to fine-gold content). Used only when the shop explicitly
    chooses to derive prices; manual per-karat prices always take precedence."""
    p = _non_negative(to_decimal(reference_price, "reference_price"), "reference_price")
    return q_money(p * _purity(target_purity) / _purity(reference_purity))


# ---------------------------------------------------------------- sale line


class MakingChargeType(str, Enum):
    PER_GRAM = "per_gram"      # EGP per gram of net gold weight (most common in Egypt)
    FIXED = "fixed"            # EGP per piece
    PERCENT = "percent"        # % of the gold value


@dataclass(frozen=True)
class SaleLineInput:
    net_weight: Decimal | str
    price_per_gram: Decimal | str
    quantity: Decimal | str | int = 1
    making_charge_type: MakingChargeType | str = MakingChargeType.PER_GRAM
    making_charge_value: Decimal | str = ZERO
    stones_value: Decimal | str = ZERO          # value of gemstones per piece, EGP
    discount: Decimal | str = ZERO              # EGP discount on the whole line
    vat_rate: Decimal | str = ZERO              # e.g. "14" for 14 %
    vat_on_gold: bool = False                   # Egypt: VAT normally applies to making charge only
    vat_on_stones: bool = True
    discount_reduces_making_first: bool = True  # discount is taken from making charge before gold


@dataclass(frozen=True)
class SaleLineResult:
    quantity: Decimal
    net_weight_per_unit: Decimal
    total_net_weight: Decimal
    price_per_gram: Decimal
    gold_value: Decimal
    making_charge: Decimal
    stones_value: Decimal
    subtotal: Decimal
    discount: Decimal
    taxable_amount: Decimal
    vat_rate: Decimal
    vat_amount: Decimal
    total: Decimal

    def as_dict(self) -> dict:
        return {k: str(v) for k, v in self.__dict__.items()}


def _quantity(q) -> Decimal:
    d = to_decimal(q, "quantity")
    if d <= 0:
        raise EngineError("quantity: must be greater than zero")
    return d


def calculate_sale_line(inp: SaleLineInput) -> SaleLineResult:
    qty = _quantity(inp.quantity)
    w = _non_negative(q_weight(inp.net_weight), "net_weight")
    price = _non_negative(to_decimal(inp.price_per_gram, "price_per_gram"), "price_per_gram")
    mc_value = _non_negative(to_decimal(inp.making_charge_value, "making_charge_value"), "making_charge_value")
    stones_unit = _non_negative(to_decimal(inp.stones_value, "stones_value"), "stones_value")
    discount = _non_negative(q_money(inp.discount), "discount")
    vat_rate = _non_negative(to_decimal(inp.vat_rate, "vat_rate"), "vat_rate")
    if vat_rate > HUNDRED:
        raise EngineError("vat_rate: cannot exceed 100")
    try:
        mc_type = MakingChargeType(inp.making_charge_type)
    except ValueError as exc:
        raise EngineError(f"making_charge_type: unknown '{inp.making_charge_type}'") from exc

    total_weight = q_weight(w * qty)

    with localcontext() as ctx:
        ctx.prec = 34
        gold_value = q_money(total_weight * price)
        if mc_type is MakingChargeType.PER_GRAM:
            making = q_money(total_weight * mc_value)
        elif mc_type is MakingChargeType.FIXED:
            making = q_money(mc_value * qty)
        else:
            if mc_value > HUNDRED * 10:
                raise EngineError("making_charge_value: percentage is unreasonably high")
            making = q_money(gold_value * mc_value / HUNDRED)
        stones = q_money(stones_unit * qty)
        subtotal = gold_value + making + stones
        if discount > subtotal:
            raise EngineError("discount: cannot exceed line subtotal")

        # Allocate the discount so VAT is computed on what is actually charged.
        if inp.discount_reduces_making_first:
            d_making = min(discount, making)
            rest = discount - d_making
            d_stones = min(rest, stones)
            d_gold = rest - d_stones
        else:  # proportional
            if subtotal == 0:
                d_gold = d_making = d_stones = ZERO
            else:
                d_making = q_money(discount * making / subtotal)
                d_stones = q_money(discount * stones / subtotal)
                d_gold = discount - d_making - d_stones

        taxable = making - d_making
        if inp.vat_on_stones:
            taxable += stones - d_stones
        if inp.vat_on_gold:
            taxable += gold_value - d_gold
        taxable = q_money(taxable)
        vat = q_money(taxable * vat_rate / HUNDRED)
        total = q_money(subtotal - discount + vat)

    return SaleLineResult(
        quantity=qty,
        net_weight_per_unit=w,
        total_net_weight=total_weight,
        price_per_gram=q_money(price),
        gold_value=gold_value,
        making_charge=making,
        stones_value=stones,
        subtotal=q_money(subtotal),
        discount=discount,
        taxable_amount=taxable,
        vat_rate=vat_rate.quantize(RATE_Q),
        vat_amount=vat,
        total=total,
    )


# ---------------------------------------------------------------- old gold (buy-back / exchange)


@dataclass(frozen=True)
class OldGoldInput:
    weight: Decimal | str                # grams as weighed at the counter
    buy_price_per_gram: Decimal | str    # shop buying price for the karat
    deduction_per_gram: Decimal | str = ZERO   # EGP/g deducted (e.g. wear/refining)
    deduction_percent: Decimal | str = ZERO    # % weight loss deducted before valuation


@dataclass(frozen=True)
class OldGoldResult:
    weight: Decimal
    accepted_weight: Decimal
    buy_price_per_gram: Decimal
    effective_price_per_gram: Decimal
    value: Decimal

    def as_dict(self) -> dict:
        return {k: str(v) for k, v in self.__dict__.items()}


def calculate_old_gold(inp: OldGoldInput) -> OldGoldResult:
    w = _non_negative(q_weight(inp.weight), "weight")
    if w == 0:
        raise EngineError("weight: must be greater than zero")
    price = _non_negative(to_decimal(inp.buy_price_per_gram, "buy_price_per_gram"), "buy_price_per_gram")
    ded_g = _non_negative(to_decimal(inp.deduction_per_gram, "deduction_per_gram"), "deduction_per_gram")
    ded_pct = _non_negative(to_decimal(inp.deduction_percent, "deduction_percent"), "deduction_percent")
    if ded_pct >= HUNDRED:
        raise EngineError("deduction_percent: must be below 100")
    if ded_g > price:
        raise EngineError("deduction_per_gram: cannot exceed the buying price")
    accepted = q_weight(w * (HUNDRED - ded_pct) / HUNDRED)
    eff_price = q_money(price - ded_g)
    return OldGoldResult(
        weight=w,
        accepted_weight=accepted,
        buy_price_per_gram=q_money(price),
        effective_price_per_gram=eff_price,
        value=q_money(accepted * eff_price),
    )


# ---------------------------------------------------------------- invoice totals


@dataclass(frozen=True)
class InvoiceTotals:
    total_weight: Decimal
    gold_value: Decimal
    making_charge: Decimal
    stones_value: Decimal
    discount: Decimal
    vat_amount: Decimal
    lines_total: Decimal
    invoice_discount: Decimal
    old_gold_value: Decimal
    grand_total: Decimal          # amount of goods sold after discounts and tax
    net_payable: Decimal          # grand_total - old gold credit; negative => shop owes customer
    paid: Decimal
    balance_due: Decimal          # net_payable - paid; >0 customer owes, <0 change/credit
    breakdown: dict = field(default_factory=dict)

    def as_dict(self) -> dict:
        d = {k: str(v) for k, v in self.__dict__.items() if k != "breakdown"}
        d["breakdown"] = self.breakdown
        return d


def calculate_invoice_totals(
    lines: Iterable[SaleLineResult],
    old_gold: Iterable[OldGoldResult] = (),
    invoice_discount=ZERO,
    payments: Iterable = (),
) -> InvoiceTotals:
    lines = list(lines)
    old_gold = list(old_gold)
    inv_disc = _non_negative(q_money(invoice_discount), "invoice_discount")
    tw = sum((l.total_net_weight for l in lines), ZERO)
    gold = sum((l.gold_value for l in lines), ZERO)
    making = sum((l.making_charge for l in lines), ZERO)
    stones = sum((l.stones_value for l in lines), ZERO)
    disc = sum((l.discount for l in lines), ZERO)
    vat = sum((l.vat_amount for l in lines), ZERO)
    lines_total = sum((l.total for l in lines), ZERO)
    if inv_disc > lines_total:
        raise EngineError("invoice_discount: cannot exceed invoice total")
    grand = q_money(lines_total - inv_disc)
    og = sum((o.value for o in old_gold), ZERO)
    net_payable = q_money(grand - og)
    paid = q_money(sum((_non_negative(to_decimal(p, "payment"), "payment") for p in payments), ZERO))
    return InvoiceTotals(
        total_weight=q_weight(tw),
        gold_value=q_money(gold),
        making_charge=q_money(making),
        stones_value=q_money(stones),
        discount=q_money(disc),
        vat_amount=q_money(vat),
        lines_total=q_money(lines_total),
        invoice_discount=inv_disc,
        old_gold_value=q_money(og),
        grand_total=grand,
        net_payable=net_payable,
        paid=paid,
        balance_due=q_money(net_payable - paid),
        breakdown={"lines": len(lines), "old_gold_items": len(old_gold)},
    )


# ---------------------------------------------------------------- valuation


def inventory_value(net_weight_total, price_per_gram) -> Decimal:
    """Market value of gold content (making charge excluded — it is not
    recoverable at buy-back, so valuing it would overstate inventory)."""
    w = _non_negative(to_decimal(net_weight_total, "net_weight_total"), "net_weight_total")
    p = _non_negative(to_decimal(price_per_gram, "price_per_gram"), "price_per_gram")
    return q_money(w * p)
