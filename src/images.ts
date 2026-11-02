// 聊天里的图片：网页先把图片传上来存进 <数据目录>/uploads/，消息正文里只放一个标记
//   ![图片](/api/image/<名字>)
// 这样图片能跟着文字走完整条路（奇奇分派、拆分、交接、后台任务都只传文字），
// 到真正发给模型的那一刻（agents.send）才把标记换成图片本身。网页显示时把标记画成缩略图。
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

export interface ImagePart {
  type: "image";
  data: string; // base64
  mimeType: string;
}

const MIME: Record<string, string> = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp" };
const EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif", "image/webp": "webp" };
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

/** 图片文件名：内容哈希 + 扩展名，同一张图只存一份。 */
export const validImageName = (n: string) => /^[a-f0-9]{32}\.(png|jpg|gif|webp)$/.test(n);
export const imageMime = (n: string) => MIME[n.split(".").pop() ?? ""] ?? "application/octet-stream";
export const uploadsDir = (dataDir: string) => join(dataDir, "uploads");

const MARK = /!\[图片\]\(\/api\/image\/([a-f0-9]{32}\.(?:png|jpg|gif|webp))\)/g;

/** 存一张图（data: URL），返回要放进消息里的标记。 */
export function saveImage(dataDir: string, dataUrl: string): string {
  const m = /^data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl);
  if (!m) throw new Error("只支持 PNG、JPG、GIF、WebP 图片");
  const buf = Buffer.from(m[2], "base64");
  if (buf.length > MAX_IMAGE_BYTES) throw new Error("图片太大了，最多 10MB");
  const name = `${createHash("sha256").update(buf).digest("hex").slice(0, 32)}.${EXT[m[1]]}`;
  const dir = uploadsDir(dataDir);
  mkdirSync(dir, { recursive: true });
  const f = join(dir, name);
  if (!existsSync(f)) writeFileSync(f, buf);
  return `![图片](/api/image/${name})`;
}

/** 消息里图片的文件名（按出现顺序，去重）。 */
export const imageNames = (text: string) => [...new Set([...text.matchAll(MARK)].map((m) => m[1]))];

/** 读一张已存的图；没有这个文件返回 undefined。 */
export function readImage(dataDir: string, name: string): ImagePart | undefined {
  const f = join(uploadsDir(dataDir), name);
  if (!validImageName(name) || !existsSync(f)) return undefined;
  return { type: "image", data: readFileSync(f).toString("base64"), mimeType: imageMime(name) };
}

/**
 * 当前模型看不了图时（比如 DeepSeek），先让看图模型把图读成文字，附在消息后面（学的 Hermes）。
 * 包在 <kiki-image-note> 里：模型看得到，网页显示时收起来。
 */
export function imageNote(items: { name: string; text: string }[], by: string): string {
  const body = items
    .map((i) => `[用户附了一张图片（${i.name}），${by} 看到的内容：\n${i.text}]`)
    .join("\n");
  return `\n\n<kiki-image-note>\n${body}\n[你自己看不到图片，上面是别的模型读出来的文字。要看细节就用 kiki_look 工具，image 填文件名，question 写要看什么。]\n</kiki-image-note>`;
}

/** 消息里有没有图片标记。 */
export const hasImages = (text: string) => new RegExp(MARK.source).test(text);

/** 把消息里的图片标记读成图片（找不到的文件跳过）。文字原样保留，模型能看到“这里有张图”。 */
export function loadImages(dataDir: string, text: string): ImagePart[] {
  const out: ImagePart[] = [];
  for (const [, name] of text.matchAll(MARK)) {
    const f = join(uploadsDir(dataDir), name);
    if (!existsSync(f)) continue;
    out.push({ type: "image", data: readFileSync(f).toString("base64"), mimeType: imageMime(name) });
  }
  return out;
}
