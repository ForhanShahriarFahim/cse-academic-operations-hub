"""PERF-01: compare actual archived CSV and every native A4 page to old build."""
import hashlib
import json
from pathlib import Path
import shutil
import subprocess
import math
import re

from pypdf import PdfReader
from PIL import Image, ImageChops

root = Path(__file__).resolve().parents[1]
artifacts = root / "output/playwright/PERF-01"
scratch = root / ".tmp/perf-01-prints"
scratch.mkdir(parents=True, exist_ok=True)
poppler = shutil.which("pdftoppm")
assert poppler, "Poppler pdftoppm is required for native page parity"
results = {}
for flow in ("courses", "rollover"):
    before = artifacts / "before" / flow
    after = artifacts / "after" / flow
    assert (before / "archive.csv").read_bytes() == (after / "archive.csv").read_bytes(), flow
    results[flow] = {"archivedCsvIdentical": True, "documents": {}}
    names = ["before-official.pdf", "before-teachers.pdf"]
    if flow == "courses":
        names.append("catalog-before.pdf")
    for name in names:
        baseline, current = before / name, after / name
        old_pages, new_pages = PdfReader(baseline).pages, PdfReader(current).pages
        assert len(old_pages) == len(new_pages), (flow, name, "page count")
        catalog = name == "catalog-before.pdf"
        texts = [[p.extract_text() for p in pages] for pages in (old_pages, new_pages)]
        if catalog:
            # Catalog print explicitly labels the actual runtime print moment.
            # Archived outputs above retain strict text/pixel equality.
            texts = [[re.sub(r"Printed [^\n]+\(Asia/Dhaka\)", "Printed <runtime timestamp> (Asia/Dhaka)", text) for text in pages] for pages in texts]
        assert texts[0] == texts[1], (flow, name, "text")
        prefixes = []
        for phase, pdf in (("before", baseline), ("after", current)):
            prefix = scratch / f"{flow}-{Path(name).stem}-{phase}"
            subprocess.run([poppler, "-r", "120", "-png", str(pdf), str(prefix)], check=True, capture_output=True)
            pages = sorted(scratch.glob(prefix.name + "-*.png"))
            assert len(pages) == len(old_pages)
            prefixes.append(pages)
        hashes = []
        timestamp_differences = []
        for index, (old, new) in enumerate(zip(*prefixes)):
            if catalog:
                old_image, new_image = Image.open(old).convert("RGB"), Image.open(new).convert("RGB")
                assert old_image.size == new_image.size
                box = ImageChops.difference(old_image, new_image).getbbox()
                if box:
                    rectangles = []
                    for page in (old_pages[index], new_pages[index]):
                        def printed(text, cm, tm, _font, size):
                            if "Printed" in text:
                                x = tm[4] * cm[0] + tm[5] * cm[2] + cm[4]
                                y = tm[4] * cm[1] + tm[5] * cm[3] + cm[5]
                                height = float(page.mediabox.height)
                                rectangles.append((math.floor(x * 120 / 72) - 32, math.floor((height - y - size * abs(cm[3])) * 120 / 72) - 3, new_image.width, math.ceil((height - y + size * abs(cm[3]) * .3) * 120 / 72) + 3))
                        page.extract_text(visitor_text=printed)
                    assert len(rectangles) == 2, (name, "one runtime Printed line per compared page")
                    allowed = (min(r[0] for r in rectangles), min(r[1] for r in rectangles), max(r[2] for r in rectangles), max(r[3] for r in rectangles))
                    assert box[0] >= allowed[0] and box[1] >= allowed[1] and box[2] <= allowed[2] and box[3] <= allowed[3], (name, box, allowed)
                    timestamp_differences.append({"page": index + 1, "changedPixelBounds": box, "printedLineBounds": allowed})
            else:
                assert old.read_bytes() == new.read_bytes(), (flow, name, "render", old.name)
            hashes.append(hashlib.sha256(new.read_bytes()).hexdigest())
        preview = artifacts / "after" / f"{flow}-{Path(name).stem}-a4.png"
        shutil.copyfile(prefixes[1][0], preview)
        results[flow]["documents"][name] = {"pages": len(old_pages), "textIdentical": not catalog, "allRenderedPagesIdentical": not timestamp_differences, "runtimePrintTimeOnly": timestamp_differences, "allOtherTextAndPixelsIdentical": True, "renderedSha256": hashes}
(artifacts / "print-review.json").write_text(json.dumps(results, indent=2) + "\n", encoding="utf-8")
print(json.dumps(results))
