import React from 'react';
import {
  LayoutDashboard,
  Package,
  ArrowDownToLine,
  ArrowUpFromLine,
  BarChart3,
  Settings,
  ChevronLeft,
  ChevronRight,
  Layers,
  Tag,
  Wallet,
} from 'lucide-react';
import { useUIStore } from '../../store/useUIStore';

interface NavGroup {
  groupTitle: string;
  items: {
    id: string;
    label: string;
    icon: React.ElementType;
  }[];
}

export const Sidebar: React.FC = () => {
  const { activeTab, setActiveTab, sidebarCollapsed, setSidebarCollapsed } = useUIStore();

  const navGroups: NavGroup[] = [
    {
      groupTitle: 'TỔNG QUAN',
      items: [{ id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard }],
    },
    {
      groupTitle: 'KHO & HÀNG HÓA',
      items: [
        { id: 'products', label: 'Sản phẩm', icon: Package },
        { id: 'import', label: 'Nhập kho', icon: ArrowDownToLine },
        { id: 'export', label: 'Xuất kho / Bán', icon: ArrowUpFromLine },
        { id: 'warehouse', label: 'Quản lý Kho & Vị trí', icon: Layers },
      ],
    },
    {
      groupTitle: 'TÀI CHÍNH & BẢNG GIÁ',
      items: [
        { id: 'financials', label: 'Tài chính & Sổ quỹ', icon: Wallet },
        { id: 'promotions', label: 'Khuyến mãi & Bảng giá', icon: Tag },
      ],
    },
    {
      groupTitle: 'BÁO CÁO & CÀI ĐẶT',
      items: [
        { id: 'reports', label: 'Báo cáo & Thống kê', icon: BarChart3 },
        { id: 'settings', label: 'Cài đặt hệ thống', icon: Settings },
      ],
    },
  ];

  return (
    <aside
      className={`hidden md:flex flex-col border-r border-gray-200 bg-white transition-all duration-300 dark:border-gray-800 dark:bg-gray-900 no-print ${
        sidebarCollapsed ? 'w-20' : 'w-68'
      }`}
    >
      {/* Navigation Links */}
      <div className="flex-1 space-y-3.5 p-3.5 overflow-y-auto">
        {navGroups.map((group, groupIdx) => (
          <div key={groupIdx} className="space-y-1">
            {!sidebarCollapsed ? (
              <div className="px-3 pt-2.5 pb-1 text-xs font-extrabold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                {group.groupTitle}
              </div>
            ) : groupIdx > 0 ? (
              <div className="my-2 border-t border-gray-100 dark:border-gray-800" />
            ) : null}

            {group.items.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`group relative flex w-full items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm font-bold transition ${
                    isActive
                      ? 'bg-emerald-500/10 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400 font-extrabold shadow-xs'
                      : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white'
                  } ${sidebarCollapsed ? 'justify-center py-3.5' : ''}`}
                  title={item.label}
                >
                  <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`} />
                  {!sidebarCollapsed && <span className="tracking-tight">{item.label}</span>}
                </button>
              );
            })}
          </div>
        ))}
      </div>

      {/* Collapse Toggle */}
      <div className="border-t border-gray-200 p-3.5 dark:border-gray-800">
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="flex w-full items-center justify-center rounded-xl py-2.5 text-gray-500 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white transition"
          title={sidebarCollapsed ? 'Mở rộng Sidebar' : 'Thu gọn Sidebar'}
        >
          {sidebarCollapsed ? <ChevronRight className="h-5.5 w-5.5" /> : <ChevronLeft className="h-5.5 w-5.5" />}
        </button>
      </div>
    </aside>
  );
};
