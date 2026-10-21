import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';

export interface WaveformHandle {
  push: (amplitude: number) => void;
}
const quiet = () => Array<number>(48).fill(0);
/** A short amplitude history, mirrored vertically; this is not a frequency spectrum. */
export const VoiceWaveform = forwardRef<WaveformHandle, { active: boolean }>(function VoiceWaveform(
  { active },
  ref,
) {
  const [bars, setBars] = useState(quiet);
  const reduced = useRef(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const smoothed = useRef(0);
  const activeRef = useRef(active);
  activeRef.current = active;
  useImperativeHandle(
    ref,
    () => ({
      push(value) {
        if (!activeRef.current || reduced.current) return;
        const level = Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0;
        smoothed.current = smoothed.current * 0.35 + level * 0.65;
        const amplitude = Math.min(1, Math.sqrt(smoothed.current) * 1.5);
        setBars((previous) => [...previous.slice(1), amplitude]);
      },
    }),
    [],
  );
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const change = () => {
      reduced.current = media.matches;
      smoothed.current = 0;
      setBars(quiet());
    };
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    if (!active) {
      smoothed.current = 0;
      setBars(quiet());
    }
  }, [active]);
  return (
    <div className="voice-waveform" aria-hidden="true">
      {bars.map((value, index) => (
        <span key={index} style={{ transform: `scaleY(${0.055 + value * 0.945})` }} />
      ))}
    </div>
  );
});
