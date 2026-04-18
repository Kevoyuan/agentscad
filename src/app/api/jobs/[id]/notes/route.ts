import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { notes } = body

    if (typeof notes !== 'string') {
      return NextResponse.json({ error: 'Notes must be a string' }, { status: 400 })
    }

    const job = await db.job.findUnique({ where: { id } })
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const updated = await db.job.update({
      where: { id },
      data: { notes },
    })

    return NextResponse.json({ job: updated })
  } catch (error) {
    console.error('Update notes error:', error)
    return NextResponse.json({ error: 'Failed to update notes' }, { status: 500 })
  }
}
