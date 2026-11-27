from django.db import migrations

TABLES = [
    "core_auditlog",
    "pricing_goldprice",
    "inventory_stockmovement",
    "inventory_scrapgoldmovement",
    "treasury_moneytransaction",
    "parties_customerledger",
    "parties_supplierledger",
]

FUNC = """
CREATE OR REPLACE FUNCTION goldshop_block_mutation() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'Table % is append-only: % is not allowed', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
"""


def forwards():
    sql = [FUNC]
    for t in TABLES:
        sql.append(f"CREATE TRIGGER {t}_append_only BEFORE UPDATE OR DELETE ON {t} "
                   f"FOR EACH ROW EXECUTE FUNCTION goldshop_block_mutation();")
    return "\n".join(sql)


def backwards():
    return "\n".join([f"DROP TRIGGER IF EXISTS {t}_append_only ON {t};" for t in TABLES]
                     + ["DROP FUNCTION IF EXISTS goldshop_block_mutation();"])


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0001_initial"),
        ("pricing", "0001_initial"),
        ("inventory", "0001_initial"),
        ("treasury", "0001_initial"),
        ("parties", "0001_initial"),
    ]
    operations = [migrations.RunSQL(forwards(), backwards())]
