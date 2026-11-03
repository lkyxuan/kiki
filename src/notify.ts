// 通知通道：收件箱是“进”，通知是“出”，两边分开。
// 收发室（以后还有定时任务、后台任务）要告诉你一件事时，只管调 notifier.send(...)，
// 至于发到哪（Kiki 界面、以后的 Telegram、微信、手机推送），由这里挂了哪些通道决定。
// 现在只有一种：Kiki 界面（奇奇的聊天里多一条）。以后的通道写成插件，实现 NotifyChannel 再 add 进来。

export interface Notice {
  title: string;
  text: string;
  urgent?: boolean; // 要你亲自看的（出错、对方标了要看）；以后的手机推送可以只推这种
  source?: string; // 从哪来的，比如 收发室 · grokbot
}

export interface NotifyChannel {
  id: string; // kiki-ui、telegram、wechat……
  name: string;
  send(n: Notice): Promise<void> | void;
}

export class Notifier {
  private channels = new Map<string, NotifyChannel>();

  add(ch: NotifyChannel) {
    this.channels.set(ch.id, ch);
  }

  list() {
    return [...this.channels.values()].map((c) => ({ id: c.id, name: c.name }));
  }

  /** 发给每个通道；某个通道出错不影响别的。 */
  async send(n: Notice) {
    await Promise.all(
      [...this.channels.values()].map(async (c) => {
        try {
          await c.send(n);
        } catch (e) {
          console.warn(`[notify] ${c.name} 没发出去：${(e as Error).message}`);
        }
      }),
    );
  }
}
