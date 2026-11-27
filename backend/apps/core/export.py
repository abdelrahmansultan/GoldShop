import csv
import io

from django.http import HttpResponse


def csv_response(filename: str, header: list[str], rows) -> HttpResponse:
    """UTF-8 CSV with BOM so Excel shows Arabic correctly. Decimals are written
    as exact strings (never floats)."""
    buf = io.StringIO()
    buf.write("﻿")
    w = csv.writer(buf)
    w.writerow(header)
    for r in rows:
        w.writerow(["" if v is None else str(v) for v in r])
    resp = HttpResponse(buf.getvalue(), content_type="text/csv; charset=utf-8")
    resp["Content-Disposition"] = f'attachment; filename="{filename}"'
    return resp
