#!/usr/bin/env python3
"""
Builds the fonts embedded in exported PDFs: public/fonts/LedgerPdf-*.ttf.

jsPDF cannot fall back between fonts per character, so one file must hold
both Latin (Noto Sans) and Bangla (Noto Sans Bengali) glyphs. Both are from
the Noto family, so they share metrics and look like one typeface.

Layout tables are dropped: jsPDF does no shaping, and Bangla text that needs
shaping is drawn by the browser instead (see lib/pdf/complex-text.ts).

Usage:  python3 scripts/build-pdf-fonts.py      (needs: pip install fonttools)
"""
import pathlib
import tempfile
import urllib.request

from fontTools import subset
from fontTools.merge import Merger
from fontTools.ttLib import TTFont

BASE = "https://github.com/notofonts/notofonts.github.io/raw/main/fonts"
WEIGHTS = ["Regular", "SemiBold"]
OUT_DIR = pathlib.Path(__file__).resolve().parent.parent / "public" / "fonts"

LATIN = [
    *range(0x20, 0x7F),  # Basic Latin
    *range(0xA0, 0x100),  # Latin-1 (£, ·, …)
    *range(0x2010, 0x2028),  # dashes, quotes, bullets, ellipsis
    0x20AC,  # €
    0x20B9,  # ₹
    0x2212,  # − minus
]
BENGALI = [*range(0x0980, 0x0A00), 0x200C, 0x200D, 0x25CC]


def subset_font(src: pathlib.Path, unicodes: list[int], dst: pathlib.Path) -> None:
    options = subset.Options()
    options.layout_features = []
    options.drop_tables += ["GSUB", "GPOS", "GDEF"]
    options.name_IDs = ["*"]
    options.notdef_outline = True
    font = TTFont(src)
    subsetter = subset.Subsetter(options)
    subsetter.populate(unicodes=unicodes)
    subsetter.subset(font)
    font.save(dst)


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        work = pathlib.Path(tmp)
        for weight in WEIGHTS:
            sources = {}
            for family in ["NotoSans", "NotoSansBengali"]:
                path = work / f"{family}-{weight}.ttf"
                urllib.request.urlretrieve(f"{BASE}/{family}/hinted/ttf/{family}-{weight}.ttf", path)
                sources[family] = path

            latin, bengali = work / f"latin-{weight}.ttf", work / f"bengali-{weight}.ttf"
            subset_font(sources["NotoSans"], LATIN, latin)
            subset_font(sources["NotoSansBengali"], BENGALI, bengali)

            merged = Merger().merge([str(latin), str(bengali)])
            for record in merged["name"].names:
                if record.nameID in (1, 16):
                    record.string = "Ledger PDF"
            out = OUT_DIR / f"LedgerPdf-{weight}.ttf"
            merged.save(out)
            print(f"wrote {out.relative_to(OUT_DIR.parent.parent)} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
