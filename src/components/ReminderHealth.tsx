import { useEffect, useState } from 'react';
import { useApp } from '../app/context';
import { ErrorState } from './ui';
export function ReminderHealth() {
  const { services } = useApp();
  const [warning, setWarning] = useState('');
  useEffect(() => {
    const service = services.nativeReminders;
    if (!service.available) return;
    let disposed = false;
    let cleanup = () => {};
    let timer: ReturnType<typeof setTimeout> | undefined;
    let revision = -1;
    void service
      .subscribe((status) => {
        if (disposed || status.revision < revision) return;
        revision = status.revision;
        clearTimeout(timer);
        if (!status.paused && !status.warning) setWarning('');
        else
          timer = setTimeout(() => {
            if (!disposed)
              setWarning(
                status.warning ||
                  'Reminder delivery is paused. Open Settings to reconcile your saved tasks.',
              );
          }, 2000);
      })
      .then(async (unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        cleanup = unlisten;
        const status = await service.status();
        if (!disposed && status.revision >= revision && status.paused)
          setWarning(
            status.warning ||
              'Reminder delivery is paused. Open Settings to reconcile your saved tasks.',
          );
      })
      .catch(() => {
        if (!disposed)
          setWarning(
            'Native reminders are unavailable. Your task data has been preserved; open Settings for recovery.',
          );
      });
    return () => {
      disposed = true;
      clearTimeout(timer);
      cleanup();
    };
  }, [services.nativeReminders]);
  return warning ? (
    <div className="reminder-health">
      <ErrorState message={warning} />
    </div>
  ) : null;
}
