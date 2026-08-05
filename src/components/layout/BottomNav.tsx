import React from 'react';
import {
  LayoutDashboard,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  Settings,
  Wallet,
} from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';

export const BottomNav: React.FC = () => {
  const { activeTab, setActiveTab } = useUIStore();

  const mobileNavItems = [
    { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'products', label: 'Sản phẩm', icon: Package },
    { id: 'import', label: 'Nhập kho', icon: ArrowDownToLine },
    { id: 'export', label: 'Xuất kho', icon: ArrowUpFromLine },
    { id: 'financials', label: 'Tài chính', icon: Wallet },
    { id: 'settings', label: 'Cài đặt', icon: Settings },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 items-center justify-around border-t border-gray-200 bg-white px-2 dark:border-gray-800 dark:bg-gray-900 md:hidden shadow-lg no-print">
      {mobileNavItems.map((item) => {
        const Icon = item.icon;
        const isActive = activeTab === item.id;

        return (
          <button
            key={item.id}
            onClick={() => setActiveTab(item.id)}
            className={`relative flex flex-col items-center justify-center gap-1 text-[10px] font-medium transition ${
              isActive
                ? 'text-emerald-600 dark:text-emerald-400 font-bold'
                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200'
            }`}
          >
            <Icon className={`h-5 w-5 ${isActive ? 'scale-110' : ''}`} />
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};
