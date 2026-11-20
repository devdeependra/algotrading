import { readFileSync } from 'node:fs';

/**
 * Minimal .env loader. Reads KEY=VALUE lines into `env` without overriding
 * variables that are already set, so a real environment always wins over the
 * file. Silently does nothing when the file is absent.
 */
export function loadDotEnv(path = '.env', env: NodeJS.ProcessEnv = process.env): void {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"));
    if (quoted) {
      value = value.slice(1, -1);
    } else {
      const hash = value.indexOf(' #');
      if (hash !== -1) value = value.slice(0, hash).trim();
    }
    if (env[key] === undefined) env[key] = value;
  }
}
