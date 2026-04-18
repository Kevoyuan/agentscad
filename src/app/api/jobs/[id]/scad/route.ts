import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { broadcastWs } from '@/lib/ws-broadcast'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { scadSource } = body

    if (typeof scadSource !== 'string') {
      return NextResponse.json({ error: 'scadSource must be a string' }, { status: 400 })
    }

    const job = await db.job.findUnique({ where: { id } })
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const updated = await db.job.update({
      where: { id },
      data: { scadSource },
    })

    broadcastWs('job:update', { jobId: id, state: updated.state, action: 'scad_updated' }).catch(() => {})

    return NextResponse.json({ job: updated })
  } catch (error) {
    console.error('Update SCAD error:', error)
    return NextResponse.json({ error: 'Failed to update SCAD source' }, { status: 500 })
  }
}
