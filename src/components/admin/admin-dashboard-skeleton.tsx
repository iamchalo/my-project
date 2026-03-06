import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

// One metric card skeleton (icon circle + title + big number + subtitle)
function MetricCardSkeleton({ gradient = false }: { gradient?: boolean }) {
  if (gradient) {
    return (
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-5 rounded-full shrink-0" />
            <div className="flex-1 space-y-1.5">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-5 w-28" />
            </div>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="space-y-2 flex-1">
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-7 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
          <Skeleton className="h-12 w-12 rounded-full shrink-0" />
        </div>
      </CardContent>
    </Card>
  );
}

export function AdminDashboardSkeleton() {
  return (
    <div className="p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-56" />
          </div>
          <Skeleton className="h-9 w-24 rounded-lg" />
        </div>

        {/* Primary metrics — 4 cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>

        {/* Secondary metrics — 4 gradient cards */}
        <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <MetricCardSkeleton key={i} gradient />
          ))}
        </div>

        {/* Branch Sales Chart card */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* Title + subtitle */}
              <div className="space-y-1.5">
                <Skeleton className="h-5 w-48" />
                <Skeleton className="h-3.5 w-36" />
              </div>
              {/* Range pill buttons */}
              <div className="flex gap-1 p-1 bg-muted rounded-lg self-start sm:self-auto">
                {['7 Days', '30 Days', '90 Days'].map(label => (
                  <Skeleton key={label} className="h-8 w-16 rounded-md" />
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {/* Chart body */}
            <div className="relative h-80 w-full overflow-hidden rounded-md bg-muted/50">
              {/* Fake Y-axis ticks */}
              <div className="absolute left-0 top-0 h-full flex flex-col justify-between py-3 pl-1 pr-2">
                {Array.from({ length: 6 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 w-8" />
                ))}
              </div>
              {/* Shimmer wave overlay */}
              <div className="absolute inset-0 animate-pulse bg-muted" />
              {/* Fake X-axis ticks */}
              <div className="absolute bottom-0 left-12 right-0 flex justify-between pb-2 px-4">
                {Array.from({ length: 7 }).map((_, i) => (
                  <Skeleton key={i} className="h-3 w-10" />
                ))}
              </div>
            </div>
            {/* Legend */}
            <div className="flex flex-wrap gap-4 pt-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-1.5">
                  <Skeleton className="h-2 w-2 rounded-full" />
                  <Skeleton className="h-3 w-14" />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
