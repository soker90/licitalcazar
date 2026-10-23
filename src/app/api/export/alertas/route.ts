import { NextRequest, NextResponse } from 'next/server';
import { getAlertasExportData, toCsv, ALERTAS_CSV_COLUMNS } from '@/lib/export';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const format = searchParams.get('format') || 'csv';
    const ambito = searchParams.get('ambito') || undefined;
    const tipo = searchParams.get('tipo') || undefined;
    const severidad = searchParams.get('severidad') || undefined;

    const data = getAlertasExportData(ambito, tipo, severidad);
    const filenameBase = `alertas_auditoria_${ambito || 'alcazar'}`;

    if (format === 'json') {
      return new NextResponse(JSON.stringify(data, null, 2), {
        headers: {
          'Content-Type': 'application/json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filenameBase}.json"`,
        },
      });
    }

    const csvContent = toCsv(data, ALERTAS_CSV_COLUMNS);
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
