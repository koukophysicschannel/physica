import { retention } from "./scoring.js";

const CATEGORY_ORDER = ["基礎CHECK", "基本例題", "基本問題", "応用問題", "重問A", "重問B", "考察"];

function pct(v) {
  return (v * 100).toFixed(1);
}

function pointsTableSection(config) {
  const rows = CATEGORY_ORDER.filter((k) => k in config.points)
    .map((k) => `<tr><td>${k}</td><td class="num">${config.points[k]}点</td></tr>`)
    .join("");
  return `
    <section class="card about-section">
      <h2 class="card-title">配点表</h2>
      <p>タイルを1回タップすると、以下の点数が加算される。</p>
      <table class="about-table">
        <thead><tr><th>種別</th><th>点数</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <p>同じ問題を複数回タップすると、そのたびに満額が加算される。</p>
    </section>
  `;
}

// Hand-rolled SVG line chart for R(t) — no chart library, matching radar.js's approach.
function renderDecaySVG(tau, floor) {
  const W = 320;
  const H = 180;
  const padL = 34;
  const padR = 10;
  const padT = 10;
  const padB = 26;
  const xMax = Math.max(42, Math.round(tau * 6));
  const yMin = floor;
  const yMax = 1;

  const xOf = (t) => padL + (t / xMax) * (W - padL - padR);
  const yOf = (r) => padT + (1 - (r - yMin) / (yMax - yMin)) * (H - padT - padB);

  const steps = 100;
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const t = (xMax * i) / steps;
    pts.push(`${xOf(t).toFixed(1)},${yOf(retention(t, tau, floor)).toFixed(1)}`);
  }

  const markers = [1, 7, 30]
    .filter((t) => t <= xMax)
    .map((t) => {
      const r = retention(t, tau, floor);
      return `
        <circle cx="${xOf(t).toFixed(1)}" cy="${yOf(r).toFixed(1)}" r="3" class="decay-point" />
        <text x="${xOf(t).toFixed(1)}" y="${(yOf(r) - 8).toFixed(1)}" text-anchor="middle" class="decay-label">${t}日 ${pct(r)}%</text>
      `;
    })
    .join("");

  return `
    <svg viewBox="0 0 ${W} ${H}" class="decay-chart" role="img" aria-label="時間経過と保持率の関係を示すグラフ">
      <line x1="${padL}" y1="${padT}" x2="${padL}" y2="${H - padB}" class="decay-axis" />
      <line x1="${padL}" y1="${H - padB}" x2="${W - padR}" y2="${H - padB}" class="decay-axis" />
      <text x="${padL - 4}" y="${padT + 4}" text-anchor="end" class="decay-tick">100%</text>
      <text x="${padL - 4}" y="${H - padB + 4}" text-anchor="end" class="decay-tick">${Math.round(floor * 100)}%</text>
      <text x="${padL}" y="${H - 6}" text-anchor="start" class="decay-tick">0日</text>
      <text x="${W - padR}" y="${H - 6}" text-anchor="end" class="decay-tick">${xMax}日</text>
      <polyline points="${pts.join(" ")}" class="decay-line" />
      ${markers}
    </svg>
  `;
}

function decaySection(config) {
  const { tau, floor } = config.decay;
  return `
    <section class="card about-section">
      <h2 class="card-title">減少のルール(忘却曲線)</h2>
      <p>タップした点数は、時間が経過すると保持率にしたがって減っていく。</p>
      <p>タップからの経過日数を t とすると、保持率 R(t) は次の式で計算される。</p>
      <p class="about-formula">R(t) = floor + (1 − floor) × exp(−√(t / tau))</p>
      <p>現在の設定では、tau(基準日数)は ${tau}、floor(下限)は ${floor} になっている。</p>
      <div class="about-chart-holder">${renderDecaySVG(tau, floor)}</div>
      <table class="about-table">
        <thead><tr><th>経過日数</th><th>保持率</th></tr></thead>
        <tbody>
          <tr><td>1日</td><td class="num">${pct(retention(1, tau, floor))}%</td></tr>
          <tr><td>7日(1週間)</td><td class="num">${pct(retention(7, tau, floor))}%</td></tr>
          <tr><td>30日(1ヶ月)</td><td class="num">${pct(retention(30, tau, floor))}%</td></tr>
        </tbody>
      </table>
      <p>経過日数がどれだけ長くなっても、保持率は ${Math.round(floor * 100)}% を下回らない。</p>
      <p>PHYSICA値は、すべてのタップについて「配点 × その時点の保持率」を計算し、合計した値になる。</p>
    </section>
  `;
}

function tileColorSection(config) {
  const tiers = Object.keys(config.lapColors)
    .map(Number)
    .sort((a, b) => a - b);
  const maxTier = Math.max(...tiers);
  const rows = tiers
    .map((tier) => {
      const rgb = config.lapColors[String(tier)];
      const desc = tier === maxTier ? `周回数が${tier}以上になると、色は下記に固定される。` : `周回数が${tier}になると、色は下記になる。`;
      return `
        <tr>
          <td><span class="color-swatch" style="background-color: rgb(${rgb});"></span></td>
          <td>${desc}</td>
        </tr>
      `;
    })
    .join("");
  return `
    <section class="card about-section">
      <h2 class="card-title">タイルの色の意味</h2>
      <p>タイルの色相は、その問題をタップした回数(周回数)によって決まる。</p>
      <table class="about-table about-table-swatch">
        <tbody>${rows}</tbody>
      </table>
      <p>タイルの色の濃さは、保持率によって決まる。保持率が高いほど濃く表示され、時間が経過して保持率が下がると薄くなる。</p>
      <p>一度もタップしていない問題は、無色(枠線のみ)で表示される。</p>
      <p>周回数が2以上になると、タイルの右上に実際のタップ回数が「×N」の形式で表示される。周回数が1のときは表示されない。</p>
    </section>
  `;
}

function expectedScoreSection(config) {
  const { k, cap } = config.conversion;
  return `
    <section class="card about-section">
      <h2 class="card-title">予想得点の計算式</h2>
      <p>予想得点は、範囲内の保持点を「範囲内満点 × ${k}」で割り、100を掛けた値になる。</p>
      <p class="about-formula">予想得点 = 範囲内保持点 ÷ (範囲内満点 × ${k}) × 100</p>
      <p>計算結果が${cap}を超えると、${cap}として表示される。</p>
      <p>通常の予想得点は、範囲を全問題として計算される。</p>
      <p>定期考査の目標では、範囲を選択した章として計算される。</p>
      <p>模試の目標では、同じ式で計算した値を「仕上がり度%」として表示する。仕上がり度%は、模試という初見の問題を含む試験の得点そのものを予想する値ではない。</p>
    </section>
  `;
}

function rankSection(config) {
  const sorted = [...config.ranks].sort((a, b) => b.score - a.score);
  const rows = sorted.map((r) => `<tr><td>${r.label}</td><td class="num">${r.score}点</td></tr>`).join("");
  return `
    <section class="card about-section">
      <h2 class="card-title">ランクの判定条件</h2>
      <p>現在ランクは、5つの分野(${config.fields.join("・")})それぞれの「保持点 ÷ 満点」の比のうち、最も低い比率をもとに判定される。</p>
      <p>最も低い比率を全範囲満点に掛けた値が、判定に使う実効値になる。</p>
      <p>実効値がランクの基準点以上になると、そのランクに到達したと判定される。</p>
      <p>5つの分野のうち1つでも基準に届いていない分野があると、他の分野が基準を超えていても、そのランクには到達しない。</p>
      <table class="about-table">
        <thead><tr><th>ランク</th><th>基準点</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function goalsSection(packages) {
  const rows = packages
    .map((pkg) => {
      const scope = pkg.範囲.章 !== undefined ? `章: ${pkg.範囲.章 === "all" ? "全範囲" : pkg.範囲.章.join(", ")}` : `分野: ${pkg.範囲.分野}`;
      return `
        <tr>
          <td>${pkg.名称}</td>
          <td>${scope}</td>
          <td class="num">${pkg.周回}周</td>
          <td class="num">${pkg.推奨期間日数}日</td>
        </tr>
      `;
    })
    .join("");

  return `
    <section class="card about-section">
      <h2 class="card-title">目標とパッケージの操作手順</h2>
      <p>「目標」タブを開くと、登録済みの目標の一覧が表示される。</p>
      <p>「＋ 目標を追加」をタップすると、目標の種類を選ぶ画面になる。</p>
      <p>定期考査を選ぶと、名前・試験日・範囲(章)を入力して保存できる。保存すると、範囲の予想得点と試験日までの日数が目標カードに表示されるようになる。</p>
      <p>模試を選ぶと、初回は学年を選ぶ画面になる。学年を選ぶと、以後の模試選択で使われる。</p>
      <p>学年を選ぶと、その学年・科目に対応する模試の一覧が表示される。模試と範囲(章)を選んで保存すると、仕上がり度%が目標カードに表示されるようになる。</p>
      <p>志望ランクを選ぶと、ランクの一覧から1つ選んで保存できる。志望ランクの目標には締切が設定されない。</p>
      <p>期間目標を選ぶと、「パッケージから選ぶ」か「自由に設定」かを選ぶ画面になる。</p>
      <p>パッケージを選ぶと、開始日は当日、終了日は推奨期間日数を加えた日付が自動で入力される。終了日は変更できる。</p>
      <p>パッケージの目標を保存すると、ホーム画面の最上部に「今日: あとN問」という表示が追加される。この数は、残りのノルマを残り日数で割った値になる。</p>
      <p>自由に設定を選ぶと、範囲(全範囲・章・分野)と周回数、開始日・終了日を指定して保存できる。</p>
      <p>目標一覧の「削除」をタップすると、その目標が削除される。</p>
      <table class="about-table">
        <thead><tr><th>パッケージ</th><th>範囲</th><th>周回</th><th>推奨期間</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </section>
  `;
}

function storageSection() {
  return `
    <section class="card about-section">
      <h2 class="card-title">データ保存の仕様</h2>
      <p>PHYSICAのデータは、このブラウザのlocalStorageにのみ保存される。</p>
      <p>サーバーへの送信や、ログインによる保存は行われない。</p>
      <p>保存されるのは、タップ履歴・登録した目標・選択した学年のみになる。</p>
      <p>現在のPHYSICA値やランクなどの計算結果は保存されず、表示のたびに履歴から計算し直される。</p>
      <p>ブラウザの閲覧データ(サイトデータ)を削除すると、保存されているデータは失われる。</p>
      <p>シークレットモード(プライベートブラウジング)で使用すると、ウィンドウを閉じた時点でデータが失われる。</p>
      <p>別の端末や別のブラウザで開くと、保存されているデータは共有されず、別々のデータとして扱われる。</p>
      <p>「設定」タブの「データをリセット」を実行すると、保存されているデータがすべて削除される。</p>
      <p>「設定」タブの「エクスポート」をタップすると、タップ履歴・目標・学年を含むJSONファイルがダウンロードされる。</p>
      <p>ダウンロードしたJSONファイルを「設定」タブの「インポート」から選択すると、その時点のデータが復元される。</p>
    </section>
  `;
}

async function main() {
  const [config, packagesRaw] = await Promise.all([
    fetch("data/config.json").then((r) => r.json()),
    fetch("data/packages.json").then((r) => r.json()),
  ]);

  const view = document.getElementById("about-view");
  view.innerHTML = [
    pointsTableSection(config),
    decaySection(config),
    tileColorSection(config),
    expectedScoreSection(config),
    rankSection(config),
    goalsSection(packagesRaw.packages),
    storageSection(),
  ].join("");
}

main();
