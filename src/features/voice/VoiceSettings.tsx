import { useEffect, useState } from 'react';
import { useApp } from '../../app/context';
import { Button, ErrorState } from '../../components/ui';
import type { ModelStatus } from '../../services/voice/types';
export function VoiceSettings() {
  const { services } = useApp();
  const [models, setModels] = useState<ModelStatus[]>([]),
    [pending, setPending] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void services.models
      .list()
      .then((value) => {
        if (active) setModels(value);
      })
      .catch(() => {
        if (active) setError('Could not read local model status.');
      });
    return () => {
      active = false;
    };
  }, [services]);
  async function validate(kind: ModelStatus['kind'], importFile: boolean) {
    setPending(kind);
    setError('');
    try {
      await services.models.validate(kind, importFile);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not validate model.');
    } finally {
      setPending('');
      setModels(await services.models.list());
    }
  }
  return (
    <section className="settings-section">
      <h2>Local AI / Voice</h2>
      <p>
        Record with your system-default microphone. Transcription and extraction run on this device.
        Recordings are deleted after transcription; saved items retain their transcript.
      </p>
      {!services.voice.available && (
        <p className="field-help">
          Open the TaskLens desktop app to use local voice and text processing.
        </p>
      )}
      {models.map((model) => (
        <div className="setting-row" key={model.kind}>
          <div>
            <h3>
              {model.kind === 'whisper'
                ? 'Speech recognition · whisper.cpp'
                : 'Structured extraction · llama.cpp'}
            </h3>
            <p>{model.name}</p>
            <p role="status">
              {pending === model.kind ? 'Validating model…' : model.status.replaceAll('_', ' ')}
              {!model.runtimeAvailable ? ' · Runtime not installed' : ''}
            </p>
          </div>
          <div className="action-pair">
            <Button disabled={!!pending} onClick={() => void validate(model.kind, true)}>
              Import model
            </Button>
            <Button
              disabled={!!pending || model.status === 'not_installed'}
              onClick={() => void validate(model.kind, false)}
            >
              Validate model
            </Button>
          </div>
        </div>
      ))}
      {error && <ErrorState message={error} />}
      <p className="field-help">
        Models are installed manually. No automatic downloads. Voice supports WAV, MP3, M4A
        (AAC-LC/ALAC), and OGG/Vorbis; up to 15 minutes and 100 MB. Recording stops at 5 minutes.
        Recognition accuracy varies by language; always inspect the transcript.
      </p>
    </section>
  );
}
