let current: { dispose: () => void } | null = null;
export function initObsRecordingFeedback() {
  if (current) return current;
  let local = '';
  let cloud = '';
  let path: string | null = null;
  const render = () => {
    const text = [local, cloud].filter(Boolean).join('\n');
    document.querySelectorAll<HTMLElement>('[data-obs-recording-feedback]').forEach((element) => {
      element.hidden = !text;
      if (element.textContent !== text) element.textContent = text;
    });
  };
  const started = () => { path = null; local = 'OBS recording active (confirmed by OBS).'; cloud = ''; render(); };
  const uncertain = (event: Event) => {
    if ((event as CustomEvent).detail?.engine !== 'obs') return;
    local = 'OBS recording status is unconfirmed. Check OBS and use Stop before starting another take.';
    cloud = ''; render();
  };
  const completed = (event: Event) => {
    const result = (event as CustomEvent).detail;
    if (!result?.stopped || !result.outputPath) return;
    path = result.outputPath;
    local = `OBS recording saved locally: ${path}`;
    cloud = 'Cloud persistence is a separate step.';
    render();
  };
  const imported = (event: Event) => {
    const detail = (event as CustomEvent).detail || {};
    if (detail.outputPath && detail.outputPath !== path) return;
    if (detail.phase === 'uploading') cloud = 'Cloud save in progress. The local OBS file is already saved.';
    else if (detail.phase === 'failed') cloud = `Cloud persistence failed${detail.reason ? ` (${detail.reason})` : ''}. ${path ? 'The local OBS recording remains saved.' : 'Check the local file separately.'}`;
    else if (detail.phase === 'needs-file') cloud = 'Cloud persistence deferred: access to the OBS file is required. The local recording is unchanged.';
    else if (['decision-required', 'kept'].includes(detail.phase)) cloud = 'Cloud recording completion confirmed.';
    else return;
    render();
  };
  const events: Array<[string, EventListener]> = [
    ['tp:recording:obs-started', started], ['tp:recording:uncertain', uncertain],
    ['tp:recording:obs-local-complete', completed], ['tp:obs:recording-import', imported],
  ];
  events.forEach(([name, listener]) => window.addEventListener(name, listener));
  const observer = new MutationObserver(render);
  observer.observe(document.documentElement, { childList: true, subtree: true });
  current = { dispose: () => {
    observer.disconnect(); events.forEach(([name, listener]) => window.removeEventListener(name, listener)); current = null;
  } };
  return current;
}
