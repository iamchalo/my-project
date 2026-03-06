import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ArrowUpIcon, ArrowDownIcon, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StatCardProps {
  title: string;
  value: string | number;
  change?: number;
  changeType?: 'increase' | 'decrease';
  icon?: LucideIcon;
  description?: string;
}

export function StatCard({
  title,
  value,
  change,
  changeType,
  icon: Icon,
  description,
}: StatCardProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        {Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
        {change !== undefined && (
          <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
            {changeType === 'increase' ? (
              <ArrowUpIcon className="h-3 w-3 text-green-500" />
            ) : (
              <ArrowDownIcon className="h-3 w-3 text-red-500" />
            )}
            <span
              className={cn(
                changeType === 'increase' ? 'text-green-500' : 'text-red-500'
              )}
            >
              {Math.abs(change)}%
            </span>
            <span>from last period</span>
          </p>
        )}
        {description && (
          <p className="text-xs text-muted-foreground mt-1">{description}</p>
        )}
      </CardContent>
    </Card>
  );
}
