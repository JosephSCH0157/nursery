/** @jest-environment jsdom */

import {
  deriveFilters,
  deriveRecommendation,
  deriveRoomAnalysis,
  type CalibrationMeasurement,
} from '../../src/asr/calibration';

const makeMeasurement = (
  overrides: Partial<CalibrationMeasurement> & { spectral?: Partial<CalibrationMeasurement['spectral']> } = {},
): CalibrationMeasurement => ({
  rmsDbfs: -50,
  peakDbfs: -40,
  spectral: {
    rumbleRatio: 0.2,
    hum50: 0.02,
    hum60: 0.02,
    hissRatio: 0.1,
    sibilanceRatio: 0.2,
    bodyRatio: 0.28,
    presenceRatio: 0.24,
    ...(overrides.spectral || {}),
  },
  stability: 2,
  ...overrides,
});

describe('ASR calibration derivation', () => {
  test('quiet room yields low room risks', () => {
    const cal = {
      noiseRmsDbfs: -56,
      noisePeakDbfs: -45,
      speechRmsDbfs: -23,
      speechPeakDbfs: -9,
      snrDb: 33,
    };
    const silence = makeMeasurement();
    const speech = makeMeasurement({ rmsDbfs: -23, peakDbfs: -9, stability: 3 });
    const room = deriveRoomAnalysis(cal, silence, speech);
    expect(room.echoRisk).toBe('low');
    expect(room.clippingRisk).toBe('low');
    expect(room.rumbleDetected).toBe(false);
    expect(room.humDetected).toBe(false);
  });

  test('noisy room yields recommendation warning', () => {
    const cal = {
      noiseRmsDbfs: -36,
      noisePeakDbfs: -25,
      speechRmsDbfs: -24,
      speechPeakDbfs: -8,
      snrDb: 12,
    };
    const room = deriveRoomAnalysis(cal, makeMeasurement(), makeMeasurement({ stability: 11 }));
    const recommendation = deriveRecommendation(cal, room);
    expect(recommendation.status).toBe('recordable_but_noisy');
    expect(recommendation.messages.join(' ')).toContain('Room noise');
  });

  test('rumble and hum are detected and produce filters', () => {
    const cal = {
      noiseRmsDbfs: -47,
      noisePeakDbfs: -34,
      speechRmsDbfs: -25,
      speechPeakDbfs: -8,
      snrDb: 22,
    };
    const silence = makeMeasurement({
      spectral: { rumbleRatio: 0.6, hum60: 0.16, hum50: 0.05 },
    } as any);
    const speech = makeMeasurement({ spectral: { rumbleRatio: 0.4 } } as any);
    const room = deriveRoomAnalysis(cal, silence, speech);
    const filters = deriveFilters(room, silence, speech);
    expect(room.rumbleDetected).toBe(true);
    expect(room.humDetected).toBe(true);
    expect(filters.hpfHz).toBeDefined();
    expect(filters.mainsNotchHz).toBe(60);
  });

  test('high clipping risk is fix-first', () => {
    const cal = {
      noiseRmsDbfs: -48,
      noisePeakDbfs: -35,
      speechRmsDbfs: -13,
      speechPeakDbfs: -1.5,
      snrDb: 35,
    };
    const room = deriveRoomAnalysis(cal, makeMeasurement(), makeMeasurement({ peakDbfs: -1.5 }));
    const recommendation = deriveRecommendation(cal, room);
    expect(room.clippingRisk).toBe('high');
    expect(recommendation.status).toBe('fix_first');
  });
});
