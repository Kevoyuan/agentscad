'use client'

import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Link2, Unlink, ChevronDown, ChevronRight, FileCode, GitBranch, Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Job, getStateInfo } from './types'
import { linkJob, unlinkJob, fetchJobs } from './api'
import { StateBadge } from './state-badge'
import { PartFamilyIcon } from './part-family-icon'

interface RelatedJob {
  id: string
  inputRequest: string
  state: string
  partFamily: string | null
}

interface JobDependenciesProps {
  job: Job
  allJobs: Job[]
  onUpdate: () => void
  onNavigateToJob?: (jobId: string) => void
}

export function JobDependencies({ job, allJobs, onUpdate, onNavigateToJob }: JobDependenciesProps) {
  const [isLinking, setIsLinking] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // Get parent and children from allJobs (the API includes parent/children relations)
  const parentJob = useMemo(() => {
    if (!job.parentId) return null
    return allJobs.find(j => j.id === job.parentId) || null
  }, [job.parentId, allJobs])

  const childJobs = useMemo(() => {
    return allJobs.filter(j => j.parentId === job.id)
  }, [job.id, allJobs])

  // Filter available parent candidates (exclude self and descendants)
  const availableParents = useMemo(() => {
    const descendantIds = new Set<string>()
    const findDescendants = (parentId: string) => {
      const children = allJobs.filter(j => j.parentId === parentId)
      for (const child of children) {
        descendantIds.add(child.id)
        findDescendants(child.id)
      }
    }
    findDescendants(job.id)

    return allJobs
      .filter(j => j.id !== job.id && !descendantIds.has(j.id) && j.id !== job.parentId)
      .filter(j =>
        !searchQuery ||
        j.inputRequest.toLowerCase().includes(searchQuery.toLowerCase()) ||
        j.id.toLowerCase().includes(searchQuery.toLowerCase())
      )
      .slice(0, 20)
  }, [allJobs, job.id, job.parentId, searchQuery])

  const dependencyCount = (job.parentId ? 1 : 0) + childJobs.length

  const handleLink = async (parentId: string) => {
    setIsSaving(true)
    try {
      await linkJob(job.id, parentId)
      setIsLinking(false)
      setSearchQuery('')
      onUpdate()
    } catch (err) {
      console.error('Failed to link job:', err)
    } finally {
      setIsSaving(false)
    }
  }

  const handleUnlink = async () => {
    setIsSaving(true)
    try {
      await unlinkJob(job.id)
      onUpdate()
    } catch (err) {
      console.error('Failed to unlink job:', err)
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-zinc-800/60 shrink-0">
        <h3 className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase flex items-center gap-2">
          <GitBranch className="w-3 h-3" />
          Dependencies
        </h3>
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="text-[9px] h-4 bg-zinc-800/50 text-zinc-500 border-zinc-700/50">
            {dependencyCount} link{dependencyCount !== 1 ? 's' : ''}
          </Badge>
          {!isLinking ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[9px] gap-1 text-violet-400 hover:text-violet-300"
              onClick={() => setIsLinking(true)}
              disabled={isSaving}
            >
              <Link2 className="w-3 h-3" />Link
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[9px] gap-1 text-zinc-500 hover:text-zinc-300"
              onClick={() => { setIsLinking(false); setSearchQuery('') }}
            >
              Cancel
            </Button>
          )}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Link to parent dialog */}
          <AnimatePresence>
            {isLinking && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="overflow-hidden"
              >
                <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <Search className="w-3 h-3 text-violet-400" />
                    <Input
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      placeholder="Search for parent job..."
                      className="h-6 text-[11px] bg-[#09090b] border-zinc-800/60 placeholder:text-zinc-700"
                      autoFocus
                    />
                  </div>
                  {availableParents.length > 0 ? (
                    <div className="max-h-40 overflow-y-auto space-y-1">
                      {availableParents.map(candidate => (
                        <motion.button
                          key={candidate.id}
                          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left hover:bg-white/[0.04] linear-transition group"
                          onClick={() => handleLink(candidate.id)}
                          disabled={isSaving}
                          whileHover={{ x: 2 }}
                          transition={{ duration: 0.15 }}
                        >
                          <PartFamilyIcon family={candidate.partFamily || 'unknown'} size="xs" />
                          <div className="flex-1 min-w-0">
                            <p className="text-[10px] text-zinc-300 truncate group-hover:text-violet-300 transition-colors">
                              {candidate.inputRequest.slice(0, 50)}
                            </p>
                            <span className="text-[8px] font-mono text-zinc-600">{candidate.id.slice(0, 8)}</span>
                          </div>
                          <StateBadge state={candidate.state} size="xs" />
                        </motion.button>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[10px] text-zinc-600 text-center py-2">No jobs found</p>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Tree visualization */}
          <div className="space-y-2">
            {/* Parent job */}
            {parentJob ? (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-1"
              >
                <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider flex items-center gap-1">
                  <ChevronDown className="w-3 h-3" />Parent
                </div>
                <div className="relative ml-2">
                  {/* Connecting line */}
                  <div className="absolute left-0 top-0 bottom-0 w-px bg-violet-500/30" />
                  <div className="absolute left-0 top-1/2 w-3 h-px bg-violet-500/30" />
                  <motion.div
                    className="ml-4 flex items-center gap-2 px-2 py-1.5 rounded-md border border-violet-500/20 bg-violet-500/5 hover:bg-violet-500/10 linear-transition cursor-pointer group"
                    onClick={() => onNavigateToJob?.(parentJob.id)}
                    whileHover={{ x: 2 }}
                    transition={{ duration: 0.15 }}
                  >
                    <PartFamilyIcon family={parentJob.partFamily || 'unknown'} size="xs" />
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] text-zinc-300 truncate group-hover:text-violet-300 transition-colors">
                        {parentJob.inputRequest.slice(0, 50)}
                      </p>
                      <span className="text-[8px] font-mono text-zinc-600">{parentJob.id.slice(0, 8)}</span>
                    </div>
                    <StateBadge state={parentJob.state} size="xs" />
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-4 w-4 p-0 text-zinc-600 hover:text-rose-400 shrink-0"
                      onClick={(e) => { e.stopPropagation(); handleUnlink() }}
                      disabled={isSaving}
                    >
                      <Unlink className="w-3 h-3" />
                    </Button>
                  </motion.div>
                </div>
              </motion.div>
            ) : !isLinking && (
              <div className="text-center py-3">
                <p className="text-[10px] text-zinc-700">No parent linked</p>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[9px] gap-1 text-violet-400 hover:text-violet-300 mt-1"
                  onClick={() => setIsLinking(true)}
                >
                  <Link2 className="w-3 h-3" />Link to parent
                </Button>
              </div>
            )}

            {/* Current job (center) */}
            <div className="relative">
              <div className="flex items-center gap-2 px-2 py-2 rounded-md border border-zinc-700/30 bg-zinc-800/20">
                <div className="w-5 h-5 rounded-md bg-violet-500/80 flex items-center justify-center shrink-0">
                  <FileCode className="w-3 h-3 text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] text-zinc-200 truncate font-medium">
                    {job.inputRequest.slice(0, 50)}
                  </p>
                  <span className="text-[8px] font-mono text-zinc-500">{job.id.slice(0, 8)}</span>
                </div>
                <StateBadge state={job.state} size="xs" />
              </div>
              {/* Vertical line from current to children */}
              {childJobs.length > 0 && (
                <div className="absolute left-[14px] top-full w-px bg-violet-500/30" style={{ height: '8px' }} />
              )}
            </div>

            {/* Child jobs */}
            {childJobs.length > 0 && (
              <div className="space-y-1">
                <div className="text-[9px] font-mono text-zinc-600 uppercase tracking-wider flex items-center gap-1">
                  <ChevronRight className="w-3 h-3" />Children ({childJobs.length})
                </div>
                {childJobs.map((child, idx) => (
                  <motion.div
                    key={child.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: idx * 0.05 }}
                    className="relative ml-2"
                  >
                    {/* Connecting line */}
                    <div className="absolute left-0 top-1/2 w-3 h-px bg-violet-500/30" />
                    <div className="absolute left-0 top-0 bottom-0 w-px bg-violet-500/30" style={{ height: idx === 0 ? '50%' : '100%', top: idx === 0 ? '50%' : '0' }} />
                    <motion.div
                      className="ml-4 flex items-center gap-2 px-2 py-1.5 rounded-md border border-cyan-500/15 bg-cyan-500/5 hover:bg-cyan-500/10 linear-transition cursor-pointer group"
                      onClick={() => onNavigateToJob?.(child.id)}
                      whileHover={{ x: 2 }}
                      transition={{ duration: 0.15 }}
                    >
                      <PartFamilyIcon family={child.partFamily || 'unknown'} size="xs" />
                      <div className="flex-1 min-w-0">
                        <p className="text-[10px] text-zinc-300 truncate group-hover:text-cyan-300 transition-colors">
                          {child.inputRequest.slice(0, 50)}
                        </p>
                        <span className="text-[8px] font-mono text-zinc-600">{child.id.slice(0, 8)}</span>
                      </div>
                      <StateBadge state={child.state} size="xs" />
                    </motion.div>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Empty state for children */}
            {childJobs.length === 0 && !isLinking && job.parentId && (
              <div className="text-center py-2">
                <p className="text-[10px] text-zinc-700">No child jobs</p>
              </div>
            )}
          </div>

          {/* Info box */}
          {!job.parentId && childJobs.length === 0 && !isLinking && (
            <div className="rounded-lg border border-zinc-800/40 bg-zinc-800/10 p-3 text-center">
              <GitBranch className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
              <p className="text-[11px] text-zinc-500 mb-1">No dependencies</p>
              <p className="text-[9px] text-zinc-700 mb-2">Link this job to a parent to build relationships between jobs</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 text-[9px] gap-1 text-violet-400 hover:text-violet-300"
                onClick={() => setIsLinking(true)}
              >
                <Link2 className="w-3 h-3" />Link to Parent
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
