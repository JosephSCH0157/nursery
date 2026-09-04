jest.mock('../../src/forge/workpiece-commit', () => ({
  commitRecordingFileToTongs: jest.fn(),
  ensureRecordingCaptureTarget: jest.fn(async () => ({ ok: false })),
  transitionRecordingCompleted: jest.fn(),
  transitionRecordingDiscarded: jest.fn(),
  transitionRecordingKept: jest.fn(),
}));

jest.mock('../../src/recording/recording-decision-dialog', () => ({
  showRecordingDecisionDialog: jest.fn(),
}));

import { relativeObsOutputPath } from '../../src/recording/obs-finished-import';

describe('OBS finished-file boundary', () => {
  test('resolves a finished file beneath the linked OBS folder', () => {
    expect(relativeObsOutputPath(
      'C:\\Users\\creator\\Videos\\OBS\\episode-01.mkv',
      'OBS',
    )).toEqual(['episode-01.mkv']);
  });

  test('supports nested OBS output folders', () => {
    expect(relativeObsOutputPath('/home/creator/OBS/2026/episode-01.mkv', 'OBS'))
      .toEqual(['2026', 'episode-01.mkv']);
  });

  test('rejects traversal and an unrelated linked directory', () => {
    expect(relativeObsOutputPath('C:\\OBS\\..\\Secrets\\take.mkv', 'OBS')).toBeNull();
    expect(relativeObsOutputPath('C:\\Videos\\take.mkv', 'OBS')).toBeNull();
  });
});
