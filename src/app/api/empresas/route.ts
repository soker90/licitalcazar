import { NextRequest, NextResponse } from 'next/server';
import { getEmpresasList } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = searchParams.get('q') || undefined;
    const page = searchParams.get('page') ? Number(searchParams.get('page')) : 1;
    const limit = searchParams.get('limit') ? Number(searchParams.get('limit')) : 25;
    const sort = searchParams.get('sort') || 'volumen';
    const view = (searchParams.get('view') === 'grupos' ? 'grupos' : 'empresas') as 'empresas' | 'grupos';
    const year = searchParams.get('year') || searchParams.get('ano') || undefined;

    const result = getEmpresasList({ q, page, limit, sort, view, year });
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
