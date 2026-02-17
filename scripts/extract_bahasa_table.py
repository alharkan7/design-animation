import argparse
import csv
import json
import re
from html.parser import HTMLParser
from pathlib import Path


class IsiTableParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.rows = []
        self._in_table = False
        self._table_depth = 0
        self._in_tr = False
        self._in_cell = False
        self._current_row = []
        self._current_cell_chunks = []

    def handle_starttag(self, tag, attrs):
        attrs_dict = dict(attrs)

        if tag == "table":
            if self._in_table:
                self._table_depth += 1
                return
            classes = (attrs_dict.get("class") or "").split()
            if "isi" in classes:
                self._in_table = True
                self._table_depth = 1
                return

        if not self._in_table:
            return

        if tag == "tr":
            self._in_tr = True
            self._current_row = []
            return

        if tag in ("td", "th"):
            self._in_cell = True
            self._current_cell_chunks = []
            return

    def handle_data(self, data):
        if self._in_table and self._in_cell:
            self._current_cell_chunks.append(data)

    def handle_endtag(self, tag):
        if not self._in_table:
            return

        if tag == "table":
            self._table_depth -= 1
            if self._table_depth <= 0:
                self._in_table = False
                self._table_depth = 0
            return

        if tag in ("td", "th") and self._in_cell:
            text = " ".join("".join(self._current_cell_chunks).split())
            self._current_row.append(text)
            self._in_cell = False
            self._current_cell_chunks = []
            return

        if tag == "tr" and self._in_tr:
            if self._current_row:
                self.rows.append(self._current_row)
            self._in_tr = False
            self._current_row = []
            return


def normalize_header_cell(s: str) -> str:
    s = s.strip().casefold()
    s = re.sub(r"[^\w]+", "", s)
    return s


def find_header_row_index(rows: list[list[str]]):
    target = ["no", "bahasa", "wilayah", "provinsi"]
    for i, row in enumerate(rows):
        norm = [normalize_header_cell(c) for c in row]
        if len(norm) >= 4 and norm[:4] == target:
            return i
    return None


def to_records(rows: list[list[str]]) -> list[dict]:
    header_idx = find_header_row_index(rows)
    start = (header_idx + 1) if header_idx is not None else 0

    records = []
    for row in rows[start:]:
        if len(row) < 4:
            continue
        no_raw, bahasa, wilayah, provinsi = row[:4]
        no_digits = re.sub(r"\D+", "", no_raw or "")
        if not no_digits:
            continue
        records.append(
            {
                "no": int(no_digits),
                "bahasa": bahasa.strip(),
                "wilayah": wilayah.strip(),
                "provinsi": provinsi.strip(),
            }
        )
    return records


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument(
        "--input",
        default=str(
            Path(__file__).resolve().parent / "public" / "Data Bahasa - Peta Bahasa.html"
        ),
    )
    ap.add_argument(
        "--out-dir",
        default=str(Path(__file__).resolve().parent / "public" / "languages"),
    )
    ap.add_argument("--base-name", default="lang_list")
    args = ap.parse_args()

    input_path = Path(args.input)
    out_dir = Path(args.out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    html = input_path.read_text(encoding="utf-8", errors="replace")
    parser = IsiTableParser()
    parser.feed(html)
    records = to_records(parser.rows)

    json_path = out_dir / f"{args.base_name}.json"
    csv_path = out_dir / f"{args.base_name}.csv"

    json_path.write_text(
        json.dumps(records, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    with csv_path.open("w", encoding="utf-8", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["no", "bahasa", "wilayah", "provinsi"])
        w.writeheader()
        w.writerows(records)

    print(f"rows={len(records)}")
    print(str(json_path))
    print(str(csv_path))


if __name__ == "__main__":
    main()
