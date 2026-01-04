import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { ChipSelector } from '../ChipSelector';
import { CHIP_VALUES } from '../../../constants/theme';

describe('ChipSelector', () => {
  it('renders chips for each value', () => {
    const onSelect = jest.fn();
    const onChipPlace = jest.fn();
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <ChipSelector selectedValue={25} onSelect={onSelect} onChipPlace={onChipPlace} />
      );
    });

    const labels = tree.root.findAllByType(Text).map((node) => {
      const { children } = node.props;
      if (Array.isArray(children)) {
        return children.join('');
      }
      return String(children);
    });
    CHIP_VALUES.forEach((value) => {
      expect(labels).toContain(`$${value}`);
    });
  });
});
