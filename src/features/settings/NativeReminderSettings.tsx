import { useEffect, useState } from 'react';
import { useApp } from '../../app/context';
import { Button, ErrorState } from '../../components/ui';
import type { ActivationPreview, ReminderStatus } from '../../services/reliability/Reminders';
import { requestClose } from '../../services/reliability/lifecycle';
export function NativeReminderSettings() {
  const { services, snapshot } = useApp();
  const service = services.nativeReminders;
  const [status, setStatus] = useState<ReminderStatus>();
  const [preview, setPreview] = useState<ActivationPreview>();
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [pending, setPending] = useState(false);
  useEffect(() => {
    if (!service.available) return;
    let disposed = false;
    let cleanup = () => {};
    const accept = (next: ReminderStatus) => {
      if (!disposed)
        setStatus((current) => (!current || next.revision >= current.revision ? next : current));
    };
    // Subscribe first: a status event arriving during the query must not be lost.
    void service
      .subscribe(accept)
      .then(async (unlisten) => {
        if (disposed) {
          unlisten();
          return;
        }
        cleanup = unlisten;
        accept(await service.status());
      })
      .catch((e) => {
        if (!disposed) setError(String(e.message || e));
      });
    return () => {
      disposed = true;
      cleanup();
    };
  }, [service]);
  async function run(operation: () => Promise<unknown>) {
    setPending(true);
    setError('');
    setMessage('');
    try {
      await operation();
      setStatus(await service.status());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Native reminders are unavailable.');
    } finally {
      setPending(false);
    }
  }
  if (!service.available)
    return (
      <p className="field-help">
        OS notification delivery and background operation require the desktop app. Browser reminders
        are saved configurations only.
      </p>
    );
  return (
    <div className="setting-subsection">
      <h3>Native notification delivery</h3>
      <p className="field-help">
        {status
          ? `${status.activated ? 'Activated' : 'Off until you activate'} · ${status.paused ? 'Delivery paused' : 'Reconciled'} · OS permission: ${status.availability}`
          : 'Checking native reminder service…'}
      </p>
      <p className="field-help">
        OS submission does not guarantee a visible banner. TaskLens must be running. Explicit Quit
        stops reminders. Past reminders restored or first activated are never replayed.
      </p>
      {error && <ErrorState message={error} />}
      {status?.warning && <ErrorState message={status.warning} />}
      {message && <p role="status">{message}</p>}
      <div className="action-pair">
        {status?.activated ? (
          <Button disabled={pending} onClick={() => void run(() => service.disable())}>
            Deactivate notifications
          </Button>
        ) : (
          <Button
            disabled={pending || !status || status.paused}
            onClick={() =>
              void run(async () => {
                await services.repository.load();
                setPreview(await service.preview());
              })
            }
          >
            Review activation
          </Button>
        )}
        <Button
          disabled={pending}
          onClick={() =>
            void run(async () => {
              await services.repository.load();
            })
          }
        >
          Retry reconciliation
        </Button>
        <Button
          disabled={pending || !status?.activated || status.paused}
          onClick={() => void run(async () => setMessage(await service.test()))}
        >
          Send test notification
        </Button>
      </div>
      {preview && (
        <div className="setting-subsection">
          <h3>Approve notification activation</h3>
          <p>
            {preview.eligible} future schedules are eligible. Night before means 8 PM on the
            previous day. Relative reminders use confirmed arrival time, or confirmed start time.
          </p>
          <p>
            No task content is included unless you separately enable titles. Schedules needing
            confirmation will remain inactive.
          </p>
          {!!preview.needsConfirmation.length && (
            <ul>
              {preview.needsConfirmation.map((issue, i) => (
                <li key={i}>{issue}</li>
              ))}
            </ul>
          )}
          <div className="action-pair">
            <Button
              disabled={pending}
              onClick={() =>
                void run(async () => {
                  await service.activate(preview);
                  setPreview(undefined);
                })
              }
            >
              Activate notifications
            </Button>
            <Button disabled={pending} onClick={() => setPreview(undefined)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {!!status?.needsConfirmation.length && (
        <details>
          <summary>Schedules needing confirmation ({status.needsConfirmation.length})</summary>
          <ul>
            {status.needsConfirmation.map((issue, i) => (
              <li key={i}>{issue}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="setting-row">
        <div>
          <h3 id="native-title-privacy">Include task titles in notifications</h3>
          <p>Off by default. Notes, transcripts and source evidence are never included.</p>
        </div>
        <input
          aria-labelledby="native-title-privacy"
          type="checkbox"
          checked={status?.includeTitle || false}
          disabled={pending || !status}
          onChange={(e) =>
            void run(() => service.preferences(e.target.checked, status?.background || false))
          }
        />
      </div>
      <div className="setting-row">
        <div>
          <h3 id="native-background">Keep running when the window closes</h3>
          <p>
            Opt in to background reminders. Some desktops hide tray icons; reopen TaskLens from your
            launcher. Quit always stops delivery.
          </p>
        </div>
        <input
          aria-labelledby="native-background"
          type="checkbox"
          checked={status?.background || false}
          disabled={pending || !status}
          onChange={(e) =>
            void run(() => service.preferences(status?.includeTitle || false, e.target.checked))
          }
        />
      </div>
      <details>
        <summary>Native schedules and delivery history</summary>
        <ul className="upcoming-reminders">
          {[...(status?.upcoming || []), ...(status?.history || [])].slice(0, 50).map((item) => (
            <li key={item.fingerprint}>
              <span>
                {snapshot.actions.find((a) => a.id === item.actionId)?.title || 'Deleted item'}
                <small>
                  {item.reminderId} · {item.state} · {item.timezone}
                </small>
              </span>
              <time dateTime={item.at}>{new Date(item.at).toLocaleString()}</time>
            </li>
          ))}
        </ul>
        <p className="field-help">
          Submitted means the OS accepted the request, not that it was seen. Unknown attempts are
          never replayed automatically. Missed reminders within 24 hours produce one private
          summary; older misses remain here.
        </p>
      </details>
      <Button onClick={() => void requestClose(true)}>Quit TaskLens</Button>
    </div>
  );
}
