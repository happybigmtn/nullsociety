import React, { createContext, useContext } from 'react';
import { useCasinoConnection, type CasinoConnection } from '../hooks/useCasinoConnection';

const CasinoConnectionContext = createContext<CasinoConnection | null>(null);

export function CasinoConnectionProvider({
  baseUrl = '/api',
  children,
}: {
  baseUrl?: string;
  children: React.ReactNode;
}) {
  const connection = useCasinoConnection(baseUrl);
  return <CasinoConnectionContext.Provider value={connection}>{children}</CasinoConnectionContext.Provider>;
}

export function useSharedCasinoConnection(): CasinoConnection {
  const ctx = useContext(CasinoConnectionContext);
  if (!ctx) {
    throw new Error('useSharedCasinoConnection must be used within CasinoConnectionProvider');
  }
  return ctx;
}

