import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const forbiddenPaths = [
  /(^|\/)AGENTS(?:\.override)?\.md$/iu,
  /(^|\/)MAINTENANCE\.md$/iu,
  /(^|\/)SETTLED_HISTORY\.md$/iu,
  /(^|\/)\.codex-project-root$/iu,
  /(^|\/)\.codex(?:-|\/|$)/iu,
  /(^|\/)(?:node_modules|__pycache__|\.venv|dist|build|staging)(?:\/|$)/iu,
  /(^|\/)\.env(?:\.(?!example$).+)?$/iu,
  /\.(?:sav|srm|dsv|nds|gba|gbc|gb|3ds|cia)$/iu,
];
const forbiddenText = [
  { label: "Windows user path", pattern: /[A-Za-z]:[\\/]Users[\\/]/iu },
  { label: "private key", pattern: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/u },
  { label: "credential-like assignment", pattern: /(?:token|password|secret|api[_-]?key)\s*[:=]\s*["'](?!\$\{)[^"']{8,}["']/iu },
];

const result = spawnSync("git", ["ls-files", "-z"], {
  cwd: projectRoot,
  encoding: "buffer",
  windowsHide: true,
  maxBuffer: 64 * 1024 * 1024,
});
if (result.status !== 0) throw new Error(String(result.stderr || result.stdout).trim());
const tracked = result.stdout.toString("utf8").split("\0").filter(Boolean).sort();
for (const relativePath of tracked) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (forbiddenPaths.some(pattern => pattern.test(normalized))) throw new Error(`Forbidden tracked path: ${normalized}`);
  const absolute = path.join(projectRoot, relativePath);
  if (!fs.existsSync(absolute) || fs.statSync(absolute).size > 2_000_000) continue;
  if (!new Set([".css", ".html", ".js", ".json", ".md", ".mjs", ".ts", ".tsx", ".txt", ".yml", ".yaml"]).has(path.extname(relativePath).toLowerCase())) continue;
  const text = fs.readFileSync(absolute, "utf8");
  for (const rule of forbiddenText) if (rule.pattern.test(text)) throw new Error(`${rule.label} found in tracked file ${normalized}`);
}
console.log(JSON.stringify({ status: "repository-publication-valid", trackedFilesChecked: tracked.length }, null, 2));
