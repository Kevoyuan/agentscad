import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { broadcastWs } from '@/lib/ws-broadcast'
import { trackVersion } from '@/lib/version-tracker'

/**
 * PATCH /api/jobs/batch-params
 * Batch update parameter values across multiple jobs
 */
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json()
    const { jobIds, parameterValues } = body as {
      jobIds: string[]
      parameterValues: Record<string, number>
    }

    if (!Array.isArray(jobIds) || jobIds.length === 0) {
      return NextResponse.json(
        { error: 'jobIds must be a non-empty array' },
        { status: 400 }
      )
    }

    if (!parameterValues || typeof parameterValues !== 'object' || Array.isArray(parameterValues)) {
      return NextResponse.json(
        { error: 'parameterValues must be an object with key-value pairs' },
        { status: 400 }
      )
    }

    const success: string[] = []
    const failed: string[] = []

    for (const jobId of jobIds) {
      try {
        const job = await db.job.findUnique({ where: { id: jobId } })
        if (!job) {
          failed.push(jobId)
          continue
        }

        // Parse existing parameter values
        let currentValues: Record<string, unknown> = {}
        if (job.parameterValues) {
          try {
            currentValues = JSON.parse(job.parameterValues)
          } catch {
            currentValues = {}
          }
        }

        // Apply new values
        const oldValues = { ...currentValues }
        for (const [key, value] of Object.entries(parameterValues)) {
          currentValues[key] = value
        }

        // Track version history
        await trackVersion(jobId, 'parameters', JSON.stringify(oldValues), JSON.stringify(currentValues))

        // Update the job
        await db.job.update({
          where: { id: jobId },
          data: {
            parameterValues: JSON.stringify(currentValues),
          },
        })

        success.push(jobId)
      } catch {
        failed.push(jobId)
      }
    }

    // Broadcast WebSocket event
    broadcastWs('job:update', { jobId: jobIds, action: 'batch_params_updated' }).catch(() => {})

    return NextResponse.json({ results: { success, failed } })
  } catch (error) {
    console.error('Batch parameter update error:', error)
    return NextResponse.json(
      { error: 'Failed to update parameters' },
      { status: 500 }
    )
  }
}
