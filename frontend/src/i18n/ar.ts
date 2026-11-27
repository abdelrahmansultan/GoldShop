import type { Dict } from "./en";

const ar: Dict = {
  app: { name: "نظام إدارة محل الذهب", tagline: "إدارة المجوهرات والذهب", currency: "ج.م" },
  nav: {
    dashboard: "لوحة التحكم", pos: "فاتورة بيع جديدة", invoices: "فواتير البيع", returns: "المرتجعات", prices: "أسعار الذهب",
    inventory: "المخزون", adjustments: "تسويات المخزون", counts: "الجرد الفعلي", scrap: "الذهب الكسر",
    purchases: "المشتريات", customers: "العملاء", suppliers: "الموردون", treasury: "الخزينة والبنوك",
    expenses: "المصروفات", reports: "التقارير", users: "المستخدمون", settings: "الإعدادات", audit: "سجل العمليات",
    sales: "المبيعات", stock: "المخزون", finance: "المالية", admin: "الإدارة",
  },
  common: {
    save: "حفظ", cancel: "إلغاء", confirm: "تأكيد", close: "إغلاق", add: "إضافة", edit: "تعديل", create: "إنشاء",
    search: "بحث", filter: "تصفية", all: "الكل", yes: "نعم", no: "لا", loading: "جارٍ التحميل…", none: "لا يوجد",
    actions: "إجراءات", status: "الحالة", date: "التاريخ", from: "من", to: "إلى", total: "الإجمالي", notes: "ملاحظات",
    name: "الاسم", nameAr: "الاسم (عربي)", nameEn: "الاسم (إنجليزي)", phone: "الهاتف", address: "العنوان",
    active: "نشط", inactive: "غير نشط", description: "الوصف", amount: "المبلغ", reason: "السبب",
    print: "طباعة", back: "رجوع", view: "عرض", details: "التفاصيل", noData: "لا توجد سجلات",
    required: "مطلوب", quantity: "الكمية", code: "الكود", type: "النوع", user: "المستخدم", reference: "المرجع",
    next: "التالي", previous: "السابق", page: "صفحة {{page}} من {{pages}}", balance: "الرصيد", remove: "حذف",
    apply: "تطبيق", reset: "مسح", optional: "اختياري", saved: "تم الحفظ بنجاح", account: "الحساب",
    method: "طريقة الدفع", approve: "اعتماد", reject: "رفض", records: "{{count}} سجل", refresh: "تحديث",
  },
  auth: {
    title: "تسجيل الدخول", username: "اسم المستخدم", password: "كلمة المرور", submit: "دخول", logout: "تسجيل الخروج",
    invalid: "اسم المستخدم أو كلمة المرور غير صحيحة", locked: "محاولات فاشلة كثيرة. تم إيقاف الحساب مؤقتاً لمدة 15 دقيقة.", profile: "ملفي الشخصي", changePassword: "تغيير كلمة المرور",
    demoTitle: "نسخة تجريبية — بيانات وأسعار وهمية للتجربة", demoHint: "كلمة السر لكل الحسابات:", oldPassword: "كلمة المرور الحالية", newPassword: "كلمة المرور الجديدة", language: "اللغة",
  },
  errors: { network: "تعذر الاتصال بالخادم. تحقق من الشبكة.", generic: "حدث خطأ غير متوقع" },
  dash: {
    todaySales: "مبيعات اليوم", todayPurchases: "مشتريات اليوم", todayExpenses: "مصروفات اليوم",
    grossProfit: "مجمل الربح", netProfit: "صافي الربح (بعد المصروفات)", cash: "رصيد الخزينة", bank: "رصيد البنوك",
    receivables: "مستحقات على العملاء", payables: "مستحقات للموردين", goldWeight: "وزن الذهب بالمخزون",
    goldValue: "قيمة الذهب (بسعر الشراء)", products: "القطع المتاحة", lowStock: "أصناف منخفضة",
    discrepancies: "تسويات بانتظار الاعتماد", byKarat: "المخزون حسب العيار", recentInvoices: "أحدث الفواتير",
    recentTx: "أحدث الحركات المالية", topItems: "الأكثر مبيعًا (30 يومًا)", dailySales: "المبيعات اليومية (30 يومًا)",
    monthly: "الإيرادات الشهرية", byMethod: "المبيعات حسب طريقة الدفع (30 يومًا)", invoicesCount: "{{count}} فاتورة",
    pure: "ذهب خالص", scrap: "ذهب كسر", valueIncomplete: "القيمة غير مكتملة: بعض الأعيرة بلا سعر",
    returns: "المرتجعات", topCategories: "أعلى الأصناف", revenue: "الإيراد", profit: "الربح",
  },
  prices: {
    title: "أسعار الذهب", board: "لوحة الأسعار الحالية", enter: "إدخال أسعار جديدة", history: "سجل الأسعار",
    buy: "شراء / جم", sell: "بيع / جم", karat: "العيار", source: "المصدر", effectiveAt: "سارٍ من",
    enteredBy: "أدخله", lastUpdate: "آخر تحديث", stale: "قديم", missing: "لم يتم إدخال سعر",
    fresh: "محدّث", note: "ملاحظة", sources: "مصادر الأسعار", warnNoInvent:
      "يتم إدخال الأسعار بواسطة موظف مخوّل أو مزامنتها من مزوّد معتمد. النظام لا يقدّر الأسعار أبدًا.",
    saved: "تم تسجيل الأسعار", lastSync: "آخر مزامنة ناجحة", lastError: "آخر خطأ", provider: "معرّف المزوّد",
    perGram: "جنيه للجرام", buyAboveSell: "سعر الشراء لا يمكن أن يتجاوز سعر البيع",
  },
  inv: {
    title: "المخزون", newItem: "صنف جديد", item: "الصنف", barcode: "الباركود", category: "الفئة",
    jewelryType: "نوع المشغولات", karat: "العيار", tracking: "طريقة التتبع", piece: "قطعة مميزة (سيريال)",
    quantityBased: "بالكمية", gross: "الوزن القائم", stone: "وزن الفصوص", net: "وزن الذهب الصافي",
    qtyOnHand: "الرصيد", reorder: "حد إعادة الطلب", pricingMode: "طريقة التسعير", byWeight: "بالوزن",
    fixed: "سعر ثابت", makingType: "نوع المصنعية", makingValue: "المصنعية", perGram: "للجرام",
    perPiece: "للقطعة", percent: "نسبة من قيمة الذهب", stonesValue: "قيمة الفصوص", sellingPrice: "سعر البيع",
    purchaseCost: "تكلفة الشراء", supplier: "المورد", purchaseDate: "تاريخ الشراء", image: "الصورة",
    openingQty: "الرصيد الافتتاحي", movements: "حركات المخزون", minWeight: "أقل وزن", maxWeight: "أعلى وزن",
    inStock: "متاح بالمخزون", scan: "امسح الباركود أو اكتبه…", valuation: "تقييم المخزون", weightLocked:
      "الأوزان والعيار لا تتغير إلا من خلال تسوية معتمدة.",
    requestAdjustment: "طلب تسوية", qtyDelta: "تغيير الكمية (+/-)", newGross: "الوزن القائم الجديد",
    newStone: "وزن الفصوص الجديد", status: {
      available: "متاح", reserved: "محجوز", sold: "مباع", returned_to_supplier: "مرتجع للمورد", inactive: "موقوف",
    },
    mv: {
      opening: "رصيد افتتاحي", purchase: "شراء", sale: "بيع", sale_return: "مرتجع مبيعات",
      purchase_return: "مرتجع للمورد", adjustment: "تسوية", weight_correction: "تصحيح وزن",
    },
    qtyAfter: "الرصيد بعد", created: "تم إنشاء الصنف", lookups: "الفئات والأنواع",
  },
  adj: {
    title: "تسويات المخزون", pending: "بانتظار الاعتماد", approved: "معتمدة", rejected: "مرفوضة",
    requestedBy: "طلبها", decidedBy: "قرار", decision: "ملاحظة القرار", confirmApprove:
      "اعتماد هذه التسوية؟ سيتغير المخزون فورًا.", requested: "تم تقديم طلب التسوية",
  },
  count: {
    title: "الجرد الفعلي", start: "بدء جرد جديد", name: "اسم الجرد", progress: "التقدم",
    expected: "المتوقع", counted: "المعدود", diff: "الفرق", finalize: "إنهاء الجرد",
    finalizeConfirm: "إنهاء الجرد؟ ستتحول الفروقات إلى تسويات بانتظار الاعتماد، والقطع غير المعدودة تُعتبر مفقودة.",
    cancelCount: "إلغاء الجرد", scanHere: "امسح باركود القطعة", uncounted: "لم تُعد", discrepancies: "الفروقات",
    weighed: "الوزن الفعلي (جم)", open: "جارٍ", finalized: "منتهي", cancelled: "ملغي",
  },
  pos: {
    title: "فاتورة بيع جديدة", scan: "امسح الباركود أو ابحث عن صنف…", items: "الأصناف", oldGold: "ذهب قديم (استبدال)",
    addOldGold: "إضافة ذهب قديم", weight: "الوزن (جم)", deductionPct: "نسبة الخصم من الوزن %",
    deductionPerGram: "خصم للجرام", customer: "العميل", walkIn: "عميل نقدي", customerName: "اسم العميل",
    payments: "المدفوعات", addPayment: "إضافة دفعة", goldValue: "قيمة الذهب", making: "المصنعية", stones: "الفصوص",
    subtotal: "الإجمالي قبل الخصم", discount: "الخصم", invoiceDiscount: "خصم على الفاتورة", vat: "ضريبة القيمة المضافة",
    grandTotal: "الإجمالي", oldGoldCredit: "قيمة الذهب القديم", netPayable: "صافي المستحق", paid: "المدفوع",
    remaining: "آجل على الحساب", shopPays: "المحل يدفع للعميل", payRest: "دفع المتبقي", post: "ترحيل الفاتورة",
    posted: "تم ترحيل الفاتورة", pricePerGram: "سعر الجرام", notAvailable: "الصنف غير متاح",
    fillRemaining: "استكمال المبلغ المتبقي", confirmPost: "ترحيل الفاتورة؟ لا يمكن تعديلها بعد ذلك.",
    empty: "امسح صنفًا للبدء", priceUsed: "السعر المستخدم", override: "تعديل", refNo: "رقم المرجع",
  },
  sales: {
    title: "فواتير البيع", number: "رقم الفاتورة", issuedAt: "التاريخ", items: "الأصناف", status: {
      posted: "مرحّلة", partially_returned: "مرتجع جزئي", returned: "مرتجعة بالكامل",
    },
    returnItems: "إرجاع أصناف", returnQty: "كمية المرتجع", settlement: "طريقة التسوية", refund: "رد المبلغ",
    credit: "إضافة لرصيد العميل", returned: "تم تسجيل المرتجع", cashier: "الكاشير", invoice: "فاتورة ضريبية",
    footerThanks: "شكرًا لزيارتكم", returnsList: "مرتجعات هذه الفاتورة", goldPriceRef: "مرجع سعر الذهب #{{id}}",
  },
  pur: {
    title: "المشتريات", new: "فاتورة شراء جديدة", supplierInvoice: "رقم فاتورة المورد", existing: "صنف موجود",
    newProduct: "صنف جديد", unitCost: "تكلفة الوحدة", goldPrice: "سعر الجرام", makingCost: "مصنعية المورد / جم",
    otherCost: "تكاليف أخرى", lineTotal: "إجمالي السطر", posted: "تم ترحيل فاتورة الشراء", vat: "الضريبة",
    addLine: "إضافة سطر", returnToSupplier: "إرجاع للمورد",
  },
  party: {
    customers: "العملاء", suppliers: "الموردون", newCustomer: "عميل جديد", newSupplier: "مورد جديد",
    nationalId: "الرقم القومي", creditLimit: "حد الائتمان", ledger: "كشف الحساب", receivePayment: "تحصيل دفعة",
    paySupplier: "سداد للمورد", taxNo: "رقم التسجيل الضريبي", hasBalance: "أصحاب الأرصدة فقط",
  },
  tr: {
    title: "الخزينة والبنوك", accounts: "الحسابات", transactions: "الحركات", transfer: "تحويل", newAccount: "حساب جديد",
    kind: "النوع", cashBox: "خزينة نقدية", bankAccount: "حساب بنكي", bankName: "البنك", accountNo: "رقم الحساب",
    isDefault: "افتراضي", source: "من", destination: "إلى", movement: "حركة نقدية", opening: "رصيد افتتاحي",
    deposit: "إيداع من المالك", withdrawal: "مسحوبات المالك",
  },
  exp: { title: "المصروفات", new: "مصروف جديد", category: "البند", void: "إلغاء", voided: "ملغي", categories: "بنود المصروفات" },
  rep: {
    title: "التقارير", sales: "تقرير المبيعات", byDay: "حسب اليوم", byKarat: "حسب العيار", byUser: "حسب الكاشير",
    byMethod: "حسب طريقة الدفع", revenue: "الإيراد (بدون ضريبة)", cogs: "تكلفة البضاعة", weightSold: "الوزن المباع",
  },
  users: { title: "المستخدمون", new: "مستخدم جديد", role: "الصلاحية", fullName: "الاسم الكامل", lastLogin: "آخر دخول", roles: {
    owner: "المالك", manager: "مدير", accountant: "محاسب", cashier: "كاشير", inventory: "أمين مخزن",
  } },
  settings: {
    title: "الإعدادات", shop: "بيانات المحل", tax: "الضرائب والحسابات", vatRate: "نسبة ضريبة القيمة المضافة %",
    vatOnMaking: "ضريبة على المصنعية", vatOnGold: "ضريبة على قيمة الذهب", vatOnStones: "ضريبة على الفصوص",
    maxDiscount: "أقصى خصم للكاشير %", staleHours: "اعتبار السعر قديمًا بعد (ساعة)", taxNo: "رقم التسجيل الضريبي",
    crNo: "رقم السجل التجاري", footerAr: "تذييل الفاتورة (عربي)", footerEn: "تذييل الفاتورة (إنجليزي)",
    karats: "الأعيرة", purity: "النقاء", backups: "النسخ الاحتياطي", createBackup: "إنشاء نسخة الآن", size: "الحجم",
  },
  audit: { title: "سجل العمليات", action: "العملية", entity: "الكيان", ip: "IP" },
  notif: {
    title: "التنبيهات", empty: "لا توجد تنبيهات",
    price_missing: "لم يتم إدخال سعر عيار {{karat}}", price_stale: "سعر عيار {{karat}} غير محدّث",
    adjustments_pending: "{{count}} تسوية بانتظار الاعتماد", low_stock: "{{count}} صنف وصل لحد إعادة الطلب",
    stock_count_open: "يوجد جرد قيد التنفيذ",
  },
  rep2: {
    tabs: { sales: "المبيعات", close: "إقفال اليومية", inventory: "المخزون", balances: "الأرصدة" },
    exportCsv: "تصدير Excel (CSV)", dailyClose: "إقفال اليومية", opening: "رصيد أول اليوم", inflow: "وارد", outflow: "منصرف",
    closing: "رصيد آخر اليوم", expectedCash: "النقدية المتوقعة بالدرج", countedCash: "النقدية الفعلية", variance: "الفرق (عجز/زيادة)",
    firstLast: "الفواتير", creditSales: "مبيعات آجلة", totalCost: "إجمالي التكلفة", valueAtBuy: "القيمة بسعر الشراء",
    unitCost: "تكلفة الوحدة", totalWeight: "إجمالي الوزن",
  },
  tx: {
    opening: "رصيد افتتاحي", sale_receipt: "تحصيل مبيعات", sale_refund: "رد مبيعات", old_gold_payout: "صرف قيمة ذهب قديم",
    customer_payment: "تحصيل من عميل", purchase_payment: "سداد لمورد", purchase_refund: "استرداد من مورد", expense: "مصروف",
    transfer: "تحويل", deposit: "إيداع من المالك", withdrawal: "مسحوبات المالك", reversal: "قيد عكسي",
  },
  scrapTypes: { received: "مستلم من عميل", sent_to_refinery: "مرسل للتكرير", adjustment: "تسوية" },
  methods: { cash: "نقدي", card: "بطاقة بنكية", bank_transfer: "تحويل بنكي", instapay: "إنستاباي", wallet: "محفظة إلكترونية", cheque: "شيك" },
};

export default ar;
