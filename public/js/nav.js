/* PressPilot V2 — nav.js
   Navigation helper that delegates to window.PP_navigate (set by main.js).
   Import this instead of main.js to avoid circular ES module dependencies. */

export function navigate(route) {
  if (window.PP_navigate) {
    window.PP_navigate(route);
  } else {
    // Fallback: change hash, let hashchange handler pick it up
    window.location.hash = '#' + route;
  }
}

export function reloadCurrentModule() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  navigate(hash);
}
