// 对话名册：记下有哪些具名对话，以及每个聊天当前接在哪段对话上。
// 存成一个 JSON 文件，对话内容本身在 pi 的 JSONL 里，这里只放索引。
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";

export interface SessionRecord {
  agent: string; // agent 文件夹名，比如 dev、life
  name: string; // 对话名，同一个 agent 内唯一
  path: string; // pi 的 JSONL 文件路径
  created: string;
  background?: boolean; // /bg 开出来的
}

interface RegistryData {
  sessions: SessionRecord[];
  chats: Record<string, string>; // 聊天 id -> 当前对话的 path
}

export class Registry {
  private data: RegistryData = { sessions: [], chats: {} };

  constructor(private file: string) {
    if (existsSync(file)) this.data = JSON.parse(readFileSync(file, "utf8"));
  }

  private save() {
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    renameSync(tmp, this.file); // 先写临时文件再改名，避免写一半
  }

  add(rec: SessionRecord) {
    this.data.sessions.push(rec);
    this.save();
  }

  list(agent?: string): SessionRecord[] {
    return this.data.sessions.filter((s) => !agent || s.agent === agent);
  }

  get(agent: string, name: string): SessionRecord | undefined {
    return this.data.sessions.find((s) => s.agent === agent && s.name === name);
  }

  /** 按 "名字" 或 "agent/名字" 查找。名字在多个 agent 下重名时返回全部，让调用方要求写全。 */
  find(query: string): SessionRecord[] {
    const [a, n] = query.includes("/") ? query.split("/", 2) : [undefined, query];
    return this.data.sessions.filter((s) => s.name === n && (!a || s.agent === a));
  }

  byPath(path: string): SessionRecord | undefined {
    return this.data.sessions.find((s) => s.path === path);
  }

  /** 从名册里去掉一段对话；接在它上面的聊天也一并断开，免得下一句投到已删的对话。 */
  remove(path: string): SessionRecord | undefined {
    const rec = this.byPath(path);
    if (!rec) return undefined;
    this.data.sessions = this.data.sessions.filter((s) => s.path !== path);
    for (const [chat, p] of Object.entries(this.data.chats)) if (p === path) delete this.data.chats[chat];
    this.save();
    return rec;
  }

  /** 一段对话换了新文件（清空主对话用）：名册和接在上面的聊天都指向新文件。 */
  repoint(oldPath: string, newPath: string) {
    const rec = this.byPath(oldPath);
    if (!rec) return;
    rec.path = newPath;
    rec.created = new Date().toISOString();
    for (const [chat, p] of Object.entries(this.data.chats)) if (p === oldPath) this.data.chats[chat] = newPath;
    this.save();
  }

  current(chatId: string): SessionRecord | undefined {
    const p = this.data.chats[chatId];
    return p ? this.byPath(p) : undefined;
  }

  setCurrent(chatId: string, path: string) {
    this.data.chats[chatId] = path;
    this.save();
  }
}
