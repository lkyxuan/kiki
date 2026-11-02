// 宝的默认头像：按名字生成一个软乎乎的小团子（同一个名字永远是同一个）。
// 学 Grok Bot 的味道：手捏一样不规则的圆润轮廓（团子或软星星），两只深色的小斜眼睛往一边瞟。
// 只有两种颜色：身体一个饱和色 + 深色眼睛。用法：kikiBot("生活宝") → SVG 字符串，透明底。
(function () {
  const HUES = ["#1f8bff", "#ff6a13", "#ff4f8b", "#22b573", "#8b5cf6", "#ffb300", "#13b5c8", "#f0473c"];
  const INK = "#14141f";

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
  const f = (n) => n.toFixed(2);

  // 轮廓：极坐标上一圈点，半径 = 基础 + 几个“瓣” + 一点手抖，再用平滑曲线连起来
  function blob(r) {
    const lobes = pick(r, [0, 0, 4, 5, 5, 6]); // 0 = 圆团子，其余是软星星 / 云团
    const depth = lobes ? 0.12 + r() * 0.06 : 0;
    const phase = r() * Math.PI * 2, w1 = r() * Math.PI * 2, w2 = r() * Math.PI * 2;
    const N = 48, pts = [];
    for (let i = 0; i < N; i++) {
      const t = (i / N) * Math.PI * 2;
      let k = 1 + depth * Math.cos(lobes * t + phase); // 瓣
      k += 0.05 * Math.cos(2 * t + w1) + 0.035 * Math.cos(3 * t + w2); // 手捏的不规则
      const R = 11.2 * k;
      pts.push([16 + R * Math.cos(t), 16.4 + R * Math.sin(t) * 0.94]);
    }
    // Catmull-Rom → 三次贝塞尔，闭合
    let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
    for (let i = 0; i < N; i++) {
      const p0 = pts[(i - 1 + N) % N], p1 = pts[i], p2 = pts[(i + 1) % N], p3 = pts[(i + 2) % N];
      d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
    }
    return d + "Z";
  }

  // 眼睛：两根短短的圆头斜条，整体往一边瞟
  function eyes(r) {
    const gx = (r() - 0.35) * 5, gy = -1 - r() * 2.2; // 往右上偏一点
    const tilt = -12 - r() * 16, len = 4 + r() * 1.2, gap = 4 + r() * 0.8;
    const one = (x) => `<rect x="${f(x - 1.1)}" y="${f(-len / 2)}" width="2.2" height="${f(len)}" rx="1.1"/>`;
    return `<g fill="${INK}" transform="translate(${f(16 + gx)} ${f(16 + gy)}) rotate(${f(tilt)})">${one(-gap / 2)}${one(gap / 2)}</g>`;
  }

  function kikiBot(seed) {
    const r = rng(seed || "宝");
    const c = pick(r, HUES), d = blob(r), spin = (r() - 0.5) * 30;
    return `<svg viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">`
      + `<path d="${d}" fill="${c}" transform="rotate(${f(spin)} 16 16)"/>${eyes(r)}</svg>`;
  }
  window.kikiBot = kikiBot;
})();
