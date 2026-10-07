import type { ActionRepository } from '../repositories/ActionRepository';
import { LocalStorageRepository } from '../repositories/LocalStorageRepository';
import type { ExtractionService } from '../services/extraction/ExtractionService';
import { MockExtractionService } from '../services/extraction/MockExtractionService';
import { ConfigurationReminderScheduler } from '../services/reminders/ReminderScheduler';
import type { ReminderScheduler } from '../services/reminders/ReminderScheduler';
export interface Services {
  repository: ActionRepository;
  extraction: ExtractionService;
  reminders: ReminderScheduler;
}
export function createServices(): Services {
  // Access browser storage lazily, so denied storage becomes a recoverable UI error.
  return {
    repository: new LocalStorageRepository({
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    }),
    extraction: new MockExtractionService(),
    reminders: new ConfigurationReminderScheduler(),
  };
}
