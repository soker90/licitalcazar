import { NextRequest, NextResponse } from 'next/server';
import { getOrganismoDetail } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const decodedNombre = decodeURIComponent(id);
    const detail = getOrganismoDetail(decodedNombre);
    if (!detail) {
      return NextResponse.json({ error: 'Organismo no encontrado' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
