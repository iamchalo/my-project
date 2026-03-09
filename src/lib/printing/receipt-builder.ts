export interface ReceiptData {
  branchName: string;
  branchPhone?: string;
  cashierName: string;
  orderNumber: number;
  items: { product_name: string; quantity: number; product_price: number }[];
  total: number;
  paymentMethod: 'cash' | 'mpesa';
  date: string;
  time: string;
}

const WIDTH = 48; // characters for standard 80mm thermal paper

function center(text: string): string {
  const trimmed = text.slice(0, WIDTH);
  const pad = Math.max(0, Math.floor((WIDTH - trimmed.length) / 2));
  return ' '.repeat(pad) + trimmed;
}

function line(char = '-'): string {
  return char.repeat(WIDTH);
}

// Right-aligns `right`, truncates `left` if needed to always fit on one line
function row(left: string, right: string): string {
  const maxLeft = WIDTH - right.length - 1;
  const safeLeft = left.length > maxLeft ? left.slice(0, maxLeft - 1) + '~' : left;
  const gap = WIDTH - safeLeft.length - right.length;
  return safeLeft + ' '.repeat(Math.max(1, gap)) + right;
}

export function buildReceiptLines(data: ReceiptData): string[] {
  const lines: string[] = [];

  // Header — no leading blank so branch name isn't lost in top waste area
  lines.push(center(data.branchName.toUpperCase()));
  if (data.branchPhone) lines.push(center(data.branchPhone));
  lines.push(center('RECEIPT'));
  lines.push(line());

  lines.push(`Order: ORD-${data.orderNumber.toString().padStart(8, '0')}`);
  lines.push(`Date : ${data.date}  ${data.time}`);
  lines.push(`Staff: ${data.cashierName}`);
  lines.push(`Pay  : ${data.paymentMethod === 'mpesa' ? 'M-Pesa' : 'Cash'}`);
  lines.push(line());

  lines.push(row('ITEM', 'TOTAL'));
  lines.push(line('-'));

  for (const item of data.items) {
    const subtotal = item.product_price * item.quantity;
    const price = `KES ${subtotal.toFixed(2)}`;
    const nameQty = `${item.product_name} x${item.quantity}`;
    lines.push(row(nameQty, price));
  }

  lines.push(line());
  lines.push(row('TOTAL', `KES ${data.total.toFixed(2)}`));

  // Display-only 16% tax line
  const taxDisplay = data.total * 0.16;
  lines.push(row('Tax (16%)', `KES ${taxDisplay.toFixed(2)}`));

  lines.push(line());
  lines.push(center('Thank you for visiting!'));
  lines.push(center('Please come again'));
  // Feed lines before cut — enough to clear the paper jaw
  lines.push('');
  lines.push('');

  return lines;
}
