/** Generate the private Stage 3 provider contract from the same validators used by the Server Actions. */
import { writeFileSync } from 'node:fs';
import { z } from 'zod';
import * as m from '../lib/admin/models';
import { command, receipt } from '../lib/admin/commands';
import { lists, type ListName } from '../lib/admin/rules';
const registry = z.registry<{ id: string }>();
const lookup: Record<string, z.ZodType> = {
  Key: m.key,
  Viewer: m.viewerSchema,
  Reference: m.refSchema,
  Costs: m.costSchema,
  Photo: m.photo,
  Variant: m.variant,
  Draft: m.draftSchema,
  Product: m.productRecord,
  ProductRow: m.productRow,
  OrderLine: m.orderLine,
  OrderRow: m.orderRow,
  Order: m.orderDetail,
  ManualFulfilment: m.manualSchema,
  Adjustment: m.adjustment,
  Customer: m.customerRow,
  Review: m.reviewRow,
  Activity: m.activity,
  Fact: m.fact,
  ImageSlot: m.slotSchema,
  SourceReview: m.feedReview,
  JobStages: m.stages,
  JobRow: m.jobRow,
  Job: m.jobDetail,
  SalesDay: m.saleDay,
  Dashboard: m.dashboard,
  Analytics: m.analytics,
  Settings: m.settings,
  SettingsRecord: z.object({ revision: z.int().nonnegative(), value: m.settings }),
  Stock: m.stockRow.extend({ productStock: z.int().nonnegative() }),
  Command: command,
  Receipt: receipt,
  Login: z.object({ email: z.email().max(254), password: z.string().min(1).max(1024) }),
  IssuedSession: z.object({
    token: z.string().regex(/^[A-Za-z0-9._~-]{20,4096}$/),
    expiresIn: z.int().min(1).max(86400),
  }),
  Recovery: z.object({ email: z.email().max(254) }),
  PrivateSearch: z.object({
    q: z.string().max(150),
    status: z.string(),
    category: z.literal(''),
    sort: z.string(),
    page: z.int().positive(),
    customerId: z.string(),
  }),
};
for (const n of ['ProductRow', 'OrderRow', 'Stock', 'Customer', 'Review', 'JobRow'])
  lookup[`${n}Page`] = m.paged(lookup[n]);
for (const [k, schema] of Object.entries(lookup)) registry.add(schema, { id: k });
const prefix = '#/components/schemas/';
const { schemas } = z.toJSONSchema(registry, { target: 'draft-2020-12', uri: (id) => `${prefix}${id}` });
for (const v of Object.values(schemas)) {
  delete v.$id;
  delete v.$schema;
}
const ref = (name: string) => ({ $ref: prefix + name });
const json = (schema: unknown) => ({ 'application/json': { schema } });
const success = (name: string, description: string) => ({ description, content: json(ref(name)) });
const protectedErrors = {
  401: { description: 'Invalid or expired session' },
  403: { description: 'Permission denied' },
  429: { description: 'Rate limited' },
  503: { description: 'Service unavailable' },
};
const paths: Record<string, unknown> = {};
const idParam = { name: 'id', in: 'path', required: true, schema: ref('Key') };
const range = { name: 'days', in: 'query', schema: { type: 'integer', enum: [7, 30, 90], default: 30 } };
function get(path: string, name: string, title: string, permissions: string[], parameters: unknown[] = []) {
  paths[path] = {
    get: {
      summary: title,
      'x-admin-permissions': permissions,
      parameters,
      responses: {
        200: success(name, 'Validated private document'),
        ...protectedErrors,
        404: { description: 'Not found' },
      },
    },
  };
}
function post(
  path: string,
  title: string,
  body: string,
  output: string,
  permissions: string[],
  status = '200',
  isPublic = false,
) {
  paths[path] = {
    post: {
      summary: title,
      'x-admin-permissions': permissions,
      ...(isPublic ? { security: [] } : {}),
      ...(body ? { requestBody: { required: true, content: json(ref(body)) } } : {}),
      responses: {
        [status]: output
          ? success(output, 'Validated response')
          : { description: status === '202' ? 'Request accepted' : 'Completed' },
        ...protectedErrors,
      },
    },
  };
}
post('/auth/login', 'Admin sign-in', 'Login', 'IssuedSession', [], '200', true);
post('/auth/recover', 'Enumeration-safe recovery', 'Recovery', '', [], '202', true);
get('/auth/session', 'Viewer', 'Verify role and permissions', []);
post('/auth/logout', 'Revoke this session', '', '', [], '204');
get('/dashboard', 'Dashboard', 'Operational and financial overview', ['analytics', 'orders', 'pii'], [range]);
get('/analytics', 'Analytics', 'Financial aggregates', ['analytics'], [range]);
const services: Record<ListName, [string, string[]]> = {
  products: ['ProductRowPage', ['catalogue']],
  orders: ['OrderRowPage', ['orders', 'pii']],
  customers: ['CustomerPage', ['customers', 'pii']],
  inventory: ['StockPage', ['inventory']],
  reviews: ['ReviewPage', ['reviews']],
  imports: ['JobRowPage', ['imports']],
};
for (const [kind, [schema, permissions]] of Object.entries(services)) {
  const rules = lists[kind as ListName];
  const parameters = [
    { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 999999, default: 1 } },
    { name: 'sort', in: 'query', schema: { type: 'string', enum: rules.sort, default: rules.sort[0] } },
    ...(rules.status.length
      ? [{ name: 'status', in: 'query', schema: { type: 'string', enum: rules.status } }]
      : []),
    ...(['customers', 'orders'].includes(kind)
      ? []
      : [{ name: 'q', in: 'query', schema: { type: 'string', maxLength: 150 } }]),
    ...(kind === 'products'
      ? [{ name: 'category', in: 'query', schema: { type: 'string', enum: m.categoryValues } }]
      : []),
    ...(kind === 'orders' ? [{ name: 'customerId', in: 'query', schema: ref('Key') }] : []),
  ];
  get(`/${kind}`, schema, `Page through ${kind}`, permissions, parameters);
}
get('/products/{id}', 'Product', 'Read product and editable draft', ['catalogue'], [idParam]);
get('/orders/{id}', 'Order', 'Read protected order detail and history', ['orders', 'pii'], [idParam]);
get('/imports/{id}', 'Job', 'Poll/resume import', ['imports'], [idParam]);
get('/settings', 'SettingsRecord', 'Single-store settings', ['settings']);
get('/pricing/defaults', 'Costs', 'Initial assumptions for new listings', ['catalogue']);
post('/orders/search', 'Private order search', 'PrivateSearch', 'OrderRowPage', ['orders', 'pii']);
post('/customers/search', 'Private customer search', 'PrivateSearch', 'CustomerPage', ['customers', 'pii']);
paths['/inventory/history'] = {
  get: {
    summary: 'Newest adjustments first',
    'x-admin-permissions': ['inventory'],
    parameters: [{ name: 'limit', in: 'query', schema: { type: 'integer', const: 25 } }],
    responses: {
      200: {
        description: 'Balanced adjustments',
        content: json({ type: 'array', maxItems: 25, items: ref('Adjustment') }),
      },
      ...protectedErrors,
    },
  },
};
paths['/commands'] = {
  post: {
    summary: 'Validate permission, revision and idempotency before executing a command',
    parameters: [
      { name: 'Idempotency-Key', in: 'header', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    requestBody: { required: true, content: json(ref('Command')) },
    responses: {
      200: success('Receipt', 'Applied'),
      201: success('Receipt', 'Created'),
      202: success('Receipt', 'Queued — not yet completed'),
      ...protectedErrors,
      404: { description: 'Record missing' },
      409: { description: 'Revision conflict' },
      422: { description: 'Business constraint, rights or transition rejected' },
    },
  },
};
paths['/media'] = {
  post: {
    summary: 'Rights-cleared private asset; permission is determined by purpose',
    requestBody: {
      required: true,
      content: {
        'multipart/form-data': {
          schema: {
            type: 'object',
            properties: {
              purpose: { enum: ['product', 'reference', 'logo'] },
              rights: { const: 'confirmed' },
              file: { type: 'string', format: 'binary', description: 'JPEG, PNG or WebP; maximum 4 MiB' },
            },
            required: ['purpose', 'rights', 'file'],
          },
        },
      },
    },
    responses: {
      201: success('Photo', 'Validated private media descriptor'),
      ...protectedErrors,
      422: { description: 'Invalid media' },
    },
  },
};
const spec = {
  openapi: '3.1.0',
  info: {
    title: 'PARADELLE private merchant service',
    version: '1.0.0',
    description:
      'Stage 3 provider contract, not a deployed endpoint. See CONTRACT.md for per-operation authorisation, conditional fields, monetary semantics and transaction rules.',
  },
  servers: [
    {
      url: '/api/private/v1',
      description:
        'Proposed route prefix inside the same application. The server adapter uses PARADELLE_ADMIN_API_URL.',
    },
  ],
  security: [{ StaffSession: [] }],
  paths,
  components: {
    securitySchemes: {
      StaffSession: {
        type: 'http',
        scheme: 'bearer',
        description: 'Server-to-service opaque admin session. Never supplied by browser JS.',
      },
    },
    schemas,
  },
};
writeFileSync('docs/admin/openapi.json', `${JSON.stringify(spec, null, 2)}\n`);
console.log(`Exported ${Object.keys(paths).length} paths and ${Object.keys(schemas).length} named schemas.`);
