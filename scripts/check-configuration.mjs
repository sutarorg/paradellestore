// Reports names only, never secret lengths, prefixes, URLs, IDs or values.
const v = process.env;
const failures = [];
const requireKeys = (keys) => {
  for (const k of keys) if (!v[k]?.trim()) failures.push(k);
};
requireKeys([
  'DATABASE_URL',
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'APP_HMAC_SECRET',
  'CRON_SECRET',
  'RAZORPAY_KEY_ID',
  'RAZORPAY_KEY_SECRET',
  'RAZORPAY_WEBHOOK_SECRET',
  'FAL_KEY',
  'FAL_DAILY_SUBMISSION_LIMIT',
  'SITE_ORIGIN',
]);
for (const k of ['APP_HMAC_SECRET', 'CRON_SECRET'])
  if (v[k] && v[k].length < 32) failures.push(`${k} (too short)`);
if (v.APP_HMAC_SECRET && v.CRON_SECRET === v.APP_HMAC_SECRET)
  failures.push('Independent application and cron secrets required');
if (v.RAZORPAY_KEY_SECRET && v.RAZORPAY_KEY_SECRET === v.RAZORPAY_WEBHOOK_SECRET)
  failures.push('Separate Razorpay API and webhook secrets required');
if (v.NEXT_PUBLIC_SUPABASE_ANON_KEY && v.NEXT_PUBLIC_SUPABASE_ANON_KEY === v.SUPABASE_SERVICE_ROLE_KEY)
  failures.push('Unsafe Supabase key configuration');
if (v.DATABASE_URL) {
  try {
    const u = new URL(v.DATABASE_URL);
    if (!['postgres:', 'postgresql:'].includes(u.protocol) || !/^paradelle_app(?:\.|$)/.test(u.username))
      failures.push('Dedicated DATABASE_URL role required');
  } catch {
    failures.push('DATABASE_URL format');
  }
}
if (v.RAZORPAY_KEY_ID && !v.RAZORPAY_KEY_ID.startsWith(`rzp_${v.RAZORPAY_ENV || 'test'}_`))
  failures.push('Razorpay environment mismatch');
if (v.RAZORPAY_ENV === 'live' && (v.VERCEL_ENV !== 'production' || v.LIVE_PAYMENTS_APPROVED !== 'true'))
  failures.push('Live payment approval');
if (
  v.FAL_DAILY_SUBMISSION_LIMIT &&
  (!/^\d+$/.test(v.FAL_DAILY_SUBMISSION_LIMIT) ||
    Number(v.FAL_DAILY_SUBMISSION_LIMIT) < 5 ||
    Number(v.FAL_DAILY_SUBMISSION_LIMIT) > 1000)
)
  failures.push('Bounded FAL_DAILY_SUBMISSION_LIMIT required');
if (v.VERCEL_ENV === 'production' && v.SITE_ORIGIN !== 'https://paradelle.store')
  failures.push('Production canonical origin');
for (const k of Object.keys(v))
  if (
    k.startsWith('NEXT_PUBLIC_') &&
    /SECRET|PASSWORD|SERVICE_ROLE|DATABASE_URL|FAL_KEY|RAZORPAY_KEY/.test(k)
  )
    failures.push(`Remove unsafe public variable ${k}`);
if (failures.length) {
  console.error(`Configuration incomplete or unsafe:\n${failures.map((x) => ` - ${x}`).join('\n')}`);
  process.exitCode = 1;
} else
  console.log(
    'Required configuration present. This does NOT verify connectivity, provider approval or launch readiness.',
  );
