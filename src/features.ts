// Kiki 自带能力的开关。状态存在 <数据目录>/features.json，只记关掉的：{"route": false}。
// 每次调用现读文件：设置页改了，下一段新开的对话就生效（已经打开的对话要重启 Kiki）。
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export const FEATURES = [
  { id: "route", name: "自动路由", desc: "收件箱的一句话由模型决定接进哪段对话；关掉后投进当前对话或默认的宝" },
  { id: "handoff", name: "交接新事", desc: "宝可以把新的事交给别的宝去开对话（kiki_handoff）" },
  { id: "peek", name: "看别的对话", desc: "宝可以读别的对话里说了什么（kiki_peek）" },
  { id: "relay", name: "捎话", desc: "宝可以给别的对话捎一句话（kiki_relay）" },
  { id: "remember", name: "记下来", desc: "宝可以把关于你的事记进“关于我”（kiki_remember）" },
  { id: "background", name: "后台任务", desc: "要干活的事开到后台去做，做完回报；卡住时停下来问你（kiki_ask_user）；关掉后一律直接聊" },
  { id: "schedule", name: "待办和定时", desc: "宝可以记待办、定时任务（每天/每周）、等某件事做完再做的事（kiki_task）" },
  { id: "postroom", name: "收发室", desc: "定时去外部 agent（信箱文件夹等）收消息、看状态，新消息交给奇奇分派；宝也能派活给它们（kiki_outside）" },
] as const;

export type FeatureId = (typeof FEATURES)[number]["id"];

const file = (dataDir: string) => join(dataDir, "features.json");

function read(dataDir: string): Record<string, boolean> {
  try {
    return existsSync(file(dataDir)) ? JSON.parse(readFileSync(file(dataDir), "utf8")) : {};
  } catch {
    return {}; // 文件写坏了就当全开，别让 Kiki 起不来
  }
}

/** 这个能力开着吗？默认开。 */
export function isOn(dataDir: string, id: FeatureId): boolean {
  return read(dataDir)[id] !== false;
}

export function listFeatures(dataDir: string) {
  const off = read(dataDir);
  return FEATURES.map((f) => ({ ...f, on: off[f.id] !== false }));
}

export function setFeature(dataDir: string, id: string, on: boolean) {
  if (!FEATURES.some((f) => f.id === id)) throw new Error(`没有这个能力 ${id}`);
  const state = read(dataDir);
  if (on) delete state[id];
  else state[id] = false;
  writeFileSync(file(dataDir), JSON.stringify(state, null, 2) + "\n");
}
