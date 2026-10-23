import { NextResponse } from 'next/server';
import { getOrganismosList } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const list = getOrganismosList();
    return NextResponse.json(list);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
