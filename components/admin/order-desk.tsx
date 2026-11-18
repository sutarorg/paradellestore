'use client';
import { PrivateImage } from './private-image';
import { useState } from 'react';
import { ArrowUpRight } from 'lucide-react';
import { type Manual, type Order, fulfilments } from '@/lib/admin/models';
import { asRef, meeshoUrl, manualIssues, stamp, human } from '@/lib/admin/rules';
import { money } from '@/lib/shop';
import {
  ALink,
  Button,
  Confirm,
  DataTable,
  Field,
  Heading,
  History,
  InfoBox,
  PanelHead,
  Select,
  Tag,
  useCommand,
} from './workbench';
import { MoneyField } from './product-fields';
export function OrderDesk({ o }: { o: Order }) {
  const [m, set] = useState(o.manual),
    [confirm, ask] = useState<'fulfil' | 'refund' | null>(null),
    [amt, amount] = useState<number | null>(null),
    [reason, why] = useState(''),
    [err, error] = useState('');
  const cmd = useCommand();
  const patch = (p: Partial<Manual>) => {
    set({ ...m, ...p });
    error('');
  };
  const source = meeshoUrl(o.manual.sourceUrl);
  return (
    <>
      <Heading
        label="Operations / Order record"
        title={`Order ${o.reference}`}
        description={`Placed ${stamp(o.date)} · Prepaid order`}
      >
        <ALink href="/admin/orders">All orders</ALink>
      </Heading>
      <div className="ad-twocol">
        <section className="ad-panel">
          <PanelHead title="Customer & delivery" kicker="Restricted information" />
          <strong>{o.customer}</strong>
          <p>{o.mobile}</p>
          <p className="ad-preline">{o.address}</p>
        </section>
        <section className="ad-panel">
          <PanelHead title="Razorpay payment" kicker="Provider record">
            <Tag value={o.payment} />
          </PanelHead>
          <dl className="ad-dl">
            <div>
              <dt>Payment reference</dt>
              <dd>{o.paymentReference || 'Not received'}</dd>
            </div>
            <div>
              <dt>Payment date</dt>
              <dd>{o.paymentAt ? stamp(o.paymentAt) : 'Not received'}</dd>
            </div>
            <div>
              <dt>Paid amount</dt>
              <dd>{money(o.paidPaise)}</dd>
            </div>
          </dl>
        </section>
      </div>
      <section className="ad-panel">
        <PanelHead title="Order items" />
        <DataTable
          title="Order items"
          heads={['Product', 'Size', 'Quantity', 'Selling price', 'Line value']}
          rows={o.items.map((l) => ({
            key: l.id,
            cells: [
              <div key="i" className="ad-productcell">
                {l.image && <PrivateImage src={l.image} alt="" width={40} height={50} />}
                <b>{l.name}</b>
                {l.sourceUrl && meeshoUrl(l.sourceUrl) && (
                  <a href={l.sourceUrl} target="_blank" rel="noreferrer">
                    Check source
                  </a>
                )}
              </div>,
              l.size,
              l.quantity,
              money(l.unitPaise),
              money(l.unitPaise * l.quantity),
            ],
          }))}
        />
        <dl className="ad-numbers">
          {[
            ['Selling subtotal', o.subtotalPaise],
            ['Discount', o.discountPaise],
            ['Order total', o.totalPaise],
            ['Sourcing cost', o.sourcingPaise],
            ['Contribution', o.contributionPaise],
          ].map(([l, v]) => (
            <div key={l}>
              <dt>{l}</dt>
              <dd>{typeof v === 'number' ? money(v) : 'Not recorded'}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section className="ad-panel">
        <PanelHead kicker="Manual purchase & delivery" title="Fulfilment desk">
          <Tag value={o.fulfilment} />
        </PanelHead>
        <div className="ad-stack">
          <InfoBox>
            Place the purchase on Meesho yourself. These controls record your work; they do not purchase
            items, sync stock or change payment status.
          </InfoBox>
          {o.exception && <InfoBox error>{o.exception}</InfoBox>}
          {o.fulfilment === 'pending-purchase' && (
            <InfoBox>
              Paid · manual purchase pending. Check the source, chosen size, current availability and resale
              permission before placing the purchase.
            </InfoBox>
          )}
          {source && (
            <a className="ad-textlink" href={source} target="_blank" rel="noopener noreferrer">
              Open source product
              <ArrowUpRight size={14} />
            </a>
          )}
          <div className="ad-formgrid">
            <Select
              label="Fulfilment status"
              value={m.status}
              options={fulfilments}
              onChange={(s) => patch({ status: s as Manual['status'] })}
            />
            <Field
              label="Meesho source URL"
              type="url"
              value={m.sourceUrl}
              onChange={(sourceUrl) => patch({ sourceUrl })}
            />
            <Field
              label="Meesho purchase ID"
              value={m.meeshoRef}
              onChange={(meeshoRef) => patch({ meeshoRef })}
            />
            <MoneyField
              label="Actual sourcing cost (₹)"
              value={m.costPaise}
              onChange={(costPaise) => patch({ costPaise })}
            />
            <Field
              label="Purchase date"
              type="date"
              value={m.purchaseDate}
              onChange={(purchaseDate) => patch({ purchaseDate })}
            />
            <Field label="Carrier" value={m.carrier} onChange={(carrier) => patch({ carrier })} />
            <Field
              label="Tracking reference"
              value={m.tracking}
              onChange={(tracking) => patch({ tracking })}
            />
            <Field
              type="url"
              label="Tracking link"
              value={m.trackingUrl}
              onChange={(trackingUrl) => patch({ trackingUrl })}
            />
            <Field
              wide
              label="Private fulfilment notes"
              type="textarea"
              value={m.notes}
              onChange={(notes) => patch({ notes })}
            />
          </div>
          {err && <InfoBox error>{err}</InfoBox>}
          <div>
            <Button
              disabled={cmd.busy}
              onClick={() => {
                const e = manualIssues(m);
                if (e.length) {
                  error(e.join(' '));
                  return;
                }
                cmd.clear();
                ask('fulfil');
              }}
            >
              Review fulfilment change
            </Button>
          </div>
        </div>
      </section>
      <div className="ad-twocol">
        <section className="ad-panel">
          <PanelHead title="Refund management" kicker="Payment operations" />
          <p>
            Refundable balance: <strong>{money(o.refundablePaise)}</strong>
          </p>
          <div className="ad-row">
            {o.refundablePaise > 0 && ['paid', 'partially-refunded'].includes(o.payment) && (
              <Button
                secondary
                onClick={() => {
                  cmd.clear();
                  error('');
                  ask('refund');
                }}
              >
                Initiate refund
              </Button>
            )}
            {o.payment === 'refund-pending' && (
              <Button
                secondary
                busy={cmd.busy}
                onClick={() =>
                  cmd.run({ op: 'order.check-refund', ref: asRef(o) }, 'Refund status check accepted.')
                }
              >
                Check refund status
              </Button>
            )}
          </div>
          {o.refunds?.map((r) => (
            <p key={r.id}>
              {money(r.amount)} · {human(r.status)} refund
            </p>
          ))}
          {cmd.error && !confirm && <InfoBox error>{cmd.error}</InfoBox>}
        </section>
        <section className="ad-panel">
          <PanelHead title="Order history" kicker="Audit trail" />
          <History rows={o.history} />
        </section>
      </div>
      {confirm && (
        <Confirm
          title={confirm === 'refund' ? 'Initiate a real refund?' : 'Save manual fulfilment?'}
          body={
            confirm === 'refund'
              ? `Request a refund against ${o.reference}. A request is not a completed refund.`
              : `Record ${human(m.status)} and purchase details. An audit entry will identify the change.`
          }
          confirm={confirm === 'refund' ? 'Request refund' : 'Confirm change'}
          close={() => ask(null)}
          busy={cmd.busy}
          danger={confirm === 'refund'}
          error={err || cmd.error}
          onConfirm={async () => {
            if (confirm === 'fulfil') {
              if (
                await cmd.run({ op: 'order.fulfil', ref: asRef(o), manual: m }, 'Fulfilment change recorded.')
              )
                ask(null);
            } else {
              if (
                !amt ||
                amt < 0 ||
                !Number.isSafeInteger(amt) ||
                amt > o.refundablePaise ||
                reason.trim().length < 3
              ) {
                error('Enter a positive amount within the refundable balance and a reason.');
                return;
              }
              if (
                await cmd.run(
                  { op: 'order.refund', ref: asRef(o), amountPaise: amt, reason },
                  'Refund request accepted for processing.',
                )
              )
                ask(null);
            }
          }}
        >
          {confirm === 'refund' && (
            <>
              <MoneyField label="Refund amount (₹)" value={amt} onChange={amount} />
              <Field label="Refund reason" value={reason} onChange={why} maxLength={500} />
            </>
          )}
        </Confirm>
      )}
    </>
  );
}
