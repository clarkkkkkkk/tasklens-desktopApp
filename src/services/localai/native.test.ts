import { expect, it } from 'vitest';
import { toLocalAIError } from './native';
it('preserves typed transport metadata and legacy user messages', () => {
  const failure = toLocalAIError(
    JSON.stringify({
      code: 'MODEL_FAILED',
      detailCode: 'CONNECTION_RESET',
      stage: 'inference',
      message: 'The local model did not respond.',
    }),
  );
  expect(failure).toMatchObject({
    code: 'MODEL_FAILED',
    detailCode: 'CONNECTION_RESET',
    stage: 'inference',
  });
  expect(toLocalAIError('MODEL_FAILED: Legacy failure')).toMatchObject({
    code: 'MODEL_FAILED',
    message: 'Legacy failure',
  });
  expect(
    toLocalAIError(
      JSON.stringify({
        code: 'OCR_FAILED',
        detailCode: 'DLL_NOT_FOUND',
        stage: 'reading_text',
        message: 'The local runtime stopped unexpectedly.',
      }),
    ),
  ).toMatchObject({ code: 'OCR_FAILED', detailCode: 'DLL_NOT_FOUND' });
});
