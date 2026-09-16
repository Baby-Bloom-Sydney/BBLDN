# shellcheck shell=bash
# smoke-env.sh — the one placeholder environment the E1 shell smoke boots against, in one place so the
# Playwright servers (`scripts/ci/shell-smoke-server.sh`) and the boot guard (`scripts/ci/boot-guard.sh`)
# can never disagree about what "a valid env" means.
#
# **Placeholder values only, never a secret** (07 §7): the same set as `.env.test` and the CI `env:` block.
# The Supabase URL points at a closed loopback port on purpose — 01 §4d step 2 says an unreadable session is
# refused, not waved through, so the smoke wants Supabase *unreachable* rather than merely unauthenticated.
#
# Modes (06 §2.5 columns; `resolveEnvironment`, ADR-108):
#   preview     VERCEL_ENV=preview      → the preview column; the stub purchase provider is legal here
#   production  VERCEL_ENV unset, NODE_ENV=production → the prod column; the stub is refused (07 §5.5)
# Every name marked dev-only (— preview · — prod) is actively unset: `refineEnv` fails the boot if one is
# present outside development, which is what makes the dev bypass unreachable rather than merely off.

smoke_env_base() {
  export NODE_ENV=production
  export NEXT_PUBLIC_APP_URL=http://localhost:3000
  export CRON_SECRET=placeholder-cron-secret
  export ADMIN_API_TOKEN=placeholder-admin-token
  export SYSTEM_PARENT_ID=00000000-0000-4000-8000-000000000000
  export ADMIN_EMAIL=admin@example.test
  export SUPPORT_INBOX=support@example.test
  export NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1
  export NEXT_PUBLIC_SUPABASE_ANON_KEY=placeholder-anon-key
  export SUPABASE_SERVICE_ROLE_KEY=placeholder-service-role
  export STRIPE_MODE=test
  export STRIPE_SECRET_KEY=sk_test_ci-dummy
  export NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_placeholder
  export STRIPE_WEBHOOK_SECRET=whsec_placeholder
  export STRIPE_PRICE_SELF_SERVE_APP_UPFRONT=price_placeholder_upfront
  export STRIPE_PRICE_SELF_SERVE_APP_MONTHLY=price_placeholder_monthly
  export EMAIL_PROVIDER=stub-email
  export SMS_PROVIDER=null-sms
  export AREAS_SOURCE=stub
  export RESEND_API_KEY=re_placeholder
  export OPENAI_API_KEY=placeholder-openai
  export GOOGLE_AI_API_KEY=placeholder-google
  export KATIE_DAILY_LIMIT_USD=2
  export KATIE_ENABLED=true
  export NEXT_PUBLIC_KATIE_ENABLED=true
  export INVITE_LINKS_ENABLED=true
  export NEW_TRIALS_ENABLED=true
  export PAYMENTS_ENABLED=true
  export NEXT_PUBLIC_SENTRY_DSN=https://placeholder@o0.ingest.sentry.example.test/0
  export SENTRY_DSN=https://placeholder@o0.ingest.sentry.example.test/0
  export ALERT_WEBHOOK_URL=https://hooks.example.test/placeholder
  # Legacy-tree names only (never defined in London — 06 §2.5); Sydney module-load guards read them until F-d.
  export SUPABASE_URL=http://127.0.0.1:1
  export NEXT_PUBLIC_SITE_URL=http://localhost:3000
  export NEXT_PUBLIC_INVITE_BASE_URL=http://localhost:3000
  # Dev-only names (`devOnly` in the registry): present outside development = a failed boot, so clear whatever
  # the ambient shell or the CI `env:` block left behind.
  unset EMAIL_DEV_DRY_RUN NEXT_PUBLIC_DEV_MODE NEXT_PUBLIC_SKIP_INTRO_WAIT NEXT_PUBLIC_FUNNEL_LOG
}

smoke_env() {
  local mode="$1"
  smoke_env_base
  case "$mode" in
    preview)
      export VERCEL_ENV=preview
      export PURCHASE_PROVIDER=stub-stripe
      export STUB_EVENT_SECRET=placeholder-stub-event-secret
      ;;
    production)
      unset STUB_EVENT_SECRET
      # `VERCEL_ENV=production` is the production signal Vercel sets and 06 §2.5 marks required in the prod
      # column. **Do not drop it** to simulate an off-Vercel production host: the boot then fails on the missing
      # name before `refineEnv` runs, so every production guard would pass for the wrong reason (the measured
      # contradiction between 07 §5.5 item 2 / ADR-108 and 06 §2.5 — recorded in docs/build-progress.md).
      export VERCEL_ENV=production
      export PURCHASE_PROVIDER=stripe-uk
      # The prod column additionally requires the analytics trio (06 §2.5).
      export NEXT_PUBLIC_META_PIXEL_ID=placeholder-pixel-id
      export META_CAPI_ACCESS_TOKEN=placeholder-capi-token
      export META_DATASET_ID=placeholder-dataset-id
      ;;
    *)
      echo "smoke-env: unknown mode '${mode}' (expected preview | production)" >&2
      return 1
      ;;
  esac
}
