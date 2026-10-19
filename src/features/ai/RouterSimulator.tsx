import { useMemo, useState } from 'react';
import {
  exampleDevices,
  exampleProviders,
  sampleTasks,
  type CatalogChoice,
} from '../../services/ai/catalog';
import type { DeviceProfile } from '../../services/ai/device';
import { aiPriorities, priorityLabels, type AIPriority } from '../../services/ai/policy';
import { deriveRequirements } from '../../services/ai/requirements';
import { recommend } from '../../services/ai/router';
import { RouteDecisionCard } from './RouteDecisionCard';

const modelChoices: { id: keyof CatalogChoice; label: string }[] = [
  { id: 'bundled', label: 'Bundled model' },
  { id: 'small', label: 'Small 1.5B' },
  { id: 'vision', label: 'Local vision 7B' },
  { id: 'large', label: 'Large 14B' },
];

/**
 * "What would TaskLens choose?" with example devices and models. Runs only the pure router; no
 * model is loaded and nothing is sent anywhere.
 */
export function RouterSimulator({ thisDevice }: { thisDevice: DeviceProfile | null }) {
  const devices = useMemo(
    () => [
      ...(thisDevice ? [{ id: 'this', label: 'This device (detected)', profile: thisDevice }] : []),
      ...exampleDevices,
    ],
    [thisDevice],
  );
  const [deviceId, setDeviceId] = useState('low'),
    [task, setTask] = useState('screenshot'),
    [priority, setPriority] = useState<AIPriority>('balanced'),
    [models, setModels] = useState<CatalogChoice>({
      bundled: true,
      small: true,
      vision: true,
      large: true,
    });
  const device = devices.find((d) => d.id === deviceId) ?? devices[0];
  const decision = useMemo(
    () =>
      recommend(
        deriveRequirements(sampleTasks.find((t) => t.id === task)!.signals),
        { device: device.profile, providers: exampleProviders(models) },
        { mode: 'automatic', priority, manualModel: null, allowMock: false },
      ),
    [device, task, priority, models],
  );
  return (
    <details className="router-simulator">
      <summary>Try the router with example devices</summary>
      <p className="field-help">
        A simulation with an example catalog of local models. It shows how TaskLens decides; nothing
        is installed, loaded or sent.
      </p>
      <div className="simulator-controls">
        <label>
          Device
          <select value={device.id} onChange={(e) => setDeviceId(e.target.value)}>
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Input
          <select value={task} onChange={(e) => setTask(e.target.value)}>
            {sampleTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
        <label>
          Priority
          <select value={priority} onChange={(e) => setPriority(e.target.value as AIPriority)}>
            {aiPriorities.map((p) => (
              <option key={p} value={p}>
                {priorityLabels[p]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <fieldset className="simulator-models">
        <legend>Installed in this example</legend>
        {modelChoices.map((choice) => (
          <label key={choice.id}>
            <input
              type="checkbox"
              checked={models[choice.id]}
              onChange={(e) => setModels({ ...models, [choice.id]: e.target.checked })}
            />
            {choice.label}
          </label>
        ))}
      </fieldset>
      <RouteDecisionCard decision={decision} />
    </details>
  );
}
