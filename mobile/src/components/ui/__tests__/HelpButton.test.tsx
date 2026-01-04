import React from 'react';
import { act, create } from 'react-test-renderer';
import { haptics } from '../../../services/haptics';

describe('HelpButton', () => {
  let HelpButton: typeof import('../HelpButton').HelpButton;
  let buttonPressSpy: jest.SpyInstance;

  beforeEach(() => {
    HelpButton = require('../HelpButton').HelpButton;
    buttonPressSpy = jest.spyOn(haptics, 'buttonPress').mockResolvedValue();
  });

  it('triggers haptic and onPress', async () => {
    const onPress = jest.fn();
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<HelpButton onPress={onPress} />);
    });

    const button = tree.root.findByProps({ accessibilityLabel: 'Help' });
    await act(async () => {
      await button.props.onPress();
    });

    expect(buttonPressSpy).toHaveBeenCalled();
    expect(onPress).toHaveBeenCalled();
  });

  afterEach(() => {
    buttonPressSpy.mockRestore();
  });
});
