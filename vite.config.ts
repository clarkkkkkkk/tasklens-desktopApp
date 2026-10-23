import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { assertReleaseEnvironment } from './scripts/release-policy.mjs';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({ command, mode }) => {
  if (command === 'build') assertReleaseEnvironment(loadEnv(mode, process.cwd(), 'VITE_'));
  return {
    plugins: [react(), tailwindcss()],
    server: {
      port: 1420,
      strictPort: true,
      watch: {
        ignored: (file: string) => {
          const normalized = file.replaceAll('\\', '/');
          return (
            /\/(?:\.local-ai|src-tauri|test-results|test-results-native|playwright-report)(?:\/|$)/.test(
              normalized,
            ) && !normalized.endsWith('/src-tauri/resources/models.json')
          );
        },
      },
    },
    clearScreen: false,
    test: { include: ['src/**/*.test.ts'] },
  };
});
