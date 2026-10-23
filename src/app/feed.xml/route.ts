import { NextRequest, NextResponse } from 'next/server';
import { generateRssFeed } from '@/lib/feed';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const ambito = searchParams.get('ambito') || undefined;

    const xml = generateRssFeed({ ambito });

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/rss+xml; charset=utf-8',
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
      },
    });
  } catch (error: any) {
    return new NextResponse(`<error>${error.message}</error>`, { status: 500 });
  }
}
