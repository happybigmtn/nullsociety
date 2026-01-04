import React from 'react';
import { act, create } from 'react-test-renderer';
import { PrimaryButton } from '../PrimaryButton';

jest.mock('../../../services/haptics', () => ({
  haptics: { betConfirm: jest.fn(() => Promise.resolve()) },
}));

describe('PrimaryButton', () => {
  let mockHaptics: { betConfirm: jest.Mock };

  beforeEach(() => {
    mockHaptics = (jest.requireMock('../../../services/haptics') as {
      haptics: { betConfirm: jest.Mock };
    }).haptics;
    mockHaptics.betConfirm.mockClear();
  });

  it('fires haptic and onPress when enabled', async () => {
    const onPress = jest.fn();
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<PrimaryButton label="Deal" onPress={onPress} />);
    });

    const button = tree.root.findByProps({ accessibilityRole: 'button' });
    await act(async () => {
      await button.props.onPress();
    });

    expect(mockHaptics.betConfirm).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalled();
  });

  it('does not trigger when disabled', async () => {
    const onPress = jest.fn();
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<PrimaryButton label="Deal" onPress={onPress} disabled />);
    });

    const button = tree.root.findByProps({ accessibilityRole: 'button' });
    await act(async () => {
      await button.props.onPress();
    });

    expect(mockHaptics.betConfirm).not.toHaveBeenCalled();
    expect(onPress).not.toHaveBeenCalled();
  });

  it('renders variant and size styles', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<PrimaryButton label="Danger" onPress={() => {}} variant="danger" size="large" />);
    });

    expect(tree.toJSON()).toBeTruthy();
  });
});
