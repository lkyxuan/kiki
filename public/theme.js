// 外观：跟随系统 / 浅色 / 深色，或者装在 ~/kiki-data/themes/ 里的外部主题。选择记在浏览器里（每台设备各自记），
// 放在 <head> 里尽早执行，免得闪一下。在 Kiki.app 里还会告诉原生窗口，让标题栏跟着变。
// 外部主题：<html> 上 data-theme="<主题 id>"、data-base="light|dark"（先套内置的浅色或深色，主题再盖上去），
// 再加载 /themes/<id>/theme.css。主题包怎么写见 docs/themes.md。
(function () {
  var KEY = "kiki.theme", BASE = "kiki.theme.base";
  var ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
  function read(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function get() { var v = read(KEY); return v && ID.test(v) ? v : "system"; } // system / light / dark / 外部主题 id
  function base(v) { return v === "light" || v === "dark" ? v : v === "system" ? "system" : read(BASE) === "dark" ? "dark" : "light"; }
  function apply(v) {
    var root = document.documentElement, b = base(v), ext = v !== "system" && v !== "light" && v !== "dark";
    if (v === "system") root.removeAttribute("data-theme"); else root.setAttribute("data-theme", v);
    if (ext) root.setAttribute("data-base", b); else root.removeAttribute("data-base");
    var link = document.getElementById("kiki-ext-theme");
    if (ext) {
      if (!link) { link = document.createElement("link"); link.id = "kiki-ext-theme"; link.rel = "stylesheet"; }
      link.href = "/themes/" + v + "/theme.css";
      // 放到 <head> 最后：页面自己的 <style> 在它前面，主题里同样的选择器才盖得过去
      var put = function () { document.head.appendChild(link); };
      put();
      if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", put);
    } else if (link) link.remove();
    try { window.webkit.messageHandlers.kikiTheme.postMessage(b); } catch (e) {}
  }
  window.kikiTheme = {
    get: get,
    /** v：system / light / dark / 外部主题 id；外部主题要同时给它基于 light 还是 dark */
    set: function (v, b) {
      try {
        if (v === "system") localStorage.removeItem(KEY); else localStorage.setItem(KEY, v);
        if (b === "light" || b === "dark") localStorage.setItem(BASE, b); else localStorage.removeItem(BASE);
      } catch (e) {}
      apply(get());
      window.dispatchEvent(new CustomEvent("kiki-theme", { detail: get() }));
    },
  };
  apply(get());
  // 别的页面（比如设置弹窗里）改了，这里也跟着变
  window.addEventListener("storage", function (e) { if (e.key === KEY || e.key === BASE || e.key === null) apply(get()); });
})();
