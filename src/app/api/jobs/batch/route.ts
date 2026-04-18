import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

const CANCELABLE_STATES = ['NEW', 'SCAD_GENERATED', 'RENDERED', 'VALIDATED', 'DEBUGGING', 'REPAIRING']

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { action, jobIds } = body as { action: string; jobIds: string[] }

    if (!action || !Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json({ error: 'Invalid request: action and jobIds required' }, { status: 400 })
    }

    let results: { success: string[]; failed: string[] } = { success: [], failed: [] }

    switch (action) {
      case 'delete': {
        const deleteResult = await db.job.deleteMany({
          where: { id: { in: jobIds } },
        })
        results.success = jobIds // Assume all deleted
        break
      }

      case 'cancel': {
        const jobs = await db.job.findMany({
          where: { id: { in: jobIds } },
        })
        const cancelableIds = jobs
          .filter(j => CANCELABLE_STATES.includes(j.state))
          .map(j => j.id)
        const nonCancelableIds = jobIds.filter(id => !cancelableIds.includes(id))

        if (cancelableIds.length > 0) {
          await db.job.updateMany({
            where: { id: { in: cancelableIds } },
            data: { state: 'CANCELLED', completedAt: new Date() },
          })
        }
        results.success = cancelableIds
        results.failed = nonCancelableIds
        break
      }

      case 'reprocess': {
        const jobs = await db.job.findMany({
          where: { id: { in: jobIds } },
        })
        const reprocessableIds = jobs
          .filter(j => j.state === 'DELIVERED' || j.state === 'CANCELLED' || CANCELABLE_STATES.includes(j.state))
          .map(j => j.id)

        if (reprocessableIds.length > 0) {
          await db.job.updateMany({
            where: { id: { in: reprocessableIds } },
            data: { state: 'NEW', completedAt: null },
          })
        }
        results.success = reprocessableIds
        break
      }

      default:
        return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 })
    }

    return NextResponse.json({ results })
  } catch (error) {
    console.error('Batch operation error:', error)
    return NextResponse.json({ error: 'Batch operation failed' }, { status: 500 })
  }
}
