import React from 'react';
import { act, create } from 'react-test-renderer';
import { formatCountdownShort, useWeeklyEvent } from '../useWeeklyEvent';

describe('useWeeklyEvent', () => {
  beforeAll(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-06T00:00:00Z'));
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  it('formats countdown values', () => {
    expect(formatCountdownShort(0)).toBe('0h');
    expect(formatCountdownShort(60 * 60 * 1000)).toBe('1h 0m');
    expect(formatCountdownShort(26 * 60 * 60 * 1000)).toBe('1d 2h');
  });

  it('returns a weekly event', () => {
    let result: ReturnType<typeof useWeeklyEvent> | null = null;
    const TestComponent = () => {
      result = useWeeklyEvent();
      return null;
    };

    act(() => {
      create(<TestComponent />);
    });

    expect(result?.event).toBeDefined();
    expect(result?.timeLeftMs).toBeGreaterThan(0);
  });
});
