// Telegram 通道适配器：长轮询收消息，发消息时自动切成 4000 字一段。
// 只用 Bot API 和 fetch，不引第三方库。以后加微信就照这个接口再写一个。
import type { Channel, IncomingMessage } from "./channel.js";

export class TelegramChannel implements Channel {
  readonly name = "telegram";
  private api: string;
  private offset = 0;

  constructor(
    token: string,
    private allowed: Set<string>, // 允许的 chat id；为空时谁都不回，只打印 id
  ) {
    this.api = `https://api.telegram.org/bot${token}`;
  }

  private async call(method: string, body: object): Promise<any> {
    const res = await fetch(`${this.api}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const json: any = await res.json();
    if (!json.ok) throw new Error(`Telegram ${method}: ${json.description}`);
    return json.result;
  }

  async start(onMessage: (msg: IncomingMessage) => void): Promise<void> {
    for (;;) {
      try {
        const updates = await this.call("getUpdates", {
          offset: this.offset,
          timeout: 50,
          allowed_updates: ["message"],
        });
        for (const u of updates) {
          this.offset = u.update_id + 1;
          const m = u.message;
          if (!m?.text) continue;
          const chatId = String(m.chat.id);
          if (!this.allowed.has(chatId)) {
            console.log(`[telegram] 忽略未授权的聊天 ${chatId}（${m.from?.username ?? ""}）。要放行就把它加进 TELEGRAM_ALLOWED_CHATS`);
            continue;
          }
          onMessage({ chatId: `tg:${chatId}`, text: m.text });
        }
      } catch (e) {
        console.error("[telegram] 轮询出错，5 秒后重试：", (e as Error).message);
        await new Promise((r) => setTimeout(r, 5000));
      }
    }
  }

  async send(chatId: string, text: string): Promise<void> {
    const id = chatId.replace(/^tg:/, "");
    for (let i = 0; i < text.length || i === 0; i += 4000) {
      await this.call("sendMessage", { chat_id: id, text: text.slice(i, i + 4000) });
    }
  }

  async typing(chatId: string): Promise<void> {
    await this.call("sendChatAction", { chat_id: chatId.replace(/^tg:/, ""), action: "typing" }).catch(() => {});
  }
}
