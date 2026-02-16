import fs from 'node:fs';
import path from 'node:path';

const SECRET_PATTERNS: Array<{ name: string; regex: RegExp }> = [
  { name: 'OpenAI key', regex: /sk-[A-Za-z0-9]{20,}/ },
  { name: 'AWS access key', regex: /AKIA[0-9A-Z]{16}/ },
  { name: 'Generic bearer token', regex: /bearer\s+[A-Za-z0-9._-]{20,}/i }
];

function walk(dir: string, acc: string[]): void {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (['node_modules', '.git', 'dist', '.growthos'].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, acc);
    } else {
      acc.push(full);
    }
  }
}

export function detectPotentialSecrets(rootDir: string): Array<{ file: string; detector: string }> {
  const files: string[] = [];
  walk(rootDir, files);

  const findings: Array<{ file: string; detector: string }> = [];
  for (const file of files) {
    let content = '';
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    for (const p of SECRET_PATTERNS) {
      if (p.regex.test(content)) {
        findings.push({ file, detector: p.name });
      }
    }
  }
  return findings;
}

export function assertNoRepoSecrets(rootDir: string): void {
  const findings = detectPotentialSecrets(rootDir);
  if (findings.length) {
    const lines = findings.map((f) => `- ${f.file} (${f.detector})`).join('\n');
    throw new Error(`Potential secret-like patterns detected. Refusing operation:\n${lines}`);
  }
}

export function sanitizeOutput(text: string): string {
  let out = text;
  out = out.replace(/sk-[A-Za-z0-9]{20,}/g, '[REDACTED_OPENAI_KEY]');
  out = out.replace(/AKIA[0-9A-Z]{16}/g, '[REDACTED_AWS_KEY]');
  out = out.replace(/(bearer\\s+)[A-Za-z0-9._-]{20,}/gi, '$1[REDACTED_TOKEN]');
  return out;
}
