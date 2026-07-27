# PHYSICA v1 — 作業状態(ハンドオフメモ)

最終更新: 2026-07-27

## 完了項目

- **アプリ本体**: `PHYSICA-spec.md` の仕様どおりにvanilla JS/HTML/CSSのPWAを実装済み。
  - `build/build_problems.py`: 2つのCSV(`titles-all-mapping.csv` / `juyomon-mapping.csv`)から `data/problems.json` を生成。得点(点数)は一切埋め込まず、`categoryKey` のみ保持し、実行時に `data/config.json` の `points` から解決する設計。
  - `js/scoring.js` / `js/snapshot.js`: 忘却曲線の減衰計算・分野別集計・ランク判定。すべてタップ履歴(localStorage)から都度再計算し、現在値はキャッシュしない。
  - 4画面(`js/views/`): ホーム・問題リスト・定期考査設定・設定。
  - PWA一式: `manifest.json` + `sw.js`(キャッシュファースト、オフライン起動対応)+ 生成アイコン。
- **仕様書側の数値訂正**: CSVを正規化・全数検証した結果、リードα合計が仕様書記載の1,285ではなく**1,288**(3章・4章・6章がそれぞれ+1)が正しいと判明。重複データではなく、仕様書内の章別満点表と「27+93+338+133件」という記載自体の間の計算違い(1,288 vs 1,285)が原因。`PHYSICA-spec.md` を1,288 / 総満点2,133に修正済み。詳細な検証根拠は本会話ログ参照。
- **ヘッドフルChrome UI検品**(Playwright-core + システムChrome、375px幅・タッチエミュレーション)で以下を確認・修正:
  1. **[修正済みバグ]** 長押し取り消しが実タッチ操作で機能しない不具合。原因: 長押しタイマーのコールバック内でジェスチャー継続中に `renderTiles()` を呼びDOMを差し替えていたため、指を離した際の合成clickイベントが新しいDOMノードに再ヒットテストされ、取り消し直後に別タップが再発生していた。`js/views/list.js` を修正し、タップ/長押し判定を `pointerdown`/`pointerup` のみで行い、再描画はジェスチャー終了後(`pointerup`)まで遅延するよう変更。
  2. **[修正済みバグ]** レーダーチャートの軸ラベル(例:「原子」→「子」)がSVG描画域外にはみ出して文字が欠けていた。`js/radar.js` の座標系(SIZE/MAX_R/ラベル半径)を拡大し、左右軸の片側伸長ラベルでも収まるよう修正。
  - その他の検証項目(タップ加点即時反映・4桁減衰・定期考査の範囲満点検算・375px幅でのレイアウト崩れなし)はすべて問題なし。
- **GitHub Pagesへのデプロイ**:
  - リポジトリ: https://github.com/koukophysicschannel/physica (公開, mainブランチ)
    (2026-07-27にmasahiroshimizu-a11y/physicaから移管。移管に伴いPages設定・URLも引き継がれた)
  - Pages有効化済み(source: main branch, path `/`, legacy build)
  - 本番URL: **https://koukophysicschannel.github.io/physica/** (v2デプロイ後も全アセット200・SW登録・オフライン起動を再確認済み)
  - サブパス配信を見越し、`manifest.json` の `start_url`/`scope`、`sw.js` のキャッシュ対象パス、`js/data.js` のfetchパス等はすべて相対パス(絶対パス `/...` を使用している箇所ゼロ)であることをリポジトリ全体grepで確認済み。

## 旧URLについて

- 移管前のURL `https://masahiroshimizu-a11y.github.io/physica/` は404を返す(GitHub Pagesは
  個人アカウント間の移管でも旧URLを自動リダイレクトしない)。ただし**この移管は一般公開前に
  行われたため実害なし**(旧URLが外部に共有・ブックマークされたことはない)。今後同様の
  移管を行う際は、既に配布済みのURLだと利用者に404が見えてしまう点に注意すること。

## 注意点・引き継ぎ情報

- **ローカル環境にはPlaywright-coreをscratchpad配下(`/private/tmp/.../scratchpad/pw/`)にのみ npm install済み**。プロジェクト本体には依存関係を一切追加していない(ビルド工程なしという仕様を維持)。
- **ローカル開発サーバー**: `python3 -m http.server 8934` をプロジェクトルートで起動して動作確認していた。ESモジュール(`<script type="module">`)を使っているため `file://` では動作しない(CORSで弾かれる)。ローカルでの再検証には必ずHTTPサーバー経由でアクセスすること。
- **git設定**: グローバルの `user.name`/`user.email` は未設定のまま(global設定には触れていない)。このリポジトリのローカル設定(`git config --local`)のみ、2026-07-27の `koukophysicschannel` 個人アカウントへの移管に合わせて `koukophysicschannel` / `koukophysics.channel@gmail.com` に更新済み(以後のコミットから適用。過去のコミットの著者情報は書き換えていない)。
- **sw.jsのキャッシュバージョン**: v2で `CACHE_NAME = "physica-v2"` に更新済み。今後 `PRECACHE_URLS` に含まれるファイルの中身を更新した場合は、このバージョン文字列をインクリメントしないと古いキャッシュが配信され続ける点に注意。
- **タイムゾーンに関する既知の注意**: UI検品中、`daysUntil()` 自体は正しく実装されているが、**テストスクリプト側**で `toISOString().slice(0,10)` を使って試験日を生成すると、UTC変換により実機のローカル日付とズレるケースを確認した(実際の `<input type="date">` はローカル日付を返すため本番では問題なし)。今後同様のテストを書く際は要注意。
- **データの既知の癖**: リードαの章別満点は仕様書と異なり合計1,288点(3, 4, 6章がそれぞれ+1)。これは重複データではなく実データに基づく正しい値として扱っている(詳細は上記および `PHYSICA-spec.md` 参照)。
