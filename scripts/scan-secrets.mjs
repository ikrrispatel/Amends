import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const IGNORED = ['node_modules', '.next', '.git', 'package-lock.json'];

function isLocalEnvFile(p) {
  const base = path.basename(p);
  return base === '.env.local' || /^\.env\..+\.local$/.test(base);
}

const rules = [
  { name: 'OPENAI_KEY', re: /sk-[a-zA-Z0-9]{20,}/i },
  { name: 'STRIPE_KEY', re: /(sk_test|sk_live)_[A-Za-z0-9]{8,}/i },
  { name: 'SLACK_TOKEN', re: /xox[baprs]-[a-zA-Z0-9-]{10,}/i },
  { name: 'NOTION_TOKEN', re: /secret_[A-Za-z0-9]{8,}/i },
  { name: 'PRIVATE_KEY', re: /-----BEGIN (?:RSA )?PRIVATE KEY-----/i },
  { name: 'ASSIGN_SECRET', re: /\b(?:[A-Z0-9_]+_API_KEY|[A-Z0-9_]+_SECRET|[A-Z0-9_]+_TOKEN|[A-Z0-9_]+_PASSWORD|DATABASE_URL)\s*=\s*["']?[^\s#"'`]{8,}/ },
];

function isIgnored(p) {
  return IGNORED.some((ig) => p === ig || p.includes(path.sep + ig + path.sep) || p.endsWith(path.sep + ig));
}

let found = false;

function scanFile(filePath) {
  const rel = path.relative(ROOT, filePath);
  if (isIgnored(rel) || isLocalEnvFile(rel)) return;
  try {
    const txt = fs.readFileSync(filePath, 'utf8');
    for (const r of rules) {
      if (rel === '.env.example' && r.name === 'ASSIGN_SECRET') continue;
      if (r.re.test(txt)) {
        console.log(`${rel}: ${r.name}`);
        found = true;
      }
    }
  } catch {
    // ignore binary or unreadable files
  }
}

function walk(dir) {
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    const stat = fs.statSync(p);
    if (stat.isDirectory()) {
      if (IGNORED.includes(name)) continue;
      walk(p);
    } else if (stat.isFile()) {
      scanFile(p);
    }
  }
}

walk(ROOT);

process.exit(found ? 1 : 0);
