import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { isTutorialCompleted, markTutorialCompleted } from '../../../services/storage';
import { TutorialOverlay } from '../TutorialOverlay';

jest.mock('../../../services/haptics', () => ({
  haptics: { buttonPress: jest.fn() },
}));

jest.mock('../../../services/storage', () => ({
  isTutorialCompleted: jest.fn(),
  markTutorialCompleted: jest.fn(),
}));

describe('TutorialOverlay', () => {
  let mockHaptics: { buttonPress: jest.Mock };

  beforeEach(() => {
    mockHaptics = (jest.requireMock('../../../services/haptics') as {
      haptics: { buttonPress: jest.Mock };
    }).haptics;
    (isTutorialCompleted as jest.Mock).mockReturnValue(false);
    (markTutorialCompleted as jest.Mock).mockReset();
    mockHaptics.buttonPress.mockClear();
  });

  it('advances through steps and completes', async () => {
    const onComplete = jest.fn();
    const steps = [
      { title: 'Step 1', description: 'First' },
      { title: 'Step 2', description: 'Second' },
    ];

    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <TutorialOverlay gameId="blackjack" steps={steps} onComplete={onComplete} forceShow />
      );
    });

    let text = tree.root.findAllByType(Text).map((node) => node.props.children).join(' ');
    expect(text).toContain('Step 1');

    const buttons = tree.root.findAll((node) => typeof node.props.onPress === 'function');
    await act(async () => {
      await buttons[1].props.onPress();
    });

    text = tree.root.findAllByType(Text).map((node) => node.props.children).join(' ');
    expect(text).toContain('Step 2');

    await act(async () => {
      await buttons[1].props.onPress();
    });

    expect(markTutorialCompleted).toHaveBeenCalledWith('blackjack');
    expect(onComplete).toHaveBeenCalled();
    expect(mockHaptics.buttonPress).toHaveBeenCalled();
  });

  it('skips tutorial when requested', async () => {
    const onComplete = jest.fn();
    const steps = [{ title: 'Only', description: 'One' }];
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <TutorialOverlay gameId="hilo" steps={steps} onComplete={onComplete} forceShow />
      );
    });

    const buttons = tree.root.findAll((node) => typeof node.props.onPress === 'function');
    await act(async () => {
      await buttons[0].props.onPress();
    });

    expect(markTutorialCompleted).toHaveBeenCalledWith('hilo');
    expect(onComplete).toHaveBeenCalled();
  });
});
