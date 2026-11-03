// 呼出菜单 + 沉浸模式。
// 呼出菜单：⌘J / Ctrl+J、在空白处点右键、或点左上角的进度名牌，在手边弹出一竖列圆形按钮（奇奇、各个宝、新建、看板、设置），
//   选一个宝，右边展开它的主对话和讨论串。方向键上下选、→ 展开、← 收回、Enter 打开、Esc 关掉。
// 沉浸模式（设置 › 外观 › 界面）：平时只留中间的对话，左上角一块名牌显示当前对话和今天任务的进度条，要去别处就呼出菜单。
// 音效（设置 › 外观）：用 WebAudio 现合成的短提示音，不带音频文件，默认关。
// 依赖 index.html 里的全局：tree、current、unread、open、openBao、openBoard、openSettings、loadTree、openPeek、avatar、esc、mainOf、threads、DEFAULT_BAO
(function () {
  const LAYOUT = "kiki.layout", SOUND = "kiki.menuSound";
  const read = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
  const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- 沉浸模式 ----------
  const focusOn = () => read(LAYOUT) === "focus";
  function applyLayout() { document.body.classList.toggle("focus", focusOn()); refresh(); }

  // ---------- 音效 ----------
  let ac = null;
  function beep(kind) {
    if (read(SOUND) !== "on") return;
    try {
      ac = ac || new (window.AudioContext || window.webkitAudioContext)();
      const notes = { open: [880, 1320], pick: [1175], close: [990, 660], hover: [1568] }[kind] || [1000];
      notes.forEach((f, i) => {
        const o = ac.createOscillator(), g = ac.createGain(), t = ac.currentTime + i * 0.06;
        o.type = "sine"; o.frequency.value = f;
        g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(kind === "hover" ? 0.03 : 0.08, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
        o.connect(g).connect(ac.destination); o.start(t); o.stop(t + 0.14);
      });
    } catch {}
  }

  // ---------- 名牌：当前对话 + 今天任务的进度条 ----------
  const today = (iso) => iso && new Date(iso).toDateString() === new Date().toDateString();
  function progress() {
    const ts = (tree.tasks || []).filter((t) => t.status !== "cancelled" && (today(t.when) || today(t.finished) || (["todo", "queued", "running", "blocked"].includes(t.status) && !t.when && today(t.created))));
    const done = ts.filter((t) => t.status === "done").length;
    return { done, total: ts.length };
  }
  function refresh() {
    const hp = document.getElementById("hp");
    if (!hp || typeof tree === "undefined") return;
    const s = current === "main" ? null : findSession(current);
    const who = s ? s.agent : DEFAULT_BAO;
    const { done, total } = progress();
    const ratio = total ? done / total : 1;
    hp.querySelector(".hp-ava").innerHTML = who === DEFAULT_BAO ? '<img src="/qiqi.png" alt="">' : avatar(who);
    hp.querySelector(".hp-name").textContent = who;
    hp.querySelector(".hp-fill").style.width = Math.round(ratio * 100) + "%";
    hp.dataset.level = ratio > 0.5 ? "high" : ratio > 0.2 ? "mid" : "low";
    hp.querySelector(".hp-num").textContent = total ? `今日 ${done} / ${total}` : "今日无任务";
    hp.title = total ? `今天的任务做完了 ${done} 件，共 ${total} 件。点一下（或 ⌘J）呼出菜单` : "今天没有任务。点一下（或 ⌘J）呼出菜单";
  }
  const findSession = (path) => { for (const a of tree.agents) for (const s of a.sessions) if (s.path === path) return s; };

  // ---------- 菜单 ----------
  const ICON = {
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
    board: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16M15 4v16"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M2 12h3M19 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>',
    chat: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z"/></svg>',
  };
  let box = null, items = [], idx = 0, sub = null, subIdx = -1, lastFocus = null;

  function entries() {
    const list = [{ kind: "main", label: "奇奇", ava: '<img src="/qiqi.png" alt="">', on: current === "main", dot: unread.has("main") }];
    for (const a of tree.agents.filter((x) => x.name !== DEFAULT_BAO)) {
      const m = mainOf(a), ss = a.sessions;
      list.push({ kind: "bao", name: a.name, label: a.name, ava: avatar(a.name), on: ss.some((s) => s.path === current), dot: ss.some((s) => unread.has(s.path)), busy: ss.some((s) => s.busy), main: m });
    }
    list.push({ kind: "new", label: "新建一个宝", ava: ICON.plus });
    list.push({ kind: "board", label: "任务看板", ava: ICON.board });
    list.push({ kind: "settings", label: "设置", ava: ICON.gear });
    return list;
  }

  function show(x, y, exact) {
    if (box) close(true);
    lastFocus = document.activeElement;
    items = entries();
    box = document.createElement("div");
    box.id = "ring-menu";
    box.setAttribute("role", "menu");
    box.setAttribute("aria-label", "菜单");
    box.innerHTML = `<div class="rm-col">${items.map((it, i) => `
      <button class="rm-btn${it.on ? " on" : ""}" role="menuitem" data-i="${i}" style="--i:${i}" aria-label="${esc(it.label)}"${it.kind === "bao" ? ' aria-haspopup="true"' : ""}>
        <span class="rm-ico">${it.ava}</span><span class="rm-label">${esc(it.label)}</span>${it.busy ? '<span class="rm-busy"></span>' : it.dot ? '<span class="rm-dot"></span>' : ""}
      </button>`).join("")}</div>`;
    document.body.appendChild(box);
    // 放在手边：以点的位置为中心往下排，碰到窗口边就往里收
    const r = box.getBoundingClientRect(), pad = 12;
    const off = exact ? 0 : 28; // 右键：让点到的位置落在第一个按钮中间；从名牌、快捷键呼出：从给的位置往下排
    const left = Math.min(Math.max(pad, x - off), innerWidth - r.width - 280 - pad);
    const top = Math.min(Math.max(pad, y - off), innerHeight - r.height - pad);
    box.style.left = Math.max(pad, left) + "px"; box.style.top = top + "px";
    box.addEventListener("click", onClick);
    box.addEventListener("mouseover", onHover);
    box.addEventListener("keydown", onKey);
    idx = Math.max(0, items.findIndex((it) => it.on));
    focusItem(idx);
    beep("open");
    if (reduced()) box.classList.add("still");
  }

  function close(silent) {
    if (!box) return;
    const b = box; box = null; sub = null;
    if (!silent) beep("close");
    if (reduced()) b.remove(); else { b.classList.add("out"); setTimeout(() => b.remove(), 160); }
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus?.();
  }

  function focusItem(i) {
    idx = (i + items.length) % items.length;
    box.querySelectorAll(".rm-btn").forEach((b, n) => b.classList.toggle("hl", n === idx));
    box.querySelectorAll(".rm-btn")[idx].focus();
    const it = items[idx];
    if (it.kind === "bao") openSub(idx); else closeSub();
  }

  function openSub(i) {
    const it = items[i];
    if (sub && sub.dataset.for === String(i)) return;
    closeSub();
    const a = tree.agents.find((x) => x.name === it.name);
    if (!a) return;
    const rows = [];
    rows.push({ kind: "bao-main", label: "主对话", path: it.main?.path, name: a.name });
    for (const s of threads(a)) rows.push({ kind: "thread", label: s.name, path: s.path, busy: s.busy, dot: unread.has(s.path) });
    rows.push({ kind: "new-thread", label: "新开讨论串", name: a.name });
    sub = document.createElement("div");
    sub.className = "rm-sub";
    sub.dataset.for = String(i);
    sub.setAttribute("role", "menu");
    sub.innerHTML = `<div class="rm-sub-head">${esc(a.name)}</div><div class="rm-rows">` + rows.map((r, n) => `
      <button class="rm-row${r.path && r.path === current ? " on" : ""}" role="menuitem" data-r="${n}" style="--i:${n}">
        <span class="rm-row-ico">${r.kind === "new-thread" ? ICON.plus : ICON.chat}</span><span class="rm-row-label">${esc(r.label)}</span>${r.busy ? '<span class="rm-busy"></span>' : r.dot ? '<span class="rm-dot"></span>' : ""}
      </button>`).join("") + "</div>";
    sub._rows = rows;
    const btn = box.querySelectorAll(".rm-btn")[i];
    box.appendChild(sub);
    // 和按钮对齐，中间一个小三角（::before）指回按钮
    const bt = btn.offsetTop + btn.offsetHeight / 2;
    sub.style.top = Math.max(0, bt - 30) + "px";
    sub.style.setProperty("--arrow", Math.min(bt - Math.max(0, bt - 30), 400) + "px");
    subIdx = -1;
  }
  function closeSub() { sub?.remove(); sub = null; subIdx = -1; }

  async function pick(it) {
    beep("pick");
    close(true);
    if (it.kind === "main") return open("main");
    if (it.kind === "bao") return openBao(it.name);
    if (it.kind === "new") return document.getElementById("add-bao")?.click();
    if (it.kind === "board") return openBoard();
    if (it.kind === "settings") return openSettings();
  }
  function pickRow(r) {
    beep("pick");
    close(true);
    if (r.kind === "bao-main") return openBao(r.name);
    if (r.kind === "thread") return openPeek(r.path, true); // 和别处一样：讨论串在右边打开，主对话留在中间
    if (r.kind === "new-thread") return newThread(r.name);
  }

  // 新开讨论串：用当前时间起个名字，开好直接进去（摘要会说明它在聊什么）
  async function newThread(agent) {
    const d = new Date(), name = `新讨论串 ${d.getMonth() + 1}-${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
    const r = await fetch("/api/new", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ agent, name }) });
    if (!r.ok) return;
    const data = await r.json();
    await loadTree();
    return openPeek(data.path, true);
  }

  function onClick(e) {
    const b = e.target.closest(".rm-btn");
    if (b) { const it = items[+b.dataset.i]; return it.kind === "bao" && !sub ? openSub(+b.dataset.i) : pick(it); }
    const r = e.target.closest(".rm-row");
    if (r) return pickRow(sub._rows[+r.dataset.r]);
  }
  function onHover(e) {
    const b = e.target.closest(".rm-btn");
    if (b && +b.dataset.i !== idx) { beep("hover"); focusItem(+b.dataset.i); }
  }
  function onKey(e) {
    const rows = sub ? [...sub.querySelectorAll(".rm-row")] : [];
    const inSub = subIdx >= 0;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); return inSub ? (subIdx = -1, focusItem(idx)) : close(); }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const d = e.key === "ArrowDown" ? 1 : -1;
      if (inSub) { subIdx = (subIdx + d + rows.length) % rows.length; rows[subIdx].focus(); } else focusItem(idx + d);
      return;
    }
    if (e.key === "ArrowRight" && !inSub && rows.length) { e.preventDefault(); subIdx = 0; rows[0].focus(); return; }
    if (e.key === "ArrowLeft" && inSub) { e.preventDefault(); subIdx = -1; focusItem(idx); return; }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (inSub) return pickRow(sub._rows[subIdx]);
      return pick(items[idx]);
    }
  }

  // ---------- 怎么呼出 ----------
  document.addEventListener("keydown", (e) => {
    if (e.key.toLowerCase() === "j" && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      if (box) return close();
      const hp = document.getElementById("hp"), r = (focusOn() && hp ? hp : document.querySelector("main")).getBoundingClientRect();
      show(r.left + (focusOn() ? 0 : 24), r.top + (focusOn() ? r.height + 10 : 64), true);
    }
  });
  // 右键：在对话区的空白处（不是文字、链接、输入框上），弹出菜单代替浏览器菜单
  document.addEventListener("contextmenu", (e) => {
    const t = e.target;
    if (t.closest("input, textarea, a, pre, code, img, #ring-menu, #ctx, #sheet, #newbao, #board")) return;
    if (!t.closest("#log, #peek-log, header, aside, #panel")) return;
    if (String(getSelection())) return; // 选了文字，留给复制
    if (t.closest(".msg") && t.closest(".msg").textContent.trim() && t !== t.closest(".msgs")) return;
    e.preventDefault();
    show(e.clientX, e.clientY);
  });
  document.addEventListener("mousedown", (e) => { if (box && !e.target.closest("#ring-menu")) close(); }, true);
  window.addEventListener("blur", () => close(true));
  window.addEventListener("resize", () => close(true));
  window.addEventListener("storage", (e) => { if (e.key === LAYOUT || e.key === null) applyLayout(); });

  document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("hp")?.addEventListener("click", (e) => {
      if (box) return close();
      const r = e.currentTarget.getBoundingClientRect();
      show(r.left, r.bottom + 10, true);
    });
    applyLayout();
  });

  window.kikiMenu = { show, close, refresh, applyLayout };
})();
