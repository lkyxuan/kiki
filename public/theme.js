// 外观：跟随系统 / 浅色 / 深色。选择记在浏览器里（每台设备各自记），放在 <head> 里尽早执行，免得闪一下。
// 在 Kiki.app 里还会告诉原生窗口，让标题栏跟着变。
(function () {
  var KEY = "kiki.theme";
  function get() {
    try { var v = localStorage.getItem(KEY); return v === "light" || v === "dark" ? v : "system"; } catch (e) { return "system"; }
  }
  function apply(v) {
    var root = document.documentElement;
    if (v === "light" || v === "dark") root.setAttribute("data-theme", v); else root.removeAttribute("data-theme");
    try { window.webkit.messageHandlers.kikiTheme.postMessage(v); } catch (e) {}
  }
  window.kikiTheme = {
    get: get,
    set: function (v) {
      try { if (v === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch (e) {}
      apply(get());
      window.dispatchEvent(new CustomEvent("kiki-theme", { detail: get() }));
    },
  };
  apply(get());
  // 别的页面（比如设置弹窗里）改了，这里也跟着变
  window.addEventListener("storage", function (e) { if (e.key === KEY || e.key === null) apply(get()); });
})();
