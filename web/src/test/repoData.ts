/// <reference types="node" />
// Reads the committed API dump and analysis output from the repository root, so
// tests can check the frontend's rules against every record, not a hand-picked few.
import { readFileSync } from 'node:fs';

const REPO_ROOT = new URL('../../../', import.meta.url);

export function readRepoJson<T>(path: string): T {
  return JSON.parse(readFileSync(new URL(path, REPO_ROOT), 'utf8')) as T;
}

/** The dump files hold either a bare array or an envelope with `results`. */
export function readRecords<T>(path: string): T[] {
  const data = readRepoJson<T[] | { results: T[] }>(path);
  return Array.isArray(data) ? data : data.results;
}
