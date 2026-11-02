// 宝的默认头像：Kiki logo 里那个往右上看的圆球，按名字换颜色（同一个名字永远同一个颜色）。
// 跟 logo、App 图标是同一套：圆球 + 两只竖着的眼睛偏在右上，所有宝都朝同一个方向看。
// 只有两种颜色：圆球一个颜色 + 白色眼睛。用法：kikiBot("生活宝") → SVG 字符串，透明底。
(function () {
  // 第一个是 logo 的靛蓝；其余挑饱和度接近的，白眼睛在上面都清楚
  const HUES = ["#5b6cf0", "#1f8bff", "#13b5c8", "#22b573", "#ffb300", "#ff7a1a", "#ff4f8b", "#d24fe0", "#8b5cf6", "#f0473c"];

  // 名字 → 颜色（FNV-1a 散列）
  function hue(seed) {
    let h = 2166136261;
    for (const c of String(seed)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
    h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; // 打散，“X宝”这种同尾巴的名字也不扎堆一个颜色
    return HUES[(h >>> 0) % HUES.length];
  }

  // 几何照搬 docs/assets/logo.svg（1024 画布里：圆心 482,542 半径 290；眼睛 64×146 圆角条，
  // 左上角在 474,396 和 606,396），按比例缩到 32×32、圆球半径 14、居中
  const S = 14 / 290, X = (v) => (16 + (v - 482) * S).toFixed(2), Y = (v) => (16 + (v - 542) * S).toFixed(2);
  const W = (64 * S).toFixed(2), H = (146 * S).toFixed(2), R = (32 * S).toFixed(2);
  const EYES = `<rect x="${X(474)}" y="${Y(396)}" width="${W}" height="${H}" rx="${R}"/><rect x="${X(606)}" y="${Y(396)}" width="${W}" height="${H}" rx="${R}"/>`;

  function kikiBot(seed) {
    return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
      + `<circle cx="16" cy="16" r="14" fill="${hue(seed || "宝")}"/><g fill="#fff">${EYES}</g></svg>`;
  }
  window.kikiBot = kikiBot;
})();
