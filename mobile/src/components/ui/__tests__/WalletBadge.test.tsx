import React from 'react';
import { act, create } from 'react-test-renderer';
import { Text } from 'react-native';
import { WalletBadge } from '../WalletBadge';
import { useGameStore } from '../../../stores/gameStore';
import { getNetworkLabel } from '../../../utils';

jest.mock('../../../stores/gameStore', () => ({
  useGameStore: jest.fn(),
}));

jest.mock('../../../utils', () => ({
  getNetworkLabel: jest.fn(),
}));

const mockUseGameStore = useGameStore as jest.Mock;

describe('WalletBadge', () => {
  beforeEach(() => {
    (getNetworkLabel as jest.Mock).mockReturnValue('Testnet');
  });

  it('renders nothing without public key', () => {
    mockUseGameStore.mockImplementation((selector: (state: { publicKey: string | null }) => unknown) =>
      selector({ publicKey: null })
    );
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<WalletBadge />);
    });

    expect(tree.root.findAllByType(Text).length).toBe(0);
  });

  it('renders network and shortened key', () => {
    mockUseGameStore.mockImplementation((selector: (state: { publicKey: string | null }) => unknown) =>
      selector({ publicKey: 'abcdef1234567890' })
    );
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<WalletBadge />);
    });

    const text = tree.root.findAllByType(Text).map((node) => node.props.children).join(' ');
    expect(text).toContain('Testnet');
    expect(text).toContain('abcdef...7890');
  });
});
