// 把模型调用的常见报错翻成新用户看得懂的话：没填密钥、密钥不对、余额不足。
// 内核原话是英文，还带着 node_modules 里的文档路径和 /login 这种命令行用法，Kiki 里用不上。

const SETTINGS = "点左下角「设置 → 模型与密钥」";

/** 认得的报错换成中文说明；不认得的原样返回。 */
export function explainError(message: string): string {
  const missing = message.match(/No API key found for "?([\w-]+)"?|Provider is not configured: ([\w-]+)/);
  if (missing) {
    const provider = missing[1] ?? missing[2];
    if (provider.toLowerCase() === "deepseek")
      return `还没填模型密钥。${SETTINGS}，填上 DeepSeek API 密钥（到 https://platform.deepseek.com 申请），保存后就能用。`;
    return `还没登录 ${provider}，也没有填它的密钥。${SETTINGS}换一个已经配好的模型，或者补上 ${provider} 的密钥。`;
  }
  if (/\b401\b|Authentication Fails|invalid[ _-]?api[ _-]?key|Incorrect API key|Unauthorized/i.test(message))
    return `模型密钥不对或者已经失效。${SETTINGS}换一个新的密钥再试。（原话：${message.slice(0, 200)}）`;
  if (/\b402\b|Insufficient Balance|insufficient_quota/i.test(message))
    return `模型账户余额不足，充值后再试。（原话：${message.slice(0, 200)}）`;
  return message;
}
