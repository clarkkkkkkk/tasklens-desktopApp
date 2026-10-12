import { MicrophoneIcon as SolarMicrophone } from '@solar-icons/react/bold-duotone/microphone';
import type { Icon, IconProps } from '@solar-icons/react/lib/types';
import { DangerCircleIcon as SolarAlertCircle } from '@solar-icons/react/bold-duotone/danger-circle';
import { ArrowDownIcon as SolarArrowDown } from '@solar-icons/react/bold-duotone/arrow-down';
import { ArrowRightIcon as SolarArrowRight } from '@solar-icons/react/bold-duotone/arrow-right';
import { ArrowUpIcon as SolarArrowUp } from '@solar-icons/react/bold-duotone/arrow-up';
import { ArrowUpFromLineIcon as SolarArrowUpFromLine } from '@solar-icons/react/bold-duotone/arrow-up-from-line';
import { BellIcon as SolarBell } from '@solar-icons/react/bold-duotone/bell';
import { CalendarDateIcon as SolarCalendarDays } from '@solar-icons/react/bold-duotone/calendar-date';
import { CalendarIcon as SolarCalendarRange } from '@solar-icons/react/bold-duotone/calendar';
import { CheckIcon as SolarCheck } from '@solar-icons/react/bold-duotone/check';
import { AltArrowLeftIcon as SolarChevronLeft } from '@solar-icons/react/bold-duotone/alt-arrow-left';
import { AltArrowRightIcon as SolarChevronRight } from '@solar-icons/react/bold-duotone/alt-arrow-right';
import { CircleDashedIcon as SolarCircle } from '@solar-icons/react/bold-duotone/circle-dashed';
import { CheckCircleIcon as SolarCircleCheck } from '@solar-icons/react/bold-duotone/check-circle';
import { QuestionCircleIcon as SolarCircleHelp } from '@solar-icons/react/bold-duotone/question-circle';
import { ClockCircleIcon as SolarClock3 } from '@solar-icons/react/bold-duotone/clock-circle';
import { ArrowToDownLeftIcon as SolarCornerDownLeft } from '@solar-icons/react/bold-duotone/arrow-to-down-left';
import { DownloadMinimalisticIcon as SolarDownload } from '@solar-icons/react/bold-duotone/download-minimalistic';
import { GalleryIcon as SolarFileImage } from '@solar-icons/react/bold-duotone/gallery';
import { FlagIcon as SolarFlag } from '@solar-icons/react/bold-duotone/flag';
import { ServerIcon as SolarHardDrive } from '@solar-icons/react/bold-duotone/server';
import { GalleryAddIcon as SolarImagePlus } from '@solar-icons/react/bold-duotone/gallery-add';
import { InboxIcon as SolarInbox } from '@solar-icons/react/bold-duotone/inbox';
import { LayersIcon as SolarLayers3 } from '@solar-icons/react/bold-duotone/layers';
import { ChecklistIcon as SolarListChecks } from '@solar-icons/react/bold-duotone/checklist';
import { ListCheckIcon as SolarListTodo } from '@solar-icons/react/bold-duotone/list-check';
import { RefreshIcon as SolarLoaderCircle } from '@solar-icons/react/bold-duotone/refresh';
import { MapPointIcon as SolarMapPin } from '@solar-icons/react/bold-duotone/map-point';
import { MonitorIcon as SolarMonitor } from '@solar-icons/react/bold-duotone/monitor';
import { PenIcon as SolarPencil } from '@solar-icons/react/bold-duotone/pen';
import { AddIcon as SolarPlus } from '@solar-icons/react/bold-duotone/add';
import { RefreshCircleIcon as SolarRefreshCw } from '@solar-icons/react/bold-duotone/refresh-circle';
import { RestartIcon as SolarRotateCcw } from '@solar-icons/react/bold-duotone/restart';
import { DisketteIcon as SolarSave } from '@solar-icons/react/bold-duotone/diskette';
import { ScannerIcon as SolarScanLine } from '@solar-icons/react/bold-duotone/scanner';
import { RoundedMagnifierIcon as SolarSearch } from '@solar-icons/react/bold-duotone/rounded-magnifier';
import { SettingsIcon as SolarSettings } from '@solar-icons/react/bold-duotone/settings';
import { ShieldCheckIcon as SolarShieldCheck } from '@solar-icons/react/bold-duotone/shield-check';
import { StarsIcon as SolarSparkles } from '@solar-icons/react/bold-duotone/stars';
import { SunIcon as SolarSun } from '@solar-icons/react/bold-duotone/sun';
import { TrashBinTrashIcon as SolarTrash2 } from '@solar-icons/react/bold-duotone/trash-bin-trash';
import { CloseIcon as SolarX } from '@solar-icons/react/bold-duotone/close';

// All interface icons accompany text or an explicitly labelled control.
// Keep geometry and duotone layers from Solar; preserve each caller's size/class.
function decorative(Component: Icon) {
  return function DecorativeIcon(props: IconProps) {
    return (
      <Component
        secondaryColor="currentColor"
        secondaryOpacity={0.5}
        {...props}
        aria-hidden="true"
        focusable="false"
      />
    );
  };
}

export const AlertCircle = decorative(SolarAlertCircle);
export const ArrowDown = decorative(SolarArrowDown);
export const ArrowRight = decorative(SolarArrowRight);
export const ArrowUp = decorative(SolarArrowUp);
export const ArrowUpFromLine = decorative(SolarArrowUpFromLine);
export const Bell = decorative(SolarBell);
export const CalendarDays = decorative(SolarCalendarDays);
export const CalendarRange = decorative(SolarCalendarRange);
export const Check = decorative(SolarCheck);
export const ChevronLeft = decorative(SolarChevronLeft);
export const ChevronRight = decorative(SolarChevronRight);
export const Circle = decorative(SolarCircle);
export const CircleCheck = decorative(SolarCircleCheck);
export const CircleHelp = decorative(SolarCircleHelp);
export const Clock3 = decorative(SolarClock3);
export const CornerDownLeft = decorative(SolarCornerDownLeft);
export const Download = decorative(SolarDownload);
export const FileImage = decorative(SolarFileImage);
export const Flag = decorative(SolarFlag);
export const HardDrive = decorative(SolarHardDrive);
export const ImagePlus = decorative(SolarImagePlus);
export const Inbox = decorative(SolarInbox);
export const Layers3 = decorative(SolarLayers3);
export const ListChecks = decorative(SolarListChecks);
export const ListTodo = decorative(SolarListTodo);
export const LoaderCircle = decorative(SolarLoaderCircle);
export const MapPin = decorative(SolarMapPin);
export const Monitor = decorative(SolarMonitor);
export const Pencil = decorative(SolarPencil);
export const Plus = decorative(SolarPlus);
export const RefreshCw = decorative(SolarRefreshCw);
export const RotateCcw = decorative(SolarRotateCcw);
export const Save = decorative(SolarSave);
export const ScanLine = decorative(SolarScanLine);
export const Search = decorative(SolarSearch);
export const Settings = decorative(SolarSettings);
export const ShieldCheck = decorative(SolarShieldCheck);
export const Sparkles = decorative(SolarSparkles);
export const Sun = decorative(SolarSun);
export const Trash2 = decorative(SolarTrash2);
export const X = decorative(SolarX);

export const Microphone = decorative(SolarMicrophone);
