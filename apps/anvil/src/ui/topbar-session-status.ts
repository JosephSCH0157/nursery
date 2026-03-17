type StatusTone = 'neutral' | 'good' | 'issue';

type StatusState = {
  full: string;
  short: string;
  tone: StatusTone;
};

const SOURCE_IDS = [
  'permChip',
  'asrCalChip',
  'displayChip',
  'recChip',
  'scrollChip',
  'camRtcChip',
  'obsChip',
] as const;

let wired = false;

function normalizeText(value: string | null | undefined): string {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/\|\s*/g, ' | ')
    .trim();
}

function buildDefault(id: string, text: string): StatusState {
  return {
    full: text,
    short: text.replace(/^[^:]+:\s*/, ''),
    tone: 'neutral',
  };
}

function parseMic(text: string): StatusState {
  const lower = text.toLowerCase();
  if (lower.includes('denied') || lower.includes('blocked')) {
    return { full: text, short: 'Mic blocked', tone: 'issue' };
  }
  if (lower.includes('unknown') || lower.includes('pending')) {
    return { full: text, short: 'Mic pending', tone: 'issue' };
  }
  if (lower.includes('capturing')) {
    return { full: text, short: 'Mic live', tone: 'good' };
  }
  if (lower.includes('allowed')) {
    return { full: text, short: 'Mic ready', tone: 'good' };
  }
  if (lower.includes('released')) {
    return { full: text, short: 'Mic released', tone: 'neutral' };
  }
  return buildDefault('permChip', text);
}

function parseAsr(text: string): StatusState {
  const lower = text.toLowerCase();
  if (lower.includes('no calibration') || lower.includes('needs calibration')) {
    return { full: text, short: 'ASR needs calibration', tone: 'issue' };
  }
  if (lower.includes('blocked') || lower.includes('unavailable') || lower.includes('error')) {
    return { full: text, short: 'ASR blocked', tone: 'issue' };
  }
  if (lower.includes('calibrated') || lower.includes('ready')) {
    return { full: text, short: 'ASR calibrated', tone: 'good' };
  }
  return buildDefault('asrCalChip', text);
}

function parseDisplay(text: string): StatusState {
  const lower = text.toLowerCase();
  if (lower.includes('blocked') || lower.includes('error')) {
    return { full: text, short: 'Display blocked', tone: 'issue' };
  }
  if (lower.includes('live')) {
    return { full: text, short: 'Display live', tone: 'good' };
  }
  if (lower.includes('ready') || lower.includes('open')) {
    return { full: text, short: 'Display ready', tone: 'good' };
  }
  if (lower.includes('closed')) {
    return { full: text, short: 'Display closed', tone: 'neutral' };
  }
  return buildDefault('displayChip', text);
}

function parseSpeech(text: string): StatusState {
  const lower = text.toLowerCase();
  if (lower.includes('error') || lower.includes('blocked')) {
    return { full: text, short: 'Speech blocked', tone: 'issue' };
  }
  if (lower.includes('ready')) {
    return { full: text, short: 'Speech ready', tone: 'good' };
  }
  if (lower.includes('listening') || lower.includes('live')) {
    return { full: text, short: 'Speech live', tone: 'good' };
  }
  if (lower.includes('idle')) {
    return { full: text, short: 'Speech idle', tone: 'neutral' };
  }
  return buildDefault('recChip', text);
}

function parseScroll(text: string): StatusState {
  const lower = text.toLowerCase();
  if (lower.includes('error') || lower.includes('blocked')) {
    return { full: text, short: 'Scroll blocked', tone: 'issue' };
  }
  if (lower.includes('idle') || lower.includes('manual')) {
    return { full: text, short: 'Scroll idle', tone: 'neutral' };
  }
  return { full: text, short: 'Scroll active', tone: 'good' };
}

function parseCamera(text: string): StatusState {
  const lower = text.toLowerCase();
  if (lower.includes('blocked') || lower.includes('error')) {
    return { full: text, short: 'Camera blocked', tone: 'issue' };
  }
  if (lower.includes('live') || lower.includes('ready')) {
    return { full: text, short: 'Camera live', tone: 'good' };
  }
  if (lower.includes('idle')) {
    return { full: text, short: 'Camera idle', tone: 'neutral' };
  }
  return buildDefault('camRtcChip', text);
}

function parseObs(text: string): StatusState {
  const lower = text.toLowerCase();
  if (lower.includes('error')) {
    return { full: text, short: 'OBS error', tone: 'issue' };
  }
  if (lower.includes('connecting')) {
    return { full: text, short: 'OBS connecting', tone: 'neutral' };
  }
  if (lower.includes('disconnected')) {
    return { full: text, short: 'OBS disconnected', tone: 'neutral' };
  }
  if (lower.includes('open') || lower.includes('identified') || lower.includes('connected')) {
    return { full: text, short: 'OBS ready', tone: 'good' };
  }
  return buildDefault('obsChip', text);
}

function parseState(id: string, text: string): StatusState {
  switch (id) {
    case 'permChip':
      return parseMic(text);
    case 'asrCalChip':
      return parseAsr(text);
    case 'displayChip':
      return parseDisplay(text);
    case 'recChip':
      return parseSpeech(text);
    case 'scrollChip':
      return parseScroll(text);
    case 'camRtcChip':
      return parseCamera(text);
    case 'obsChip':
      return parseObs(text);
    default:
      return buildDefault(id, text);
  }
}

function getStates(): StatusState[] {
  return SOURCE_IDS.map((id) => {
    const element = document.getElementById(id);
    const preferred = element?.getAttribute('data-session-text');
    const text = normalizeText(preferred || element?.textContent);
    return text ? parseState(id, text) : null;
  }).filter((value): value is StatusState => Boolean(value));
}

function summarize(states: StatusState[]): { label: string; title: string; tone: StatusTone } {
  const issues = states.filter((state) => state.tone === 'issue');
  if (issues.length > 0) {
    const first = issues[0];
    const suffix = issues.length > 1 ? ` +${issues.length - 1}` : '';
    return {
      label: `Session: ${first.short}${suffix}`,
      title: states.map((state) => state.full).join('\n'),
      tone: 'issue',
    };
  }

  const good = states.filter((state) => state.tone === 'good');
  if (good.length > 0) {
    return {
      label: `Session: ${good.slice(0, 2).map((state) => state.short).join(' · ')}`,
      title: states.map((state) => state.full).join('\n'),
      tone: 'good',
    };
  }

  return {
    label: 'Session: Idle',
    title: states.map((state) => state.full).join('\n') || 'Session status',
    tone: 'neutral',
  };
}

export function initTopbarSessionStatus(): void {
  if (wired || typeof document === 'undefined') return;
  wired = true;

  const chip = document.getElementById('sessionStatusChip') as HTMLElement | null;
  if (!chip) return;

  let rafId = 0;
  const sync = () => {
    rafId = 0;
    const summary = summarize(getStates());
    chip.textContent = summary.label;
    chip.title = summary.title;
    chip.dataset.tone = summary.tone;
    chip.setAttribute('aria-label', summary.label);
  };

  const scheduleSync = () => {
    if (rafId !== 0) return;
    rafId = window.requestAnimationFrame(sync);
  };

  const attachObserver = (element: HTMLElement | null) => {
    if (!element) return;
    const observer = new MutationObserver(scheduleSync);
    observer.observe(element, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'hidden', 'aria-hidden'],
    });
  };

  SOURCE_IDS.forEach((id) => attachObserver(document.getElementById(id) as HTMLElement | null));
  scheduleSync();
}
