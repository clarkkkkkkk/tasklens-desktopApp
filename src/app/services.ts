import { ProcessingMode } from '../services/ai/ProcessingMode';
import {
  NativeVoiceCapture,
  NativeSpeechToText,
  NativeModelManager,
} from '../services/voice/NativeVoiceServices';
import type {
  AudioPreprocessor,
  VoiceCaptureService,
  SpeechToTextService,
  ModelManager,
} from '../services/voice/types';
import { audioPreprocessor } from '../services/voice/types';
import { ReminderSafeRepository } from '../repositories/ReminderSafeRepository';
import { NativeReminders, type ReminderService } from '../services/reliability/Reminders';
import type { ActionRepository } from '../repositories/ActionRepository';
import { LocalStorageRepository } from '../repositories/LocalStorageRepository';
import type { ExtractionService } from '../services/extraction/ExtractionService';
import { MockExtractionService } from '../services/extraction/MockExtractionService';
import { RoutedExtractionService } from '../services/extraction/RoutedExtractionService';
import {
  NativeLocalModelManager,
  type LocalModelManager,
} from '../services/localai/LocalModelManager';
import {
  watchLocalIntelligence,
  type IntelligenceStatus,
} from '../services/localai/LocalIntelligence';
import { nativeAvailable, LocalAIError } from '../services/localai/native';
import { NativeOcrService } from '../services/ocr/NativeOcrService';
import { ConfigurationReminderScheduler } from '../services/reminders/ReminderScheduler';
import type { ReminderScheduler } from '../services/reminders/ReminderScheduler';
import { NativeDeviceProfiler, type DeviceProfiler } from '../services/ai/device';
import type { RoutingPolicy } from '../services/ai/policy';
import { ProviderRegistry } from '../services/ai/registry';
import { AIRouter } from '../services/ai/router';
import type { AIProvider } from '../services/ai/types';
import { LlamaCppProvider } from '../services/ai/providers/LlamaCppProvider';
import { MockProvider } from '../services/ai/providers/MockProvider';
import { GroqProvider } from '../services/ai/providers/GroqProvider';
import { OllamaProvider } from '../services/ai/providers/OllamaProvider';
import { encodeImageForAI } from '../lib/images';
import { defaultSettings, type Settings } from '../types/action';

/** Shared providers, local hardware detection and explicit execution-mode routing. */
export interface AIServices {
  router: AIRouter;
  registry: ProviderRegistry;
  device: DeviceProfiler;
}
export interface Services {
  processing: ProcessingMode;
  audioPreprocessor: AudioPreprocessor;
  voice: VoiceCaptureService;
  speech: SpeechToTextService;
  /** Whisper (voice) model files. */
  models: ModelManager;
  /** On-device extraction model, its llama.cpp runtime and OCR language status. */
  localAI: LocalModelManager;
  repository: ActionRepository;
  /** Routed AI in the desktop app; the deterministic mock in browsers, tests and demo mode. */
  extraction: ExtractionService;
  /** Always the mock: onboarding and samples must work before a model is installed. */
  demoExtraction: ExtractionService;
  reminders: ReminderScheduler;
  nativeReminders: ReminderService;
  ai: AIServices;
  /** Latest saved settings, readable by services created before data loads. */
  settings: { current: Settings };
}
export function createServices(): Services {
  const settings = { current: defaultSettings };
  const processing = new ProcessingMode();
  const localAI = new NativeLocalModelManager();
  const demo = new MockExtractionService();
  const useMock = !nativeAvailable() || import.meta.env.VITE_TASKLENS_EXTRACTION === 'mock';

  const intelligence: { current: IntelligenceStatus | null } = { current: null };
  const providers: AIProvider[] = [
    new GroqProvider(),
    new LlamaCppProvider(
      localAI,
      () => intelligence.current,
      () => settings.current.localAI.contextSize,
    ),
    new OllamaProvider(undefined, () => settings.current.ai.ollama.enabled),
    ...(useMock ? [new MockProvider()] : []),
  ];
  const registry = new ProviderRegistry(providers);
  if (nativeAvailable())
    void watchLocalIntelligence((status) => {
      intelligence.current = status;
      registry.invalidate();
    }).catch(() => {});
  const policy = (): RoutingPolicy => ({
    mode: settings.current.ai.mode,
    executionMode: processing.getSnapshot().effectiveMode,
    priority: settings.current.ai.priority,
    manualModel: settings.current.ai.manualModel,
    allowMock: useMock,
  });
  const device = new NativeDeviceProfiler();
  const router = new AIRouter(registry, device, policy);

  const nativeReminders = new NativeReminders();
  // Access browser storage lazily, so denied storage becomes a recoverable UI error.
  const storage = new LocalStorageRepository({
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  });
  const services: Services = {
    processing,
    audioPreprocessor,
    voice: new NativeVoiceCapture(audioPreprocessor),
    speech: new NativeSpeechToText(),
    models: new NativeModelManager(),
    localAI,
    repository: nativeReminders.available
      ? new ReminderSafeRepository(storage, nativeReminders)
      : storage,
    nativeReminders,
    extraction: useMock
      ? {
          get mode() {
            return processing.getSnapshot().effectiveMode === 'groq'
              ? ('routed' as const)
              : ('mock' as const);
          },
          extract(input, options) {
            if (processing.getSnapshot().effectiveMode !== 'groq')
              return demo.extract(input, options);
            return new RoutedExtractionService(
              new NativeOcrService(),
              router,
              () => settings.current,
            ).extract(input, options);
          },
        }
      : new RoutedExtractionService(new NativeOcrService(), router, () => settings.current, {
          encodeImage: encodeImageForAI,
        }),
    demoExtraction: demo,
    reminders: new ConfigurationReminderScheduler(),
    ai: { router, registry, device },
    settings,
  };
  services.extraction = withProcessingMode(services.extraction, processing);
  return services;
}

export function withProcessingMode(
  extraction: ExtractionService,
  processing: ProcessingMode,
): ExtractionService {
  return {
    get mode() {
      return extraction.mode;
    },
    async extract(input, options) {
      const selectedMode = processing.getSnapshot().effectiveMode;
      const controller = new AbortController();
      const cancel = () => controller.abort(options.signal.reason);
      options.signal.addEventListener('abort', cancel, { once: true });
      if (options.signal.aborted) cancel();
      const unsubscribe = processing.subscribe(() => {
        if (processing.getSnapshot().effectiveMode !== selectedMode)
          controller.abort(
            new LocalAIError(
              'CANCELLED',
              'AI mode changed. Your source is retained; choose Retry locally.',
            ),
          );
      });
      try {
        const result = await extraction.extract(input, { ...options, signal: controller.signal });
        controller.signal.throwIfAborted();
        return result;
      } catch (error) {
        if (controller.signal.aborted) throw controller.signal.reason;
        throw error;
      } finally {
        unsubscribe();
        options.signal.removeEventListener('abort', cancel);
      }
    },
  };
}
