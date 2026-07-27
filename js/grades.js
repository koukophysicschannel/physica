// 学年の共通定義。中学生も含めた7区分。
// mocktest目標(exams.json)・パッケージ(packages.json)の対象学年フィルタ、
// オンボーディング・設定画面の学年選択で共通利用する。
export const GRADE_ORDER = [1, 2, 3, 4, 5, 6, 7];

export const GRADE_LABELS = {
  1: "中学1年",
  2: "中学2年",
  3: "中学3年",
  4: "高校1年",
  5: "高校2年",
  6: "高校3年",
  7: "卒業生",
};

// 卒業生(7)は、既卒限定の別回がexams.json/packages.jsonにまだ収録されていないため、
// 現状は高校3年(6)向けの模試・パッケージと同じ候補を表示する。
export function matchesGrade(itemGrade, grade) {
  if (itemGrade == null) return true;
  if (itemGrade === grade) return true;
  if (grade === 7 && itemGrade === 6) return true;
  return false;
}
