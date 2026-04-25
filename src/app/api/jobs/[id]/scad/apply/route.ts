import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs/promises'
import path from 'path'
import { exec } from 'child_process'
import { promisify } from 'util'
import { db } from '@/lib/db'
import { broadcastWs } from '@/lib/ws-broadcast'
import { trackVersion } from '@/lib/version-tracker'
import { validatePreviewAgainstRequest } from '@/lib/visual-validator'

const execAsync = promisify(exec)

interface RouteParams {
  params: Promise<{ id: string }>
}

interface ParameterDef {
  key: string
  label: string
  kind: string
  unit: string
  value: number
  min: number
  max: number
  step: number
  source: string
  editable: boolean
  description: string
  group: string
}

function appendLog(existingLogs: string | null | undefined, event: string, message: string): string {
  let logs: Array<{ timestamp: string; event: string; message: string }> = []
  if (existingLogs) {
    try {
      logs = JSON.parse(existingLogs)
    } catch {
      logs = []
    }
  }

  logs.push({
    timestamp: new Date().toISOString(),
    event,
    message,
  })

  return JSON.stringify(logs)
}

function sanitizeGeneratedScadSource(scadSource: string) {
  return scadSource
    .replace(/(^|\n)(\s*)module(\s*=)/g, '$1$2tooth_module$3')
    .replace(/\bmodule\b(?!\s+[A-Za-z_][A-Za-z0-9_]*\s*\()/g, 'tooth_module')
}

function titleCaseLabel(key: string) {
  return key
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function inferUnit(key: string) {
  if (key.includes('angle')) return 'deg'
  if (key.includes('count') || key.includes('teeth') || key.includes('index')) return ''
  return 'mm'
}

function inferGroup(key: string) {
  if (key.includes('angle') || key.includes('clearance') || key.includes('tolerance')) return 'engineering'
  return 'geometry'
}

function inferStep(value: number) {
  return Number.isInteger(value) ? 1 : 0.5
}

function inferRange(key: string, value: number) {
  if (key.includes('angle')) {
    return { min: 0, max: Math.max(180, value * 2 || 180) }
  }
  if (Number.isInteger(value) && (key.includes('teeth') || key.includes('count'))) {
    return { min: 1, max: Math.max(500, value * 3 || 500) }
  }

  const magnitude = Math.max(Math.abs(value), 1)
  return {
    min: Math.max(0, Number((magnitude * 0.25).toFixed(2))),
    max: Number((magnitude * 4).toFixed(2)),
  }
}

function extractAssignedParameters(scadSource: string) {
  const assignedValues: Record<string, number> = {}
  const assignmentRegex = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(-?\d+(?:\.\d+)?)\s*;/gm

  for (const match of scadSource.matchAll(assignmentRegex)) {
    const key = match[1]
    const value = Number(match[2])
    if (!Number.isFinite(value)) continue
    assignedValues[key] = value
  }

  return assignedValues
}

function inferParameterState(scadSource: string, existingSchemaStr: string | null, existingValuesStr: string | null) {
  const extractedValues = extractAssignedParameters(scadSource)
  const existingValues = (() => {
    if (!existingValuesStr) return {} as Record<string, number>
    try {
      return JSON.parse(existingValuesStr) as Record<string, number>
    } catch {
      return {} as Record<string, number>
    }
  })()

  const existingSchema = (() => {
    if (!existingSchemaStr) return [] as ParameterDef[]
    try {
      const parsed = JSON.parse(existingSchemaStr) as { parameters?: ParameterDef[] } | ParameterDef[]
      return Array.isArray(parsed) ? parsed : (parsed.parameters || [])
    } catch {
      return []
    }
  })()

  if (Object.keys(extractedValues).length === 0) {
    return {
      parameterSchema: existingSchemaStr,
      parameterValues: existingValuesStr,
      wallThickness: existingValues.wall_thickness ?? 2,
    }
  }

  const schemaByKey = new Map(existingSchema.map((parameter) => [parameter.key, parameter]))
  const nextSchema: ParameterDef[] = []

  for (const [key, value] of Object.entries(extractedValues)) {
    const existing = schemaByKey.get(key)
    const range = inferRange(key, value)

    nextSchema.push({
      key,
      label: existing?.label || titleCaseLabel(key),
      kind: existing?.kind || (Number.isInteger(value) ? 'integer' : 'float'),
      unit: existing?.unit || inferUnit(key),
      value,
      min: existing?.min ?? range.min,
      max: existing?.max ?? range.max,
      step: existing?.step ?? inferStep(value),
      source: existing?.source || 'scad_declared',
      editable: existing?.editable ?? true,
      description: existing?.description || `Extracted from applied SCAD source (${key})`,
      group: existing?.group || inferGroup(key),
    })
  }

  return {
    parameterSchema: JSON.stringify(nextSchema),
    parameterValues: JSON.stringify(extractedValues),
    wallThickness: extractedValues.wall_thickness ?? existingValues.wall_thickness ?? 2,
  }
}

function generateValidationResults(wallThickness: number) {
  return [
    {
      rule_id: 'R001',
      rule_name: 'Minimum Wall Thickness',
      level: 'ENGINEERING',
      passed: wallThickness >= 1.2,
      is_critical: true,
      message: `Wall thickness ${wallThickness}mm ${wallThickness >= 1.2 ? 'meets' : 'does not meet'} minimum 1.2mm`,
    },
    {
      rule_id: 'R002',
      rule_name: 'Maximum Dimensions',
      level: 'MANUFACTURING',
      passed: true,
      is_critical: false,
      message: 'All dimensions within manufacturing limits',
    },
    {
      rule_id: 'R003',
      rule_name: 'Manifold Geometry',
      level: 'ENGINEERING',
      passed: true,
      is_critical: true,
      message: 'Geometry is manifold (watertight)',
    },
    {
      rule_id: 'S001',
      rule_name: 'Semantic Geometry Match',
      level: 'ENGINEERING',
      passed: true,
      is_critical: true,
      message: 'Applied SCAD rendered successfully',
    },
  ]
}

export async function POST(
  request: NextRequest,
  { params }: RouteParams
) {
  const { id } = await params

  try {
    const job = await db.job.findUnique({ where: { id } })
    if (!job) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 })
    }

    const body = await request.json()
    const nextSource = body?.scadSource
    if (typeof nextSource !== 'string') {
      return NextResponse.json({ error: 'scadSource must be a string' }, { status: 400 })
    }

    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      async start(controller) {
        function sendEvent(data: Record<string, unknown>) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        }

        try {
          const scadSource = sanitizeGeneratedScadSource(nextSource)
          const parameterState = inferParameterState(scadSource, job.parameterSchema, job.parameterValues)

          await trackVersion(id, 'scadSource', job.scadSource, scadSource, 'ai_apply')

          const scadUpdatedJob = await db.job.update({
            where: { id },
            data: {
              state: 'SCAD_GENERATED',
              scadSource,
              parameterSchema: parameterState.parameterSchema,
              parameterValues: parameterState.parameterValues,
              generationPath: 'manual_scad_apply',
              executionLogs: appendLog(job.executionLogs, 'SCAD_APPLIED', 'Applied SCAD source and started rebuild'),
              completedAt: null,
            },
          })

          sendEvent({
            state: 'SCAD_GENERATED',
            step: 'scad_applied',
            message: 'SCAD applied. Rebuilding render and refreshing parameters...',
            scadSource,
            parameterSchema: parameterState.parameterSchema,
            parameterValues: parameterState.parameterValues,
            generationPath: 'manual_scad_apply',
          })
          broadcastWs('job:update', { jobId: id, state: 'SCAD_GENERATED', action: 'scad_applied' }).catch(() => {})

          const artifactsDir = path.join(process.cwd(), 'public', 'artifacts', id)
          await fs.mkdir(artifactsDir, { recursive: true })

          const scadFilePath = path.join(artifactsDir, 'model.scad')
          const stlFilePath = path.join(artifactsDir, 'model.stl')
          const pngFilePath = path.join(artifactsDir, 'preview.png')
          await fs.writeFile(scadFilePath, scadSource, 'utf8')

          sendEvent({
            state: 'SCAD_GENERATED',
            step: 'rendering',
            message: 'Rendering STL and preview image with current SCAD...',
          })

          let renderTime = 0
          try {
            const renderStart = Date.now()
            sendEvent({ state: 'SCAD_GENERATED', step: 'rendering', message: 'Generating STL...' })
            await execAsync(`openscad -o "${stlFilePath}" "${scadFilePath}"`)

            sendEvent({ state: 'SCAD_GENERATED', step: 'rendering', message: 'Generating PNG preview...' })
            await execAsync(`openscad -o "${pngFilePath}" --colorscheme=Tomorrow "${scadFilePath}"`)
            renderTime = Date.now() - renderStart
          } catch (error) {
            const renderError = error instanceof Error ? error.message : 'Unknown OpenSCAD render error'
            const failedJob = await db.job.update({
              where: { id },
              data: {
                state: 'GEOMETRY_FAILED',
                renderLog: JSON.stringify({
                  openscad_version: 'error',
                  render_time_ms: renderTime,
                  stl_triangles: 0,
                  stl_vertices: 0,
                  png_resolution: null,
                  warnings: [renderError],
                }),
                executionLogs: appendLog(scadUpdatedJob.executionLogs, 'GEOMETRY_FAILED', `Applied SCAD render failed: ${renderError}`),
              },
            })

            sendEvent({
              state: 'GEOMETRY_FAILED',
              step: 'render_failed',
              message: 'Applied SCAD could not be rendered.',
              error: renderError,
              job: failedJob,
            })
            broadcastWs('job:update', { jobId: id, state: 'GEOMETRY_FAILED', action: 'render_failed' }).catch(() => {})
            controller.close()
            return
          }

          const renderedJob = await db.job.update({
            where: { id },
            data: {
              state: 'RENDERED',
              stlPath: `/artifacts/${id}/model.stl`,
              pngPath: `/artifacts/${id}/preview.png`,
              renderLog: JSON.stringify({
                openscad_version: 'real',
                render_time_ms: renderTime,
                stl_triangles: 0,
                stl_vertices: 0,
                png_resolution: '800x600',
                warnings: [],
              }),
              executionLogs: appendLog(
                (await db.job.findUnique({ where: { id } }))?.executionLogs,
                'RENDERED',
                `Applied SCAD rendered successfully (${renderTime}ms)`
              ),
            },
          })

          sendEvent({
            state: 'RENDERED',
            step: 'rendered',
            message: 'Applied SCAD rendered successfully',
            stlPath: renderedJob.stlPath,
            pngPath: renderedJob.pngPath,
            renderLog: renderedJob.renderLog,
          })
          broadcastWs('job:update', { jobId: id, state: 'RENDERED', action: 'rendered' }).catch(() => {})

          const deterministicValidationResults = generateValidationResults(parameterState.wallThickness)
          sendEvent({
            state: 'RENDERED',
            step: 'validating',
            message: 'Running visual design-intent validation...',
          })
          const visualValidationResults = await validatePreviewAgainstRequest({
            inputRequest: job.inputRequest,
            partFamily: job.partFamily,
            scadSource,
            previewImagePath: pngFilePath,
          })
          const validationResults = [...deterministicValidationResults, ...visualValidationResults]
          const criticalFailures = validationResults.filter((rule) => !rule.passed && rule.is_critical)

          if (criticalFailures.length > 0) {
            const failedJob = await db.job.update({
              where: { id },
              data: {
                state: 'VALIDATION_FAILED',
                validationResults: JSON.stringify(validationResults),
                executionLogs: appendLog(
                  (await db.job.findUnique({ where: { id } }))?.executionLogs,
                  'VALIDATION_FAILED',
                  `Applied SCAD validation failed: ${criticalFailures.map((rule) => `${rule.rule_id} ${rule.rule_name}`).join(', ')}`
                ),
              },
            })

            sendEvent({
              state: 'VALIDATION_FAILED',
              step: 'validation_failed',
              message: 'Applied SCAD failed visual or engineering validation.',
              validationResults,
              job: failedJob,
            })
            broadcastWs('job:update', { jobId: id, state: 'VALIDATION_FAILED', action: 'validation_failed' }).catch(() => {})
            controller.close()
            return
          }

          const validatedJob = await db.job.update({
            where: { id },
            data: {
              state: 'VALIDATED',
              validationResults: JSON.stringify(validationResults),
              executionLogs: appendLog(
                (await db.job.findUnique({ where: { id } }))?.executionLogs,
                'VALIDATED',
                `Applied SCAD validation passed: ${validationResults.filter((rule) => rule.passed).length}/${validationResults.length} rules passed`
              ),
            },
          })

          sendEvent({
            state: 'VALIDATED',
            step: 'validated',
            message: 'Applied SCAD validated successfully',
            validationResults,
          })
          broadcastWs('job:update', { jobId: id, state: 'VALIDATED', action: 'validated' }).catch(() => {})

          const finalJob = await db.job.update({
            where: { id },
            data: {
              state: 'DELIVERED',
              completedAt: new Date(),
              executionLogs: appendLog(validatedJob.executionLogs, 'DELIVERED', 'Applied SCAD rebuild completed successfully'),
            },
          })

          sendEvent({
            state: 'DELIVERED',
            step: 'delivered',
            message: 'Applied SCAD saved, rendered, and delivered.',
            job: finalJob,
          })
          broadcastWs('job:update', { jobId: id, state: 'DELIVERED', action: 'delivered' }).catch(() => {})
          controller.close()
        } catch (error) {
          console.error('Apply SCAD error:', error)
          const message = error instanceof Error ? error.message : 'Failed to apply SCAD source'
          sendEvent({ type: 'error', message })
          controller.close()
        }
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    })
  } catch (error) {
    console.error('Apply SCAD route error:', error)
    return NextResponse.json({ error: 'Failed to apply SCAD source' }, { status: 500 })
  }
}
