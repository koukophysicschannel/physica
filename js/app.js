import "./installPrompt.js"; // registers the beforeinstallprompt listener as early as possible
import { loadData } from "./data.js";
import {
  loadHistory,
  loadGoals,
  loadProfile,
  migrateLegacyExamSettings,
  migrateRenamedUniversities,
  migrateLegacyRankGoals,
  isOnboardingDone,
} from "./storage.js";
import { mountHome } from "./views/home.js";
import { mountList } from "./views/list.js";
import { mountGoals } from "./views/goals.js";
import { mountSettings } from "./views/settings.js";
import { mountOnboarding } from "./views/onboarding.js";

const ROUTES = {
  home: mountHome,
  list: mountList,
  goals: mountGoals,
  settings: mountSettings,
  onboarding: mountOnboarding,
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
  let route = currentRouteName();
  const done = isOnboardingDone();
  if (!done && route !== "onboarding") {
    location.hash = "#/onboarding";
    return; // the resulting hashchange re-invokes render() with route === "onboarding"
  }
  if (done && route === "onboarding") {
    // guards against a stale/bookmarked #/onboarding hash once it's already done
    location.hash = `#/${DEFAULT_ROUTE}`;
    return;
  }
  document.body.classList.toggle("onboarding-active", route === "onboarding");
  for (const link of navLinks) {
    link.classList.toggle("active", link.dataset.route === route);
  }
  viewEl.innerHTML = "";
  currentCleanup = await ROUTES[route](viewEl, ctx(data));
}

async function main() {
  migrateLegacyExamSettings();
  const data = await loadData();
  migrateRenamedUniversities();
  migrateLegacyRankGoals(data.config.ranks);
  const editionBadge = document.getElementById("edition-badge");
  if (editionBadge && data.config.edition) editionBadge.textContent = data.config.edition;
  window.addEventListener("hashchange", () => render(data));
  if (!isOnboardingDone()) {
    location.hash = "#/onboarding";
  } else if (!location.hash) {
    location.hash = `#/${DEFAULT_ROUTE}`;
  }
  await render(data);

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch(() => {
      /* offline-first is best-effort; ignore registration failures */
    });
  }
}

main();
