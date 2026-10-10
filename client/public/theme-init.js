// Applies the saved (or system) theme before the first paint to avoid a light flash.
// Kept as a separate file so it is allowed by the Content-Security-Policy (script-src 'self').
(function () {
  var theme = 'light';
  try {
    var saved = localStorage.getItem('ee_theme');
    if (saved === 'light' || saved === 'dark') theme = saved;
    else if (window.matchMedia('(prefers-color-scheme: dark)').matches) theme = 'dark';
  } catch (e) {
    /* storage unavailable */
  }
  document.documentElement.dataset.theme = theme;
})();
