import { dispatch } from '@/lib/server/http';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
async function route(request: Request, { params }: { params: Promise<{ route: string[] }> }) {
  return dispatch(request, (await params).route);
}
export { route as GET, route as POST, route as DELETE, route as PATCH, route as PUT };
