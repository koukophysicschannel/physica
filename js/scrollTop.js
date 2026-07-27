// Shared floating "scroll to top" button. Works whether the page itself
// scrolls (about.html/mission.html -> pass window) or a specific element
// scrolls (the SPA's #view, which has overflow-y:auto -> pass that element).
const SCREENS_BEFORE_SHOW = 2;

export function attachScrollTopButton(scrollEl) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "scroll-top-btn";
  if (!document.querySelector(".bottomnav")) btn.classList.add("no-bottomnav");
  btn.setAttribute("aria-label", "上に戻る");
  btn.textContent = "↑";

  const mountPoint = scrollEl === window ? document.body : scrollEl;
  mountPoint.appendChild(btn);

  const getScrollTop = () => (scrollEl === window ? window.scrollY : scrollEl.scrollTop);
  const threshold = () => window.innerHeight * SCREENS_BEFORE_SHOW;

  function onScroll() {
    btn.classList.toggle("visible", getScrollTop() > threshold());
  }

  function onClick() {
    const target = scrollEl === window ? window : scrollEl;
    target.scrollTo({ top: 0, behavior: "smooth" });
  }

  scrollEl.addEventListener("scroll", onScroll, { passive: true });
  btn.addEventListener("click", onClick);
  onScroll();

  return () => {
    scrollEl.removeEventListener("scroll", onScroll);
    btn.removeEventListener("click", onClick);
    btn.remove();
  };
}
