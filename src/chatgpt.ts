// 用 ChatGPT 订阅登录（pi 自带的「Sign in with ChatGPT」，走订阅额度，不要 API Key）。
// 流程：点登录 → pi 给出一个 OpenAI 登录网址 → 在浏览器里登完。
//   在 Mac mini 本机点：浏览器跳回 localhost:1455，pi 自己接住，自动完成。
//   在别的电脑远程点：跳回的 localhost 页面打不开，把地址栏里那个网址整段粘回 Kiki 就行。
// 凭证存在 <数据目录>/engine/auth.json，pi 会自动续期。
import { SettingsManager } from "@earendil-works/pi-coding-agent";
import type { ModelRuntime } from "@earendil-works/pi-coding-agent";

export const CHATGPT_PROVIDER = "openai";

export interface LoginState {
  status: "idle" | "waiting" | "done" | "error";
  url?: string; // 要在浏览器里打开的登录网址
  error?: string;
}

export class ChatGPTLogin {
  state: LoginState = { status: "idle" };
  private abort?: AbortController;
  private paste?: (input: string) => void;

  constructor(
    private runtime: () => Promise<ModelRuntime>,
    private dataDir: string,
    private engineDir: string,
  ) {}

  async loggedIn(): Promise<boolean> {
    const rt = await this.runtime();
    return rt.isUsingOAuth(CHATGPT_PROVIDER);
  }

  /** 开始登录，等到拿到登录网址（或出错）就返回。 */
  async start(): Promise<LoginState> {
    this.cancel();
    const rt = await this.runtime();
    const abort = (this.abort = new AbortController());
    this.state = { status: "waiting" };
    let gotUrl!: () => void;
    const urlReady = new Promise<void>((r) => (gotUrl = r));
    const deviceId = SettingsManager.create(this.dataDir, this.engineDir).getOrCreateDeviceId();
    rt.login(
      CHATGPT_PROVIDER,
      "oauth",
      {
        signal: abort.signal,
        notify: (ev) => {
          if (ev.type === "auth_url") {
            this.state = { status: "waiting", url: ev.url };
            gotUrl();
          }
        },
        prompt: (p) =>
          new Promise<string>((resolve, reject) => {
            if (p.type !== "manual_code" && p.type !== "text") return reject(new Error("Kiki 不支持这种登录步骤"));
            this.paste = resolve;
            p.signal?.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      },
      { getDeviceId: () => deviceId, agentName: "Kiki" },
    )
      .then(() => {
        if (this.abort === abort) this.state = { status: "done" };
      })
      .catch((e: Error) => {
        if (this.abort === abort && !abort.signal.aborted) this.state = { status: "error", error: e.message };
      })
      .finally(() => {
        gotUrl();
        if (this.abort === abort) this.paste = undefined;
      });
    await Promise.race([urlReady, new Promise((r) => setTimeout(r, 10_000))]);
    return this.state;
  }

  /** 远程登录：把浏览器最后跳到的网址（或授权码）粘回来。 */
  submit(input: string) {
    if (!this.paste) throw new Error("现在没有在登录");
    this.paste(input.trim());
  }

  cancel() {
    this.abort?.abort();
    this.abort = undefined;
    this.paste = undefined;
    if (this.state.status === "waiting") this.state = { status: "idle" };
  }

  async logout() {
    this.cancel();
    await (await this.runtime()).logout(CHATGPT_PROVIDER);
    this.state = { status: "idle" };
  }
}
