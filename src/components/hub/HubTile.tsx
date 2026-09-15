'use client';

import Link from 'next/link';
import { Lock } from 'lucide-react';
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { trackEvent } from '@/lib/analytics/trackEvent';

interface HubTileProps {
  title: string;
  status: 'locked' | 'empty' | 'active';
  lockedMessage?: string;
  emptyMessage?: string;
  preview?: React.ReactNode;
  primaryCTA: { label: string; href: string; trackingEvent: string };
  icon?: React.ReactNode;
  className?: string;
}

export function HubTile({
  title,
  status,
  lockedMessage,
  emptyMessage,
  preview,
  primaryCTA,
  icon,
  className,
}: HubTileProps) {
  return (
    <Card
      className={cn(
        'flex flex-col',
        status === 'locked' && 'opacity-60 bg-slate-50',
        status === 'empty' && 'border-dashed',
        status === 'active' && 'bg-white shadow-sm',
        className
      )}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          {icon && <span className="text-violet-500">{icon}</span>}
          <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
          {status === 'locked' && <Lock className="h-4 w-4 text-slate-400" />}
        </div>
      </CardHeader>

      <CardContent className="flex-1">
        {status === 'locked' && lockedMessage && (
          <p className="text-sm text-slate-500">{lockedMessage}</p>
        )}
        {status === 'empty' && emptyMessage && (
          <p className="text-sm text-slate-500">{emptyMessage}</p>
        )}
        {status === 'active' && preview}
      </CardContent>

      <CardFooter className="pt-3">
        <Button
          asChild
          className={cn(
            'w-full',
            status === 'active'
              ? 'bg-violet-600 hover:bg-violet-700 text-white'
              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
          )}
          variant={status === 'active' ? 'default' : 'secondary'}
        >
          <Link
            href={primaryCTA.href}
            onClick={() => trackEvent({ event_name: primaryCTA.trackingEvent })}
          >
            {primaryCTA.label}
          </Link>
        </Button>
      </CardFooter>
    </Card>
  );
}
