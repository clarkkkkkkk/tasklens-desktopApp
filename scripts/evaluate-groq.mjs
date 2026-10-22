// The test key is read only by Rust; inherited environment is never printed.
import { spawnSync } from 'node:child_process';
const result = spawnSync(
  process.execPath,
  ['node_modules/vitest/vitest.mjs', 'run', 'src/services/extraction/evaluation/groq.eval.test.ts'],
  {
    env: { ...process.env, TASKLENS_GROQ_EVAL: '1' },
    stdio: 'inherit',
  },
);
process.exitCode = result.status ?? 1;
