import { NextRequest, NextResponse } from 'next/server';
import { getEmpresaDetail } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const decodedId = decodeURIComponent(id);
    const detail = getEmpresaDetail(decodedId);
    if (!detail) {
      return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 });
    }
    return NextResponse.json(detail);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
