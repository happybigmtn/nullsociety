import { Outlet } from 'react-router-dom';
import { BottomNav } from './BottomNav';

export default function AppLayout() {
  return (
    <div className="min-h-screen pb-bottom-nav">
      <Outlet />
      <BottomNav />
    </div>
  );
}

