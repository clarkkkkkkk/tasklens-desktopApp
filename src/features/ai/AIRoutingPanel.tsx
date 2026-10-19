import { useMemo, useState } from 'react';
import { useApp } from '../../app/context';
import { LoaderCircle, Monitor, RefreshCw, Sparkles } from '../../components/icons';
import { Button, ErrorState } from '../../components/ui';
import { sampleTasks } from '../../services/ai/catalog';
import { assessDevice, type DeviceProfile } from '../../services/ai/device';
import { formatGB } from '../../services/ai/footprint';
import { aiModes, aiPriorities, modeLabels, priorityLabels } from '../../services/ai/policy';
import { deriveRequirements } from '../../services/ai/requirements';
import { recommend } from '../../services/ai/router';
import { modelKey } from '../../services/ai/types';
import type { Settings } from '../../types/action';
import { RouteDecisionCard } from './RouteDecisionCard';
import { RouterSimulator } from './RouterSimulator';
import { cloudProvidersRegistered, effectiveMode } from './cloudAvailability';
import { useAIRouting } from './useAIRouting';
import './ai.css';

const GB = 1024 ** 3;
const performanceLabel = { low: 'Entry level', mid: 'Mid-range', high: 'High-end' };

function HardwareDetails({ profile }: { profile: DeviceProfile }) {
  const assessment = assessDevice(profile);
  return (
    <details className="hardware-details">
      <summary>Hardware details</summary>
      <dl className="local-ai-facts">
        <dt>Detected by</dt>
        <dd>
          {profile.source === 'native'
            ? 'TaskLens on this device'
            : 'Browser estimate (open the desktop app for real detection)'}
        </dd>
        <dt>Processor</dt>
        <dd>
          {profile.cpu.model ?? 'Unknown'} ·{' '}
          {profile.cpu.physicalCores ? `${profile.cpu.physicalCores} cores, ` : ''}
          {profile.cpu.logicalCores} threads
          {profile.cpu.features.length ? ` · ${profile.cpu.features.join(', ').toUpperCase()}` : ''}
        </dd>
        <dt>Memory</dt>
        <dd>
          {profile.memory.totalBytes ? formatGB(profile.memory.totalBytes / GB) : 'Unknown'} total
          {profile.memory.availableBytes
            ? ` · ${formatGB(profile.memory.availableBytes / GB)} available`
            : ''}
          {assessment.memoryPressure !== 'unknown'
            ? ` · ${assessment.memoryPressure} pressure`
            : ''}
        </dd>
        <dt>Graphics</dt>
        <dd>
          {profile.gpus.length
            ? profile.gpus
                .map(
                  (g) =>
                    `${g.name}${g.vramBytes ? ` · ${formatGB(g.vramBytes / GB)} VRAM` : ''}${g.vramFreeBytes !== null ? ` (${formatGB(g.vramFreeBytes / GB)} free)` : ''}${g.backends.length ? ` · ${g.backends.join(', ').toUpperCase()}` : ''}`,
                )
                .join('; ')
            : 'No GPU detected · CPU-only'}
        </dd>
        <dt>AI memory budget</dt>
        <dd>
          {assessment.ramBudgetGB !== null
            ? `~${formatGB(assessment.ramBudgetGB)} RAM after headroom for the system`
            : 'Unknown'}
          {assessment.vramBudgetGB !== null && assessment.bestGpu?.vendor !== 'apple'
            ? ` · ~${formatGB(assessment.vramBudgetGB)} VRAM`
            : ''}
        </dd>
        <dt>Class</dt>
        <dd>{performanceLabel[assessment.performanceClass]} (routing heuristic)</dd>
      </dl>
      <p className="field-help">
        Only hardware facts that matter for choosing a model are read. No serial numbers, names,
        network addresses or files.
      </p>
    </details>
  );
}

export function AIRoutingPanel({
  settings,
  onUpdate,
  pending,
}: {
  settings: Settings;
  onUpdate: (next: Settings) => Promise<void>;
  pending: boolean;
}) {
  const { services } = useApp();
  const [taskId, setTaskId] = useState('screenshot');
  const task = sampleTasks.find((t) => t.id === taskId)!;
  const { snapshot, decision, policy, loading, error, refresh } = useAIRouting(task.signals);
  const ai = settings.ai;
  const cloud = cloudProvidersRegistered(services);
  const mode = effectiveMode(ai.mode, cloud);
  const update = (changes: Partial<Settings['ai']>) =>
    void onUpdate({ ...settings, ai: { ...ai, ...changes } });
  const device = snapshot ? assessDevice(snapshot.device) : null;
  const allModels = useMemo(
    () =>
      snapshot?.providers.flatMap((p) =>
        p.models.map((m) => ({
          key: modelKey(m),
          label: `${m.name} · ${p.provider.name}`,
          available: p.status.available,
        })),
      ) ?? [],
    [snapshot],
  );
  // What Automatic routing would pick, for "Use recommended" in Manual mode.
  const automatic = useMemo(
    () =>
      snapshot && ai.mode === 'manual'
        ? recommend(deriveRequirements(task.signals), snapshot, {
            ...policy,
            mode: 'ask-before-cloud',
          })
        : null,
    [snapshot, ai.mode, policy, task],
  );

  return (
    <section className="settings-section ai-routing" aria-labelledby="ai-routing-heading">
      <h2 id="ai-routing-heading">
        <Sparkles size={18} />
        TaskLens AI
        <span className="badge">Adaptive</span>
      </h2>
      <p>
        TaskLens chooses the AI for each job from this device&rsquo;s hardware, the network, the
        models that are actually available and your privacy settings.
      </p>
      {error && <ErrorState message={error} />}
      <div className="setting-row">
        <div>
          <h3>Current device</h3>
          <p>{device ? device.summary : 'Checking this device…'}</p>
        </div>
        <Button
          onClick={() => void refresh(true)}
          disabled={loading}
          aria-label="Check device and AI providers again"
        >
          {loading ? <LoaderCircle size={16} className="spin" /> : <RefreshCw size={16} />}
          Re-check
        </Button>
      </div>
      {snapshot && <HardwareDetails profile={snapshot.device} />}
      <div className="setting-row">
        <div>
          <h3>Network</h3>
          <p>
            <span
              className={`network-dot ${snapshot?.network.online === false ? 'offline' : 'online'}`}
              aria-hidden
            />
            {snapshot?.network.online === false ? 'Offline: only local AI can run' : 'Online'}
            <span className="field-help">
              {' '}
              · as reported by your operating system; no server is contacted to check
            </span>
          </p>
        </div>
      </div>

      <div className="setting-subsection">
        <h3 id="route-task-label">Recommendation for</h3>
        <div className="segmented" role="radiogroup" aria-labelledby="route-task-label">
          {sampleTasks.map((t) => (
            <button
              key={t.id}
              type="button"
              role="radio"
              aria-checked={taskId === t.id}
              className={taskId === t.id ? 'selected' : ''}
              onClick={() => setTaskId(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {decision ? (
          <RouteDecisionCard
            decision={decision}
            action={
              ai.mode === 'manual' &&
              automatic?.selected &&
              automatic.selected.key !== ai.manualModel ? (
                <Button
                  variant="primary"
                  disabled={pending}
                  onClick={() => update({ manualModel: automatic.selected!.key })}
                >
                  Use recommended: {automatic.selected.model.name}
                </Button>
              ) : ai.mode !== 'manual' && decision.selected ? (
                <p className="field-help">
                  {decision.selected.provider.kind === 'mock'
                    ? 'Used in this preview only. The desktop app routes to real models.'
                    : decision.status === 'needs-consent'
                      ? 'TaskLens will ask before using it for a job like this.'
                      : 'Used automatically for jobs like this.'}
                </p>
              ) : null
            }
          />
        ) : (
          <p className="field-help" role="status">
            Checking available AI…
          </p>
        )}
      </div>

      <fieldset className="setting-subsection ai-mode">
        <legend>AI mode</legend>
        {aiModes
          .filter((m) => cloud || m === 'local-only' || m === 'manual')
          .map((m) => (
            <label key={m} className={mode === m ? 'selected' : ''}>
              <input
                type="radio"
                name="ai-mode"
                value={m}
                checked={mode === m}
                disabled={pending}
                onChange={() => update({ mode: m })}
              />
              <span>
                <strong>{modeLabels[m].title}</strong>
                {m === 'local-only' && <span className="badge">Default</span>}
                <small>{modeLabels[m].description}</small>
              </span>
            </label>
          ))}
      </fieldset>

      <div className="developer-fields">
        <label>
          Priority
          <select
            value={ai.priority}
            disabled={pending || ai.mode === 'manual'}
            onChange={(e) => update({ priority: e.target.value as Settings['ai']['priority'] })}
          >
            {aiPriorities.map((p) => (
              <option key={p} value={p}>
                {priorityLabels[p]}
              </option>
            ))}
          </select>
        </label>
        {ai.mode === 'manual' && (
          <label>
            Model
            <select
              value={ai.manualModel ?? ''}
              disabled={pending}
              onChange={(e) => update({ manualModel: e.target.value || null })}
            >
              <option value="">Choose a model</option>
              {allModels.map((m) => (
                <option key={m.key} value={m.key}>
                  {m.label}
                  {m.available ? '' : ' (unavailable)'}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      {cloud && mode !== 'local-only' && (
        <div className="setting-row">
          <div>
            <h3>Share screenshots with cloud vision models</h3>
            <p>
              When off, a cloud model receives only the text recognized on this device, never the
              image.
            </p>
          </div>
          <input
            type="checkbox"
            aria-label="Share screenshots with cloud vision models"
            checked={ai.shareImages}
            disabled={pending}
            onChange={(e) => update({ shareImages: e.target.checked })}
          />
        </div>
      )}

      <div className="setting-subsection">
        <h3>
          <Monitor size={16} /> AI providers
        </h3>
        <ul className="provider-list">
          {snapshot?.providers.map(({ provider, status, models }) => (
            <li key={provider.id}>
              <div>
                <strong>{provider.name}</strong>
                <span className="field-help">
                  {' '}
                  ·{' '}
                  {provider.kind === 'cloud'
                    ? 'Cloud'
                    : provider.kind === 'mock'
                      ? 'Demo'
                      : 'Local'}{' '}
                  · {provider.runtime}
                </span>
                <p className="field-help">
                  {status.available
                    ? models.length
                      ? models.map((m) => m.name).join(', ')
                      : 'No models'
                    : status.reason}
                </p>
              </div>
              <span className={`badge ${status.available ? 'badge-ready' : ''}`} role="status">
                {status.available ? 'Ready' : 'Unavailable'}
              </span>
            </li>
          ))}
        </ul>
        <div className="setting-row">
          <div>
            <h3>Detect Ollama</h3>
            <p>
              Use models from an Ollama server on this computer (127.0.0.1:11434). Nothing leaves
              the device.
            </p>
          </div>
          <input
            type="checkbox"
            aria-label="Detect Ollama"
            checked={ai.ollama.enabled}
            disabled={pending}
            onChange={(e) => update({ ollama: { enabled: e.target.checked } })}
          />
        </div>
      </div>

      <RouterSimulator thisDevice={snapshot?.device.source === 'native' ? snapshot.device : null} />
      {services.extraction.mode === 'mock' && (
        <p className="field-help">
          This preview has no real AI. Extraction uses Demo / Mock AI, which returns a fixed sample.
        </p>
      )}
    </section>
  );
}
