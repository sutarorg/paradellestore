# Production deployment · paradelle.store

## Canonical hosts
`https://paradelle.store` and `https://www.paradelle.store` → apex. `vercel.json` redirects `www` permanently. `supabase/config.toml` sets `site_url` and `additional_redirect_urls` to the apex. Preview deployments are `noindex`.

## Environment
All values from `.env.example`. Preview and Production MUST use separate Supabase projects and Razorpay keys. `DATABASE_URL` is the Supavisor transaction pooler (`6543`), TLS verified, role `paradelle_app` (NOT `postgres`). `scripts/check-configuration.mjs` validates names only, never secret values, before deploy. `node scripts/check-configuration.mjs` must pass.

Required: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_HMAC_SECRET` (≥32), `CRON_SECRET` (≥32, independent), `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `FAL_KEY`, `FAL_DAILY_SUBMISSION_LIMIT` (5–1000), `SITE_ORIGIN`. Live: `RAZORPAY_ENV=live`, `LIVE_PAYMENTS_APPROVED=true`, `VERCEL_ENV=production`. Optional: `RAZORPAY_WEBHOOK_PREVIOUS_SECRET` during rotation, `DATABASE_CA_PEM`, `GA4_MEASUREMENT_ID`, `META_PIXEL_ID`.

## Database bootstrap
1. Create Supabase project (PG17). Disable `db.seed`, `auth.enable_signup`.
2. Apply migrations in order `supabase/migrations/*.sql` via `supabase db push` (uses `supabase/config.toml`).
3. Create login role: `CREATE ROLE paradelle_app NOLOGIN NOINHERIT; GRANT paradelle_runtime TO paradelle_app;` Never grant `postgres` or `service_role`. Set `DATABASE_URL` to that role.
4. Create Supabase Auth admin user(s), then insert `shop.profiles` row with `is_active=true`, least-privilege `permissions`.

No seed catalogue; empty `store_settings` only.

## Cron and limits
`vercel.json` crons `GET /api/maintenance` every minute with `Authorization: Bearer $CRON_SECRET`. Handler does reconciliation, refund-checks, expiry cleanup under bounded time. Razorpay and fal calls are server-only with timeouts; catalogue reads rate-limited (`catalogue-read` 180/60s, checkout IP throttles, `FAL_DAILY_SUBMISSION_LIMIT`).

## Backups and recovery
Supabase PITR/daily per plan; Storage objects NOT included in DB backups. Application never stores payment secrets in DB. Rotate `APP_HMAC_SECRET`/`CRON_SECRET` via Vercel sensitive settings, redeploy, verify `check:config`. For webhook secret rotation, set `RAZORPAY_WEBHOOK_PREVIOUS_SECRET` for one retry window, then remove. Rollback: revert deployment in Vercel, re-apply prior migration if schema changed (forward-only; test in preview first).

## Provider acceptance
Before live sales: Razorpay test/live payments + refunds with HMAC verification; fal `flux-2-pro/edit` and `openrouter/router` with real `FAL_KEY` and budget cap; Supabase Auth/Storage acceptance; DNS/TLS for both hosts; Search Console sitemap. Stage 3 `npm run test:commerce:browser` is local isolated evidence only, NOT hosted provider proof.
