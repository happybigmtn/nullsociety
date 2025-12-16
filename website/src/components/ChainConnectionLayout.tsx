import React from 'react';
import { Outlet } from 'react-router-dom';
import { CasinoConnectionProvider } from '../chain/CasinoConnectionContext';

export default function ChainConnectionLayout() {
  return (
    <CasinoConnectionProvider baseUrl="/api">
      <Outlet />
    </CasinoConnectionProvider>
  );
}

