import { cancelNativeJob, nativeInvoke, onNativeEvent } from '../localai/native';
import { ocrDocumentSchema, type OcrService, type OcrStage, type OcrStatus } from './types';

/** Tesseract through the TaskLens native layer. Image bytes travel over local IPC only. */
export class NativeOcrService implements OcrService {
  async recognize(
    image: Blob,
    {
      jobId,
      signal,
      onStage,
    }: { jobId: string; signal: AbortSignal; onStage?: (stage: OcrStage) => void },
  ) {
    signal.throwIfAborted();
    const bytes = new Uint8Array(await image.arrayBuffer());
    signal.throwIfAborted();
    const unlisten = await onNativeEvent<{ jobId: string; stage: OcrStage }>(
      'local-ai-progress',
      (payload) => {
        if (payload.jobId === jobId) onStage?.(payload.stage);
      },
    );
    const cancel = () => void cancelNativeJob(jobId);
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const result = await nativeInvoke('ocr_recognize', bytes, { 'x-tasklens-job': jobId });
      signal.throwIfAborted();
      return ocrDocumentSchema.parse(result);
    } finally {
      unlisten();
      signal.removeEventListener('abort', cancel);
    }
  }

  status() {
    return nativeInvoke<OcrStatus>('ocr_status');
  }

  importLanguages() {
    return nativeInvoke<OcrStatus>('ocr_import_languages');
  }
}
