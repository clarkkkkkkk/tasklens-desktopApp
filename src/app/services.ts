import {
  NativeVoiceCapture,
  NativeSpeechToText,
  NativeModelManager,
} from '../services/voice/NativeVoiceServices';
import type {
  VoiceCaptureService,
  SpeechToTextService,
  ModelManager,
} from '../services/voice/types';
import type { ActionRepository } from '../repositories/ActionRepository';
import { LocalStorageRepository } from '../repositories/LocalStorageRepository';
import type { ExtractionService } from '../services/extraction/ExtractionService';
import { LocalExtractionService } from '../services/extraction/LocalExtractionService';
import { ConfigurationReminderScheduler } from '../services/reminders/ReminderScheduler';
import type { ReminderScheduler } from '../services/reminders/ReminderScheduler';
export interface Services {
  voice: VoiceCaptureService;
  speech: SpeechToTextService;
  models: ModelManager;
  repository: ActionRepository;
  extraction: ExtractionService;
  reminders: ReminderScheduler;
}
export function createServices(): Services {
  // Access browser storage lazily, so denied storage becomes a recoverable UI error.
  return {
    voice: new NativeVoiceCapture(),
    speech: new NativeSpeechToText(),
    models: new NativeModelManager(),
    repository: new LocalStorageRepository({
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    }),
    extraction: new LocalExtractionService(),
    reminders: new ConfigurationReminderScheduler(),
  };
}
