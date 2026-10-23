import { NextRequest, NextResponse } from 'next/server';
import { getEmpresasExportData, toCsv, EMPRESAS_CSV_COLUMNS } from '@/lib/export';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'csv';
    const ambito = searchParams.get('ambito') || undefined;

    const data = getEmpresasExportData(ambito);
    const filenameBase = ambito ? `empresas_${ambito}` : 'empresas_alcazar';

    if (format === 'json') {
      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filenameBase}.json"`,
        },
      });
    }

    const csvContent = toCsv(data, EMPRESAS_CSV_COLUMNS);
    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filenameBase}.csv"`,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
