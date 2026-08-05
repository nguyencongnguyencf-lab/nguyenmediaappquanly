const defaultUnits = ['', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];

function readThreeDigits(number: number, isHighestChunk: boolean): string {
  const hundred = Math.floor(number / 100);
  const ten = Math.floor((number % 100) / 10);
  const unit = number % 10;

  if (hundred === 0 && ten === 0 && unit === 0) return '';

  let res = '';

  // Show "trăm" if hundred > 0 or if there are higher chunks before
  if (hundred > 0 || !isHighestChunk) {
    res += defaultUnits[hundred] + ' trăm ';
  }

  if (ten === 0 && unit > 0) {
    res += 'lẻ ';
  } else if (ten === 1) {
    res += 'mười ';
  } else if (ten > 1) {
    res += defaultUnits[ten] + ' mươi ';
  }

  if (unit === 1) {
    if (ten > 1) {
      res += 'mốt';
    } else {
      res += 'một';
    }
  } else if (unit === 5) {
    if (ten > 0) {
      res += 'lăm';
    } else {
      res += 'năm';
    }
  } else if (unit > 0) {
    res += defaultUnits[unit];
  }

  return res.trim();
}

/**
 * Convert numeric amount in VND to Vietnamese words
 * Example: 1500000 -> "Một triệu năm trăm nghìn đồng"
 */
export function numberToVietnameseWords(amount: number): string {
  if (!amount || amount === 0) return 'Không đồng';
  const cleanAmount = Math.floor(Math.abs(amount));

  const unitsName = ['', ' nghìn', ' triệu', ' tỷ', ' nghìn tỷ', ' triệu tỷ'];
  let num = cleanAmount;
  let str = '';
  let i = 0;

  while (num > 0) {
    const chunk = num % 1000;
    if (chunk > 0) {
      const isHighestChunk = Math.floor(num / 1000) === 0;
      const chunkText = readThreeDigits(chunk, isHighestChunk);
      if (chunkText) {
        str = chunkText + unitsName[i] + (str ? ' ' + str : '');
      }
    }
    num = Math.floor(num / 1000);
    i++;
  }

  str = str.trim();
  if (!str) return 'Không đồng';

  // Capitalize first character and append "đồng."
  return str.charAt(0).toUpperCase() + str.slice(1) + ' đồng.';
}
