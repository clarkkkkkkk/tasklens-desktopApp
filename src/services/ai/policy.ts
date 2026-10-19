import type { TaskRequirements } from './requirements';
import type { AIModel } from './types';

export const aiModes = ['automatic', 'local-only', 'ask-before-cloud', 'manual'] as const;
export type AIMode = (typeof aiModes)[number];
export const aiPriorities = ['balanced', 'privacy', 'speed', 'quality', 'cost'] as const;
export type AIPriority = (typeof aiPriorities)[number];

export const modeLabels: Record<AIMode, { title: string; description: string }> = {
  automatic: {
    title: 'Automatic',
    description:
      'TaskLens picks the best AI for each job, including cloud models you have set up. Every result shows where it ran.',
  },
  'local-only': {
    title: 'Local Only',
    description: 'Everything stays on this device. Cloud providers are never contacted.',
  },
  'ask-before-cloud': {
    title: 'Ask Before Cloud',
    description:
      'TaskLens may recommend a cloud model, but asks before anything leaves this device.',
  },
  manual: {
    title: 'Manual Selection',
    description: 'You choose the model. TaskLens still explains the trade-offs.',
  },
};

export const priorityLabels: Record<AIPriority, string> = {
  balanced: 'Balanced',
  privacy: 'Privacy first',
  speed: 'Speed first',
  quality: 'Quality first',
  cost: 'Lowest cost',
};

/** Whether cloud models may be used, before any per-model decision. */
export type CloudPermission = 'excluded' | 'ask' | 'allowed';

export interface RoutingPolicy {
  mode: AIMode;
  priority: AIPriority;
  /** `providerId/modelId` chosen in Manual mode. */
  manualModel: string | null;
  /** Send the screenshot image to image-capable cloud models (otherwise OCR text only). */
  shareImages: boolean;
  /** Demo/mock providers may be selected (browser preview, demos, tests). */
  allowMock: boolean;
}

export const defaultPolicy: RoutingPolicy = {
  mode: 'local-only',
  priority: 'balanced',
  manualModel: null,
  shareImages: true,
  allowMock: false,
};

export function cloudPermission(policy: Pick<RoutingPolicy, 'mode'>): CloudPermission {
  switch (policy.mode) {
    case 'local-only':
      return 'excluded';
    case 'ask-before-cloud':
      return 'ask';
    case 'automatic':
      return 'allowed';
    case 'manual':
      // Choosing a cloud model by hand is the permission for that model; anything else asks.
      return 'ask';
  }
}

/** What would leave this device if `model` ran this job. */
export interface DataFlow {
  leavesDevice: boolean;
  destination: string | null;
  /** Items sent, in plain language. Empty when everything stays local. */
  sends: string[];
  /** Stages that stay on this device regardless. */
  staysLocal: string[];
  attachImage: boolean;
}

export function dataFlow(
  model: AIModel,
  providerName: string,
  requirements: TaskRequirements,
  policy: Pick<RoutingPolicy, 'shareImages'>,
): DataFlow {
  const vision = model.capabilities.includes('image-understanding');
  const attachImage =
    requirements.hasImage && vision && (model.privacy === 'local' || policy.shareImages);
  if (model.privacy === 'local')
    return {
      leavesDevice: false,
      destination: null,
      sends: [],
      staysLocal: [...requirements.localStages, 'AI extraction'],
      attachImage,
    };
  const text =
    requirements.input === 'screenshot'
      ? 'Text recognized from the screenshot'
      : requirements.input === 'voice'
        ? 'The voice note transcript (not the audio)'
        : 'The text you entered';
  return {
    leavesDevice: true,
    destination: providerName,
    sends: [
      text,
      ...(attachImage ? ['The screenshot image'] : []),
      'Current date, time zone and capture time (to resolve relative dates)',
    ],
    staysLocal: requirements.localStages,
    attachImage,
  };
}
