import type { DeviceAssessment } from './device';
import { formatGB } from './footprint';
import type { TaskRequirements } from './requirements';
import type { Reason, ScoredCandidate } from './router';
import type { AICapability } from './types';

const capabilityPraise: Partial<Record<AICapability, string>> = {
  'image-understanding': 'Strong image understanding',
  multilingual: 'Handles English, Cebuano and Tagalog',
  'long-context': 'Large context window for long sources',
};

const vision = (c: ScoredCandidate) => c.model.capabilities.includes('image-understanding');

/** Short chips for a candidate card. */
export function highlights(c: ScoredCandidate): string[] {
  if (c.provider.kind === 'mock') return ['Not real AI', 'Deterministic'];
  if (c.provider.kind === 'cloud') return ['Online', 'Text sent to Groq', 'Your API key'];
  const chips = ['Private', 'Offline'];
  if (c.speedClass === 'fast') chips.push('Fast');
  if (c.memory && c.memory.weightsGB < 2) chips.push('Low memory');
  if (vision(c)) chips.push('Sees images');
  return chips;
}

/** One-line trade-off of `alt` compared with the selected candidate. */
export function tradeoff(
  alt: ScoredCandidate,
  selected: ScoredCandidate,
  req: TaskRequirements,
): string {
  if (alt.provider.kind === 'mock') return 'sample output only, not AI analysis';
  const parts: string[] = [];
  const order = ['basic', 'good', 'excellent'];
  const q = order.indexOf(alt.qualityClass) - order.indexOf(selected.qualityClass);
  const visionGap = req.hasImage && vision(alt) !== vision(selected);
  if (visionGap) parts.push(vision(alt) ? 'can read the image itself' : 'no image understanding');
  if (q < 0 || (visionGap && !vision(alt))) parts.push('lower expected extraction quality');
  else if (q > 0) parts.push('higher expected quality');
  const speeds = ['slow', 'moderate', 'fast'];
  const s = speeds.indexOf(alt.speedClass) - speeds.indexOf(selected.speedClass);
  if (s > 0) parts.push('faster');
  else if (s < 0) parts.push('slower');
  if (alt.memory && selected.memory && alt.memory.minRamGB < selected.memory.minRamGB * 0.7)
    parts.push('lower memory use');
  if (alt.breakdown.device.score < 0.3) parts.push('needs more memory than is free now');
  if (!parts.length) parts.push(`scored ${Math.round(selected.total - alt.total)} points lower`);
  return parts.join(', ');
}

export function reasonsFor(
  selected: ScoredCandidate,
  ctx: {
    requirements: TaskRequirements;
    device: DeviceAssessment;
    manual: boolean;
  },
): Reason[] {
  const { requirements: req, device } = ctx;
  const reasons: Reason[] = [];
  const add = (tone: Reason['tone'], text: string) => reasons.push({ tone, text });
  if (selected.provider.kind === 'mock') {
    add('info', 'No real AI model is available here');
    add('con', 'Returns a fixed sample result; it does not read your source');
    return reasons;
  }
  if (selected.provider.kind === 'cloud') {
    add('info', 'You selected Groq Cloud in Settings');
    add('info', 'OCR and voice transcription run locally; source text is sent to Groq');
    add('con', 'Requires internet and your Groq API key; quality and speed need evaluation');
    return reasons;
  }
  if (ctx.manual) add('info', 'You chose this model in Manual mode');
  if (req.hasImage) add('info', 'Current task contains a screenshot');
  if (req.input === 'voice') add('info', 'Speech is transcribed on this device first');
  for (const p of req.preferred)
    if (selected.model.capabilities.includes(p.capability) && capabilityPraise[p.capability])
      add('pro', capabilityPraise[p.capability]!);
  add('pro', 'Runs locally');
  if (device.totalRamGB !== null && device.totalRamGB <= 8)
    add('info', `Device has limited RAM (${Math.round(device.totalRamGB)} GB)`);
  const fit = selected.breakdown.device;
  if (fit.score >= 0.8) add('pro', fit.note);
  else if (fit.score >= 0.55) add('info', fit.note);
  if (selected.offload === 'full' && device.bestGpu)
    add('pro', `Accelerated by your ${device.bestGpu.name}`);
  else if (
    device.bestGpu &&
    !device.bestGpu.integrated &&
    !selected.model.accelerators.some((a) => a !== 'cpu')
  )
    add(
      'info',
      `${selected.provider.runtime} runs on the CPU; your ${device.bestGpu.name} isn't used by it`,
    );
  if (selected.model.capabilities.includes('structured-extraction') && !req.hasImage)
    add('pro', 'Suitable for structured text extraction');
  add('pro', 'No source material leaves this device');
  if (req.complexity === 'simple' && selected.speedClass !== 'slow')
    add('pro', 'Fast enough for a short, simple job');
  for (const caution of selected.cautions) add('con', caution);
  return reasons;
}

export function privacyStatement(selected: ScoredCandidate | undefined): string {
  if (!selected) return 'Nothing is processed until an AI model is available.';
  if (selected.provider.kind === 'mock') return 'Nothing is analyzed; a fixed sample is returned.';
  if (selected.provider.kind === 'cloud')
    return 'Recognized text or transcripts are sent to Groq. Original screenshots and audio stay on this device.';
  return 'Processed on this device. No source material leaves it.';
}

export const memoryLine = (c: ScoredCandidate) =>
  c.memory ? `~${formatGB(c.memory.minRamGB)} memory (${c.memory.basis})` : null;
