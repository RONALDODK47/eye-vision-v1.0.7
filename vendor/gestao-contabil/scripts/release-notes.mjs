import { execSync } from "node:child_process";

function sh(cmd) {
  return execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], encoding: "utf8" }).trim();
}

function trySh(cmd) {
  try {
    return sh(cmd);
  } catch {
    return "";
  }
}

const tags = trySh('git tag --sort=-creatordate')
  .split(/\r?\n/)
  .map((t) => t.trim())
  .filter(Boolean);

const latestTag = tags[0] || null;
const range = latestTag ? `${latestTag}..HEAD` : "HEAD";
const header = latestTag ? `Mudanças desde ${latestTag}` : "Mudanças (sem tags ainda)";

const log = trySh(`git log ${range} --no-merges --pretty=format:"- %s (%h)"`);

process.stdout.write(`${header}\n\n`);
process.stdout.write(log ? `${log}\n` : "- (nenhuma mudança)\n");

