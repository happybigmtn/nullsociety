import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { EventBadge } from '../EventBadge';
import { formatCountdownShort, useWeeklyEvent } from '../../../hooks/useWeeklyEvent';

jest.mock('../../../hooks/useWeeklyEvent', () => ({
  formatCountdownShort: jest.fn(),
  useWeeklyEvent: jest.fn(),
}));

describe('EventBadge', () => {
  beforeEach(() => {
    (formatCountdownShort as jest.Mock).mockReturnValue('1d');
  });

  it('renders nothing when no event', () => {
    (useWeeklyEvent as jest.Mock).mockReturnValue({ event: null, timeLeftMs: 0 });
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<EventBadge />);
    });
    expect(tree.root.findAllByType(Text).length).toBe(0);
  });

  it('renders event details', () => {
    (useWeeklyEvent as jest.Mock).mockReturnValue({
      event: { label: 'Weekly', color: '#ff0000' },
      timeLeftMs: 1000,
    });
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<EventBadge />);
    });
    const text = tree.root.findAllByType(Text).map((node) => node.props.children).join(' ');
    expect(text).toContain('Event');
    expect(text).toContain('Weekly');
    expect(text).toContain('Ends in');
    expect(text).toContain('1d');
  });
});
