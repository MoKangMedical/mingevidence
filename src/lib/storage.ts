import { promises as fs } from "node:fs";
import path from "node:path";

const dataRoot = path.join(process.cwd(), "data");

export function resolveDataPath(...segments: string[]) {
  return path.join(dataRoot, ...segments);
}

export async function readJsonFile<T>(...segments: string[]) {
  const target = resolveDataPath(...segments);
  const content = await fs.readFile(target, "utf8");
  return JSON.parse(content) as T;
}

export async function ensureDirectory(...segments: string[]) {
  const target = resolveDataPath(...segments);
  await fs.mkdir(target, { recursive: true });
  return target;
}

export async function appendJsonLine(relativeFilePath: string, payload: unknown) {
  const target = resolveDataPath(relativeFilePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.appendFile(target, `${JSON.stringify(payload)}\n`, "utf8");
}
