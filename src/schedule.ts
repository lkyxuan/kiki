// 定时的写法：agent 和用户都用中文短语，Kiki 换算成本机时间。
// 一次性（when）："+30m" "+2h" "+1d"、"09:00"（今天，过了就明天）、"明天 09:00"、"后天 9:30"、
//              "周一 09:00"、"2026-11-05 09:00"，或者 ISO 时间。
// 重复（repeat）："每天 09:00"、"工作日 09:00"、"每周一 09:00"、"每小时"。原样存进任务文件，打开就看得懂。

const WEEK: Record<string, number> = { 日: 0, 天: 0, 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6 };

function hm(s: string | undefined): [number, number] | undefined {
  if (!s) return [9, 0]; // 只说"明天"不说几点，就早上 9 点
  const m = s.trim().match(/^(\d{1,2})(?:[:：点](\d{1,2})?)?分?$/);
  if (!m) return undefined;
  const h = Number(m[1]), min = Number(m[2] ?? 0);
  return h < 24 && min < 60 ? [h, min] : undefined;
}

function at(base: Date, dayOffset: number, [h, m]: [number, number]): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(h, m, 0, 0);
  return d;
}

/** 一次性时间 → Date；看不懂返回 undefined。 */
export function parseWhen(input: string, now = new Date()): Date | undefined {
  const s = input.trim();
  let m = s.match(/^\+(\d+)\s*(m|min|分钟|h|小时|d|天)$/i);
  if (m) {
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const ms = unit.startsWith("m") || unit === "分钟" ? 60_000 : unit.startsWith("h") || unit === "小时" ? 3_600_000 : 86_400_000;
    return new Date(now.getTime() + n * ms);
  }
  m = s.match(/^(今天|明天|后天)\s*(.*)$/);
  if (m) {
    const t = hm(m[2] || undefined);
    return t && at(now, { 今天: 0, 明天: 1, 后天: 2 }[m[1] as "今天"], t);
  }
  m = s.match(/^(?:下)?(?:周|星期|礼拜)([日天一二三四五六])\s*(.*)$/);
  if (m) {
    const t = hm(m[2] || undefined);
    if (!t) return undefined;
    if (s.startsWith("下")) {
      // "下周三"：下一周（从周一算起）的那天
      const toMonday = (1 - now.getDay() + 7) % 7 || 7;
      return at(now, toMonday + ((WEEK[m[1]] + 6) % 7), t);
    }
    const diff = (WEEK[m[1]] - now.getDay() + 7) % 7;
    const d = at(now, diff, t);
    return d <= now ? at(now, diff + 7, t) : d;
  }
  const t = hm(s);
  if (t && /^\d/.test(s)) {
    const d = at(now, 0, t);
    return d <= now ? at(now, 1, t) : d;
  }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})(?:[ T](\d{1,2}:\d{2}))?$/);
  if (m) {
    const [hh, mm] = hm(m[4]) ?? [9, 0];
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), hh, mm);
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** 重复规则在 after 之后的下一次；规则看不懂返回 undefined。 */
export function nextRun(repeat: string, after = new Date()): Date | undefined {
  const s = repeat.trim();
  if (/^每(个)?小时$/.test(s)) {
    const d = new Date(after);
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return d;
  }
  let m = s.match(/^(每天|工作日)\s*(.*)$/);
  if (m) {
    const t = hm(m[2] || undefined);
    if (!t) return undefined;
    for (let i = 0; i < 8; i++) {
      const d = at(after, i, t);
      if (d <= after) continue;
      if (m[1] === "工作日" && (d.getDay() === 0 || d.getDay() === 6)) continue;
      return d;
    }
  }
  m = s.match(/^每(?:周|星期)([日天一二三四五六])\s*(.*)$/);
  if (m) {
    const t = hm(m[2] || undefined);
    if (!t) return undefined;
    for (let i = 0; i < 8; i++) {
      const d = at(after, i, t);
      if (d > after && d.getDay() === WEEK[m[1]]) return d;
    }
  }
  return undefined;
}

/** 给人看的时间："今天 09:00"、"明天 21:30"、"11月5日 09:00"。 */
export function showTime(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  const t = `${p(d.getHours())}:${p(d.getMinutes())}`;
  const day = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diff = Math.round((day(d) - day(now)) / 86_400_000);
  if (diff === 0) return `今天 ${t}`;
  if (diff === 1) return `明天 ${t}`;
  if (diff === 2) return `后天 ${t}`;
  return `${d.getMonth() + 1}月${d.getDate()}日 ${t}`;
}
