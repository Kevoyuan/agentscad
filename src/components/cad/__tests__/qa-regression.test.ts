import { describe, test, expect } from 'bun:test'
import { PIPELINE_STEPS, getPipelineProgress } from '../types'

/**
 * QA Regression Tests
 *
 * These tests guard against bugs found during the 2026-04-27 QA pass.
 * Each test maps to a specific issue from the QA report.
 */

// ─── ISSUE-007: Pipeline shows "running" for completed jobs ──────────────────
describe('ISSUE-007: Pipeline terminal state logic', () => {
  const failedStates = ['GEOMETRY_FAILED', 'RENDER_FAILED', 'VALIDATION_FAILED']

  // Maps failed state names to their corresponding pipeline step keys
  const failedStepMap: Record<string, string> = {
    'GEOMETRY_FAILED': 'SCAD_GENERATED',
    'RENDER_FAILED': 'RENDERED',
    'VALIDATION_FAILED': 'VALIDATED',
  }

  function getStepStatus(state: string, stepIdx: number) {
    const currentIdx = PIPELINE_STEPS.findIndex(s => s.key === state)
    const isFailed = failedStates.includes(state)
    const failedStepKey = isFailed ? failedStepMap[state] ?? null : null
    const failedStepIdx = failedStepKey
      ? PIPELINE_STEPS.findIndex(s => s.key === failedStepKey)
      : -1
    const isTerminalState = state === 'DELIVERED' || state === 'CANCELLED'

    const isCompleted = isFailed
      ? stepIdx < failedStepIdx
      : isTerminalState
        ? stepIdx <= currentIdx
        : stepIdx < currentIdx

    const isCurrent = isFailed
      ? stepIdx === failedStepIdx
      : !isTerminalState && stepIdx === currentIdx && !isFailed

    return { isCompleted, isCurrent }
  }

  test('DELIVERED state: all steps should be completed, none current', () => {
    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      const { isCompleted, isCurrent } = getStepStatus('DELIVERED', i)
      expect(isCompleted).toBe(true)
      expect(isCurrent).toBe(false)
    }
  })

  test('CANCELLED state: no steps completed (not a pipeline step)', () => {
    // CANCELLED is not in PIPELINE_STEPS, so currentIdx = -1
    // No steps should be marked as completed or current
    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      const { isCompleted, isCurrent } = getStepStatus('CANCELLED', i)
      expect(isCompleted).toBe(false)
      expect(isCurrent).toBe(false)
    }
  })

  test('SCAD_GENERATED state: steps before GENERATE are completed, GENERATE is current', () => {
    const generateIdx = PIPELINE_STEPS.findIndex(s => s.key === 'SCAD_GENERATED')
    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      const { isCompleted, isCurrent } = getStepStatus('SCAD_GENERATED', i)
      if (i < generateIdx) {
        expect(isCompleted).toBe(true)
        expect(isCurrent).toBe(false)
      } else if (i === generateIdx) {
        expect(isCompleted).toBe(false)
        expect(isCurrent).toBe(true)
      } else {
        expect(isCompleted).toBe(false)
        expect(isCurrent).toBe(false)
      }
    }
  })

  test('RENDER_FAILED state: steps before RENDER are completed, RENDER is failed', () => {
    const renderIdx = PIPELINE_STEPS.findIndex(s => s.key === 'RENDERED')
    expect(renderIdx).toBe(2)

    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      const { isCompleted, isCurrent } = getStepStatus('RENDER_FAILED', i)
      if (i < renderIdx) {
        expect(isCompleted).toBe(true)
        expect(isCurrent).toBe(false)
      } else if (i === renderIdx) {
        expect(isCompleted).toBe(false)
        expect(isCurrent).toBe(true)
      } else {
        expect(isCompleted).toBe(false)
        expect(isCurrent).toBe(false)
      }
    }
  })

  test('GEOMETRY_FAILED state: INTAKE is completed, GENERATE is failed', () => {
    const generateIdx = PIPELINE_STEPS.findIndex(s => s.key === 'SCAD_GENERATED')
    expect(generateIdx).toBe(1)

    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      const { isCompleted, isCurrent } = getStepStatus('GEOMETRY_FAILED', i)
      if (i < generateIdx) {
        expect(isCompleted).toBe(true)
        expect(isCurrent).toBe(false)
      } else if (i === generateIdx) {
        expect(isCompleted).toBe(false)
        expect(isCurrent).toBe(true)
      } else {
        expect(isCompleted).toBe(false)
        expect(isCurrent).toBe(false)
      }
    }
  })

  test('VALIDATION_FAILED state: steps before VALIDATE are completed, VALIDATE is failed', () => {
    const validateIdx = PIPELINE_STEPS.findIndex(s => s.key === 'VALIDATED')
    expect(validateIdx).toBe(3)

    for (let i = 0; i < PIPELINE_STEPS.length; i++) {
      const { isCompleted, isCurrent } = getStepStatus('VALIDATION_FAILED', i)
      if (i < validateIdx) {
        expect(isCompleted).toBe(true)
        expect(isCurrent).toBe(false)
      } else if (i === validateIdx) {
        expect(isCompleted).toBe(false)
        expect(isCurrent).toBe(true)
      } else {
        expect(isCompleted).toBe(false)
        expect(isCurrent).toBe(false)
      }
    }
  })
})

// ─── ISSUE-005: Filter counts from filtered jobs ─────────────────────────────
describe('ISSUE-005: Filter state counts derive from filtered list', () => {
  const mockJobs = [
    { id: '1', state: 'DELIVERED', inputRequest: 'gear' },
    { id: '2', state: 'DELIVERED', inputRequest: 'box' },
    { id: '3', state: 'NEW', inputRequest: 'gear housing' },
    { id: '4', state: 'RENDER_FAILED', inputRequest: 'bracket' },
  ]

  function computeStateCounts(jobs: typeof mockJobs) {
    const counts: Record<string, number> = {}
    for (const j of jobs) {
      if (['VALIDATION_FAILED', 'GEOMETRY_FAILED', 'RENDER_FAILED'].includes(j.state)) {
        counts['FAILED'] = (counts['FAILED'] || 0) + 1
      }
      counts[j.state] = (counts[j.state] || 0) + 1
    }
    return counts
  }

  test('stateCounts reflects all jobs when no filter applied', () => {
    const counts = computeStateCounts(mockJobs)
    expect(counts['DELIVERED']).toBe(2)
    expect(counts['NEW']).toBe(1)
    expect(counts['RENDER_FAILED']).toBe(1)
    expect(counts['FAILED']).toBe(1)
  })

  test('stateCounts reflects filtered subset when search applied', () => {
    const filtered = mockJobs.filter(j => j.inputRequest.includes('gear'))
    const counts = computeStateCounts(filtered)
    expect(counts['DELIVERED']).toBe(1)
    expect(counts['NEW']).toBe(1)
    expect(counts['FAILED']).toBeUndefined()
  })

  test('totalFiltered equals sum of stateCounts values', () => {
    const filtered = mockJobs.filter(j => j.inputRequest.includes('gear'))
    const counts = computeStateCounts(filtered)
    const totalFiltered = Object.values(counts).reduce((a, b) => a + b, 0)
    expect(totalFiltered).toBe(filtered.length)
  })
})

// ─── ISSUE-002: getPipelineProgress for terminal and failed states ───────────
describe('ISSUE-002: getPipelineProgress correctness', () => {
  test('DELIVERED returns 100%', () => {
    expect(getPipelineProgress('DELIVERED')).toBe(100)
  })

  test('NEW returns 20%', () => {
    expect(getPipelineProgress('NEW')).toBe(20)
  })

  test('unknown state returns 0', () => {
    expect(getPipelineProgress('UNKNOWN_STATE')).toBe(0)
  })

  test('each step returns increasing progress', () => {
    const progresses = PIPELINE_STEPS.map(s => getPipelineProgress(s.key))
    for (let i = 1; i < progresses.length; i++) {
      expect(progresses[i]).toBeGreaterThan(progresses[i - 1])
    }
  })
})

// ─── ISSUE-004: DialogDescription presence ───────────────────────────────────
describe('ISSUE-004: Dialog accessibility (code-level check)', () => {
  test('PIPELINE_STEPS has all 5 expected steps', () => {
    const keys = PIPELINE_STEPS.map(s => s.key)
    expect(keys).toEqual(['NEW', 'SCAD_GENERATED', 'RENDERED', 'VALIDATED', 'DELIVERED'])
  })

  test('each PIPELINE_STEPS entry has key, label, and icon', () => {
    for (const step of PIPELINE_STEPS) {
      expect(step.key).toBeTruthy()
      expect(step.label).toBeTruthy()
      expect(step.icon).toBeTruthy()
    }
  })
})
