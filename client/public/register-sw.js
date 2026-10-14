/* global navigator, window */

(() => {
  if (!("serviceWorker" in navigator)) return;

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
      // Installation remains optional; the website must continue to work when
      // service workers are disabled by browser or organization policy.
    });
  });
})();
