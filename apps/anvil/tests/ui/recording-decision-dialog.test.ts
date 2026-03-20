import {
  hideRecordingFinalizeIndicator,
  showRecordingDecisionDialog,
  showRecordingFinalizeIndicator,
} from '../../src/recording/recording-decision-dialog';

describe('recording decision dialog', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    const style = document.getElementById('tp-recording-decision-styles');
    style?.parentElement?.removeChild(style);
  });

  test('shows a working indicator while the take is finalizing', () => {
    showRecordingFinalizeIndicator({
      takeName: 'Episode_00.webm',
      detail: 'Saving your take and preparing review options.',
    });

    expect(document.body.textContent).toContain('Finalizing recording');
    expect(document.body.textContent).toContain('Working…');
    expect(document.body.textContent).toContain('Episode_00.webm');

    hideRecordingFinalizeIndicator();
    expect(document.getElementById('tp-recording-working-modal')).toBeNull();
  });

  test('keeps a take and closes the dialog', async () => {
    const onKeep = jest.fn(async () => {});
    const onDiscard = jest.fn(async () => {});

    const dialogPromise = showRecordingDecisionDialog({
      takeName: 'Episode_01.webm',
      onKeep,
      onDiscard,
    });

    const keepButton = document.querySelector<HTMLButtonElement>('[data-action="keep"]');

    expect(document.body.textContent).toContain('Recording complete');
    expect(document.body.textContent).toContain('Episode_01.webm');
    expect(keepButton).toBeTruthy();

    keepButton?.click();
    await dialogPromise;

    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(onDiscard).not.toHaveBeenCalled();
    expect(document.getElementById('tp-recording-decision-modal')).toBeNull();
  });

  test('decision dialog replaces the working indicator', async () => {
    const onKeep = jest.fn(async () => {});
    const onDiscard = jest.fn(async () => {});

    showRecordingFinalizeIndicator({ takeName: 'Episode_replace.webm' });

    const dialogPromise = showRecordingDecisionDialog({
      takeName: 'Episode_replace.webm',
      onKeep,
      onDiscard,
    });

    expect(document.getElementById('tp-recording-working-modal')).toBeNull();
    expect(document.getElementById('tp-recording-decision-modal')).toBeTruthy();

    document.querySelector<HTMLButtonElement>('[data-action="discard"]')?.click();
    await dialogPromise;
  });

  test('shows a retryable error when the decision write fails', async () => {
    const onKeep = jest.fn(async () => {
      throw new Error('Tongs unavailable');
    });
    const onDiscard = jest.fn(async () => {});

    const dialogPromise = showRecordingDecisionDialog({
      takeName: 'Episode_02.webm',
      onKeep,
      onDiscard,
    });

    const keepButton = document.querySelector<HTMLButtonElement>('[data-action="keep"]');
    keepButton?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorNode = document.querySelector<HTMLElement>('[data-role="error"]');
    const discardButton = document.querySelector<HTMLButtonElement>('[data-action="discard"]');

    expect(onKeep).toHaveBeenCalledTimes(1);
    expect(errorNode?.textContent).toContain('Tongs unavailable');
    expect(document.getElementById('tp-recording-decision-modal')).toBeTruthy();

    discardButton?.click();
    await dialogPromise;

    expect(onDiscard).toHaveBeenCalledTimes(1);
    expect(document.getElementById('tp-recording-decision-modal')).toBeNull();
  });
});
