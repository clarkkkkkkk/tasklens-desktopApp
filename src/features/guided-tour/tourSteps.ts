import {
  Bell,
  CalendarDays,
  CircleCheck,
  FileImage,
  HardDrive,
  Inbox,
  ListTodo,
  Microphone,
  ScanLine,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
} from '../../components/icons';
import type { View } from '../../types/action';

export type TourPlacement = 'right' | 'left' | 'below' | 'above';
export interface TourStep {
  id: string;
  title: string;
  description: string;
  target: string;
  fallback?: string;
  view: View;
  icon: typeof Inbox;
  tips?: string[];
  placement?: TourPlacement;
}

export const workspaceSearchShortcut = () =>
  /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';

export function tourSteps(): TourStep[] {
  return [
    {
      id: 'welcome',
      title: 'Welcome to TaskLens',
      description:
        'Your sidebar brings captures, plans, and completed items together. Here’s a quick look at the essentials.',
      target: 'navigation',
      fallback: 'brand',
      view: 'inbox',
      icon: Sparkles,
      tips: [
        'Use Next and Back to explore, or Escape to leave.',
        'Ctrl + Shift + Space collapses the sidebar.',
      ],
      placement: 'right',
    },
    {
      id: 'screenshot',
      title: 'Start in Inbox',
      description:
        'Drop a screenshot, browse for an image, or paste one from your clipboard. TaskLens turns the information into details you can review.',
      target: 'screenshot',
      fallback: 'inbox-heading',
      view: 'inbox',
      icon: FileImage,
      tips: ['PNG, JPG, and WEBP images up to 10 MB.'],
      placement: 'above',
    },
    {
      id: 'voice',
      title: 'Capture voice or text',
      description:
        'Record a voice note, import audio, or choose Capture text to paste or type information. Review the extracted details before saving.',
      target: 'voice',
      fallback: 'inbox-heading',
      view: 'inbox',
      icon: Microphone,
      tips: ['Recording starts only when you choose the microphone.'],
      placement: 'below',
    },
    {
      id: 'review-source',
      title: 'Review & Source Trace',
      description:
        'After capture, check dates, requirements, and uncertain details before saving. Source controls let you trace supported details back to the screenshot or transcript.',
      target: 'review-guidance',
      fallback: 'inbox-heading',
      view: 'inbox',
      icon: ScanLine,
      tips: ['Nothing from a capture is saved until you choose to save it.'],
      placement: 'above',
    },
    {
      id: 'search',
      title: 'Search or create',
      description:
        'Search your saved information across the workspace. Already know the details? Use New item to create a task, event, or deadline yourself.',
      target: 'workspace-tools',
      fallback: 'search',
      view: 'inbox',
      icon: Search,
      tips: [`Open search with ${workspaceSearchShortcut()}.`],
      placement: 'below',
    },
    {
      id: 'today',
      title: 'Today and what’s next',
      description:
        'Today brings together confirmed items due today and anything overdue. Upcoming in the sidebar groups your future plans by date.',
      target: 'view-today',
      fallback: 'nav-today',
      view: 'today',
      icon: Sun,
      placement: 'below',
    },
    {
      id: 'calendar',
      title: 'A little perspective',
      description:
        'See confirmed tasks and events by date. Choose a day to see its items, or move between months to look ahead.',
      target: 'calendar',
      fallback: 'view-calendar',
      view: 'calendar',
      icon: CalendarDays,
      placement: 'below',
    },
    {
      id: 'all',
      title: 'All your tasks, together',
      description:
        'All Tasks keeps your complete collection together. Needs Review holds saved drafts and uncertain details; Completed keeps the things you’ve finished.',
      target: 'view-all',
      fallback: 'nav-all',
      view: 'all',
      icon: ListTodo,
      tips: ['Filter All Tasks by tasks, events, or deadlines.'],
      placement: 'below',
    },
    {
      id: 'ai',
      title: 'Choose where AI works',
      description:
        'Local AI works on this device, including offline. Optional Groq Cloud uses your API key and permission to process recognized text online.',
      target: 'ai-processing',
      fallback: 'settings-heading',
      view: 'settings',
      icon: ShieldCheck,
      tips: ['Screenshots are read locally. This tour does not change your AI choice.'],
      placement: 'below',
    },
    {
      id: 'reminders',
      title: 'A timely reminder',
      description:
        'Choose reminder defaults here. Desktop notifications also need explicit activation through Review activation, OS permission, and TaskLens running.',
      target: 'reminders',
      fallback: 'settings-heading',
      view: 'settings',
      icon: Bell,
      tips: ['Quitting TaskLens stops delivery. Browser reminders are saved configurations only.'],
      placement: 'below',
    },
    {
      id: 'privacy',
      title: 'Your data, on your device',
      description:
        'Saved items stay in local storage. Export a backup here to keep your own copy. Backups contain private information, so store them somewhere safe.',
      target: 'data-privacy',
      fallback: 'settings-heading',
      view: 'settings',
      icon: HardDrive,
      placement: 'below',
    },
    {
      id: 'ready',
      title: 'You’re ready',
      description:
        'Your workspace is ready when you are. Start with a screenshot, a voice note, a little text, or an item of your own.',
      target: 'inbox-heading',
      view: 'inbox',
      icon: CircleCheck,
      tips: ['You can replay this guided tour from Settings at any time.'],
      placement: 'below',
    },
  ];
}
