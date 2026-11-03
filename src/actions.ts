// “Kiki 做了什么”：自动做掉的危险动作（删除、强推、对外发送、花钱）都记一笔，能撤回的带撤回按钮。
// 不问你，但事后让你看得到、改得回来。记在 <数据目录>/actions.jsonl，一行一条；撤回时追加一行 {id, undone}。
import { EventEmitter } from "node:events";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { undo as runUndo, type Undo } from "./backup.js";

export interface Action {
  id: string;
  time: string;
  agent: string;
  path: string; // 哪段对话做的
  category: "delete" | "force" | "send" | "spend";
  categoryName: string;
  label: string;
  detail: string;
  note: string; // 怎么兜底的：已备份到哪、等了几秒没人撤回、记了多少钱
  undo?: Undo; // 没有就是撤不回（比如已经发出去的消息）
  undone?: string; // 撤回的时间
  undoNote?: string;
}

/** 事件：change 有新记录或撤回了（网页刷新） */
export class ActionLog extends EventEmitter {
  private seq = 0;
  constructor(readonly dataDir: string) {
    super();
  }
  private get file() {
    return join(this.dataDir, "actions.jsonl");
  }

  add(a: Omit<Action, "id" | "time">): Action {
    const full: Action = { id: `x${Date.now().toString(36)}${(this.seq++).toString(36)}`, time: new Date().toISOString(), ...a };
    mkdirSync(this.dataDir, { recursive: true });
    appendFileSync(this.file, JSON.stringify(full) + "\n");
    this.emit("change");
    return full;
  }

  /** 最近的在前 */
  list(limit = 50): Action[] {
    if (!existsSync(this.file)) return [];
    const all = new Map<string, Action>();
    for (const line of readFileSync(this.file, "utf8").split("\n")) {
      if (!line.trim()) continue;
      try {
        const x = JSON.parse(line);
        const had = all.get(x.id);
        all.set(x.id, had ? { ...had, ...x } : x);
      } catch {}
    }
    return [...all.values()].filter((a) => a.time).reverse().slice(0, limit);
  }

  undo(id: string): string {
    const a = this.list(1000).find((x) => x.id === id);
    if (!a) throw new Error("没找到这条记录");
    if (a.undone) throw new Error("已经撤回过了");
    if (!a.undo) throw new Error("这一步撤不回（比如消息已经发出去了）");
    const undoNote = runUndo(a.undo);
    appendFileSync(this.file, JSON.stringify({ id, undone: new Date().toISOString(), undoNote }) + "\n");
    this.emit("change");
    return undoNote;
  }
}
