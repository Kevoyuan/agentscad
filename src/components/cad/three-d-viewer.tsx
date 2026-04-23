'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { Box, Loader2, AlertCircle } from 'lucide-react'
import { Job, parseJSON, safeNum } from './types'
import { ViewerControls, useViewerControls } from './viewer-controls'

// ─── Rounded Rectangle Shape ──────────────────────────────────────────────────

function createRoundedRectShape(THREE: any, w: number, h: number, r: number) {
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

// ─── Auto-fit camera to geometry bounds ──────────────────────────────────────

function fitCameraToObject(THREE: any, camera: any, controls: any, object: any, padding = 1.4) {
  const box = new THREE.Box3().setFromObject(object)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z)
  const fov = camera.fov * (Math.PI / 180)
  const dist = (maxDim / 2 / Math.tan(fov / 2)) * padding

  camera.position.set(center.x + dist * 0.7, center.y + dist * 0.5, center.z + dist * 0.7)
  controls.target.copy(center)
  controls.update()
}

// ─── Fallback procedural enclosure ──────────────────────────────────────────

function buildProceduralEnclosure(THREE: any, mainGroup: any, values: Record<string, number>, controlsState: any) {
  const width = safeNum(values.width, 40)
  const depth = safeNum(values.depth, 30)
  const height = safeNum(values.height, 15)
  const wall = safeNum(values.wall_thickness, 2)
  const cornerR = Math.min(width, depth, height) * 0.12

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

  const innerW = Math.max(0.1, width - 2 * wall)
  const innerD = Math.max(0.1, depth - 2 * wall)
  const innerH = Math.max(0.1, height - 2 * wall)
  const innerR = Math.max(0.1, cornerR - wall)
  const innerShape = createRoundedRectShape(THREE, innerW, innerD, innerR)
  const innerGeo = new THREE.ExtrudeGeometry(innerShape, { depth: innerH, bevelEnabled: false })
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

  const outerEdges = new THREE.EdgesGeometry(outerGeo, 15)
  const outerLine = new THREE.LineSegments(outerEdges, new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.5 }))
  outerLine.rotation.x = -Math.PI / 2
  outerLine.position.y = height
  mainGroup.add(outerLine)
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ThreeDViewer({ job }: { job: Job }) {
  const mountRef = useRef<HTMLDivElement>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const {
    state: controlsState,
    setState: setControlsState,
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
  const partFamily = job.partFamily || 'unknown'

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
    if (cameraRef.current && controlsObjRef.current && mainGroupRef.current && threeModuleRef.current) {
      fitCameraToObject(threeModuleRef.current, cameraRef.current, controlsObjRef.current, mainGroupRef.current)
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

    Promise.all([
      import('three'),
      import('three/examples/jsm/controls/OrbitControls.js'),
    ]).then(async ([THREE, { OrbitControls }]) => {
      threeModuleRef.current = THREE

      if (cancelled || !mountRef.current) return

      try {
        const scene = new THREE.Scene()
        scene.background = new THREE.Color(controlsState.darkBg ? 0x080810 : 0x050508)
        scene.fog = new THREE.Fog(0x080810, 100, 200)
        sceneRef.current = scene

        const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 1000)
        camera.position.set(60, 50, 60)
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

        // ─── Load real STL if available, otherwise fall back to procedural mesh ───
        if (job.stlPath) {
          try {
            const { STLLoader } = await import('three/examples/jsm/loaders/STLLoader.js')
            const loader = new STLLoader()

            const geometry = await new Promise<any>((resolve, reject) => {
              loader.load(
                job.stlPath!,
                (geo: any) => resolve(geo),
                undefined,
                (err: any) => reject(err),
              )
            })

            if (cancelled) return

            // Center and normalize the geometry
            geometry.computeBoundingBox()
            const bbox = geometry.boundingBox
            const center = new THREE.Vector3()
            bbox.getCenter(center)
            geometry.translate(-center.x, -center.y, -center.z)

            const material = new THREE.MeshPhongMaterial({
              color: 0x6366f1,
              transparent: true,
              opacity: 0.85,
              side: THREE.DoubleSide,
              wireframe: controlsState.wireframe,
              shininess: 80,
            })

            const mesh = new THREE.Mesh(geometry, material)
            mesh.castShadow = true
            mesh.receiveShadow = true
            mainGroup.add(mesh)

            // Wireframe overlay
            const edges = new THREE.EdgesGeometry(geometry, 30)
            const edgeMat = new THREE.LineBasicMaterial({ color: 0x818cf8, transparent: true, opacity: 0.4 })
            const edgeLines = new THREE.LineSegments(edges, edgeMat)
            mainGroup.add(edgeLines)

          } catch (stlErr) {
            console.warn('STL load failed, using procedural fallback:', stlErr)
            buildProceduralEnclosure(THREE, mainGroup, values, controlsState)
          }
        } else {
          buildProceduralEnclosure(THREE, mainGroup, values, controlsState)
        }

        scene.add(mainGroup)
        mainGroupRef.current = mainGroup

        // Auto-fit camera to the loaded geometry
        fitCameraToObject(THREE, camera, controls, mainGroup)

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [job.state, job.stlPath, job.parameterValues, partFamily])

  if (job.state === 'NEW' || job.state === 'SCAD_GENERATED') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--app-text-dim)] gap-3">
        <div className="w-16 h-16 rounded-2xl bg-[var(--app-empty-bg)] flex items-center justify-center">
          <Box className="w-8 h-8 opacity-20" />
        </div>
        <span className="text-xs">Process job to generate 3D preview</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--app-text-dim)] gap-3 p-4">
        <AlertCircle className="w-8 h-8 text-rose-500/50" />
        <span className="text-xs text-rose-400">3D preview unavailable</span>
        <span className="text-[10px] text-[var(--app-text-dim)]">{error}</span>
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
              <Loader2 className="w-6 h-6 animate-spin text-[var(--app-accent-text)]" />
              <span className="text-[10px] text-[var(--app-text-muted)]">Loading 3D preview...</span>
            </div>
          </div>
        </div>
      )}
      <div ref={mountRef} className="w-full h-full" />
      <div className="absolute bottom-2 left-2 flex items-center gap-2 z-[5]">
        <span className="text-[9px] font-mono text-[var(--app-text-dim)] bg-black/40 px-1.5 py-0.5 rounded">
          {partFamily}
          {job.stlPath ? ' (STL)' : ' (preview)'}
        </span>
      </div>
      <div className="absolute bottom-2 right-3 z-[5] pointer-events-none">
        <span className="text-[8px] font-mono text-[var(--app-text-dim)] tracking-widest">AgentSCAD Preview</span>
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
