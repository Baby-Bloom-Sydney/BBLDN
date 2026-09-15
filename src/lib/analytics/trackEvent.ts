interface TrackEventParams {
  event_name: string
  user_id?: string
  user_role?: 'nanny' | 'parent'
  page?: string
  metadata?: Record<string, unknown>
}

export function trackEvent(params: TrackEventParams): void {
  console.log('[BB Analytics]', {
    ...params,
    timestamp: new Date().toISOString(),
    page: params.page ?? (typeof window !== 'undefined' ? window.location.pathname : 'server'),
  })
}
