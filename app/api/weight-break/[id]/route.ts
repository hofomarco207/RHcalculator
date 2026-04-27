import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// GET /api/weight-break/[id] — single dataset with entries
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  const { data: dataset, error: dsErr } = await supabase
    .from('weight_break_datasets')
    .select('*')
    .eq('id', id)
    .single()

  if (dsErr) return NextResponse.json({ error: dsErr.message }, { status: 404 })

  const { data: entries, error: entErr } = await supabase
    .from('weight_break_entries')
    .select('*')
    .eq('dataset_id', id)
    .order('weight_kg', { ascending: true })

  if (entErr) return NextResponse.json({ error: entErr.message }, { status: 500 })

  return NextResponse.json({ ...dataset, entries: entries ?? [] })
}

// DELETE /api/weight-break/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await createClient()

  // ON DELETE CASCADE handles entries
  const { error } = await supabase
    .from('weight_break_datasets')
    .delete()
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
