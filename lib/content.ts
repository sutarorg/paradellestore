export const categories = [
  {
    slug: 'all',
    name: 'All Kurtis',
    short: 'All',
    alt: 'Ivory botanical Kurti styled with a maroon dupatta',
  },
  {
    slug: 'anarkali',
    name: 'Anarkali Kurtis',
    short: 'Anarkali',
    alt: 'Sage Anarkali silhouette in a sandstone courtyard',
  },
  { slug: 'rayon', name: 'Rayon Kurtis', short: 'Rayon', alt: 'Soft rose Kurti with a floral neckline' },
  { slug: 'cotton', name: 'Cotton Kurtis', short: 'Cotton', alt: 'Ivory and indigo cotton styling' },
  {
    slug: 'straight',
    name: 'Straight Kurtis',
    short: 'Straight',
    alt: 'Charcoal floral straight-cut silhouette',
  },
  { slug: 'long', name: 'Long Kurtis', short: 'Long', alt: 'Ochre long Kurti styled with gold earrings' },
] as const;
export const categoryHref = (slug: string) =>
  slug === 'all' ? '/kurtis' : `/kurtis?category=${encodeURIComponent(slug)}`;
export const sortOptions = [
  ['recommended', 'Recommended'],
  ['newest', 'Newest'],
  ['price-asc', 'Price: low to high'],
  ['price-desc', 'Price: high to low'],
] as const;
export type Sort = (typeof sortOptions)[number][0];
export const isSort = (s: unknown): s is Sort => sortOptions.some(([v]) => v === s);
export const policyLinks = [
  ['/shipping-policy', 'Shipping policy'],
  ['/returns-refunds', 'Returns & refunds'],
  ['/privacy-policy', 'Privacy policy'],
  ['/terms', 'Terms of service'],
] as const;
export const editionLinks = [
  {
    name: 'The Cotton Edit',
    href: '/kurtis?category=cotton',
    image: 'cotton-campaign',
    note: 'Light layers, easy mornings.',
  },
  {
    name: 'The Anarkali Edit',
    href: '/kurtis?category=anarkali',
    image: 'anarkali-campaign',
    note: 'A little movement, a little occasion.',
  },
];
export const publicPages = [
  '/',
  '/kurtis',
  '/about',
  '/contact',
  '/track-order',
  ...policyLinks.map(([url]) => url),
];
