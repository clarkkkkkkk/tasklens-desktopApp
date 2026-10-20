export const aiModes = ['automatic', 'manual'] as const;
export type AIMode = (typeof aiModes)[number];
export const aiPriorities = ['balanced', 'speed', 'quality'] as const;
export type AIPriority = (typeof aiPriorities)[number];

export const modeLabels: Record<AIMode, { title: string; description: string }> = {
  automatic: {
    title: 'Automatic',
    description:
      'TaskLens picks the best model on this device for each job. Every result shows which one ran.',
  },
  manual: {
    title: 'Manual Selection',
    description: 'You choose the model. TaskLens still explains the trade-offs.',
  },
};

export const priorityLabels: Record<AIPriority, string> = {
  balanced: 'Balanced',
  speed: 'Speed first',
  quality: 'Quality first',
};

export interface RoutingPolicy {
  mode: AIMode;
  priority: AIPriority;
  /** `providerId/modelId` chosen in Manual mode. */
  manualModel: string | null;
  /** Demo/mock providers may be selected (browser preview, demos, tests). */
  allowMock: boolean;
}

export const defaultPolicy: RoutingPolicy = {
  mode: 'automatic',
  priority: 'balanced',
  manualModel: null,
  allowMock: false,
};
