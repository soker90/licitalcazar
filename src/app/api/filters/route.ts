import { NextResponse } from 'next/server';
import { getFilterValues } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const filters = getFilterValues();
    return NextResponse.json(filters);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
