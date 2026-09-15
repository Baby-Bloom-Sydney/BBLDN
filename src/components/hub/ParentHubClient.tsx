'use client';

import { useEffect } from 'react';
import { Baby } from 'lucide-react';
import { PositionTile, PositionSummary } from '@/components/hub/PositionTile';
import { MatchesTile } from '@/components/hub/MatchesTile';
import { ConnectionsTile, ConnectedNanny } from '@/components/hub/ConnectionsTile';
import { HubTile } from '@/components/hub/HubTile';
import { VerificationBanner } from '@/components/hub/VerificationBanner';
import { trackEvent } from '@/lib/analytics/trackEvent';

interface ParentHubClientProps {
  firstName: string;
  isVerified: boolean;
  hasPosition: boolean;
  positionSummary: PositionSummary | null;
  hasDfy: boolean;
  connectionsCount: number;
  connectedNannies: ConnectedNanny[];
  placement: ConnectedNanny | null;
  bsrCount: number;
}

export function ParentHubClient({
  firstName,
  isVerified,
  hasPosition,
  positionSummary,
  hasDfy,
  connectionsCount,
  connectedNannies,
  placement,
  bsrCount,
}: ParentHubClientProps) {
  useEffect(() => {
    trackEvent({ event_name: 'parent_hub_viewed', user_role: 'parent' });
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <h1 className="text-2xl font-bold text-slate-900">
        Welcome, {firstName}!
      </h1>

      {/* Verification Banner */}
      {!isVerified && (
        <VerificationBanner
          role="parent"
          message="Verify your identity to connect with nannies and book babysitters"
          submessage="Quick verification with your passport or driver's license"
        />
      )}

      {/* Tiles Grid */}
      <div className="grid gap-4 sm:gap-6 grid-cols-1 sm:grid-cols-2">
        {/* Position Tile */}
        <PositionTile
          hasPosition={hasPosition}
          positionSummary={positionSummary}
          hasDfy={hasDfy}
        />

        {/* Matchmaking Tile */}
        <MatchesTile
          hasPosition={hasPosition}
          hasDfy={hasDfy}
        />

        {/* Connections Tile */}
        <ConnectionsTile
          connectionsCount={connectionsCount}
          connectedNannies={connectedNannies}
          placement={placement}
        />

        {/* Babysitting Tile */}
        <HubTile
          title="Book a Babysitter"
          icon={<Baby className="h-5 w-5" />}
          status="active"
          preview={
            bsrCount > 0 ? (
              <p className="text-sm text-slate-600">
                <span className="text-2xl font-bold text-violet-600">{bsrCount}</span>{' '}
                active request{bsrCount !== 1 ? 's' : ''}
              </p>
            ) : (
              <p className="text-sm text-slate-600">
                Find a trusted babysitter for a one-time booking
              </p>
            )
          }
          primaryCTA={{ label: 'Find a Babysitter', href: '/parent/babysitting', trackingEvent: 'babysitting_tile_clicked' }}
          className="rounded-2xl hover:shadow-lg hover:border-violet-200 transition-all"
        />
      </div>
    </div>
  );
}
