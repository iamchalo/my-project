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

const WIDTH = 42; // characters for 80mm paper

function center(text: string): string {
  const pad = Math.max(0, Math.floor((WIDTH - text.length) / 2));
  return ' '.repeat(pad) + text;
}

function line(char = '-'): string {
  return char.repeat(WIDTH);
}

function row(left: string, right: string): string {
  const gap = WIDTH - left.length - right.length;
  return left + ' '.repeat(Math.max(1, gap)) + right;
}

export function buildReceiptLines(data: ReceiptData): string[] {
  const lines: string[] = [];

  lines.push('');
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
    const nameQty = `${item.product_name} x${item.quantity}`;
    lines.push(row(nameQty, `KES ${subtotal.toFixed(2)}`));
  }

  lines.push(line());
  lines.push(row('TOTAL', `KES ${data.total.toFixed(2)}`));

  // Display-only 16% tax line
  const taxDisplay = data.total * 0.16;
  lines.push(row('Tax (16%)', `KES ${taxDisplay.toFixed(2)}`));

  lines.push(line());
  lines.push(center('Thank you for visiting!'));
  lines.push(center('Please come again'));
  lines.push('');
  lines.push('');
  lines.push('');

  return lines;
}
