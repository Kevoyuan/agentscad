import { db } from '@/lib/db'

/**
 * Track a version change for a job.
 * Creates a JobVersion record with old and new values.
 */
export async function trackVersion(
  jobId: string,
  field: string,
  oldValue: unknown,
  newValue: unknown,
  changedBy: string = 'user'
): Promise<void> {
  // Don't track if values are the same
  const oldStr = oldValue != null ? (typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue)) : null
  const newStr = newValue != null ? (typeof newValue === 'string' ? newValue : JSON.stringify(newValue)) : null

  if (oldStr === newStr) return

  await db.jobVersion.create({
    data: {
      jobId,
      field,
      oldValue: oldStr,
      newValue: newStr,
      changedBy,
    },
  })
}
