#!/usr/bin/env python3
"""
Builds data/problems.json from the two source CSVs.

Inputs (repo root):
  - titles-all-mapping.csv  (readalpha)
  - juyomon-mapping.csv     (juyomon)

Output:
  - data/problems.json

This script assigns point *categories* (categoryKey) to each problem, but does
NOT bake in point values -- those are looked up from config.json at runtime so
that config.json remains the single source of truth for scoring.

Run: python3 build/build_problems.py
"""
import csv
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TITLES_CSV = ROOT / "titles-all-mapping.csv"
# 28・29章(電子と光/原子と原子核)は動画未制作のため titles-all-mapping.csv に
# 行がない。同じ3列(video_id/旧タイトル/新タイトル)だけを持つ補完ファイルを
# 別途用意し、同じ行処理ループにそのまま合流させる。
LEAD_SUPPLEMENT_CSV = ROOT / "lead-ch28-29.csv"
JUYOMON_CSV = ROOT / "juyomon-mapping.csv"
OUT_PATH = ROOT / "data" / "problems.json"
# 管理者が admin.html で育てるマスタデータ。ビルド生成物ではなく、このスクリプトが
# 読み込んで problems.json に rating フィールドとしてマージする側。存在しなくても
# ビルドは通り、その場合は全問題がデフォルト評価(stars:2, skip:false)になる。
RATINGS_JSON = ROOT / "data" / "ratings.json"

# 章 -> 分野 mapping. lead-ch28-29-addition.md(管理者提供のlead_butsukibutsuri_taiou.xlsx
# 対応表)に基づき確定。実際の章タイトルに基づく対応(11〜13熱/14〜20波動/21〜27電磁気/28〜29原子)。
CHAPTER_FIELD_RANGES = [
    ("力学", 1, 10),
    ("熱", 11, 13),
    ("波動", 14, 20),
    ("電磁気", 21, 27),
    ("原子", 28, 29),
]

CATEGORY_SLUG = {
    "基礎CHECK": "kisocheck",
    "基本例題": "kihonrei",
    "基本問題": "kihonmondai",
    "応用問題": "ouyou",
}

# Both "基礎CHECK" and "基礎チェック" appear in the source data; normalize to one category.
CATEGORY_NORMALIZE = {
    "基礎CHECK": "基礎CHECK",
    "基礎チェック": "基礎CHECK",
    "基本例題": "基本例題",
    "基本問題": "基本問題",
    "応用問題": "応用問題",
}

TITLE_RE = re.compile(r"(\d+)章_(基礎CHECK|基礎チェック|基本例題|基本問題|応用問題)(\d*)")


def chapter_field(chapter):
    for field, lo, hi in CHAPTER_FIELD_RANGES:
        if lo <= chapter <= hi:
            return field
    raise ValueError(f"chapter {chapter} not in any field range")


def iter_title_rows(*paths):
    for path in paths:
        if not path.exists():
            continue
        with open(path, encoding="utf-8-sig", newline="") as f:
            yield from csv.DictReader(f)


def build_leadalpha():
    problems = []
    seen_kisocheck_chapters = set()
    for row in iter_title_rows(TITLES_CSV, LEAD_SUPPLEMENT_CSV):
        raw_title = row["旧タイトル"]
        m = TITLE_RE.search(raw_title)
        if not m:
            print(f"WARNING: could not parse title: {raw_title!r}", file=sys.stderr)
            continue
        chapter = int(m.group(1))
        category = CATEGORY_NORMALIZE[m.group(2)]
        number = int(m.group(3)) if m.group(3) else None

        if category == "基礎CHECK":
            # one entry per chapter; skip duplicate 基礎CHECK/基礎チェック rows
            if chapter in seen_kisocheck_chapters:
                continue
            seen_kisocheck_chapters.add(chapter)
            pid = f"la-{chapter}-{CATEGORY_SLUG[category]}"
            number = None
        else:
            pid = f"la-{chapter}-{CATEGORY_SLUG[category]}-{number}"

        problems.append({
            "id": pid,
            "source": "leadalpha",
            "chapter": chapter,
            "field": chapter_field(chapter),
            "categoryKey": category,
            "number": number,
            "title": row["新タイトル"] or raw_title,
            "videoId": row["video_id"],
        })

    problems.sort(key=lambda p: (p["chapter"], CATEGORY_SLUG[p["categoryKey"]], p["number"] or 0))
    return problems


def build_juyomon():
    problems = []
    with open(JUYOMON_CSV, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            num = int(row["num"])
            field = row["分野"]
            difficulty = row["難易度"]
            is_consideration = difficulty == "−"
            if is_consideration:
                category_key = "考察"
            elif difficulty == "A":
                category_key = "重問A"
            elif difficulty == "B":
                category_key = "重問B"
            else:
                raise ValueError(f"unexpected 難易度 {difficulty!r} for num={num}")

            problems.append({
                "id": f"jm-{num}",
                "source": "juyomon",
                "num": num,
                "field": field,
                "categoryKey": category_key,
                "isConsideration": is_consideration,
                "title": row["問題名"],
                "source_ref": row["出典"],
            })

    problems.sort(key=lambda p: p["num"])
    return problems


def load_ratings():
    if not RATINGS_JSON.exists():
        return {}
    with open(RATINGS_JSON, encoding="utf-8") as f:
        return json.load(f)


def apply_ratings(problems, ratings):
    for p in problems:
        r = ratings.get(p["id"], {})
        p["rating"] = {"stars": r.get("stars", 2), "skip": r.get("skip", False)}


def main():
    leadalpha = build_leadalpha()
    juyomon = build_juyomon()

    ratings = load_ratings()
    apply_ratings(leadalpha, ratings)
    apply_ratings(juyomon, ratings)
    if ratings:
        print(f"{len(ratings)}件の評価を data/ratings.json からマージしました")

    # Sanity checks against spec counts (591 original + 59 added by
    # lead-ch28-29-addition.md for chapters 28-29 = 650).
    assert len(leadalpha) == 650, f"expected 650 leadalpha problems, got {len(leadalpha)}"
    assert len(juyomon) == 163, f"expected 163 juyomon problems, got {len(juyomon)}"

    counts = {}
    for p in leadalpha:
        counts[p["categoryKey"]] = counts.get(p["categoryKey"], 0) + 1
    assert counts.get("基礎CHECK") == 29, counts
    assert counts.get("基本例題") == 104, counts
    assert counts.get("基本問題") == 371, counts
    assert counts.get("応用問題") == 146, counts

    jcounts = {}
    for p in juyomon:
        jcounts[p["categoryKey"]] = jcounts.get(p["categoryKey"], 0) + 1
    assert jcounts.get("重問A") == 143, jcounts
    assert jcounts.get("重問B") == 15, jcounts
    assert jcounts.get("考察") == 5, jcounts

    OUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUT_PATH, "w", encoding="utf-8") as f:
        json.dump({"leadalpha": leadalpha, "juyomon": juyomon}, f, ensure_ascii=False, indent=2)

    print(f"Wrote {OUT_PATH} ({len(leadalpha)} leadalpha + {len(juyomon)} juyomon problems)")


if __name__ == "__main__":
    main()
