from decimal import Decimal

from django.db import transaction
from django.db.models import Sum
from django.utils import timezone

from apps.core.audit import audit
from apps.core.exceptions import BusinessError
from apps.core.models import DocumentSequence, ShopSettings
from apps.inventory.models import Product, ScrapGoldMovement, StockMovement
from apps.inventory.services import IN_STOCK, move_stock
from apps.parties.models import CustomerLedger
from apps.pricing.services import current_price
from apps.treasury.models import MoneyTransaction
from apps.treasury.services import account_for, post
from gold_engine import (
    MakingChargeType,
    OldGoldInput,
    SaleLineInput,
    calculate_invoice_totals,
    calculate_old_gold,
    calculate_sale_line,
    q_money,
)

from .models import InvoicePayment, OldGoldLine, SalesInvoice, SalesInvoiceLine, SalesReturn, SalesReturnLine

ZERO = Decimal("0")


def _allocate(total: Decimal, weights: list[Decimal]) -> list[Decimal]:
    """Split `total` across lines proportionally; the last line absorbs rounding."""
    s = sum(weights, ZERO)
    if total == 0 or s == 0:
        return [ZERO] * len(weights)
    out, acc = [], ZERO
    for i, w in enumerate(weights):
        part = total - acc if i == len(weights) - 1 else q_money(total * w / s)
        out.append(part)
        acc += part
    return out


def price_sale(user, data: dict, *, for_update: bool = False) -> dict:
    """Compute a sale without side effects. Used by both the live preview
    and posting, so the cashier sees exactly what will be saved."""
    cfg = ShopSettings.load()
    vat_rate = cfg.vat_rate if cfg.vat_on_making_charge or cfg.vat_on_gold or cfg.vat_on_stones else ZERO
    lines_in = data.get("lines") or []
    if not lines_in:
        raise BusinessError("Add at least one item to the invoice.")
    can_override = user.has_cap("sales.discount_override")

    seen, prepared = set(), []
    for i, ln in enumerate(lines_in):
        product: Product = ln["product"]
        if for_update:
            product = Product.objects.select_for_update().get(pk=product.pk)
        if product.pk in seen:
            raise BusinessError(f"{product.code} is listed twice; change the quantity instead.")
        seen.add(product.pk)
        qty = int(ln.get("quantity") or 1)
        if product.status not in IN_STOCK or product.quantity_on_hand < qty:
            raise BusinessError(f"{product.code} is not available in the requested quantity "
                                f"(on hand: {product.quantity_on_hand}).", code="insufficient_stock")
        gp = current_price(product.karat)
        price = gp.sell_price
        overridden = False
        if ln.get("price_per_gram") not in (None, ""):
            if Decimal(ln["price_per_gram"]) != price:
                if not can_override:
                    raise BusinessError("Only a manager can change the gold price on an invoice.",
                                        code="forbidden_override")
                price, overridden = Decimal(ln["price_per_gram"]), True

        mc_type, mc_value = product.making_charge_type, product.making_charge_value
        if product.pricing_mode == Product.PricingMode.FIXED:
            gold_value = q_money(product.net_weight * price)
            derived = q_money(product.selling_price - product.stones_value - gold_value)
            if derived < 0:
                raise BusinessError(f"{product.code}: fixed price is below today's gold value "
                                    f"({gold_value}). Update the item's price.", code="fixed_below_gold")
            mc_type, mc_value = MakingChargeType.FIXED.value, derived
        if ln.get("making_charge_value") not in (None, ""):
            new_type = ln.get("making_charge_type") or mc_type
            if (new_type, Decimal(ln["making_charge_value"])) != (mc_type, Decimal(mc_value)):
                if not can_override:
                    raise BusinessError("Only a manager can change the making charge.", code="forbidden_override")
                mc_type, mc_value = new_type, Decimal(ln["making_charge_value"])

        prepared.append(dict(product=product, qty=qty, gp=gp, price=price, overridden=overridden,
                             mc_type=mc_type, mc_value=Decimal(mc_value),
                             own_discount=q_money(ln.get("discount") or 0)))

    # pre-discount subtotals for proportional allocation of the invoice discount
    base = [calculate_sale_line(SaleLineInput(
        net_weight=p["product"].net_weight, price_per_gram=p["price"], quantity=p["qty"],
        making_charge_type=p["mc_type"], making_charge_value=p["mc_value"],
        stones_value=p["product"].stones_value)) for p in prepared]
    inv_disc = q_money(data.get("invoice_discount") or 0)
    shares = _allocate(inv_disc, [b.subtotal - p["own_discount"] for b, p in zip(base, prepared)])

    results = []
    for p, share in zip(prepared, shares):
        r = calculate_sale_line(SaleLineInput(
            net_weight=p["product"].net_weight, price_per_gram=p["price"], quantity=p["qty"],
            making_charge_type=p["mc_type"], making_charge_value=p["mc_value"],
            stones_value=p["product"].stones_value, discount=p["own_discount"] + share,
            vat_rate=vat_rate, vat_on_gold=cfg.vat_on_gold, vat_on_stones=cfg.vat_on_stones))
        results.append(r)

    total_discount = sum((r.discount for r in results), ZERO)
    total_subtotal = sum((r.subtotal for r in results), ZERO)
    if total_subtotal and not user.has_cap("sales.discount_override"):
        pct = total_discount * 100 / total_subtotal
        if pct > cfg.max_discount_percent_cashier:
            raise BusinessError(f"Discount {pct:.2f}% exceeds your limit of {cfg.max_discount_percent_cashier}%. "
                                "Ask a manager.", code="discount_limit")

    old = []
    for og in data.get("old_gold") or []:
        gp = current_price(og["karat"])
        r = calculate_old_gold(OldGoldInput(weight=og["weight"], buy_price_per_gram=gp.buy_price,
                                            deduction_per_gram=og.get("deduction_per_gram") or 0,
                                            deduction_percent=og.get("deduction_percent") or 0))
        old.append(dict(input=og, gp=gp, result=r))

    payments = data.get("payments") or []
    totals = calculate_invoice_totals(results, [o["result"] for o in old], 0)
    paid = sum((Decimal(p["amount"]) for p in payments), ZERO)
    return dict(cfg=cfg, vat_rate=vat_rate, prepared=prepared, results=results, old=old, totals=totals,
                invoice_discount=inv_disc, paid=q_money(paid), credit=q_money(totals.net_payable - paid))


def _validate_settlement(calc: dict, data: dict):
    net, paid, credit = calc["totals"].net_payable, calc["paid"], calc["credit"]
    customer = data.get("customer")
    for p in data.get("payments") or []:
        amt = Decimal(p["amount"])
        if amt == 0:
            raise BusinessError("Remove empty payment lines.")
        if net >= 0 and amt < 0:
            raise BusinessError("Payments must be positive when the customer is paying.")
        if net < 0 and amt > 0:
            raise BusinessError("The shop owes the customer on this exchange; enter the payout as a negative amount.")
    if net >= 0 and paid > net:
        raise BusinessError(f"Payments ({paid}) exceed the amount due ({net}). Enter only what is kept; "
                            "give change separately.", code="overpaid")
    if net < 0 and paid < net:
        raise BusinessError("Payout exceeds what the shop owes the customer.", code="overpaid")
    if credit != 0:
        if customer is None:
            raise BusinessError("Select a registered customer to leave a balance on account.",
                                code="credit_needs_customer")
        if credit > 0:
            limit = customer.credit_limit
            balance = customer.ledger_balance()
            if balance + credit > limit:
                raise BusinessError(f"Credit limit exceeded for {customer.name}: limit {limit}, "
                                    f"current balance {balance}, this invoice {credit}.",
                                    code="credit_limit")


@transaction.atomic
def post_sale(user, data: dict, request=None) -> SalesInvoice:
    calc = price_sale(user, data, for_update=True)
    _validate_settlement(calc, data)
    t, cfg = calc["totals"], calc["cfg"]
    customer = data.get("customer")
    now = timezone.now()
    cogs = sum((p["product"].purchase_cost * p["qty"] for p in calc["prepared"]), ZERO)
    inv = SalesInvoice.objects.create(
        number=DocumentSequence.next("INV", timezone.localdate().year), issued_at=now, customer=customer,
        customer_name=(customer.name if customer else data.get("customer_name", ""))[:200],
        customer_phone=(customer.phone if customer else data.get("customer_phone", ""))[:30],
        total_weight=t.total_weight, gold_value=t.gold_value, making_charge=t.making_charge,
        stones_value=t.stones_value, line_discount=t.discount - calc["invoice_discount"],
        invoice_discount=calc["invoice_discount"], vat_amount=t.vat_amount, grand_total=t.grand_total,
        old_gold_value=t.old_gold_value, net_payable=t.net_payable, paid_amount=calc["paid"],
        credit_amount=calc["credit"], cost_of_goods=q_money(cogs), vat_rate=calc["vat_rate"],
        vat_policy={"making": cfg.vat_on_making_charge, "gold": cfg.vat_on_gold, "stones": cfg.vat_on_stones},
        notes=data.get("notes", "")[:500], created_by=user)

    for p, r in zip(calc["prepared"], calc["results"]):
        prod = p["product"]
        SalesInvoiceLine.objects.create(
            invoice=inv, product=prod, product_code=prod.code, description=prod.name, karat=prod.karat,
            karat_code=prod.karat.code, purity=prod.karat.purity, gold_price=p["gp"], price_per_gram=p["price"],
            price_overridden=p["overridden"], quantity=p["qty"], gross_weight=prod.gross_weight,
            stone_weight=prod.stone_weight, net_weight=prod.net_weight, total_net_weight=r.total_net_weight,
            making_charge_type=str(p["mc_type"]), making_charge_value=p["mc_value"], gold_value=r.gold_value,
            making_charge=r.making_charge, stones_value=r.stones_value, subtotal=r.subtotal, discount=r.discount,
            taxable_amount=r.taxable_amount, vat_rate=r.vat_rate, vat_amount=r.vat_amount, total=r.total,
            unit_cost=prod.purchase_cost)
        move_stock(prod, StockMovement.Type.SALE, -p["qty"], user, ref_type="sales_invoice", ref_id=inv.pk,
                   note=inv.number)

    for o in calc["old"]:
        og, r = o["input"], o["result"]
        OldGoldLine.objects.create(
            invoice=inv, karat=og["karat"], karat_code=og["karat"].code, gold_price=o["gp"],
            description=og.get("description", "")[:200], weight=r.weight,
            deduction_percent=og.get("deduction_percent") or 0, deduction_per_gram=og.get("deduction_per_gram") or 0,
            accepted_weight=r.accepted_weight, buy_price_per_gram=r.buy_price_per_gram,
            effective_price_per_gram=r.effective_price_per_gram, value=r.value)
        ScrapGoldMovement.objects.create(karat=og["karat"], type=ScrapGoldMovement.Type.RECEIVED,
                                         weight=r.accepted_weight, value=r.value, ref_type="sales_invoice",
                                         ref_id=str(inv.pk), note=inv.number, created_by=user)

    for p in data.get("payments") or []:
        acc = account_for(p["method"], p.get("account"))
        amt = q_money(p["amount"])
        InvoicePayment.objects.create(invoice=inv, method=p["method"], account=acc, amount=amt,
                                      reference_no=p.get("reference_no", ""))
        post(acc, MoneyTransaction.Type.SALE_RECEIPT if amt > 0 else MoneyTransaction.Type.OLD_GOLD_PAYOUT, amt,
             f"{inv.number} {inv.customer_name}".strip(), user, method=p["method"],
             reference_no=p.get("reference_no", ""), ref_type="sales_invoice", ref_id=inv.pk)

    if calc["credit"] != 0:
        CustomerLedger.objects.create(customer=customer, amount=calc["credit"],
                                      description=f"Invoice {inv.number}", ref_type="sales_invoice",
                                      ref_id=str(inv.pk), created_by=user)
    audit(user, "sale.posted", inv, f"{inv.number} total {inv.grand_total} EGP",
          {"net_payable": inv.net_payable, "paid": inv.paid_amount, "credit": inv.credit_amount}, request=request)
    return inv


@transaction.atomic
def return_sale(user, invoice: SalesInvoice, items: list[dict], reason: str, settlement: str,
                refund_method: str = "cash", refund_account=None, request=None) -> SalesReturn:
    """items: [{"line": SalesInvoiceLine, "quantity": int}]"""
    inv = SalesInvoice.objects.select_for_update().get(pk=invoice.pk)
    if len((reason or "").strip()) < 3:
        raise BusinessError("A return reason is required.", field="reason")
    if not items:
        raise BusinessError("Select at least one item to return.")
    if settlement == SalesReturn.Settlement.CREDIT and inv.customer is None:
        raise BusinessError("Credit settlement needs a registered customer on the invoice.")
    ret = SalesReturn.objects.create(number=DocumentSequence.next("RET", timezone.localdate().year), invoice=inv,
                                     reason=reason, settlement=settlement, created_by=user)
    total = vat = cogs = ZERO
    for it in items:
        line = SalesInvoiceLine.objects.select_for_update().get(pk=it["line"].pk)
        if line.invoice_id != inv.pk:
            raise BusinessError("Item does not belong to this invoice.")
        q = int(it["quantity"])
        remaining = line.quantity - line.returned_quantity
        if q <= 0 or q > remaining:
            raise BusinessError(f"{line.product_code}: can return at most {remaining}.")
        prev = line.return_lines.aggregate(a=Sum("amount"), v=Sum("vat_amount"))
        if q == remaining:  # last return of this line absorbs rounding
            amt, v = line.total - (prev["a"] or ZERO), line.vat_amount - (prev["v"] or ZERO)
        else:
            amt, v = q_money(line.total * q / line.quantity), q_money(line.vat_amount * q / line.quantity)
        SalesReturnLine.objects.create(sales_return=ret, invoice_line=line, quantity=q, amount=amt, vat_amount=v)
        line.returned_quantity += q
        line.save(update_fields=["returned_quantity"])
        move_stock(line.product, StockMovement.Type.SALE_RETURN, q, user, ref_type="sales_return", ref_id=ret.pk,
                   note=f"{ret.number} / {inv.number}", unit_cost=line.unit_cost)
        total, vat, cogs = total + amt, vat + v, cogs + line.unit_cost * q

    ret.amount, ret.vat_amount, ret.cost_of_goods = total, vat, q_money(cogs)
    if settlement == SalesReturn.Settlement.REFUND:
        acc = account_for(refund_method, refund_account)
        ret.refund_method, ret.refund_account = refund_method, acc
        post(acc, MoneyTransaction.Type.SALE_REFUND, -total, f"{ret.number} refund for {inv.number}", user,
             method=refund_method, ref_type="sales_return", ref_id=ret.pk)
    else:
        CustomerLedger.objects.create(customer=inv.customer, amount=-total,
                                      description=f"Return {ret.number} ({inv.number})",
                                      ref_type="sales_return", ref_id=str(ret.pk), created_by=user)
    ret.save()
    all_returned = all(l.returned_quantity >= l.quantity for l in inv.lines.all())
    inv.status = SalesInvoice.Status.RETURNED if all_returned else SalesInvoice.Status.PARTIALLY_RETURNED
    inv.save(update_fields=["status", "updated_at"])
    audit(user, "sale.returned", ret, f"{ret.number} for {inv.number}: {total} EGP", {"reason": reason},
          request=request)
    return ret


@transaction.atomic
def receive_customer_payment(user, customer, amount: Decimal, method: str, account=None, reference_no="",
                             note="", request=None):
    if amount <= 0:
        raise BusinessError("Amount must be positive.")
    acc = account_for(method, account)
    ref = DocumentSequence.next("RCV", timezone.localdate().year)
    tx = post(acc, MoneyTransaction.Type.CUSTOMER_PAYMENT, amount, f"{ref} {customer.name} {note}".strip(), user,
              method=method, reference_no=reference_no, ref_type="customer_payment", ref_id=ref)
    CustomerLedger.objects.create(customer=customer, amount=-amount, description=f"Payment {ref} {note}".strip(),
                                  ref_type="customer_payment", ref_id=ref, created_by=user)
    audit(user, "customer.payment", customer, f"{ref} {amount}", request=request)
    return tx
