async function main() {
  const config = await fetch("data/config.json").then((r) => r.json());
  const links = config.links;
  const section = document.getElementById("links-section");
  if (!links || (!links.youtube && !links.website)) return;

  section.innerHTML = `
    <h2 class="card-title">関連リンク</h2>
    ${links.youtube ? `<p><a href="${links.youtube}" target="_blank" rel="noopener">高校物理 解説チャンネル(YouTube)</a></p>` : ""}
    ${links.website ? `<p><a href="${links.website}" target="_blank" rel="noopener">公式サイト</a></p>` : ""}
  `;
}

main();
