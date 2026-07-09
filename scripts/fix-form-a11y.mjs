/**
 * Adiciona aria-label em controles sem nome acessível (não pula label wrapper).
 */
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.join(process.cwd(), 'src', 'contabilfacil');

function walk(dir, acc = []) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (p.endsWith('.tsx')) acc.push(p);
  }
  return acc;
}

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '').replace(/\{[^}]+\}/g, '').trim();
}

function getControlChunk(lines, start) {
  let chunk = '';
  for (let i = start; i < Math.min(start + 12, lines.length); i++) {
    chunk += lines[i] + '\n';
    if (/>/.test(lines[i])) break;
  }
  return chunk;
}

function extractLabel(lines, idx) {
  for (let i = idx - 1; i >= Math.max(0, idx - 10); i--) {
    const line = lines[i];
    const patterns = [
      /<label[^>]*>([^<{]+)</,
      /<span className=\{CF_LABEL\}>([^<]+)</,
      /<span className="[^"]*">([^<]+)</,
      /<label className="[^"]*">([^<]+)</,
    ];
    for (const re of patterns) {
      const m = line.match(re);
      if (m) return stripTags(m[1]);
    }
    const ph = line.match(/placeholder="([^"]+)"/);
    if (ph && i >= idx - 2) return stripTags(ph[1]);
  }
  return null;
}

function fixFile(filePath) {
  if (filePath.endsWith('FreeNumericInput.tsx')) return 0;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  let changed = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!/<(input|select|textarea|FreeNumericInput)\b/i.test(line)) continue;
    const chunk = getControlChunk(lines, i);
    if (/aria-label|aria-labelledby/.test(chunk)) continue;

    const label = extractLabel(lines, i);
    if (!label || label.length < 2) continue;

    const escaped = label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    if (/^\s*<(input|select|textarea|FreeNumericInput)\b/.test(lines[i])) {
      lines[i] = lines[i].replace(
        /<(input|select|textarea|FreeNumericInput)\b/,
        `<$1 aria-label="${escaped}"`,
      );
      changed++;
    }
  }

  if (changed > 0) {
    fs.writeFileSync(filePath, lines.join('\n'), 'utf8');
    console.log(path.relative(process.cwd(), filePath), changed);
  }
  return changed;
}

let total = 0;
for (const f of walk(ROOT)) total += fixFile(f);
console.log('TOTAL', total);
