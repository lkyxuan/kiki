// 通道接口：路由器只认这个，不关心消息是 Telegram 还是微信来的。
export interface IncomingMessage {
  chatId: string; // 带通道前缀，比如 tg:12345，这样不同通道的聊天不会撞号
  text: string;
}

export interface Channel {
  readonly name: string;
  start(onMessage: (msg: IncomingMessage) => void): Promise<void>;
  send(chatId: string, text: string): Promise<void>;
  typing?(chatId: string): Promise<void>;
}
