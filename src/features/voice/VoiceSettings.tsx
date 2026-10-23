import { useLocalIntelligence } from '../../services/localai/useLocalIntelligence';
import { useEffect, useState } from 'react';
import { useApp } from '../../app/context';
import { Button, ErrorState } from '../../components/ui';
import type { ModelStatus } from '../../services/voice/types';
export function VoiceSettings() {
  const { services, snapshot } = useApp();
  const { status: intelligence } = useLocalIntelligence();
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
  }, [services, intelligence.state]);
  async function validate(kind: ModelStatus['kind'], importFile: boolean) {
    setPending(kind);
    setError('');
    try {
      await services.models.validate(kind, importFile);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not validate model.');
    } finally {
      setPending('');
      try {
        setModels(await services.models.list());
      } catch {
        setError('Could not refresh model status. Reopen Settings to retry.');
      }
    }
  }
  return (
    <section className="settings-section" data-tour-busy={!!pending}>
      <h2>Voice transcription</h2>
      <p>
        Record with your system-default microphone. Transcription (whisper.cpp) runs on this device.
        Extraction uses the AI processing mode selected below. Recordings are deleted after
        transcription; saved items retain their transcript.
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
              {pending === model.kind
                ? 'Validating model…'
                : model.status === 'error'
                  ? 'Validation needed · retry validation or reinstall TaskLens'
                  : model.status.replaceAll('_', ' ')}
              {!model.runtimeAvailable ? ' · Runtime not installed' : ''}
            </p>
          </div>
          <div className="action-pair">
            {snapshot.settings.localAI.developerMode && (
              <Button disabled={!!pending} onClick={() => void validate(model.kind, true)}>
                Import supported developer override
              </Button>
            )}
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
        Models are bundled and verified locally. No downloads are needed. Voice supports WAV, MP3,
        M4A (AAC-LC/ALAC), and OGG/Vorbis; up to 15 minutes and 100 MB. Recording stops at 5
        minutes. Recognition accuracy varies by language; always inspect the transcript.
      </p>
    </section>
  );
}
