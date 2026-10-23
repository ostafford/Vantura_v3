// Apply stored theme before first paint to prevent flash. Loaded as a
// same-origin file (not inline) so the CSP's script-src 'self' allows it.
;(function () {
  var m = localStorage.getItem('vantura_theme_mode') || 'dark'
  var r =
    m === 'system'
      ? window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : m
  document.documentElement.setAttribute('data-theme', r)
  document.documentElement.setAttribute('data-bs-theme', r)
  var meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', r === 'light' ? '#f5f4f0' : '#13131c')
})()
