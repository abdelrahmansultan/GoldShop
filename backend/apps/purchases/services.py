from decimal import Decimal

from django.db import transaction
from django.utils import timezone

from apps.core.audit import audit
from apps.core.exceptions import BusinessError
from apps.core.models import DocumentSequence
from apps.inventory.models import Product, StockMovement
from apps.inventory.services import create_product, move_stock
from apps.parties.models import SupplierLedger
from apps.treasury.models import MoneyTransaction
from apps.treasury.services import account_for, post
from gold_engine import net_weight as calc_net, q_money

from .models import PurchaseInvoice, PurchaseLine, PurchasePayment, PurchaseReturn

ZERO = Decimal("0")


def _unit_cost(net_w, ln) -> Decimal:
    if ln.get("unit_cost") not in (None, ""):
        c = q_money(ln["unit_cost"])
    else:
        c = q_money(Decimal(net_w) * (Decimal(ln.get("gold_price_per_gram") or 0)
                                      + Decimal(ln.get("making_cost_per_gram") or 0))
                    + Decimal(ln.get("other_cost") or 0))
    if c <= 0:
        raise BusinessError("Each purchase line needs a cost (unit cost or gold price per gram).")
    return c


@transaction.atomic
def post_purchase(user, data: dict, request=None) -> PurchaseInvoice:
    lines = data.get("lines") or []
    if not lines:
        raise BusinessError("Add at least one line.")
    supplier = data["supplier"]
    date = data.get("date") or timezone.localdate()
    inv = PurchaseInvoice.objects.create(number=DocumentSequence.next("PUR", date.year), supplier=supplier,
                                         supplier_invoice_no=data.get("supplier_invoice_no", ""), date=date,
                                         notes=data.get("notes", ""), created_by=user)
    subtotal, weight = ZERO, ZERO
    for ln in lines:
        qty = int(ln.get("quantity") or 1)
        if qty <= 0:
            raise BusinessError("Quantity must be positive.")
        if ln.get("product"):
            p: Product = ln["product"]
            if p.tracking != Product.Tracking.QUANTITY:
                raise BusinessError(f"{p.code} is a serialized piece. Register new pieces as new products.")
            cost = _unit_cost(p.net_weight, ln)
            p.purchase_cost, p.supplier, p.purchase_date = cost, supplier, date  # latest cost
            p.save(update_fields=["purchase_cost", "supplier", "purchase_date", "updated_at"])
            move_stock(p, StockMovement.Type.PURCHASE, qty, user, ref_type="purchase_invoice", ref_id=inv.pk,
                       note=inv.number, unit_cost=cost)
        else:
            np = dict(ln["new_product"])
            nw = calc_net(np["gross_weight"], np.get("stone_weight") or 0)
            cost = _unit_cost(nw, ln)
            np.update(purchase_cost=cost, supplier=supplier, purchase_date=date)
            if np.get("tracking", Product.Tracking.PIECE) == Product.Tracking.PIECE and qty > 1:
                raise BusinessError("Serialized pieces must be entered one per line.")
            p = create_product(user, np, opening_quantity=0, request=request)
            move_stock(p, StockMovement.Type.PURCHASE, qty, user, ref_type="purchase_invoice", ref_id=inv.pk,
                       note=inv.number, unit_cost=cost)
        total = q_money(cost * qty)
        PurchaseLine.objects.create(invoice=inv, product=p, karat=p.karat, quantity=qty, net_weight=p.net_weight,
                                    gold_price_per_gram=ln.get("gold_price_per_gram") or 0,
                                    making_cost_per_gram=ln.get("making_cost_per_gram") or 0,
                                    other_cost=ln.get("other_cost") or 0, unit_cost=cost, line_total=total)
        subtotal += total
        weight += p.net_weight * qty

    vat = q_money(data.get("vat_amount") or 0)
    if vat < 0:
        raise BusinessError("VAT cannot be negative.")
    inv.subtotal, inv.vat_amount, inv.total, inv.total_weight = subtotal, vat, subtotal + vat, weight
    paid = ZERO
    for pay in data.get("payments") or []:
        amt = q_money(pay["amount"])
        if amt <= 0:
            raise BusinessError("Payment amounts must be positive.")
        acc = account_for(pay["method"], pay.get("account"))
        PurchasePayment.objects.create(invoice=inv, method=pay["method"], account=acc, amount=amt,
                                       reference_no=pay.get("reference_no", ""))
        post(acc, MoneyTransaction.Type.PURCHASE_PAYMENT, -amt, f"{inv.number} {supplier.name}", user,
             method=pay["method"], reference_no=pay.get("reference_no", ""), ref_type="purchase_invoice",
             ref_id=inv.pk)
        paid += amt
    if paid > inv.total:
        raise BusinessError(f"Payments ({paid}) exceed the invoice total ({inv.total}).")
    inv.paid_amount, inv.credit_amount = paid, inv.total - paid
    inv.save()
    if inv.credit_amount:
        SupplierLedger.objects.create(supplier=supplier, amount=inv.credit_amount, description=f"Purchase {inv.number}",
                                      ref_type="purchase_invoice", ref_id=str(inv.pk), created_by=user)
    audit(user, "purchase.posted", inv, f"{inv.number} {inv.total} EGP", request=request)
    return inv


@transaction.atomic
def return_to_supplier(user, line: PurchaseLine, quantity: int, reason: str, request=None) -> PurchaseReturn:
    line = PurchaseLine.objects.select_for_update().get(pk=line.pk)
    if quantity <= 0 or quantity > line.quantity - line.returned_quantity:
        raise BusinessError(f"Can return at most {line.quantity - line.returned_quantity}.")
    if len((reason or "").strip()) < 3:
        raise BusinessError("A reason is required.", field="reason")
    amt = q_money(line.unit_cost * quantity)
    ret = PurchaseReturn.objects.create(number=DocumentSequence.next("PRT", timezone.localdate().year),
                                        invoice=line.invoice, line=line, quantity=quantity, amount=amt,
                                        reason=reason, created_by=user)
    move_stock(line.product, StockMovement.Type.PURCHASE_RETURN, -quantity, user, ref_type="purchase_return",
               ref_id=ret.pk, note=f"{ret.number}: {reason}", unit_cost=line.unit_cost)
    line.returned_quantity += quantity
    line.save(update_fields=["returned_quantity"])
    SupplierLedger.objects.create(supplier=line.invoice.supplier, amount=-amt, description=f"Return {ret.number}",
                                  ref_type="purchase_return", ref_id=str(ret.pk), created_by=user)
    audit(user, "purchase.returned", ret, f"{ret.number} {amt}", request=request)
    return ret


@transaction.atomic
def pay_supplier(user, supplier, amount: Decimal, method: str, account=None, reference_no="", note="",
                 request=None):
    if amount <= 0:
        raise BusinessError("Amount must be positive.")
    acc = account_for(method, account)
    ref = DocumentSequence.next("PAY", timezone.localdate().year)
    tx = post(acc, MoneyTransaction.Type.PURCHASE_PAYMENT, -amount, f"{ref} {supplier.name} {note}".strip(), user,
              method=method, reference_no=reference_no, ref_type="supplier_payment", ref_id=ref)
    SupplierLedger.objects.create(supplier=supplier, amount=-amount, description=f"Payment {ref} {note}".strip(),
                                  ref_type="supplier_payment", ref_id=ref, created_by=user)
    audit(user, "supplier.payment", supplier, f"{ref} {amount}", request=request)
    return tx
