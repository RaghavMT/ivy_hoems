// Runs every browser test, or the ones named: `npm run e2e`, `npm run e2e -- listings`.
// Needs a running build of the app (see README) at E2E_BASE_URL.

import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ORDER = ['login', 'listings', 'detail', 'saved', 'rentals'];

const available = readdirSync(HERE)
  .filter((f) => f.endsWith('.mjs') && !['lib.mjs', 'run.mjs'].includes(f))
  .map((f) => f.replace(/\.mjs$/, ''))
  .sort((a, b) => (ORDER.indexOf(a) + 100 * (ORDER.indexOf(a) < 0)) - (ORDER.indexOf(b) + 100 * (ORDER.indexOf(b) < 0)));

const requested = process.argv.slice(2);
const specs = requested.length ? requested : available;
let failed = 0;

for (const spec of specs) {
  if (!available.includes(spec)) {
    console.error(`No spec named "${spec}". Available: ${available.join(', ')}`);
    process.exit(2);
  }
  const run = spawnSync(process.execPath, [path.join(HERE, `${spec}.mjs`)], { stdio: 'inherit' });
  if (run.status !== 0) failed++;
}

console.log(`\n${specs.length - failed}/${specs.length} specs passed`);
process.exit(failed ? 1 : 0);
