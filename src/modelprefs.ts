// 模型菜单里显示哪些：每家服务商一个开关，打开的那家再勾选要用哪几个模型。
// 存在 <数据目录>/models-menu.json：{ off: [服务商], models: { 服务商: [模型 id] } }。
// 没勾过的服务商：模型不多（≤10）就全列，多的话先列前 8 个，去设置里勾更多。
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface MenuPrefs {
  off: string[];
  models: Record<string, string[]>;
}

export const DEFAULT_PICK = 8;

export function readPrefs(dataDir: string): MenuPrefs {
  try {
    const j = JSON.parse(readFileSync(join(dataDir, "models-menu.json"), "utf8"));
    return { off: Array.isArray(j.off) ? j.off.map(String) : [], models: j.models && typeof j.models === "object" ? j.models : {} };
  } catch {
    return { off: [], models: {} };
  }
}

export function writePrefs(dataDir: string, p: MenuPrefs) {
  writeFileSync(join(dataDir, "models-menu.json"), JSON.stringify(p, null, 2) + "\n");
}

/** 这家服务商哪些模型进菜单（ids 是这家全部模型，按目录顺序）。 */
export function pickedIds(p: MenuPrefs, provider: string, ids: string[]): Set<string> {
  const chosen = p.models[provider];
  if (chosen) return new Set(chosen.filter((id) => ids.includes(id)));
  return new Set(ids.length <= 10 ? ids : ids.slice(0, DEFAULT_PICK));
}

export function setProviderOn(dataDir: string, provider: string, on: boolean) {
  const p = readPrefs(dataDir);
  p.off = p.off.filter((x) => x !== provider);
  if (!on) p.off.push(provider);
  writePrefs(dataDir, p);
}

export function setProviderModels(dataDir: string, provider: string, ids: string[]) {
  const p = readPrefs(dataDir);
  p.models[provider] = [...new Set(ids.map(String))];
  writePrefs(dataDir, p);
}

