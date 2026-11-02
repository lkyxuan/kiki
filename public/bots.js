// 宝的默认头像：按名字生成一个小精灵（同一个名字永远是同一个）。
// 两种颜色：一个主色的形状（云朵、水滴、小幽灵、花、星星、豆子）+ 白色眼睛。
// 用法：kikiBot("生活宝") → SVG 字符串。透明底，深浅主题都能看。
(function () {
  const HUES = ["#5b6cf0", "#3a9bf0", "#20b2aa", "#36b37e", "#f5b82e", "#ff8a3d", "#ff6b8b", "#e05fd0", "#9b6cf0", "#ef5a5a"];
  const EYE = "#fff";

  // 字符串 → 种子 → 一串伪随机数（mulberry32）
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

  // 五角星：普通的星形折线，再描一圈同色圆角边让尖角变软
  function softStar() {
    const pt = (i, rad) => { const a = -Math.PI / 2 + (i * Math.PI) / 5; return [16 + rad * Math.cos(a), 17 + rad * Math.sin(a)]; };
    const f = ([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`;
    let d = "";
    for (let i = 0; i < 10; i++) d += (i ? "L" : "M") + f(pt(i, i % 2 ? 6 : 12));
    return d + "z";
  }

  // 形状（viewBox 0 0 32 32），y 是眼睛的高度
  const SHAPES = [
    { y: 18, d: "M9 27a6.5 6.5 0 0 1-1.2-12.9A8.5 8.5 0 0 1 24.3 12 6.5 6.5 0 0 1 23 27z" }, // 云朵
    { y: 19, d: "M16 3c5 6 10 10.5 10 16a10 10 0 0 1-20 0c0-5.5 5-10 10-16z" }, // 水滴
    { y: 14.5, d: "M5 15a11 11 0 0 1 22 0v13l-3.7-2.6L19.7 28 16 25.4 12.3 28l-3.6-2.6L5 28z" }, // 小幽灵
    { y: 16, d: "M16 3.5a5 5 0 0 1 4.3 2.5 5 5 0 0 1 5.7 5.7 5 5 0 0 1 0 8.6 5 5 0 0 1-5.7 5.7 5 5 0 0 1-8.6 0A5 5 0 0 1 6 20.3a5 5 0 0 1 0-8.6A5 5 0 0 1 11.7 6 5 5 0 0 1 16 3.5z" }, // 花
    { y: 17.5, d: softStar(), soft: true }, // 星星（描一圈同色圆角边，尖角变软）
    { y: 16.5, d: "M3 16.5a13 11.5 0 1 0 26 0a13 11.5 0 1 0-26 0z" }, // 豆子
  ];
  // 眼睛（白色）：圆点 / 竖条 / 开心弯弯 / 往右上看
  const EYES = [
    (y) => `<circle cx="12" cy="${y}" r="2" fill="${EYE}"/><circle cx="20" cy="${y}" r="2" fill="${EYE}"/>`,
    (y) => `<rect x="10.7" y="${y - 2.6}" width="2.6" height="5.2" rx="1.3" fill="${EYE}"/><rect x="18.7" y="${y - 2.6}" width="2.6" height="5.2" rx="1.3" fill="${EYE}"/>`,
    (y) => `<path d="M10 ${y + 1}q2-2.6 4 0M18 ${y + 1}q2-2.6 4 0" stroke="${EYE}" stroke-width="1.8" fill="none" stroke-linecap="round"/>`,
    (y) => `<circle cx="13" cy="${y - 0.8}" r="2" fill="${EYE}"/><circle cx="21" cy="${y - 0.8}" r="2" fill="${EYE}"/>`,
  ];

  function kikiBot(seed) {
    const r = rng(seed || "宝");
    const shape = pick(r, SHAPES), c = pick(r, HUES), eyes = pick(r, EYES);
    return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="${shape.d}" fill="${c}"${shape.soft ? ` stroke="${c}" stroke-width="3" stroke-linejoin="round"` : ""}/>${eyes(shape.y)}</svg>`;
  }
  window.kikiBot = kikiBot;
})();
