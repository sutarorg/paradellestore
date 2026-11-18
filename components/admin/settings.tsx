'use client';
import { useState } from 'react';
import { Save } from 'lucide-react';
import { type AdminSettings, type Read, blankSettings, settingsSections } from '@/lib/admin/models';
import { checkCommand } from '@/lib/admin/commands';
import { policyLinks } from '@/lib/content';
import {
  Button,
  Confirm,
  Field,
  Heading,
  InfoBox,
  PanelHead,
  Select,
  StateBox,
  useCommand,
} from './workbench';
import { MediaEditor, Pricing, MoneyField } from './product-fields';
const labels = {
  identity: 'Store identity',
  contact: 'Contact details',
  pricing: 'Pricing defaults',
  delivery: 'Delivery coverage',
  social: 'Social links',
  policies: 'Store policies',
  seo: 'SEO defaults',
  profile: 'Admin profile',
};
type Section = (typeof settingsSections)[number];
export function Preferences({ data }: { data: Read<{ value: AdminSettings; revision: number }> }) {
  const [s, set] = useState<AdminSettings>(() =>
      data.state === 'ready' ? data.value.value : blankSettings(),
    ),
    [tab, open] = useState<Section>('identity'),
    [rights, right] = useState(false),
    [confirm, ask] = useState(false),
    [err, error] = useState(''),
    [policy, pick] = useState('shipping-policy'),
    [pending, hasPending] = useState(false);
  const [keys, setKeys] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(Object.entries(s.policies).map(([p, arr]) => [p, arr.map((_, i) => `${p}-${i}`)])),
  );
  const cmd = useCommand();
  if (data.state !== 'ready' && data.state !== 'offline')
    return (
      <>
        <Heading title="Settings" label="Store / Preferences" />
        <StateBox state={data} />
      </>
    );
  function patch<K extends keyof AdminSettings>(k: K, v: Partial<AdminSettings[K]>) {
    set({ ...s, [k]: { ...s[k], ...v } });
    error('');
  }
  const section = (
    title: string,
    k: 'contact' | 'social' | 'seo' | 'profile',
    fields: [string, string, string?][],
  ) => (
    <section className="ad-formgrid" aria-label={title}>
      {fields.map(([key, label, type]) => (
        <Field
          key={key}
          label={label}
          value={String(s[k][key as keyof (typeof s)[typeof k]] ?? '')}
          onChange={(v) => patch(k, { [key]: v })}
          type={type}
        />
      ))}
    </section>
  );
  const blocks = s.policies[policy] ?? [];
  const save = async () => {
    if (data.state !== 'ready') {
      error('Private services are not connected. No settings were saved.');
      ask(false);
      return;
    }
    const c = {
      op: 'settings.save' as const,
      revision: data.value.revision,
      section: tab,
      value: tab === 'delivery' ? { ...s.delivery, pins: s.delivery.pins.filter(Boolean) } : s[tab],
    };
    const issues = checkCommand(c);
    if (issues.length) {
      error(issues[0]);
      ask(false);
      return;
    }
    if (await cmd.run(c, `${labels[tab]} saved.`)) ask(false);
  };
  return (
    <>
      <Heading
        title="Settings"
        label="Store / Preferences"
        description="Manage the details and defaults for your PARADELLE store."
      />
      <div className="ad-editor-nav">
        {settingsSections.map((k) => (
          <button
            type="button"
            key={k}
            aria-pressed={k === tab}
            onClick={() => {
              open(k);
              error('');
              cmd.clear();
            }}
          >
            {labels[k]}
          </button>
        ))}
      </div>
      <section className="ad-panel">
        <PanelHead title={labels[tab]} kicker="Store configuration" />
        <div className="ad-stack">
          {tab === 'identity' ? (
            <>
              <Field
                label="Store name"
                value={s.identity.name}
                onChange={(name) => patch('identity', { name })}
                required
              />
              <Field
                label="Store announcement"
                value={s.identity.announcement}
                onChange={(announcement) => patch('identity', { announcement })}
              />
              <MediaEditor
                purpose="logo"
                max={1}
                photos={s.identity.logo ? [s.identity.logo] : []}
                change={(p) => patch('identity', { logo: p[0] ?? null })}
                rights={rights}
                onRights={right}
                onPending={hasPending}
              />
            </>
          ) : tab === 'contact' ? (
            section('Contact details', 'contact', [
              ['email', 'Support email', 'email'],
              ['phone', 'Support phone', 'tel'],
              ['businessName', 'Registered business name'],
              ['registration', 'Registration details'],
              ['address', 'Business address', 'textarea'],
            ])
          ) : tab === 'delivery' ? (
            <div className="ad-formgrid">
              <MoneyField
                label="Flat delivery charge including tax (₹)"
                value={s.delivery.shipping}
                onChange={(shipping) => patch('delivery', { shipping })}
              />
              <MoneyField
                label="Free delivery from (₹, optional)"
                value={s.delivery.freeFrom}
                onChange={(freeFrom) => patch('delivery', { freeFrom })}
              />
              <Field
                label="GST included in delivery charge (%)"
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={s.delivery.gst / 100}
                onChange={(str) => patch('delivery', { gst: Math.round(Number(str) * 100) })}
              />
              <Field
                wide
                label="Serviceable Indian PIN codes"
                hint="Enter one confirmed PIN per line. Empty coverage disables checkout."
                type="textarea"
                value={s.delivery.pins.join('\n')}
                onChange={(value) => patch('delivery', { pins: value.split(/[\s,]/) })}
              />
            </div>
          ) : tab === 'pricing' ? (
            <Pricing defaults value={s.pricing} set={(pricing) => set({ ...s, pricing })} />
          ) : tab === 'social' ? (
            section('Social links', 'social', [
              ['instagram', 'Instagram URL', 'url'],
              ['facebook', 'Facebook URL', 'url'],
              ['pinterest', 'Pinterest URL', 'url'],
            ])
          ) : tab === 'seo' ? (
            section('SEO defaults', 'seo', [
              ['title', 'Default page title'],
              ['description', 'Default meta description', 'textarea'],
            ])
          ) : tab === 'profile' ? (
            <>
              <InfoBox>
                Profile changes apply only to the signed-in administrator. Email changes require provider
                verification.
              </InfoBox>
              {section('Admin profile', 'profile', [['name', 'Display name']])}
              <p className="ad-muted">
                Verified sign-in email: {s.profile.email || 'Not available'}. Manage identity changes through
                authorised Supabase administration.
              </p>
            </>
          ) : (
            <>
              <InfoBox>
                Publish only the policies approved for your business. Empty overrides retain the storefront’s
                general guidance.
              </InfoBox>
              <Select
                label="Policy"
                value={policy}
                onChange={pick}
                options={policyLinks.map(([path, label]) => [path.slice(1), label])}
              />
              {blocks.map((v, i) => (
                <div className="ad-block" key={keys[policy]?.[i]}>
                  <Field
                    label={`Section ${i + 1} heading`}
                    value={v.title}
                    onChange={(title) =>
                      patch('policies', { [policy]: blocks.map((b, j) => (j === i ? { ...b, title } : b)) })
                    }
                  />
                  <Field
                    label={`Section ${i + 1} text`}
                    type="textarea"
                    value={v.body}
                    onChange={(body) =>
                      patch('policies', { [policy]: blocks.map((b, j) => (j === i ? { ...b, body } : b)) })
                    }
                  />
                  <button
                    type="button"
                    className="ad-textlink"
                    onClick={() => {
                      setKeys({ ...keys, [policy]: keys[policy].filter((_, j) => j !== i) });
                      patch('policies', { [policy]: blocks.filter((_, j) => j !== i) });
                    }}
                  >
                    Remove section
                  </button>
                </div>
              ))}
              <div>
                <Button
                  secondary
                  onClick={() => {
                    setKeys({ ...keys, [policy]: [...(keys[policy] ?? []), crypto.randomUUID()] });
                    patch('policies', { [policy]: [...blocks, { title: '', body: '' }] });
                  }}
                >
                  Add policy section
                </Button>
              </div>
            </>
          )}
          {(err || cmd.error) && <InfoBox error>{err || cmd.error}</InfoBox>}
          <div className="ad-row">
            <Button
              disabled={cmd.busy}
              onClick={() => {
                if (tab === 'identity' && pending) {
                  error('Upload or remove the local logo preview before saving.');
                  return;
                }
                const issues = checkCommand({
                  op: 'settings.save',
                  revision: data.state === 'ready' ? data.value.revision : 0,
                  section: tab,
                  value:
                    tab === 'delivery' ? { ...s.delivery, pins: s.delivery.pins.filter(Boolean) } : s[tab],
                });
                if (issues.length) {
                  error(issues.join(' '));
                  return;
                }
                ask(true);
              }}
            >
              <Save size={15} />
              Save {labels[tab].toLowerCase()}
            </Button>
          </div>
        </div>
      </section>
      {confirm && (
        <Confirm
          title={`Save ${labels[tab].toLowerCase()}?`}
          body="Only this settings section will change. The service records the administrator and revision."
          confirm="Confirm settings"
          close={() => ask(false)}
          onConfirm={save}
          busy={cmd.busy}
          error={cmd.error}
        />
      )}
    </>
  );
}
