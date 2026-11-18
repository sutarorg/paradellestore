import { dispatch } from '@/lib/server/http';
export async function GET(r: Request, { params }: { params: Promise<{ id: string }> }) {
  return dispatch(r, ['admin', 'media', (await params).id]);
}
