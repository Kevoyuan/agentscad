'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Box, Loader2, AlertCircle } from 'lucide-react'
import { Job, parseJSON, safeNum } from './types'
import { ViewerControls, useViewerControls, type ViewerControlsState } from './viewer-controls'

export function ThreeDViewer({ job }: { job: Job }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Viewer controls
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

  // Refs to Three.js objects so we can manipulate them from controls
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

  // Default camera position for reset
  const defaultCameraPos = { x: 60, y: 50, z: 60 }
  const defaultTarget = { x: 0, y: 0, z: 0 }

  // Apply controls state changes to Three.js scene
  useEffect(() => {
    // Auto-rotate
    if (controlsObjRef.current) {
      controlsObjRef.current.autoRotate = controlsState.autoRotate
    }

    // Wireframe
    if (mainGroupRef.current) {
      mainGroupRef.current.traverse((child: any) => {
        if (child.isMesh && child.material) {
          child.material.wireframe = controlsState.wireframe
        }
      })
    }

    // Grid visibility
    if (gridHelperRef.current) {
      gridHelperRef.current.visible = controlsState.showGrid
    }

    // Axes visibility
    if (axisHelperRef.current) {
      axisHelperRef.current.visible = controlsState.showAxes
    }

    // Background
    if (sceneRef.current && threeModuleRef.current) {
      sceneRef.current.background = new threeModuleRef.current.Color(
        controlsState.darkBg ? 0x080810 : 0x050508
      )
    }
  }, [controlsState])

  // Control handlers
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

    // Check dimensions first
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

        // Clear previous content
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

        // Grid
        const gridHelper = new THREE.GridHelper(120, 24, 0x1a1a3e, 0x0d0d1f)
        gridHelper.visible = controlsState.showGrid
        scene.add(gridHelper)
        gridHelperRef.current = gridHelper

        // Axis helper
        const axisHelper = new THREE.AxesHelper(30)
        axisHelper.position.set(-50, 0.1, -50)
        axisHelper.visible = controlsState.showAxes
        scene.add(axisHelper)
        axisHelperRef.current = axisHelper

        // Build geometry based on part family
        const mainGroup = new THREE.Group()

        if (partFamily === 'spur_gear') {
          // Gear body
          const gearRadius = outerDiam / 2
          const gearGeo = new THREE.CylinderGeometry(gearRadius, gearRadius, thickness, Math.max(8, teeth), 1)
          const gearMat = new THREE.MeshPhongMaterial({
            color: 0x6366f1,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide,
            wireframe: controlsState.wireframe,
          })
          const gearMesh = new THREE.Mesh(gearGeo, gearMat)
          gearMesh.rotation.x = Math.PI / 2
          gearMesh.position.y = thickness / 2
          mainGroup.add(gearMesh)

          // Gear teeth
          for (let i = 0; i < teeth; i++) {
            const angle = (i / teeth) * Math.PI * 2
            const toothGeo = new THREE.BoxGeometry(outerDiam * 0.06, thickness, outerDiam * 0.08)
            const toothMesh = new THREE.Mesh(toothGeo, gearMat.clone())
            toothMesh.material.wireframe = controlsState.wireframe
            toothMesh.position.x = Math.cos(angle) * (gearRadius + outerDiam * 0.02)
            toothMesh.position.z = Math.sin(angle) * (gearRadius + outerDiam * 0.02)
            toothMesh.position.y = thickness / 2
            toothMesh.rotation.y = -angle
            mainGroup.add(toothMesh)
          }

          // Bore hole
          const boreGeo = new THREE.CylinderGeometry(boreDiam / 2, boreDiam / 2, thickness + 1, 32)
          const boreMat = new THREE.MeshPhongMaterial({
            color: 0x080810,
            side: THREE.BackSide,
            wireframe: controlsState.wireframe,
          })
          const boreMesh = new THREE.Mesh(boreGeo, boreMat)
          boreMesh.rotation.x = Math.PI / 2
          boreMesh.position.y = thickness / 2
          mainGroup.add(boreMesh)

          // Edges
          const edgesGeo = new THREE.EdgesGeometry(gearGeo)
          const edgesMat = new THREE.LineBasicMaterial({ color: 0x818cf8 })
          const edgesLine = new THREE.LineSegments(edgesGeo, edgesMat)
          edgesLine.rotation.x = Math.PI / 2
          edgesLine.position.y = thickness / 2
          mainGroup.add(edgesLine)

        } else if (partFamily === 'device_stand') {
          const standH = safeNum(values.stand_height, 80)
          const deviceW = safeNum(values.device_width, 75)
          const wallT = safeNum(values.wall_thickness, 3)

          // Base
          const baseGeo = new THREE.BoxGeometry(deviceW + wallT * 2 + 40, wallT, deviceW * 0.6)
          const baseMat = new THREE.MeshPhongMaterial({ color: 0x6366f1, transparent: true, opacity: 0.7, wireframe: controlsState.wireframe })
          const baseMesh = new THREE.Mesh(baseGeo, baseMat)
          baseMesh.position.y = wallT / 2
          mainGroup.add(baseMesh)

          // Back support
          const backGeo = new THREE.BoxGeometry(deviceW + wallT * 2, standH, wallT)
          const backMesh = new THREE.Mesh(backGeo, baseMat.clone())
          backMesh.material.wireframe = controlsState.wireframe
          backMesh.position.y = standH / 2
          backMesh.position.z = -deviceW * 0.2
          mainGroup.add(backMesh)

          // Front lip
          const lipGeo = new THREE.BoxGeometry(deviceW + wallT * 2, safeNum(values.lip_height, 10), wallT)
          const lipMesh = new THREE.Mesh(lipGeo, baseMat.clone())
          lipMesh.material.wireframe = controlsState.wireframe
          lipMesh.position.y = safeNum(values.lip_height, 10) / 2
          lipMesh.position.z = deviceW * 0.2
          mainGroup.add(lipMesh)

          // Edges
          mainGroup.children.forEach(child => {
            if (child instanceof THREE.Mesh) {
              const edges = new THREE.EdgesGeometry(child.geometry)
              const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({ color: 0x818cf8 }))
              line.position.copy(child.position)
              mainGroup.add(line)
            }
          })

        } else if (partFamily === 'phone_case') {
          const bodyL = safeNum(values.body_length, 158)
          const bodyW = safeNum(values.body_width, 78)
          const bodyD = safeNum(values.body_depth, 8)
          const wallT = safeNum(values.wall_thickness, 1.5)

          // Outer shell
          const outerGeo = new THREE.BoxGeometry(bodyL + wallT * 2, bodyD + wallT, bodyW + wallT * 2)
          const outerMat = new THREE.MeshPhongMaterial({ color: 0x6366f1, transparent: true, opacity: 0.5, wireframe: controlsState.wireframe })
          const outerMesh = new THREE.Mesh(outerGeo, outerMat)
          outerMesh.position.y = (bodyD + wallT) / 2
          mainGroup.add(outerMesh)

          // Inner cavity
          const innerGeo = new THREE.BoxGeometry(bodyL, bodyD, bodyW)
          const innerMat = new THREE.MeshPhongMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.15, side: THREE.BackSide, wireframe: controlsState.wireframe })
          const innerMesh = new THREE.Mesh(innerGeo, innerMat)
          innerMesh.position.y = wallT + bodyD / 2
          mainGroup.add(innerMesh)

          // Edges
          const outerEdges = new THREE.EdgesGeometry(outerGeo)
          const outerLine = new THREE.LineSegments(outerEdges, new THREE.LineBasicMaterial({ color: 0x818cf8 }))
          outerLine.position.y = (bodyD + wallT) / 2
          mainGroup.add(outerLine)

        } else {
          // Default: electronics_enclosure / unknown box
          const outerGeo = new THREE.BoxGeometry(width, height, depth)
          const outerMat = new THREE.MeshPhongMaterial({
            color: 0x6366f1,
            transparent: true,
            opacity: 0.3,
            side: THREE.DoubleSide,
            wireframe: controlsState.wireframe,
          })
          const outerMesh = new THREE.Mesh(outerGeo, outerMat)
          outerMesh.position.y = height / 2
          mainGroup.add(outerMesh)

          const outerEdges = new THREE.EdgesGeometry(outerGeo)
          const outerLine = new THREE.LineSegments(outerEdges, new THREE.LineBasicMaterial({ color: 0x818cf8 }))
          outerLine.position.y = height / 2
          mainGroup.add(outerLine)

          const innerW = Math.max(0.1, width - 2 * wall)
          const innerD = Math.max(0.1, depth - 2 * wall)
          const innerH = Math.max(0.1, height - 2 * wall)
          const innerGeo = new THREE.BoxGeometry(innerW, innerH, innerD)
          const innerMat = new THREE.MeshPhongMaterial({
            color: 0x22d3ee,
            transparent: true,
            opacity: 0.08,
            side: THREE.BackSide,
            wireframe: controlsState.wireframe,
          })
          const innerMesh = new THREE.Mesh(innerGeo, innerMat)
          innerMesh.position.y = height / 2
          mainGroup.add(innerMesh)

          const innerEdges = new THREE.EdgesGeometry(innerGeo)
          const innerLine = new THREE.LineSegments(innerEdges, new THREE.LineBasicMaterial({ color: 0x22d3ee, transparent: true, opacity: 0.5 }))
          innerLine.position.y = height / 2
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
    }).catch((err) => {
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
      // Clear refs
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
    <div className="relative w-full h-full viewer-vignette viewer-scanlines">
      {/* Corner brackets */}
      <div className="viewer-corner-bracket tl" style={{ top: 8, left: 8 }} />
      <div className="viewer-corner-bracket tr" style={{ top: 8, right: 8 }} />
      <div className="viewer-corner-bracket bl" style={{ bottom: 8, left: 8 }} />
      <div className="viewer-corner-bracket br" style={{ bottom: 8, right: 8 }} />
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 z-10 backdrop-blur-sm">
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
            <span className="text-[10px] text-zinc-500">Loading 3D preview...</span>
          </div>
        </div>
      )}
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-2 flex items-center gap-2 z-[5]">
        <span className="text-[9px] font-mono text-zinc-600 bg-black/40 px-1.5 py-0.5 rounded">
          {partFamily === 'spur_gear' ? `${teeth}T ⌀${outerDiam}mm` :
           partFamily === 'phone_case' ? `${safeNum(values.body_length, 158)}×${safeNum(values.body_width, 78)}mm` :
           partFamily === 'device_stand' ? `${safeNum(values.device_width, 75)}mm stand` :
           `${width}×${depth}×${height}mm`}
        </span>
      </div>
      {/* Watermark */}
      <div className="absolute bottom-2 right-3 z-[5] pointer-events-none">
        <span className="text-[8px] font-mono text-zinc-700/30 tracking-widest">AgentSCAD Preview</span>
      </div>
      {/* Viewer Controls */}
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
