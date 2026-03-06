import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { LucideIcon, ArrowRightIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavigationCardProps {
  title: string;
  description: string;
  href: string;
  icon: LucideIcon;
  className?: string;
}

export function NavigationCard({
  title,
  description,
  href,
  icon: Icon,
  className,
}: NavigationCardProps) {
  return (
    <Link href={href} className="block">
      <Card
        className={cn(
          'transition-all hover:shadow-lg hover:scale-105 cursor-pointer',
          className
        )}
      >
        <CardContent className="p-6">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-primary/10 rounded-lg">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">{title}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
            <ArrowRightIcon className="h-5 w-5 text-muted-foreground mt-2" />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
