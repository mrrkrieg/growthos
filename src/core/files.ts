import fs from 'node:fs';
import path from 'node:path';

export function copyDirectory(src: string, dst: string): void {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const dstPath = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(srcPath, dstPath);
    } else {
      fs.copyFileSync(srcPath, dstPath);
    }
  }
}

export function writeJsonFile(pathname: string, value: unknown): void {
  fs.writeFileSync(pathname, JSON.stringify(value, null, 2), 'utf8');
}
