// Compatibility entry point: the shared harness requires a separate acceptance receipt.
if (process.platform !== 'win32') throw new Error('Native Windows execution required.');
await import('./native-reliability-acceptance.mjs');
