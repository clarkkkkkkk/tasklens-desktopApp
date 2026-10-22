// Synthetic key only. Separate Rust processes prove persistence and removal without
// reading or modifying the user's actual Groq credential.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const service = `app.tasklens.desktop.groq.acceptance.${randomUUID()}`;
let failed = false;
for (const phase of ['write', 'read', 'remove', 'absent']) {
  const result = spawnSync(
    'cargo',
    [
      'test',
      '--locked',
      '--manifest-path',
      'src-tauri/Cargo.toml',
      'native_credential_acceptance',
      '--',
      '--ignored',
      '--nocapture',
    ],
    {
      env: {
        ...process.env,
        TASKLENS_CREDENTIAL_TEST_SERVICE: service,
        TASKLENS_CREDENTIAL_TEST_PHASE: phase,
      },
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) {
    failed = true;
    if (phase !== 'write')
      spawnSync(
        'cargo',
        [
          'test',
          '--locked',
          '--manifest-path',
          'src-tauri/Cargo.toml',
          'native_credential_acceptance',
          '--',
          '--ignored',
        ],
        {
          env: {
            ...process.env,
            TASKLENS_CREDENTIAL_TEST_SERVICE: service,
            TASKLENS_CREDENTIAL_TEST_PHASE: 'remove',
          },
          stdio: 'inherit',
        },
      );
    break;
  }
}
process.exitCode = failed ? 1 : 0;
