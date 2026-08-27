import {
  hideRecordingFinalizeIndicator,
  isRecordingDecisionPending,
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

  test('explains missing workspace context without exposing an internal error code', async () => {
    const dialogPromise = showRecordingDecisionDialog({
      takeName: 'Episode_context.webm',
      onKeep: async () => { throw new Error('ready_workspace_missing'); },
      onDiscard: async () => {},
    });

    document.querySelector<HTMLButtonElement>('[data-action="keep"]')?.click();
    await new Promise((resolve) => setTimeout(resolve, 0));

    const errorText = document.querySelector<HTMLElement>('[data-role="error"]')?.textContent ?? '';
    expect(errorText).toContain('recording is still saved');
    expect(errorText).toContain('Reopen this episode from Hearth');
    expect(errorText).not.toContain('ready_workspace_missing');

    document.querySelector<HTMLButtonElement>('[data-action="discard"]')?.click();
    await dialogPromise;
  });

  test('isRecordingDecisionPending returns false when no dialog is shown', () => {
    expect(isRecordingDecisionPending()).toBe(false);
  });

  test('isRecordingDecisionPending returns true while dialog is open, false after decision', async () => {
    const onKeep = jest.fn(async () => {});
    const onDiscard = jest.fn(async () => {});

    const dialogPromise = showRecordingDecisionDialog({
      takeName: 'Episode_pending.webm',
      onKeep,
      onDiscard,
    });

    expect(isRecordingDecisionPending()).toBe(true);

    document.querySelector<HTMLButtonElement>('[data-action="keep"]')?.click();
    await dialogPromise;

    expect(isRecordingDecisionPending()).toBe(false);
  });

  test('shows recovery title and copy when isRecovery is true', async () => {
    const onKeep = jest.fn(async () => {});
    const onDiscard = jest.fn(async () => {});

    const dialogPromise = showRecordingDecisionDialog({
      takeName: 'Episode_recovery.webm',
      isRecovery: true,
      onKeep,
      onDiscard,
    });

    expect(document.body.textContent).toContain('Recording awaiting review');
    expect(document.body.textContent).toContain('not reviewed');

    document.querySelector<HTMLButtonElement>('[data-action="discard"]')?.click();
    await dialogPromise;
  });

  test('visibility guard re-inserts dialog when overlay removed while pending', async () => {
    const onKeep = jest.fn(async () => {});
    const onDiscard = jest.fn(async () => {});

    const dialogPromise = showRecordingDecisionDialog({
      takeName: 'Episode_visibility.webm',
      onKeep,
      onDiscard,
    });

    const overlay = document.getElementById('tp-recording-decision-modal');
    expect(overlay).toBeTruthy();

    // Simulate external removal of the overlay (without a button click)
    if (overlay && overlay.parentElement) {
      overlay.parentElement.removeChild(overlay);
    }
    expect(document.getElementById('tp-recording-decision-modal')).toBeNull();

    // Simulate the tab becoming visible
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Dialog should be re-inserted by the visibility guard
    expect(document.getElementById('tp-recording-decision-modal')).toBeTruthy();

    // Clean up: make a decision
    document.querySelector<HTMLButtonElement>('[data-action="discard"]')?.click();
    await dialogPromise;
  });

  test('visibility guard is removed after decision', async () => {
    const onKeep = jest.fn(async () => {});
    const onDiscard = jest.fn(async () => {});

    const dialogPromise = showRecordingDecisionDialog({
      takeName: 'Episode_guard_cleanup.webm',
      onKeep,
      onDiscard,
    });

    document.querySelector<HTMLButtonElement>('[data-action="keep"]')?.click();
    await dialogPromise;

    // After decision the guard should be gone; removing a new modal should not re-insert it
    const fakeModal = document.createElement('div');
    fakeModal.id = 'tp-recording-decision-modal';
    document.body.appendChild(fakeModal);
    fakeModal.parentElement?.removeChild(fakeModal);

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    document.dispatchEvent(new Event('visibilitychange'));
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Guard is gone — nothing re-inserted by the old dialog
    expect(document.getElementById('tp-recording-decision-modal')).toBeNull();
  });
});
