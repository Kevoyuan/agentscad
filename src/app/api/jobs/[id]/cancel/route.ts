import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { broadcastWs } from '@/lib/ws-broadcast'

const CANCELABLE_STATES = ['NEW', 'SCAD_GENERATED', 'RENDERED', 'VALIDATED', 'DEBUGGING', 'REPAIRING']

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const job = await db.job.findUnique({ where: { id } })

    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    if (!CANCELABLE_STATES.includes(job.state)) {
      return NextResponse.json(
        { error: `Cannot cancel job in state ${job.state}` },
        { status: 400 }
      )
    }

    const updated = await db.job.update({
      where: { id },
      data: {
        state: 'CANCELLED',
        completedAt: new Date(),
      },
    })

    // Broadcast WebSocket event
    broadcastWs('job:update', { jobId: id, state: 'CANCELLED', action: 'cancelled' }).catch(() => {})

    return NextResponse.json({ job: updated })
  } catch (error) {
    console.error('Cancel job error:', error)
    return NextResponse.json({ error: 'Failed to cancel job' }, { status: 500 })
  }
}
