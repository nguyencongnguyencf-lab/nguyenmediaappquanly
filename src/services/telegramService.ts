import { useSettingsStore } from '../store/useSettingsStore';
import type { InventoryTransaction, FinancialTransaction } from '../types/inventory';

interface SendResult {
  success: boolean;
  message?: string;
}

export interface LowStockItem {
  name: string;
  sku: string;
  stockQuantity: number;
  minStockAlert: number;
  unit: string;
}

/**
  Send raw text message to Telegram Chat using Telegram Bot API
 */
export const sendTelegramMessage = async (
  text: string,
  overrideToken?: string,
  overrideChatId?: string
): Promise<SendResult> => {
  const settings = useSettingsStore.getState();
  const token = overrideToken || settings.telegramBotToken;
  const chatId = overrideChatId || settings.telegramChatId;
  const enabled = overrideToken ? true : settings.telegramEnabled;

  if (!enabled) {
    return { success: false, message: 'Thông báo Telegram chưa được bật.' };
  }

  if (!token || !chatId) {
    return { success: false, message: 'Thiếu Bot Token hoặc Chat ID.' };
  }

  try {
    const url = `https://api.telegram.org/bot${token.trim()}/sendMessage`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        chat_id: chatId.trim(),
        text: text,
        parse_mode: 'HTML',
        disable_web_page_preview: true,
      }),
    });

    const data = await response.json();

    if (data.ok) {
      return { success: true };
    } else {
      return {
        success: false,
        message: data.description || 'Lỗi không xác định từ Telegram API.',
      };
    }
  } catch (error: any) {
    console.error('Telegram API Error:', error);
    return {
      success: false,
      message: error.message || 'Không thể kết nối đến máy chủ Telegram. Kiểm tra kết nối mạng.',
    };
  }
};

/**
  Send test message to check connection
 */
export const sendTestNotification = async (
  token: string,
  chatId: string
): Promise<SendResult> => {
  const storeName = useSettingsStore.getState().storeName || 'Kho Hàng Nguyễn Vi';
  const now = new Date().toLocaleString('vi-VN');
  
  const text = `🎉 <b>KẾT NỐI TELEGRAM BOT THÀNH CÔNG!</b>\n` +
    `-----------------------------------\n` +
    `🏪 <b>Cửa hàng:</b> ${storeName}\n` +
    `⏰ <b>Thời gian:</b> ${now}\n` +
    `✅ Hệ thống quản lý kho đã kết nối thành công với Telegram Bot này. Bạn sẽ nhận được các thông báo tự động khi phát sinh giao dịch.`;

  return sendTelegramMessage(text, token, chatId);
};

/**
  Notify on Stock Import (Phiếu Nhập Kho)
 */
export const notifyStockImport = async (transaction: InventoryTransaction) => {
  const settings = useSettingsStore.getState();
  if (!settings.telegramEnabled || !settings.notifyStockImport) return;

  const now = new Date(transaction.createdAt).toLocaleString('vi-VN');
  const itemsText = transaction.items
    .map(
      (item, idx) =>
        `${idx + 1}. <b>${item.productName}</b> (${item.sku})\n   👉 SL: <b>${item.quantity} ${item.unit}</b> × ${item.price.toLocaleString('vi-VN')}đ = ${item.subtotal.toLocaleString('vi-VN')}đ`
    )
    .join('\n');

  const text = `📥 <b>THÔNG BÁO NHẬP KHO MỚI</b>\n` +
    `-----------------------------------\n` +
    `📋 <b>Mã phiếu:</b> ${transaction.code}\n` +
    `🏬 <b>Nhà cung cấp:</b> ${transaction.customerSupplierName || 'Chưa ghi'}\n` +
    `💵 <b>Tổng tiền:</b> <code>${transaction.totalAmount.toLocaleString('vi-VN')} VNĐ</code>\n` +
    `⏰ <b>Thời gian:</b> ${now}\n` +
    (transaction.note ? `📝 <b>Ghi chú:</b> ${transaction.note}\n` : '') +
    `-----------------------------------\n` +
    `📦 <b>Sản phẩm nhập:</b>\n${itemsText}`;

  await sendTelegramMessage(text);
};

/**
  Notify on Stock Export (Phiếu Xuất Kho / Bán Hàng)
 */
export const notifyStockExport = async (
  transaction: InventoryTransaction,
  lowStockItems?: LowStockItem[]
) => {
  const settings = useSettingsStore.getState();
  if (!settings.telegramEnabled || !settings.notifyStockExport) return;

  const now = new Date(transaction.createdAt).toLocaleString('vi-VN');
  const itemsText = transaction.items
    .map(
      (item, idx) =>
        `${idx + 1}. <b>${item.productName}</b> (${item.sku})\n   👉 SL: <b>${item.quantity} ${item.unit}</b> × ${item.price.toLocaleString('vi-VN')}đ = ${item.subtotal.toLocaleString('vi-VN')}đ`
    )
    .join('\n');

  let text = `📤 <b>THÔNG BÁO XUẤT KHO / BÁN HÀNG</b>\n` +
    `-----------------------------------\n` +
    `📋 <b>Mã phiếu:</b> ${transaction.code}\n` +
    `👤 <b>Khách hàng:</b> ${transaction.customerSupplierName || 'Khách lẻ'}\n` +
    `💵 <b>Tổng tiền:</b> <code>${transaction.totalAmount.toLocaleString('vi-VN')} VNĐ</code>\n` +
    `⏰ <b>Thời gian:</b> ${now}\n` +
    (transaction.note ? `📝 <b>Ghi chú:</b> ${transaction.note}\n` : '') +
    `-----------------------------------\n` +
    `🛒 <b>Danh sách sản phẩm:</b>\n${itemsText}`;

  // If low stock items were triggered during this export, append low stock warnings
  if (settings.notifyLowStock && lowStockItems && lowStockItems.length > 0) {
    const lowStockText = lowStockItems
      .map(
        (item) =>
          `• ⚠️ <b>${item.name}</b> (${item.sku}): Còn <b>${item.stockQuantity} ${item.unit}</b> (Mức tối thiểu: ${item.minStockAlert})`
      )
      .join('\n');

    text += `\n\n🚨 <b>CẢNH BÁO TỒN KHO THẤP DƯỚI BÁO ĐỘNG:</b>\n${lowStockText}`;
  }

  await sendTelegramMessage(text);
};

/**
  Notify Low Stock Batch Alert
 */
export const notifyLowStockAlert = async (items: LowStockItem[]) => {
  const settings = useSettingsStore.getState();
  if (!settings.telegramEnabled || !settings.notifyLowStock || items.length === 0) return;

  const itemsText = items
    .map(
      (item, idx) =>
        `${idx + 1}. ⚠️ <b>${item.name}</b> (${item.sku})\n   👉 Tồn hiện tại: <b>${item.stockQuantity} ${item.unit}</b> (Báo động: ${item.minStockAlert})`
    )
    .join('\n');

  const text = `🚨 <b>CẢNH BÁO TỒN KHO THẤP HẠN MỨC!</b>\n` +
    `-----------------------------------\n` +
    `Cửa hàng có <b>${items.length}</b> sản phẩm đã chạm hoặc xuống dưới mức tồn kho tối thiểu:\n\n` +
    `${itemsText}\n\n` +
    `💡 <i>Vui lòng lên kế hoạch nhập thêm hàng sớm!</i>`;

  await sendTelegramMessage(text);
};

/**
  Notify on Financial Transaction (Thu / Chi)
 */
export const notifyFinancialTransaction = async (transaction: FinancialTransaction) => {
  const settings = useSettingsStore.getState();
  if (!settings.telegramEnabled || !settings.notifyFinancial) return;

  const isIncome = transaction.type === 'income';
  const icon = isIncome ? '💵' : '💸';
  const title = isIncome ? 'THÔNG BÁO PHIẾU THU' : 'THÔNG BÁO PHIẾU CHI';
  const now = new Date(transaction.createdAt).toLocaleString('vi-VN');

  const text = `${icon} <b>${title}</b>\n` +
    `-----------------------------------\n` +
    `📋 <b>Mã phiếu:</b> ${transaction.code}\n` +
    `📂 <b>Hạng mục:</b> ${transaction.categoryName}\n` +
    `💰 <b>Số tiền:</b> <code>${transaction.amount.toLocaleString('vi-VN')} VNĐ</code>\n` +
    `💳 <b>Hình thức:</b> ${transaction.paymentMethod === 'cash' ? 'Tiền mặt' : transaction.paymentMethod === 'bank_transfer' ? 'Chuyển khoản' : 'Khác'}\n` +
    (transaction.partyName ? `🤝 <b>Đối tác:</b> ${transaction.partyName}\n` : '') +
    `⏰ <b>Thời gian:</b> ${now}\n` +
    (transaction.note ? `📝 <b>Ghi chú:</b> ${transaction.note}` : '');

  await sendTelegramMessage(text);
};
