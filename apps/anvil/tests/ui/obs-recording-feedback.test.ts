import { initObsRecordingFeedback } from '../../src/ui/obs-recording-feedback';
let feedback: ReturnType<typeof initObsRecordingFeedback>;
const emit = (type: string, detail: any) => window.dispatchEvent(new CustomEvent(type, { detail }));
beforeEach(() => { document.body.innerHTML = '<div data-obs-recording-feedback role="status" hidden></div>'; feedback = initObsRecordingFeedback(); });
afterEach(() => feedback.dispose());

test('Tongs 502 after successful local capture leaves local saved confirmation intact', () => {
  emit('tp:recording:obs-local-complete', { stopped: true, outputPath: 'E:/OBS/take.mkv' });
  emit('tp:obs:recording-import', { phase: 'uploading', outputPath: 'E:/OBS/take.mkv' });
  emit('tp:obs:recording-import', { phase: 'failed', reason: 'Tongs HTTP 502', outputPath: 'E:/OBS/take.mkv' });
  const text = document.querySelector('[data-obs-recording-feedback]')!.textContent!;
  expect(text).toContain('OBS recording saved locally: E:/OBS/take.mkv'); expect(text).toContain('Cloud persistence failed'); expect(text).toContain('remains saved');
});
test('a late cloud response for the previous take cannot relabel the current take', () => {
  emit('tp:recording:obs-local-complete', { stopped: true, outputPath: 'E:/OBS/new.mkv' });
  emit('tp:obs:recording-import', { phase: 'failed', reason: 'old 502', outputPath: 'E:/OBS/old.mkv' });
  expect(document.querySelector('[data-obs-recording-feedback]')!.textContent).not.toContain('old 502');
  emit('tp:recording:obs-started', {});
  emit('tp:obs:recording-import', { phase: 'failed', reason: 'old 502', outputPath: 'E:/OBS/new.mkv' });
  const active = document.querySelector('[data-obs-recording-feedback]')!.textContent;
  expect(active).toContain('recording active (confirmed by OBS)');
  expect(active).not.toContain('old 502');
});
test('unknown start is explicitly unconfirmed, with no active claim', () => {
  emit('tp:recording:uncertain', { engine: 'obs' });
  expect(document.querySelector('[data-obs-recording-feedback]')!.textContent).toContain('status is unconfirmed');
  expect(document.querySelector('[data-obs-recording-feedback]')!.textContent).not.toContain('recording active');
});
