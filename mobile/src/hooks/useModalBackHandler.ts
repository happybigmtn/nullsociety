import { useCallback } from 'react';
import { BackHandler } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

export function useModalBackHandler(isOpen: boolean, onClose: () => void) {
  useFocusEffect(
    useCallback(() => {
      if (!isOpen) {
        return undefined;
      }

      const handler = () => {
        onClose();
        return true;
      };

      const subscription = BackHandler.addEventListener('hardwareBackPress', handler);
      return () => subscription.remove();
    }, [isOpen, onClose])
  );
}

