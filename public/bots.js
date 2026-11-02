// 宝的默认头像：按名字随机生成一个小机器人（同一个名字永远是同一个）。
// 只用一个形状、两只眼睛、一种主色，可爱靠眼睛（和 Kiki 的 logo 一个路子）。
// 用法：kikiBot("生活宝") → SVG 字符串。透明底，深浅主题都能看。
(function () {
  // 主色：饱和但不刺眼，白色面罩在上面都看得清
  const HUES = ["#5b6cf0", "#3a9bf0", "#20b2aa", "#36b37e", "#8bc34a", "#f5b82e", "#ff8a3d", "#ff6b8b", "#e05fd0", "#9b6cf0", "#ef5a5a"];
  const INK = "#1f2440"; // 眼睛、嘴

  // 字符串 → 32 位种子 → 一串伪随机数（mulberry32）
  function rng(seed) {
    let h = 2166136261;
    for (const c of String(seed)) h = Math.imul(h ^ c.codePointAt(0), 16777619);
    let a = h >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pick = (r, arr) => arr[Math.floor(r() * arr.length)];

  // 头：圆角方块 / 圆 / 宽扁 / 圆顶（全在 viewBox 0 0 32 32 里，下方留 2 的边）
  const HEADS = [
    (c) => `<rect x="4" y="9" width="24" height="21" rx="7" fill="${c}"/>`,
    (c) => `<circle cx="16" cy="19.5" r="11.5" fill="${c}"/>`,
    (c) => `<rect x="2.5" y="11" width="27" height="19" rx="8" fill="${c}"/>`,
    (c) => `<path d="M4 20a12 12 0 0 1 24 0v4a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill="${c}"/>`,
  ];
  // 天线：没有 / 一根小球 / 两根 / 小芽 / 小星星
  const ANTENNAE = [
    () => "",
    (c) => `<path d="M16 9V4.5" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><circle cx="16" cy="3.6" r="2.2" fill="${c}"/>`,
    (c) => `<path d="M11 10 8.6 5.2M21 10l2.4-4.8" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><circle cx="8.2" cy="4.6" r="1.8" fill="${c}"/><circle cx="23.8" cy="4.6" r="1.8" fill="${c}"/>`,
    (c) => `<path d="M16 9.5V6" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><path d="M16 6c0-2.6 1.8-4 4.4-4-.2 2.6-1.8 4-4.4 4zM16 6.4c0-2-1.4-3.2-3.4-3.2.1 2 1.4 3.2 3.4 3.2z" fill="${c}"/>`,
    (c) => `<path d="M16 9.5V7" stroke="${c}" stroke-width="1.8" stroke-linecap="round"/><path d="M16 1.2l1.2 2.5 2.6.3-1.9 1.8.5 2.6L16 7.1l-2.4 1.3.5-2.6-1.9-1.8 2.6-.3z" fill="#ffd166"/>`,
  ];
  // 眼睛：圆点 / 竖椭圆 / 开心弯弯 / 眨一只 / 大眼带高光 / 往右上看
  const EYES = [
    (y) => `<circle cx="12" cy="${y}" r="1.9" fill="${INK}"/><circle cx="20" cy="${y}" r="1.9" fill="${INK}"/>`,
    (y) => `<rect x="10.6" y="${y - 2.6}" width="2.8" height="5.2" rx="1.4" fill="${INK}"/><rect x="18.6" y="${y - 2.6}" width="2.8" height="5.2" rx="1.4" fill="${INK}"/>`,
    (y) => `<path d="M10 ${y + 1}q2-2.6 4 0M18 ${y + 1}q2-2.6 4 0" stroke="${INK}" stroke-width="1.7" fill="none" stroke-linecap="round"/>`,
    (y) => `<circle cx="12" cy="${y}" r="2" fill="${INK}"/><path d="M18 ${y}h4" stroke="${INK}" stroke-width="1.7" stroke-linecap="round"/>`,
    (y) => `<circle cx="12" cy="${y}" r="2.6" fill="${INK}"/><circle cx="20" cy="${y}" r="2.6" fill="${INK}"/><circle cx="12.9" cy="${y - 0.9}" r=".9" fill="#fff"/><circle cx="20.9" cy="${y - 0.9}" r=".9" fill="#fff"/>`,
    (y) => `<circle cx="13" cy="${y - 0.8}" r="1.9" fill="${INK}"/><circle cx="21" cy="${y - 0.8}" r="1.9" fill="${INK}"/>`,
  ];
  // 嘴：没有 / 小笑 / 小 o / 猫嘴
  const MOUTHS = [
    () => "",
    (y) => `<path d="M14.4 ${y}q1.6 1.4 3.2 0" stroke="${INK}" stroke-width="1.4" fill="none" stroke-linecap="round"/>`,
    (y) => `<ellipse cx="16" cy="${y + 0.3}" rx="1" ry="1.1" fill="${INK}"/>`,
    (y) => `<path d="M13.8 ${y}q1.1 1.2 2.2 0q1.1 1.2 2.2 0" stroke="${INK}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`,
  ];
  // 面罩：白色圆角屏，眼睛画在上面
  const FACE = { 0: [7, 13.5, 18, 12], 1: [7.5, 14, 17, 11.5], 2: [6, 15, 20, 11], 3: [7, 14, 18, 12] };

  function kikiBot(seed) {
    const r = rng(seed || "宝");
    const head = Math.floor(r() * HEADS.length);
    const c = pick(r, HUES), ant = pick(r, ANTENNAE), eyes = pick(r, EYES), mouth = pick(r, MOUTHS);
    const blush = r() < 0.35;
    const [fx, fy, fw, fh] = FACE[head];
    const ey = fy + fh * 0.42, my = fy + fh * 0.74;
    return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
      + ant(c) + HEADS[head](c)
      + `<rect x="${fx}" y="${fy}" width="${fw}" height="${fh}" rx="${fh / 2.4}" fill="#fff"/>`
      + (blush ? `<circle cx="9.6" cy="${my - 0.6}" r="1.3" fill="#ff8fa3" opacity=".7"/><circle cx="22.4" cy="${my - 0.6}" r="1.3" fill="#ff8fa3" opacity=".7"/>` : "")
      + eyes(ey) + mouth(my)
      + `</svg>`;
  }
  window.kikiBot = kikiBot;
})();
