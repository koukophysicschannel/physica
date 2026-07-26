import { loadData } from "./data.js";
import { loadHistory, loadGoals, loadProfile, migrateLegacyExamSettings } from "./storage.js";
import { mountHome } from "./views/home.js";
import { mountList } from "./views/list.js";
import { mountGoals } from "./views/goals.js";
import { mountSettings } from "./views/settings.js";

const ROUTES = {
  home: mountHome,
  list: mountList,
  goals: mountGoals,
  settings: mountSettings,
};
const DEFAULT_ROUTE = "home";

const viewEl = document.getElementById("view");
const navLinks = [...document.querySelectorAll(".bottomnav a")];

let currentCleanup = null;

function currentRouteName() {
  const hash = location.hash.replace(/^#\/?/, "");
  return ROUTES[hash] ? hash : DEFAULT_ROUTE;
}

function ctx(data) {
  return {
    data,
    getHistory: () => loadHistory(),
    getGoals: () => loadGoals(),
    getProfile: () => loadProfile(),
    navigate: (route) => {
      location.hash = `#/${route}`;
    },
  };
}

async function render(data) {
  if (currentCleanup) {
    currentCleanup();
    currentCleanup = null;
  }
  const route = currentRouteName();
  for (const link of navLinks) {
    link.classList.toggle("active", link.dataset.route === route);
  }
  viewEl.innerHTML = "";
  currentCleanup = await ROUTES[route](viewEl, ctx(data));
}

async function main() {
  migrateLegacyExamSettings();
  const data = await loadData();
  window.addEventListener("hashchange", () => render(data));
  if (!location.hash) location.hash = `#/${DEFAULT_ROUTE}`;
  await render(data);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* offline-first is best-effort; ignore registration failures */
    });
  }
}

main();
