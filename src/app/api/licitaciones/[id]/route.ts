import { NextRequest, NextResponse } from 'next/server';
import { getLicitacionById } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const decodedId = decodeURIComponent(id);
    const item = getLicitacionById(decodedId);
    if (!item) {
      return NextResponse.json({ error: 'Licitación no encontrada' }, { status: 404 });
    }
    return NextResponse.json(item);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
