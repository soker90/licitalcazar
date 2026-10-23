import { NextRequest, NextResponse } from 'next/server';
import { getStats } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const ano = request.nextUrl.searchParams.get('ano') || undefined;
    const ambito = request.nextUrl.searchParams.get('ambito') || undefined;
    const stats = getStats(ano, ambito);
    return NextResponse.json(stats);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
