import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadDotEnv } from './dotenv.js';

function writeEnv(content: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'dotenv-'));
  const file = join(dir, '.env');
  writeFileSync(file, content);
  return file;
}

describe('loadDotEnv', () => {
  it('parses simple, quoted and commented lines', () => {
    const file = writeEnv(`
# comment
A=1
B="two words"
C='single'
D=value # trailing comment
E=has=equals
`);
    const env: NodeJS.ProcessEnv = {};
    loadDotEnv(file, env);
    expect(env).toEqual({ A: '1', B: 'two words', C: 'single', D: 'value', E: 'has=equals' });
  });

  it('does not override variables already set', () => {
    const file = writeEnv('A=file\n');
    const env: NodeJS.ProcessEnv = { A: 'real' };
    loadDotEnv(file, env);
    expect(env['A']).toBe('real');
  });

  it('ignores a missing file', () => {
    const env: NodeJS.ProcessEnv = {};
    expect(() => loadDotEnv('/nonexistent/.env', env)).not.toThrow();
    expect(env).toEqual({});
  });
});
