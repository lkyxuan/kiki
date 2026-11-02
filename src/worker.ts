// 后台任务子程序的入口：主程序用 child_process.fork 起它，一个任务一个。说明见 workerhost.ts、workerchild.ts。
import { Agents } from "./agents.js";
import { serve } from "./workerchild.js";

process.title = "Kiki 后台任务";
serve(process, (dataDir, model) => new Agents(dataDir, model));
