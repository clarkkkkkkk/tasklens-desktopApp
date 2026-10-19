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
import { LocalAIExtractionService } from '../services/extraction/LocalAIExtractionService';
import { MockExtractionService } from '../services/extraction/MockExtractionService';
import {
  NativeLocalModelManager,
  type LocalModelManager,
} from '../services/localai/LocalModelManager';
import { nativeAvailable } from '../services/localai/native';
import { NativeOcrService } from '../services/ocr/NativeOcrService';
import { ConfigurationReminderScheduler } from '../services/reminders/ReminderScheduler';
import type { ReminderScheduler } from '../services/reminders/ReminderScheduler';
import { defaultSettings, type Settings } from '../types/action';
export interface Services {
  audioPreprocessor: AudioPreprocessor;
  voice: VoiceCaptureService;
  speech: SpeechToTextService;
  /** Whisper (voice) model files. */
  models: ModelManager;
  /** On-device extraction model, its llama.cpp runtime and OCR language status. */
  localAI: LocalModelManager;
  repository: ActionRepository;
  /** Local AI in the desktop app; the deterministic mock in browsers, tests and demo mode. */
  extraction: ExtractionService;
  /** Always the mock: onboarding and samples must work before a model is installed. */
  demoExtraction: ExtractionService;
  reminders: ReminderScheduler;
  nativeReminders: ReminderService;
  /** Latest saved settings, readable by services created before data loads. */
  settings: { current: Settings };
}
export function createServices(): Services {
  const settings = { current: defaultSettings };
  const localAI = new NativeLocalModelManager();
  const demo = new MockExtractionService();
  const useMock = !nativeAvailable() || import.meta.env.VITE_TASKLENS_EXTRACTION === 'mock';
  const nativeReminders = new NativeReminders();
  const storage = new LocalStorageRepository({
    getItem: (key) => window.localStorage.getItem(key),
    setItem: (key, value) => window.localStorage.setItem(key, value),
    removeItem: (key) => window.localStorage.removeItem(key),
  });
  // Access browser storage lazily, so denied storage becomes a recoverable UI error.
  return {
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
      ? demo
      : new LocalAIExtractionService(new NativeOcrService(), localAI, () => settings.current),
    demoExtraction: demo,
    reminders: new ConfigurationReminderScheduler(),
    settings,
  };
}
