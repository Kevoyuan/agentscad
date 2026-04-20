'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Box, Loader2, AlertCircle } from 'lucide-react'
import { Job, parseJSON, safeNum } from './types'
import { ViewerControls, useViewerControls } from './viewer-controls'

// ─── Involute Gear Profile Generator ──────────────────────────────────────────

function createInvoluteGearShape(
  THREE: any,
  numTeeth: number,
  outerRadius: number,
  boreRadius: number,
): any {
  const gearModule = (outerRadius * 2) / (numTeeth + 2)
  const pitchRadius = (gearModule * numTeeth) / 2
  const addendum = gearModule
  const dedendum = gearModule * 1.25
  const tipRadius = pitchRadius + addendum
  const rootRadius = Math.max(pitchRadius - dedendum, boreRadius + 1)
  const toothAngularWidth = Math.PI / numTeeth * 0.55 // slightly less than half-pitch for gap

  const shape = new THREE.Shape()

  // Draw involute gear profile using Shape
  const pts: { x: number; y: number }[] = []

  for (let i = 0; i < numTeeth; i++) {
    const toothCenterAngle = (i / numTeeth) * Math.PI * 2

    // Involute function: r = baseRadius * sqrt(1 + theta^2)
    // For simplified involute: we trace from root to tip and back
    const baseRadius = pitchRadius * Math.cos(Math.PI / 4.5) // pressure angle ~20deg

    const numSteps = 6

    // Left flank: root to tip (involute curve)
    const leftStart = toothCenterAngle - toothAngularWidth / 2
    for (let s = 0; s <= numSteps; s++) {
      const t = s / numSteps // 0→1
      const r = rootRadius + (tipRadius - rootRadius) * t
      // Involute curve: angle offset increases as we go outward
      const involuteOffset = t * t * (toothAngularWidth * 0.3)
      const angle = leftStart + involuteOffset
      pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r })
    }

    // Tip arc
    const tipStartAngle = toothCenterAngle - toothAngularWidth / 2 + toothAngularWidth * 0.3
    const tipEndAngle = toothCenterAngle + toothAngularWidth / 2 - toothAngularWidth * 0.3
    for (let s = 1; s <= 3; s++) {
      const t = s / 3
      const angle = tipStartAngle + (tipEndAngle - tipStartAngle) * t
      pts.push({ x: Math.cos(angle) * tipRadius, y: Math.sin(angle) * tipRadius })
    }

    // Right flank: tip to root (involute curve descending)
    const rightEnd = toothCenterAngle + toothAngularWidth / 2
    for (let s = 1; s <= numSteps; s++) {
      const t = 1 - s / numSteps // 1→0
      const r = rootRadius + (tipRadius - rootRadius) * t
      const involuteOffset = t * t * (toothAngularWidth * 0.3)
      const angle = rightEnd - involuteOffset
      pts.push({ x: Math.cos(angle) * r, y: Math.sin(angle) * r })
    }

    // Root fillet to next tooth
    const gapStart = rightEnd
    const gapEnd = ((i + 1) / numTeeth) * Math.PI * 2 - toothAngularWidth / 2
    const filletSteps = 4
    for (let s = 1; s <= filletSteps; s++) {
      const t = s / filletSteps
      const angle = gapStart + (gapEnd - gapStart) * t
      // Small root fillet arc
      const filletR = rootRadius + 0.5 * Math.sin(t * Math.PI)
      pts.push({ x: Math.cos(angle) * filletR, y: Math.sin(angle) * filletR })
    }
  }

  // Build the shape from points
  if (pts.length > 0) {
    shape.moveTo(pts[0].x, pts[0].y)
    for (let i = 1; i < pts.length; i++) {
      shape.lineTo(pts[i].x, pts[i].y)
    }
    shape.lineTo(pts[0].x, pts[0].y)
  }

  // Bore hole as a hole in the shape
  const borePath = new THREE.Path()
  const boreSegs = 32
  for (let i = 0; i <= boreSegs; i++) {
    const angle = (i / boreSegs) * Math.PI * 2
    const x = Math.cos(angle) * boreRadius
    const y = Math.sin(angle) * boreRadius
    if (i === 0) borePath.moveTo(x, y)
    else borePath.lineTo(x, y)
  }
  shape.holes.push(borePath)

  return shape
}

// ─── Rounded Rectangle Shape ──────────────────────────────────────────────────

function createRoundedRectShape(
  THREE: any,
  w: number,
  h: number,
  r: number,
): any {
  const shape = new THREE.Shape()
  const hw = w / 2
  const hh = h / 2
  r = Math.min(r, hw, hh)

  shape.moveTo(-hw + r, -hh)
  shape.lineTo(hw - r, -hh)
  shape.quadraticCurveTo(hw, -hh, hw, -hh + r)
  shape.lineTo(hw, hh - r)
  shape.quadraticCurveTo(hw, hh, hw - r, hh)
  shape.lineTo(-hw + r, hh)
  shape.quadraticCurveTo(-hw, hh, -hw, hh - r)
  shape.lineTo(-hw, -hh + r)
  shape.quadraticCurveTo(-hw, -hh, -hw + r, -hh)

  return shape
}

// ─── Hexagonal Shape ──────────────────────────────────────────────────────────

function createHexShape(THREE: any, radius: number): any {
  const shape = new THREE.Shape()
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 6
    const x = Math.cos(angle) * radius
    const y = Math.sin(angle) * radius
    if (i === 0) shape.moveTo(x, y)
    else shape.lineTo(x, y)
  }
  shape.closePath()
  return shape
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ThreeDViewer({ job }: { job: Job }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    state: controlsState,
    setState: setControlsState,
    handleScreenshot,
  } = useViewerControls({
    autoRotate: true,
    wireframe: false,
    showGrid: true,
    showAxes: true,
    darkBg: true,
  })

  const threeModuleRef = useRef<any>(null)
  const sceneRef = useRef<any>(null)
  const controlsObjRef = useRef<any>(null)
  const gridHelperRef = useRef<any>(null)
  const axisHelperRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const rendererRef = useRef<any>(null)
  const mainGroupRef = useRef<any>(null)

  const values = parseJSON<Record<string, number>>(job.parameterValues, {})
  const width = safeNum(values.width, 40)
  const depth = safeNum(values.depth, 30)
  const height = safeNum(values.height, 15)
  const wall = safeNum(values.wall_thickness, 2)
  const teeth = safeNum(values.teeth, 20)
  const outerDiam = safeNum(values.outer_diameter, 50)
  const boreDiam = safeNum(values.bore_diameter, 8)
  const thickness = safeNum(values.thickness, 8)
  const partFamily = job.partFamily || 'unknown'

  const defaultCameraPos = { x: 60, y: 50, z: 60 }
  const defaultTarget = { x: 0, y: 0, z: 0 }

  // Apply controls state changes to Three.js scene
  useEffect(() => {
    if (controlsObjRef.current) {
      controlsObjRef.current.autoRotate = controlsState.autoRotate
    }
    if (mainGroupRef.current) {
      mainGroupRef.current.traverse((child: any) => {
        if (child.isMesh && child.material) {
          child.material.wireframe = controlsState.wireframe
        }
      })
    }
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = controlsState.showGrid
    }
    if (axisHelperRef.current) {
      axisHelperRef.current.visible = controlsState.showAxes
    }
    if (sceneRef.current && threeModuleRef.current) {
      sceneRef.current.background = new threeModuleRef.current.Color(
        controlsState.darkBg ? 0x080810 : 0x050508
      )
    }
  }, [controlsState])

  const handleResetCamera = useCallback(() => {
    if (cameraRef.current && controlsObjRef.current) {
      cameraRef.current.position.set(defaultCameraPos.x, defaultCameraPos.y, defaultCameraPos.z)
      controlsObjRef.current.target.set(defaultTarget.x, defaultTarget.y, defaultTarget.z)
      controlsObjRef.current.update()
    }
  }, [])

  const handleZoomIn = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.position.multiplyScalar(0.85)
      if (controlsObjRef.current) controlsObjRef.current.update()
    }
  }, [])

  const handleZoomOut = useCallback(() => {
    if (cameraRef.current) {
      cameraRef.current.position.multiplyScalar(1.15)
      if (controlsObjRef.current) controlsObjRef.current.update()
    }
  }, [])

  const handleScreenshotWithCanvas = useCallback(() => {
    if (rendererRef.current) {
      const canvas = rendererRef.current.domElement
      if (canvas) {
        const link = document.createElement('a')
        link.download = `cad-preview-${Date.now()}.png`
        link.href = canvas.toDataURL('image/png')
        link.click()
      }
    }
  }, [])

  useEffect(() => {
    if (!mountRef.current || job.state === 'NEW' || job.state === 'SCAD_GENERATED') return

    let cancelled = false
    setIsLoading(true)
    setError(null)

    const container = mountRef.current
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === 0 || h === 0) {
      setIsLoading(false)
      return
    }

    let renderer: any = null
    let controls: any = null
    let animFrameId: number | null = null

    import('three').then(async (THREE) => {
      threeModuleRef.current = THREE
      const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')

      if (cancelled || !mountRef.current) return

      try {
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(controlsState.darkBg ? 0x080810 : 0x050508)
        scene.fog = new THREE.Fog(0x080810, 100, 200)
        sceneRef.current = scene

        const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000)
        camera.position.set(defaultCameraPos.x, defaultCameraPos.y, defaultCameraPos.z)
        cameraRef.current = camera

        renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true })
        renderer.setSize(w, h)
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
        renderer.shadowMap.enabled = true
        rendererRef.current = renderer

        while (container.firstChild) {
          container.removeChild(container.firstChild)
        }
        container.appendChild(renderer.domElement)

        controls = new OrbitControls(camera, renderer.domElement)
        controls.enableDamping = true
        controls.dampingFactor = 0.05
        controls.autoRotate = controlsState.autoRotate
        controls.autoRotateSpeed = 0.5
        controlsObjRef.current = controls

        const gridHelper = new THREE.GridHelper(120, 24, 0x1a1a3e, 0x0d0d1f)
        gridHelper.visible = controlsState.showGrid
        scene.add(gridHelper)
        gridHelperRef.current = gridHelper

        const axisHelper = new THREE.AxesHelper(30)
        axisHelper.position.set(-50, 0.1, -50)
        axisHelper.visible = controlsState.showAxes
        scene.add(axisHelper)
        axisHelperRef.current = axisHelper

        const mainGroup = new THREE.Group()

        // ─── SPUR GEAR ───────────────────────────────────────────────────────
        if (partFamily === 'spur_gear') {
          const outerR = outerDiam / 2
          const boreR = boreDiam / 2

          // Create involute gear shape and extrude
          const gearShape = createInvoluteGearShape(THREE, teeth, outerR, boreR)
          const extrudeSettings = {
            depth: thickness,
            bevelEnabled: true,
            bevelThickness: 0.3,
            bevelSize: 0.3,
            bevelSegments: 2,
          }
          const gearGeo = new THREE.ExtrudeGeometry(gearShape, extrudeSettings)
          const gearMat = new THREE.MeshPhongMaterial({
            color: 0x6366f1,
            transparent: true,
            opacity: 0.85,
            side: THREE.DoubleSide,
            wireframe: controlsState.wireframe,
            shininess: 80,
          })
          const gearMesh = new THREE.Mesh(gearGeo, gearMat)
          // Extrude goes along Z by default; rotate so thickness is along Y
          gearMesh.rotation.x = -Math.PI / 2
          gearMesh.position.y = 0
          mainGroup.add(gearMesh)

          // Hub boss (raised center)
          const hubRadius = boreR * 2.5
          const hubHeight = thickness * 0.3
          const hubGeo = new THREE.CylinderGeometry(hubRadius, hubRadius, hubHeight, 32)
          const hubMat = new THREE.MeshPhongMaterial({
            color: 0x818cf8,
            transparent: true,
            opacity: 0.9,
            wireframe: controlsState.wireframe,
            shininess: 100,
          })
          const hubMesh = new THREE.Mesh(hubGeo, hubMat)
          hubMesh.position.y = thickness + hubHeight / 2
          mainGroup.add(hubMesh)

          // Keyway in bore
          const keywayWidth = boreR * 0.6
          const keywayDepth = boreR * 0.4
          const keywayGeo = new THREE.BoxGeometry(keywayWidth, thickness + hubHeight + 1, keywayDepth)
          const keywayMat = new THREE.MeshPhongMaterial({
            color: 0x080810,
            wireframe: controlsState.wireframe,
          })
          const keywayMesh = new THREE.Mesh(keywayGeo, keywayMat)
          keywayMesh.position.y = (thickness + hubHeight) / 2
          keywayMesh.position.z = boreR * 0.3
          mainGroup.add(keywayMesh)

          // Edges on gear profile
          const edgesGeo = new THREE.EdgesGeometry(gearGeo, 15)
          const edgesMat = new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.6 })
          const edgesLine = new THREE.LineSegments(edgesGeo, edgesMat)
          edgesLine.rotation.x = -Math.PI / 2
          mainGroup.add(edgesLine)

          // Lightened holes (weight reduction)
          if (outerR > 15) {
            const lightHoleR = (outerR - boreR * 2.5) * 0.25
            const lightHoleDist = (outerR + boreR * 2.5) / 2
            const numLightHoles = Math.min(Math.floor(teeth / 4), 6)
            for (let i = 0; i < numLightHoles; i++) {
              const angle = (i / numLightHoles) * Math.PI * 2
              const lhGeo = new THREE.CylinderGeometry(lightHoleR, lightHoleR, thickness - 1, 16)
              const lhMat = new THREE.MeshPhongMaterial({
                color: 0x080810,
                wireframe: controlsState.wireframe,
              })
              const lhMesh = new THREE.Mesh(lhGeo, lhMat)
              lhMesh.position.x = Math.cos(angle) * lightHoleDist
              lhMesh.position.z = Math.sin(angle) * lightHoleDist
              lhMesh.position.y = thickness / 2
              mainGroup.add(lhMesh)
            }
          }

        // ─── HEX BOLT ───────────────────────────────────────────────────────
        } else if (partFamily === 'hex_bolt') {
          const headDiam = safeNum(values.head_diameter, 16)
          const shaftLength = safeNum(values.shaft_length, 40)
          const shaftDiam = safeNum(values.shaft_diameter, 8)
          const threadSize = safeNum(values.thread_size, 8)

          const headHeight = headDiam * 0.6
          const headRadius = headDiam / 2
          const shaftRadius = shaftDiam / 2

          // Hex head using ExtrudeGeometry
          const hexShape = createHexShape(THREE, headRadius)
          const headGeo = new THREE.ExtrudeGeometry(hexShape, {
            depth: headHeight,
            bevelEnabled: true,
            bevelThickness: 0.5,
            bevelSize: 0.5,
            bevelSegments: 2,
          })
          const boltMat = new THREE.MeshPhongMaterial({
            color: 0x94a3b8,
            transparent: true,
            opacity: 0.9,
            wireframe: controlsState.wireframe,
            shininess: 120,
          })
          const headMesh = new THREE.Mesh(headGeo, boltMat)
          headMesh.rotation.x = -Math.PI / 2
          headMesh.position.y = headHeight
          mainGroup.add(headMesh)

          // Shaft
          const shaftGeo = new THREE.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 32)
          const shaftMesh = new THREE.Mesh(shaftGeo, boltMat.clone())
          shaftMesh.material.wireframe = controlsState.wireframe
          shaftMesh.position.y = -shaftLength / 2
          mainGroup.add(shaftMesh)

          // Thread visualization - helical ridges on shaft
          const threadDepth = Math.max(0.3, shaftRadius * 0.08)
          const threadPitch = threadSize * 1.25 // coarse pitch
          const numThreads = Math.floor(shaftLength / threadPitch)
          for (let i = 0; i < numThreads; i++) {
            const y = -i * threadPitch
            if (y < -shaftLength) break
            const ringGeo = new THREE.TorusGeometry(shaftRadius + threadDepth, threadDepth * 0.6, 4, 32)
            const ringMat = new THREE.MeshPhongMaterial({
              color: 0x64748b,
              wireframe: controlsState.wireframe,
              shininess: 60,
            })
            const ringMesh = new THREE.Mesh(ringGeo, ringMat)
            ringMesh.rotation.x = Math.PI / 2
            ringMesh.position.y = y
            mainGroup.add(ringMesh)
          }

          // Chamfer on head top
          const chamferGeo = new THREE.CylinderGeometry(headRadius * 0.85, headRadius, 1, 6)
          const chamferMat = new THREE.MeshPhongMaterial({
            color: 0x94a3b8,
            wireframe: controlsState.wireframe,
            shininess: 120,
          })
          const chamferMesh = new THREE.Mesh(chamferGeo, chamferMat)
          chamferMesh.position.y = headHeight + 0.5
          mainGroup.add(chamferMesh)

          // Edges
          const headEdges = new THREE.EdgesGeometry(headGeo, 15)
          const headEdgesLine = new THREE.LineSegments(headEdges, new THREE.LineBasicMaterial({ color: 0xa5b4fc, transparent: true, opacity: 0.5 }))
          headEdgesLine.rotation.x = -Math.PI / 2
          headEdgesLine.position.y = headHeight
          mainGroup.add(headEdgesLine)

        // ─── DEVICE STAND ───────────────────────────────────────────────────
        } else if (partFamily === 'device_stand') {
          const standH = safeNum(values.stand_height, 80)
          const deviceW = safeNum(values.device_width, 75)
          const wallT = safeNum(values.wall_thickness, 3)
          const lipH = safeNum(values.lip_height, 10)
          const baseR = 4 // base corner radius

          const baseMat = new THREE.MeshPhongMaterial({
            color: 0x6366f1,
            transparent: true,
            opacity: 0.8,
            wireframe: controlsState.wireframe,
            shininess: 60,
          })
          const accentMat = new THREE.MeshPhongMaterial({
            color: 0x818cf8,
            transparent: true,
            opacity: 0.9,
            wireframe: controlsState.wireframe,
            shininess: 80,
          })

          // Base plate with rounded corners
          const baseW = deviceW + wallT * 2 + 40
          const baseD = deviceW * 0.6
          const baseShape = createRoundedRectShape(THREE, baseW, baseD, baseR)
          const baseGeo = new THREE.ExtrudeGeometry(baseShape, { depth: wallT, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 1 })
          const baseMesh = new THREE.Mesh(baseGeo, baseMat)
          baseMesh.rotation.x = -Math.PI / 2
          baseMesh.position.y = wallT
          mainGroup.add(baseMesh)

          // Back support with rounded top
          const backW = deviceW + wallT * 2
          const backShape = createRoundedRectShape(THREE, backW, standH, baseR)
          const backGeo = new THREE.ExtrudeGeometry(backShape, { depth: wallT, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 1 })
          const backMesh = new THREE.Mesh(backGeo, accentMat)
          backMesh.rotation.x = -Math.PI / 2
          backMesh.position.y = wallT + standH
          backMesh.position.z = -baseD * 0.3
          mainGroup.add(backMesh)

          // Angle support rib (triangular brace)
          const ribShape = new THREE.Shape()
          const ribH = standH * 0.5
          const ribD = baseD * 0.25
          ribShape.moveTo(0, 0)
          ribShape.lineTo(ribD, 0)
          ribShape.lineTo(0, ribH)
          ribShape.closePath()
          const ribGeo = new THREE.ExtrudeGeometry(ribShape, { depth: wallT, bevelEnabled: false })
          const ribMat = new THREE.MeshPhongMaterial({ color: 0x6366f1, transparent: true, opacity: 0.6, wireframe: controlsState.wireframe })
          // Two ribs on sides
          for (const side of [-1, 1]) {
            const ribMesh = new THREE.Mesh(ribGeo, ribMat)
            ribMesh.rotation.x = -Math.PI / 2
            ribMesh.position.set(side * (backW / 2 - wallT), wallT, -baseD * 0.3)
            mainGroup.add(ribMesh)
          }

          // Front lip with rounded top
          const lipShape = createRoundedRectShape(THREE, backW, lipH, 2)
          const lipGeo = new THREE.ExtrudeGeometry(lipShape, { depth: wallT, bevelEnabled: true, bevelThickness: 0.2, bevelSize: 0.2, bevelSegments: 1 })
          const lipMesh = new THREE.Mesh(lipGeo, accentMat)
          lipMesh.rotation.x = -Math.PI / 2
          lipMesh.position.y = wallT + lipH
          lipMesh.position.z = baseD * 0.3
          mainGroup.add(lipMesh)

          // Cable management channel (slot in back support)
          const channelW = backW * 0.4
          const channelH = standH * 0.12
          const channelGeo = new THREE.BoxGeometry(channelW, channelH, wallT + 1)
          const channelMat = new THREE.MeshPhongMaterial({ color: 0x080810, wireframe: controlsState.wireframe })
          const channelMesh = new THREE.Mesh(channelGeo, channelMat)
          channelMesh.position.y = wallT + standH * 0.3
          channelMesh.position.z = -baseD * 0.3
          mainGroup.add(channelMesh)

          // Rubber feet recesses (4 corners of base)
          const footR = 3
          const footH = 1
          for (const [fx, fz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
            const footGeo = new THREE.CylinderGeometry(footR, footR, footH, 16)
            const footMat = new THREE.MeshPhongMaterial({ color: 0x1a1a2e, wireframe: controlsState.wireframe })
            const footMesh = new THREE.Mesh(footGeo, footMat)
            footMesh.position.set(
              fx * (baseW / 2 - footR * 2),
              -footH / 2,
              fz * (baseD / 2 - footR * 2)
            )
            mainGroup.add(footMesh)
          }

          // Edges on base
          const baseEdges = new THREE.EdgesGeometry(baseGeo, 15)
          const baseEdgeLine = new THREE.LineSegments(baseEdges, new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.5 }))
          baseEdgeLine.rotation.x = -Math.PI / 2
          baseEdgeLine.position.y = wallT
          mainGroup.add(baseEdgeLine)

        // ─── PHONE CASE ─────────────────────────────────────────────────────
        } else if (partFamily === 'phone_case') {
          const bodyL = safeNum(values.body_length, 158)
          const bodyW = safeNum(values.body_width, 78)
          const bodyD = safeNum(values.body_depth, 8)
          const wallT = safeNum(values.wall_thickness, 1.5)
          const cornerR = Math.min(bodyW * 0.08, 8)

          // Outer shell with rounded corners and edges
          const outerShape = createRoundedRectShape(THREE, bodyL + wallT * 2, bodyW + wallT * 2, cornerR + wallT)
          const outerGeo = new THREE.ExtrudeGeometry(outerShape, {
            depth: bodyD + wallT,
            bevelEnabled: true,
            bevelThickness: wallT * 0.4,
            bevelSize: wallT * 0.4,
            bevelSegments: 3,
          })
          const outerMat = new THREE.MeshPhongMaterial({
            color: 0x6366f1,
            transparent: true,
            opacity: 0.6,
            wireframe: controlsState.wireframe,
            shininess: 80,
          })
          const outerMesh = new THREE.Mesh(outerGeo, outerMat)
          outerMesh.rotation.x = -Math.PI / 2
          outerMesh.position.y = bodyD + wallT
          mainGroup.add(outerMesh)

          // Inner cavity
          const innerShape = createRoundedRectShape(THREE, bodyL, bodyW, cornerR)
          const innerGeo = new THREE.ExtrudeGeometry(innerShape, {
            depth: bodyD,
            bevelEnabled: false,
          })
          const innerMat = new THREE.MeshPhongMaterial({
            color: 0x080810,
            transparent: true,
            opacity: 0.9,
            wireframe: controlsState.wireframe,
          })
          const innerMesh = new THREE.Mesh(innerGeo, innerMat)
          innerMesh.rotation.x = -Math.PI / 2
          innerMesh.position.y = bodyD + wallT
          innerMesh.position.x = 0
          innerMesh.position.z = 0
          mainGroup.add(innerMesh)

          // Camera cutout (rectangle + circles for lenses)
          const camCutW = bodyW * 0.35
          const camCutH = bodyW * 0.25
          const camX = bodyL / 2 - camCutW / 2 - wallT * 2
          const camZ = -bodyW / 2 + camCutH / 2 + wallT * 3

          const camCutGeo = new THREE.BoxGeometry(camCutW, bodyD + wallT + 1, camCutH)
          const camCutMat = new THREE.MeshPhongMaterial({ color: 0x080810, wireframe: controlsState.wireframe })
          const camCutMesh = new THREE.Mesh(camCutGeo, camCutMat)
          camCutMesh.position.set(camX, (bodyD + wallT) / 2, camZ)
          mainGroup.add(camCutMesh)

          // Camera lens circles
          const lensR = camCutH * 0.2
          for (let li = 0; li < 3; li++) {
            const lensGeo = new THREE.CylinderGeometry(lensR, lensR, wallT + 1, 24)
            const lensMat = new THREE.MeshPhongMaterial({
              color: 0x0d0d1f,
              wireframe: controlsState.wireframe,
              shininess: 200,
            })
            const lensMesh = new THREE.Mesh(lensGeo, lensMat)
            lensMesh.position.set(
              camX - camCutW * 0.2 + li * camCutW * 0.2,
              bodyD + wallT + 0.5,
              camZ
            )
            mainGroup.add(lensMesh)
          }

          // Button recesses (side volume buttons + power)
          const btnW = bodyW * 0.06
          const btnH = bodyW * 0.12
          const btnD = wallT + 2
          // Volume buttons (left side)
          for (let bi = 0; bi < 2; bi++) {
            const btnGeo = new THREE.BoxGeometry(btnD, btnH, btnW)
            const btnMat = new THREE.MeshPhongMaterial({ color: 0x080810, wireframe: controlsState.wireframe })
            const btnMesh = new THREE.Mesh(btnGeo, btnMat)
            btnMesh.position.set(
              -bodyL / 2 - wallT - 0.5,
              bodyD * 0.3 + bi * (btnH + 2),
              0
            )
            mainGroup.add(btnMesh)
          }
          // Power button (right side)
          const pwrGeo = new THREE.BoxGeometry(btnD, btnH * 1.2, btnW)
          const pwrMat = new THREE.MeshPhongMaterial({ color: 0x080810, wireframe: controlsState.wireframe })
          const pwrMesh = new THREE.Mesh(pwrGeo, pwrMat)
          pwrMesh.position.set(
            bodyL / 2 + wallT + 0.5,
            bodyD * 0.5,
            0
          )
          mainGroup.add(pwrMesh)

          // Bottom charging port cutout
          const portW = bodyW * 0.15
          const portH = bodyD * 0.2
          const portGeo = new THREE.BoxGeometry(portW, portH, wallT + 1)
          const portMat = new THREE.MeshPhongMaterial({ color: 0x080810, wireframe: controlsState.wireframe })
          const portMesh = new THREE.Mesh(portGeo, portMat)
          portMesh.position.set(0, bodyD * 0.3, bodyW / 2 + wallT + 0.5)
          mainGroup.add(portMesh)

          // Edges
          const outerEdges = new THREE.EdgesGeometry(outerGeo, 15)
          const outerLine = new THREE.LineSegments(outerEdges, new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.5 }))
          outerLine.rotation.x = -Math.PI / 2
          outerLine.position.y = bodyD + wallT
          mainGroup.add(outerLine)

        // ─── ELECTRONICS ENCLOSURE ──────────────────────────────────────────
        } else {
          const cornerR = Math.min(width, depth, height) * 0.12

          // Outer shell with rounded corners
          const outerShape = createRoundedRectShape(THREE, width, depth, cornerR)
          const outerGeo = new THREE.ExtrudeGeometry(outerShape, {
            depth: height,
            bevelEnabled: true,
            bevelThickness: 0.5,
            bevelSize: 0.5,
            bevelSegments: 2,
          })
          const outerMat = new THREE.MeshPhongMaterial({
            color: 0x6366f1,
            transparent: true,
            opacity: 0.55,
            side: THREE.DoubleSide,
            wireframe: controlsState.wireframe,
            shininess: 60,
          })
          const outerMesh = new THREE.Mesh(outerGeo, outerMat)
          outerMesh.rotation.x = -Math.PI / 2
          outerMesh.position.y = height
          mainGroup.add(outerMesh)

          // Inner cavity
          const innerW = Math.max(0.1, width - 2 * wall)
          const innerD = Math.max(0.1, depth - 2 * wall)
          const innerH = Math.max(0.1, height - 2 * wall)
          const innerR = Math.max(0.1, cornerR - wall)
          const innerShape = createRoundedRectShape(THREE, innerW, innerD, innerR)
          const innerGeo = new THREE.ExtrudeGeometry(innerShape, {
            depth: innerH,
            bevelEnabled: false,
          })
          const innerMat = new THREE.MeshPhongMaterial({
            color: 0x22d3ee,
            transparent: true,
            opacity: 0.08,
            side: THREE.BackSide,
            wireframe: controlsState.wireframe,
          })
          const innerMesh = new THREE.Mesh(innerGeo, innerMat)
          innerMesh.rotation.x = -Math.PI / 2
          innerMesh.position.y = height - wall
          mainGroup.add(innerMesh)

          // Snap-fit features on lid (4 clips at corners)
          const clipW = wall * 1.5
          const clipH = wall * 1.2
          const clipD = wall * 2
          const clipMat = new THREE.MeshPhongMaterial({
            color: 0x818cf8,
            transparent: true,
            opacity: 0.8,
            wireframe: controlsState.wireframe,
          })
          for (const [cx, cz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
            const clipGeo = new THREE.BoxGeometry(clipW, clipH, clipD)
            const clipMesh = new THREE.Mesh(clipGeo, clipMat)
            clipMesh.position.set(
              cx * (innerW / 2 - clipW),
              height + clipH / 2,
              cz * (innerD / 2 - clipD)
            )
            mainGroup.add(clipMesh)
          }

          // Ventilation slots on one side
          const ventCount = Math.max(2, Math.floor(depth / 6))
          const ventW = width * 0.5
          const ventH = wall + 1
          const ventSlotW = 1.5
          const ventMat = new THREE.MeshPhongMaterial({ color: 0x080810, wireframe: controlsState.wireframe })
          for (let vi = 0; vi < ventCount; vi++) {
            const ventGeo = new THREE.BoxGeometry(ventW, ventH, ventSlotW)
            const ventMesh = new THREE.Mesh(ventGeo, ventMat)
            ventMesh.position.set(
              0,
              height * 0.3 + vi * (depth * 0.5 / ventCount),
              depth / 2 + 0.5
            )
            mainGroup.add(ventMesh)
          }

          // PCB mounting posts (4 corner posts)
          const postR = Math.max(1, wall * 0.8)
          const postH = innerH * 0.6
          const postMat = new THREE.MeshPhongMaterial({
            color: 0x818cf8,
            transparent: true,
            opacity: 0.7,
            wireframe: controlsState.wireframe,
          })
          for (const [px, pz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
            const postGeo = new THREE.CylinderGeometry(postR, postR, postH, 12)
            const postMesh = new THREE.Mesh(postGeo, postMat)
            postMesh.position.set(
              px * (innerW / 2 - postR * 2),
              wall + postH / 2,
              pz * (innerD / 2 - postR * 2)
            )
            mainGroup.add(postMesh)
          }

          // Lid (transparent top)
          const lidShape = createRoundedRectShape(THREE, width + 0.5, depth + 0.5, cornerR)
          const lidGeo = new THREE.ExtrudeGeometry(lidShape, {
            depth: wall,
            bevelEnabled: true,
            bevelThickness: 0.3,
            bevelSize: 0.3,
            bevelSegments: 1,
          })
          const lidMat = new THREE.MeshPhongMaterial({
            color: 0x22d3ee,
            transparent: true,
            opacity: 0.25,
            wireframe: controlsState.wireframe,
          })
          const lidMesh = new THREE.Mesh(lidGeo, lidMat)
          lidMesh.rotation.x = -Math.PI / 2
          lidMesh.position.y = height + wall
          mainGroup.add(lidMesh)

          // Edges on outer
          const outerEdges = new THREE.EdgesGeometry(outerGeo, 15)
          const outerLine = new THREE.LineSegments(outerEdges, new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.5 }))
          outerLine.rotation.x = -Math.PI / 2
          outerLine.position.y = height
          mainGroup.add(outerLine)

          // Edges on inner
          const innerEdges = new THREE.EdgesGeometry(innerGeo, 15)
          const innerLine = new THREE.LineSegments(innerEdges, new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.3 }))
          innerLine.rotation.x = -Math.PI / 2
          innerLine.position.y = height - wall
          mainGroup.add(innerLine)
        }

        scene.add(mainGroup)
        mainGroupRef.current = mainGroup

        // Lights
        const ambient = new THREE.AmbientLight(0x404060, 2.5)
        scene.add(ambient)
        const dirLight = new THREE.DirectionalLight(0xffffff, 1.2)
        dirLight.position.set(50, 80, 50)
        dirLight.castShadow = true
        scene.add(dirLight)
        const pointLight1 = new THREE.PointLight(0x6366f1, 0.6, 200)
        pointLight1.position.set(-30, 40, -30)
        scene.add(pointLight1)
        const pointLight2 = new THREE.PointLight(0x22d3ee, 0.3, 150)
        pointLight2.position.set(30, 20, 30)
        scene.add(pointLight2)

        setIsLoading(false)

        function animate() {
          if (cancelled) return
          animFrameId = requestAnimationFrame(animate)
          controls.update()
          renderer.render(scene, camera)
        }
        animate()

      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : '3D rendering failed')
          setIsLoading(false)
        }
      }
    }).catch(() => {
      if (!cancelled) {
        setError('Failed to load 3D library')
        setIsLoading(false)
      }
    })

    return () => {
      cancelled = true
      if (animFrameId !== null) cancelAnimationFrame(animFrameId)
      if (renderer) {
        renderer.dispose()
        renderer = null
      }
      if (controls) {
        controls.dispose()
        controls = null
      }
      threeModuleRef.current = null
      sceneRef.current = null
      controlsObjRef.current = null
      gridHelperRef.current = null
      axisHelperRef.current = null
      cameraRef.current = null
      rendererRef.current = null
      mainGroupRef.current = null
      if (container) {
        while (container.firstChild) {
          container.removeChild(container.firstChild)
        }
      }
    }
  }, [job.state, job.parameterValues, width, depth, height, wall, teeth, outerDiam, boreDiam, thickness, partFamily])

  if (job.state === 'NEW' || job.state === 'SCAD_GENERATED') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3">
        <div className="w-16 h-16 rounded-2xl bg-zinc-800/20 flex items-center justify-center">
          <Box className="w-8 h-8 opacity-20" />
        </div>
        <span className="text-xs">Process job to generate 3D preview</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-zinc-600 gap-3 p-4">
        <AlertCircle className="w-8 h-8 text-rose-500/50" />
        <span className="text-xs text-rose-400">3D preview unavailable</span>
        <span className="text-[10px] text-zinc-700">{error}</span>
      </div>
    )
  }

  return (
    <div className="relative w-full h-full linear-border rounded-lg overflow-hidden">
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-3 w-3/4 max-w-xs">
            <div className="skeleton-loading w-full h-40 rounded-lg" />
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
              <span className="text-[10px] text-zinc-500">Loading 3D preview...</span>
            </div>
          </div>
        </div>
      )}
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-2 flex items-center gap-2 z-[5]">
        <span className="text-[9px] font-mono text-zinc-600 bg-black/40 px-1.5 py-0.5 rounded">
          {partFamily === 'spur_gear' ? `${teeth}T ⌀${outerDiam}mm` :
           partFamily === 'hex_bolt' ? `M${safeNum(values.thread_size, 8)} × ${safeNum(values.shaft_length, 40)}mm` :
           partFamily === 'phone_case' ? `${safeNum(values.body_length, 158)}×${safeNum(values.body_width, 78)}mm` :
           partFamily === 'device_stand' ? `${safeNum(values.device_width, 75)}mm stand` :
           `${width}×${depth}×${height}mm`}
        </span>
      </div>
      <div className="absolute bottom-2 right-3 z-[5] pointer-events-none">
        <span className="text-[8px] font-mono text-zinc-700/30 tracking-widest">AgentSCAD Preview</span>
      </div>
      <ViewerControls
        state={controlsState}
        onChange={setControlsState}
        onResetCamera={handleResetCamera}
        onScreenshot={handleScreenshotWithCanvas}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
      />
    </div>
  )
}
