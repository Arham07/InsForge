import React, { useState } from 'react';
import AppSidebar from './AppSidebar';
import AppHeader from './AppHeader';
import { cn } from '@/lib/utils/utils';
import { useAuth } from '@/lib/contexts/AuthContext';
import { useMediaQuery } from '@/lib/hooks/useMediaQuery';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const { user, logout } = useAuth();
  const is2xl = useMediaQuery('(min-width: 1536px)');

  return (
    <div className="h-screen bg-gray-50 flex">
      <AppHeader currentUser={user} onLogout={logout} />

      <AppSidebar
        currentUser={user}
        onLogout={logout}
        isCollapsed={is2xl ? sidebarCollapsed : !isHovering}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
        onMouseEnter={() => setIsHovering(true)}
        onMouseLeave={() => setIsHovering(false)}
      />

      {/* Main content */}
      <div
        className={cn(
          'flex-1 transition-all duration-300 ease-in-out overflow-y-auto mt-16 ml-18',
          !sidebarCollapsed && '2xl:ml-60'
        )}
      >
        {children}
      </div>
    </div>
  );
}
