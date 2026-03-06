'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { SalesData } from '@/lib/types';

interface SalesChartProps {
  data: SalesData[];
  title?: string;
}

export function SalesChart({ data, title = 'Sales Overview' }: SalesChartProps) {
  const maxSales = Math.max(...data.map((d) => d.sales));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {data.map((item, index) => {
            const percentage = (item.sales / maxSales) * 100;
            const date = new Date(item.date).toLocaleDateString('en-KE', {
              month: 'short',
              day: 'numeric',
              timeZone: 'Africa/Nairobi',
            });

            return (
              <div key={index} className="flex items-center gap-2">
                <div className="w-16 text-xs text-muted-foreground">{date}</div>
                <div className="flex-1 h-8 bg-secondary rounded-md overflow-hidden relative">
                  <div
                    className="h-full bg-primary transition-all duration-500 ease-out flex items-center justify-end pr-2"
                    style={{ width: `${percentage}%` }}
                  >
                    <span className="text-xs font-medium text-primary-foreground">
                      ${item.sales.toLocaleString()}
                    </span>
                  </div>
                </div>
                <div className="w-16 text-xs text-muted-foreground text-right">
                  {item.transactions} txn
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 pt-4 border-t">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Total Sales</span>
            <span className="font-semibold">
              ${data.reduce((sum, d) => sum + d.sales, 0).toLocaleString()}
            </span>
          </div>
          <div className="flex justify-between text-sm mt-1">
            <span className="text-muted-foreground">Total Transactions</span>
            <span className="font-semibold">
              {data.reduce((sum, d) => sum + d.transactions, 0)}
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
