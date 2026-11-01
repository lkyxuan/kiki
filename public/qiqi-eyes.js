// 奇奇的头像会动：眨眼、眼珠跟着鼠标、干活时抬头看右上角（像 logo 里看星星）。
// 图层（都是 256×256，坐标是头像图里的像素）：
//   qiqi-base.png    眼睛里面涂黑的头像，当底
//   qiqi.png         原图，只露出眼睛里面（椭圆裁剪），平移它就是转眼珠
//   qiqi-closed.png  只有两只眼睛那块、用周围肤色补平的图，盖上去就是闭眼
// 眨眼是三帧：半闭 → 全闭 → 半闭 → 睁开，只切显示隐藏，不靠 SVG 变形动画，Safari 里也稳。
const EYES = [
  { cx: 115.2, cy: 168.4, rx: 19.4, ry: 20.2 }, // 左眼
  { cx: 186.6, cy: 158.3, rx: 14.0, ry: 18.6 }, // 右眼（侧脸，窄一点）
];
const LOOK = 5; // 眼珠最多挪几个像素
const INSET = 2.5; // 眼珠这层往里缩一点，别把黑色描边也带着动
const STROKE = 'fill="none" stroke="#111" stroke-width="3.2" stroke-linecap="round"';

let uid = 0;

/** 把会动的头像放进 el（替换里面的内容），返回 { think(on), blink() }。 */
export function mountQiqi(el) {
  const id = `qe${++uid}`;
  // 半闭时眼皮的下沿：一条略往下弯的线，大约在眼睛中间偏上
  const lidEdge = (e) => {
    const y = e.cy - e.ry * 0.2;
    return { y, d: `M${e.cx - e.rx * 1.05} ${y} Q${e.cx} ${y + e.ry * 0.45} ${e.cx + e.rx * 1.05} ${y}` };
  };
  const defs = EYES.map((e, i) => {
    const { y } = lidEdge(e);
    const top = e.cy - e.ry - 8, l = e.cx - e.rx - 8, r = e.cx + e.rx + 8;
    return `
      <clipPath id="${id}i${i}"><ellipse cx="${e.cx}" cy="${e.cy}" rx="${e.rx - INSET}" ry="${e.ry - INSET}"/></clipPath>
      <clipPath id="${id}h${i}"><path d="M${l} ${top} H${r} V${y} Q${e.cx} ${y + e.ry * 0.9} ${l} ${y} Z"/></clipPath>`;
  }).join("");
  const irises = EYES.map((_, i) => `<g clip-path="url(#${id}i${i})"><image class="iris" href="/qiqi.png" width="256" height="256"/></g>`).join("");
  const half = EYES.map((e, i) => `<g clip-path="url(#${id}h${i})"><image href="/qiqi-closed.png" width="256" height="256"/></g><path d="${lidEdge(e).d}" ${STROKE}/>`).join("");
  // 全闭：一条往下弯的弧，像眯着眼
  const shut = EYES.map((e) => `<path d="M${e.cx - e.rx * 0.95} ${e.cy + e.ry * 0.05} Q${e.cx} ${e.cy + e.ry * 0.7} ${e.cx + e.rx * 0.95} ${e.cy + e.ry * 0.05}" ${STROKE}/>`).join("");
  el.innerHTML = `<svg class="qiqi-ava" viewBox="0 0 256 256" aria-hidden="true"><defs>${defs}</defs>
    <image href="/qiqi-base.png" width="256" height="256"/>${irises}
    <g class="half" display="none">${half}</g>
    <g class="shut" display="none"><image href="/qiqi-closed.png" width="256" height="256"/>${shut}</g></svg>`;
  const svg = el.firstElementChild;
  const iris = [...svg.querySelectorAll(".iris")];
  const halfG = svg.querySelector(".half"), shutG = svg.querySelector(".shut");

  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let thinking = false, mouse = null, movedAt = 0, wander = [0, 0];
  const look = (x, y) => iris.forEach((im) => (im.style.transform = `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)`));

  function aim() {
    if (thinking) return look(LOOK * 0.8, -LOOK * 0.8); // 抬头看右上角的星星
    if (mouse && Date.now() - movedAt < 4000) {
      const r = svg.getBoundingClientRect();
      const dx = mouse[0] - (r.left + r.width * 0.6), dy = mouse[1] - (r.top + r.height * 0.64);
      const d = Math.hypot(dx, dy) || 1, k = Math.min(1, d / 240) * LOOK;
      return look((dx / d) * k, (dy / d) * k);
    }
    look(wander[0], wander[1]);
  }

  const frame = (h, s) => { halfG.setAttribute("display", h ? "inline" : "none"); shutG.setAttribute("display", s ? "inline" : "none"); };
  function blink() {
    frame(1, 0);
    setTimeout(() => frame(0, 1), 45);
    setTimeout(() => frame(1, 0), 140);
    setTimeout(() => frame(0, 0), 185);
  }
  function blinkLoop() {
    // 每 2.5–6 秒眨一次，偶尔连眨两下；页面在后台就不眨
    setTimeout(() => {
      if (!document.hidden) { blink(); if (Math.random() < 0.2) setTimeout(blink, 300); }
      blinkLoop();
    }, 2500 + Math.random() * 3500);
  }
  function drift() {
    // 鼠标不动时，偶尔自己东张西望一下，多数时候看正前方
    setTimeout(() => {
      wander = Math.random() < 0.55 ? [0, 0] : [(Math.random() * 2 - 1) * LOOK, (Math.random() * 2 - 1) * LOOK * 0.6];
      aim();
      drift();
    }, 1800 + Math.random() * 2500);
  }

  if (!still) {
    blinkLoop();
    drift();
    addEventListener("pointermove", (e) => { mouse = [e.clientX, e.clientY]; movedAt = Date.now(); aim(); }, { passive: true });
  }
  return {
    think(on) { if (on !== thinking) { thinking = on; if (!still) aim(); } }, // 减少动态效果时连“看星星”也不动
    blink,
  };
}
