import { NextRequest, NextResponse } from 'next/server';
import { getLicitaciones, FilterOptions } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const opts: FilterOptions = {
      q: searchParams.get('q') || undefined,
      organo: searchParams.get('organo') || undefined,
      adjudicatario: searchParams.get('adjudicatario') || undefined,
      nif: searchParams.get('nif') || undefined,
      year: searchParams.get('ano') || undefined,
      tipo: searchParams.get('tipo') || undefined,
      procedimiento: searchParams.get('procedimiento') || undefined,
      estado: searchParams.get('estado') || undefined,
      scope: searchParams.get('ambito') || undefined,
      flujoEconomico: searchParams.get('flujo') || undefined,
      minImporte: searchParams.get('minImporte') ? Number(searchParams.get('minImporte')) : undefined,
      maxImporte: searchParams.get('maxImporte') ? Number(searchParams.get('maxImporte')) : undefined,
      ofertaUnica: searchParams.get('oferta_unica') === 'true' || searchParams.get('alerta') === 'oferta_unica',
      bajaCero: searchParams.get('baja_cero') === 'true' || searchParams.get('alerta') === 'baja_cero',
      alertaMenor: searchParams.get('alerta_menor') === 'true' || searchParams.get('alerta') === 'alerta_menor',
      fondosUe: searchParams.get('fondos_ue') === 'true' || searchParams.get('alerta') === 'fondos_ue',
      conAlertas: searchParams.get('con_alertas') === 'true' || searchParams.get('alerta') === 'con_alertas',
      conProrroga: searchParams.get('con_prorroga') === 'true' || searchParams.get('alerta') === 'prorroga',
      conModificaciones: searchParams.get('con_modificaciones') === 'true' || searchParams.get('alerta') === 'modificaciones',
      sort: (searchParams.get('sort') as any) || 'reciente',
      page: searchParams.get('page') ? Number(searchParams.get('page')) : 1,
      limit: searchParams.get('limit') ? Number(searchParams.get('limit')) : 15,
    };

    const result = getLicitaciones(opts);
    return NextResponse.json(result);
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
