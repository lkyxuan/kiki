// 给 pi 支持的各家模型服务商配置凭证：填 API 密钥，或者用订阅登录（ChatGPT、Claude Pro/Max、GitHub Copilot……）。
// 全部走 pi 自己的登录流程（ModelRuntime.login），凭证存在 <数据目录>/engine/auth.json，订阅登录 pi 会自动续期。
//
// 登录流程里 pi 会：给一个网址让你在浏览器里打开（auth_url）、给一个设备码（device_code）、
// 或者问你要一样东西（密钥、跳转后的网址、选项）。网页把这些显示出来，你填的东西再经 answer() 交回 pi。
// 订阅登录在 Mac mini 本机点时，浏览器会跳回本机，pi 自己接住；在别的电脑上点，把跳转后打不开的网址粘回来就行。
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { readPrefs } from "./modelprefs.js";

export type LoginType = "api_key" | "oauth";

export interface LoginPrompt {
  type: "text" | "secret" | "select" | "manual_code";
  message: string;
  placeholder?: string;
  options?: { id: string; label: string; description?: string }[];
}

export interface LoginState {
  status: "idle" | "waiting" | "done" | "error";
  provider?: string;
  type?: LoginType;
  url?: string; // 要在浏览器里打开的登录网址
  instructions?: string;
  deviceCode?: { userCode: string; verificationUri: string };
  prompt?: LoginPrompt; // 正在等你填的东西
  progress?: string;
  error?: string;
}

/** 一家服务商：能不能填密钥、能不能订阅登录、现在配好没有 */
export interface ProviderInfo {
  id: string;
  name: string;
  apiKey?: string; // 密钥叫什么，比如 "Anthropic API key"；不支持填密钥就没有
  oauth?: string; // 订阅登录叫什么，比如 "Anthropic (Claude Pro/Max)"
  configured: boolean;
  source?: string; // 凭证从哪来：auth.json / 环境变量 / …
  oauthActive: boolean; // 现在用的是订阅登录
  on: boolean; // 设置里的开关（配好了且没关掉）
  models: number;
}

/** 菜单里不列的服务商：被 openai 的 ChatGPT 登录取代的老入口，和只做分类的 */
const HIDDEN = new Set(["openai-codex", "typesafe"]);

export class Logins {
  state: LoginState = { status: "idle" };
  private abort?: AbortController;
  private pending?: { resolve: (v: string) => void; reject: (e: Error) => void };

  constructor(
    private runtime: () => Promise<ModelRuntime>,
    private dataDir: string,
    private engineDir: string,
  ) {}

  async providers(): Promise<ProviderInfo[]> {
    const rt = await this.runtime();
    const off = new Set(readPrefs(this.dataDir).off);
    return (rt.getProviders() as any[])
      .filter((p) => !HIDDEN.has(p.id))
      .map((p) => {
        const st: any = rt.getProviderAuthStatus(p.id) ?? {};
        return {
          id: p.id,
          name: p.name ?? p.id,
          apiKey: p.auth?.apiKey?.login ? p.auth.apiKey.name : undefined,
          oauth: p.auth?.oauth ? p.auth.oauth.name : undefined,
          configured: !!st.configured,
          source: st.label ?? st.source,
          oauthActive: rt.isUsingOAuth(p.id),
          on: !!st.configured && !off.has(p.id),
          models: rt.getModels(p.id).length,
        };
      })
      .sort((a, b) => Number(b.on) - Number(a.on) || Number(b.configured) - Number(a.configured) || a.name.localeCompare(b.name));
  }

  async loggedIn(provider: string): Promise<boolean> {
    return (await this.runtime()).isUsingOAuth(provider);
  }

  /** 开始登录，等到第一步要你做的事（打开网址 / 填东西）或者结束就返回。 */
  async start(provider: string, type: LoginType): Promise<LoginState> {
    this.cancel();
    const rt = await this.runtime();
    if (!rt.getProvider(provider)) throw new Error(`没有服务商 ${provider}`);
    const abort = (this.abort = new AbortController());
    this.state = { status: "waiting", provider, type };
    let step!: () => void;
    let stepped = new Promise<void>((r) => (step = r));
    const mine = () => this.abort === abort;
    const deviceId = SettingsManager.create(this.dataDir, this.engineDir).getOrCreateDeviceId();
    rt.login(
      provider,
      type,
      {
        signal: abort.signal,
        notify: (ev: any) => {
          if (!mine()) return;
          if (ev.type === "auth_url") this.state = { ...this.state, url: ev.url, instructions: ev.instructions };
          else if (ev.type === "device_code") this.state = { ...this.state, deviceCode: { userCode: ev.userCode, verificationUri: ev.verificationUri } };
          else if (ev.type === "progress" || ev.type === "info") this.state = { ...this.state, progress: ev.message };
          step();
        },
        prompt: (p: any) =>
          new Promise<string>((resolve, reject) => {
            if (!mine()) return reject(new Error("aborted"));
            this.state = { ...this.state, prompt: { type: p.type, message: p.message, placeholder: p.placeholder, options: p.options } };
            this.pending = { resolve, reject };
            p.signal?.addEventListener("abort", () => {
              if (this.pending?.resolve === resolve) {
                this.pending = undefined;
                if (mine()) this.state = { ...this.state, prompt: undefined };
              }
              reject(new Error("aborted"));
            });
            step();
          }),
      },
      { getDeviceId: () => deviceId, agentName: "Kiki" },
    )
      .then(() => {
        if (mine()) this.state = { status: "done", provider, type };
      })
      .catch((e: Error) => {
        if (mine() && !abort.signal.aborted) this.state = { status: "error", provider, type, error: e.message };
      })
      .finally(() => {
        if (mine()) this.pending = undefined;
        step();
      });
    await Promise.race([stepped, new Promise((r) => setTimeout(r, 10_000))]);
    return this.state;
  }

  /** 把你填的东西（密钥、跳转后的网址、选项 id）交给正在等的那一步。 */
  async answer(value: string): Promise<LoginState> {
    const p = this.pending;
    if (!p) throw new Error("现在没有在等你填东西");
    this.pending = undefined;
    this.state = { ...this.state, prompt: undefined, progress: "正在处理…" };
    p.resolve(value.trim());
    // 等一下：可能马上就完成，或者还有下一步要填
    for (let i = 0; i < 30 && this.state.status === "waiting" && !this.state.prompt; i++) await new Promise((r) => setTimeout(r, 200));
    return this.state;
  }

  cancel() {
    this.abort?.abort();
    this.pending?.reject(new Error("aborted"));
    this.abort = undefined;
    this.pending = undefined;
    if (this.state.status === "waiting") this.state = { status: "idle" };
  }

  async logout(provider: string) {
    if (this.state.provider === provider) this.cancel();
    await (await this.runtime()).logout(provider);
    if (this.state.provider === provider) this.state = { status: "idle" };
  }
}
