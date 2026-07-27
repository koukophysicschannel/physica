#!/usr/bin/env python3
"""
Estimates which リードα chapter(s)/problem(s) each 重問(juyomon) problem
corresponds to, from 分野 + a lightweight text-similarity match against
リードα titles. Many-to-many by design: a 重問 can match several リードα
problems (possibly across several chapters within the same 分野 range), and
a リードα problem can be the best match for more than one 重問.

This does NOT use any external NLP library or network call, so it keeps
working unmodified when next year's CSVs (same column names, new rows) are
dropped in. Re-run whenever titles-all-mapping.csv / juyomon-mapping.csv change:

  python3 build/map_juyomon_lead.py
  python3 build/map_juyomon_lead.py --titles path/to/new-titles.csv --juyomon path/to/new-juyomon.csv

Outputs (repo root by default):
  - build/juyomon-lead-map.json        machine-readable map, keyed by 重問番号(num)
  - build/juyomon-lead-map-review.csv  human review sheet, low-confidence rows first
"""
import argparse
import csv
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_problems import CHAPTER_FIELD_RANGES, TITLE_RE, CATEGORY_NORMALIZE, CATEGORY_SLUG

ROOT = Path(__file__).resolve().parent.parent

# 上位互換: 上位N件を候補として残し、そのうちトップスコアの
# TOP_SCORE_RATIO 倍以上のものだけ「対応あり」として採用する
# (= 複数章・複数問題にまたがる対応を許容しつつ、ノイズは削る)
TOP_N = 5
TOP_SCORE_RATIO = 0.7

# 確信度のしきい値(スコアはbigram Jaccard類似度、0〜1)。実データで
# 分布を見ながら調整すること。低確信度は「要確認」としてレビューCSVの先頭に出す。
CONFIDENCE_HIGH = 0.30
CONFIDENCE_MID = 0.12


def field_chapters(field):
    if field == "考察":
        # 考察は特定分野を持たない(v1仕様で分野バランス計算からも除外)ため、
        # 全章を候補にする。
        return sorted({ch for _, lo, hi in CHAPTER_FIELD_RANGES for ch in range(lo, hi + 1)})
    for f, lo, hi in CHAPTER_FIELD_RANGES:
        if f == field:
            return list(range(lo, hi + 1))
    raise ValueError(f"unknown 分野: {field!r}")


def normalize_text(s):
    return re.sub(r"[\s『』｜【】\[\]()（）]+", "", s or "")


def bigrams(s):
    s = normalize_text(s)
    if len(s) < 2:
        return {s} if s else set()
    return {s[i : i + 2] for i in range(len(s) - 1)}


def similarity(a, b):
    A, B = bigrams(a), bigrams(b)
    if not A or not B:
        return 0.0
    return len(A & B) / len(A | B)


def load_leadalpha_candidates(titles_path):
    """{ chapter: [ {id, chapter, category, number, title}, ... ] }"""
    by_chapter = {}
    with open(titles_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            raw_title = row["旧タイトル"]
            m = TITLE_RE.search(raw_title)
            if not m:
                continue
            chapter = int(m.group(1))
            category = CATEGORY_NORMALIZE[m.group(2)]
            number = int(m.group(3)) if m.group(3) else None
            pid = (
                f"la-{chapter}-{CATEGORY_SLUG[category]}"
                if category == "基礎CHECK"
                else f"la-{chapter}-{CATEGORY_SLUG[category]}-{number}"
            )
            by_chapter.setdefault(chapter, []).append(
                {
                    "id": pid,
                    "chapter": chapter,
                    "category": category,
                    "number": number,
                    "title": row["新タイトル"] or raw_title,
                }
            )
    return by_chapter


def load_juyomon(juyomon_path):
    rows = []
    with open(juyomon_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rows.append(
                {
                    "num": int(row["num"]),
                    "field": row["分野"],
                    "title": row["問題名"],
                    "gist": row.get("趣旨", ""),
                }
            )
    return rows


def confidence_label(score):
    if score >= CONFIDENCE_HIGH:
        return "高"
    if score >= CONFIDENCE_MID:
        return "中"
    return "低(要確認)"


def match_one(juyomon_row, candidates_by_chapter):
    chapters = field_chapters(juyomon_row["field"])
    candidates = [c for ch in chapters for c in candidates_by_chapter.get(ch, [])]
    query = f"{juyomon_row['title']} {juyomon_row['gist']}"

    scored = sorted(
        ({**c, "score": similarity(query, c["title"])} for c in candidates),
        key=lambda c: c["score"],
        reverse=True,
    )
    top = scored[:TOP_N]
    top_score = top[0]["score"] if top else 0.0
    kept = [c for c in top if c["score"] > 0 and c["score"] >= top_score * TOP_SCORE_RATIO] if top_score > 0 else []

    lead_chapters = sorted({c["chapter"] for c in kept})
    return {
        "num": juyomon_row["num"],
        "field": juyomon_row["field"],
        "title": juyomon_row["title"],
        "leadChapters": lead_chapters,
        "leadProblems": [c["id"] for c in kept],
        "matches": [{"id": c["id"], "title": c["title"], "score": round(c["score"], 3)} for c in kept],
        "topScore": round(top_score, 3),
        "confidence": confidence_label(top_score),
    }


def write_json(out_path, results):
    payload = {str(r["num"]): r for r in results}
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)


def write_review_csv(out_path, results):
    # 要確認(確信度が低いもの)を先頭にまとめ、以降は重問番号順。
    confidence_rank = {"低(要確認)": 0, "中": 1, "高": 2}
    ordered = sorted(results, key=lambda r: (confidence_rank[r["confidence"]], r["num"]))

    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(out_path, "w", encoding="utf-8-sig", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["重問番号", "問題名", "分野", "推定リード章", "根拠(マッチしたリードα問題・スコア)", "確信度"])
        for r in ordered:
            basis = "; ".join(f"{m['title']}(章{m['id'].split('-')[1]}, score={m['score']})" for m in r["matches"])
            writer.writerow(
                [
                    r["num"],
                    r["title"],
                    r["field"],
                    "・".join(f"{c}章" for c in r["leadChapters"]) or "(該当なし)",
                    basis or "(候補なし)",
                    r["confidence"],
                ]
            )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--titles", default=str(ROOT / "titles-all-mapping.csv"))
    parser.add_argument("--juyomon", default=str(ROOT / "juyomon-mapping.csv"))
    parser.add_argument("--out-json", default=str(ROOT / "build" / "juyomon-lead-map.json"))
    parser.add_argument("--out-review-csv", default=str(ROOT / "build" / "juyomon-lead-map-review.csv"))
    args = parser.parse_args()

    candidates_by_chapter = load_leadalpha_candidates(Path(args.titles))
    juyomon_rows = load_juyomon(Path(args.juyomon))

    results = [match_one(row, candidates_by_chapter) for row in juyomon_rows]

    write_json(Path(args.out_json), results)
    write_review_csv(Path(args.out_review_csv), results)

    low_count = sum(1 for r in results if r["confidence"] == "低(要確認)")
    mid_count = sum(1 for r in results if r["confidence"] == "中")
    high_count = sum(1 for r in results if r["confidence"] == "高")
    print(f"Mapped {len(results)} juyomon problems: 高={high_count} 中={mid_count} 低(要確認)={low_count}")
    print(f"Wrote {args.out_json}")
    print(f"Wrote {args.out_review_csv}")


if __name__ == "__main__":
    main()
