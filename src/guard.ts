// 访问守卫：Kiki 能在你的电脑上跑命令，所以只接受"你自己"的请求。
//   1. Host 必须是本机名、Tailscale 域名（*.ts.net）或 Tailscale 的内网 IP（100.64.0.0/10、fd7a:115c:a1e0::/48），挡住 DNS 重绑定。
//   2. 改东西的请求（POST）如果带 Origin，必须和 Host 一致，挡住别的网页偷偷发请求（CSRF）。
// 别的主机名要放行就写进 KIKI_ALLOWED_HOSTS（逗号分隔）。
import type { IncomingMessage } from "node:http";

// 每次现读：这个模块比 main.ts 读 .env 更早加载
const extra = () =>
  (process.env.KIKI_ALLOWED_HOSTS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);

const hostname = (host: string) => host.toLowerCase().replace(/:\d+$/, "").replace(/^\[|\]$/g, "");

// Tailscale 给每台设备分的 IP：IPv4 在 100.64.0.0/10，IPv6 在 fd7a:115c:a1e0::/48
function tailscaleIp(h: string): boolean {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h);
  if (m) {
    const [a, b, c, d] = m.slice(1).map(Number);
    return a === 100 && b >= 64 && b <= 127 && c <= 255 && d <= 255;
  }
  return h.startsWith("fd7a:115c:a1e0:");
}

export function allowedHost(host: string | undefined): boolean {
  if (!host) return false;
  const h = hostname(host);
  return h === "localhost" || h === "127.0.0.1" || h === "::1" || h.endsWith(".ts.net") || tailscaleIp(h) || extra().includes(h);
}

/** 返回拒绝原因；放行返回 undefined。 */
export function rejectReason(req: IncomingMessage): string | undefined {
  const host = req.headers.host;
  if (!allowedHost(host)) return `不认识的主机名 ${host}`;
  const origin = req.headers.origin;
  if (req.method !== "GET" && req.method !== "HEAD" && origin) {
    try {
      // 经 Tailscale Serve 这类反向代理时，原始主机名可能在 X-Forwarded-Host 里
      const o = new URL(origin).host.toLowerCase();
      const fwd = String(req.headers["x-forwarded-host"] ?? "").toLowerCase();
      if (o !== host!.toLowerCase() && o !== fwd) return "跨站请求";
    } catch {
      return "跨站请求";
    }
  }
}
