const API_BASE = window.CAD_AGENT_API_BASE || `${window.location.protocol === 'file:' ? 'http:' : window.location.protocol}//${window.location.hostname || '127.0.0.1'}:8000`;
const TERMINAL_STATES = new Set(['DELIVERED', 'ARCHIVED', 'CANCELLED', 'HUMAN_REVIEW']);
const BLOCKED_STATES = new Set(['SPEC_FAILED', 'RENDER_FAILED', 'VALIDATION_FAILED', 'DEBUGGING', 'REPAIRING', 'HUMAN_REVIEW', 'CANCELLED']);

const state = {
    jobs: [],
    selectedJobId: null,
    selectedJob: null,
    health: null,
    validations: [],
    similarCases: [],
    filterState: 'ALL',
    pollingHandle: null,
    viewerCleanup: null,
    viewerInstance: null,
    isLoadingJobs: false,
    isLoadingDetail: false,
    isSubmitting: false,
    parameterOverrides: {},
    parameterUpdateTimer: null,
    parameterUpdateSeq: 0,
    isUpdatingParameters: false,
    justRebuilt: false,
    lastStableStlUrl: null,
    lastStableViewerJobId: null,
    eventSource: null,
};

const elements = {
    healthCard: document.getElementById('healthCard'),
    runtimeMetrics: document.getElementById('runtimeMetrics'),
    refreshStatus: document.getElementById('refreshStatus'),
    jobCountBadge: document.getElementById('jobCountBadge'),
    deliveredCount: document.getElementById('deliveredCount'),
    generationCount: document.getElementById('generationCount'),
    jobsList: document.getElementById('jobsList'),
    threadTitle: document.getElementById('threadTitle'),
    conversationStream: document.getElementById('conversationStream'),
    jobForm: document.getElementById('jobForm'),
    requestInput: document.getElementById('requestInput'),
    referenceImages: document.getElementById('referenceImages'),
    customerId: document.getElementById('customerId'),
    priorityInput: document.getElementById('priorityInput'),
    priorityValue: document.getElementById('priorityValue'),
    submitButton: document.getElementById('submitButton'),
    similarButton: document.getElementById('similarButton'),
    refreshButton: document.getElementById('refreshButton'),
    newCreationButton: document.getElementById('newCreationButton'),
    viewerTitle: document.getElementById('viewerTitle'),
    viewerStateBadge: document.getElementById('viewerStateBadge'),
    viewerPathBadge: document.getElementById('viewerPathBadge'),
    artifactSummary: document.getElementById('artifactSummary'),
    validationSummary: null, // Moved to Inspector or removed
    updatedSummary: document.getElementById('updatedSummary'),
    stlViewer: document.getElementById('stlViewer'),
    viewerPlaceholder: document.getElementById('viewerPlaceholder'),
    artifactActions: document.getElementById('artifactActions'),
    parametersPanel: document.getElementById('parametersPanel'),
    performancePanel: document.getElementById('performancePanel'),
    validationPanel: document.getElementById('validationPanel'),
    timelinePanel: document.getElementById('timelinePanel'),
    resetParametersButton: document.getElementById('resetParametersButton'),
    copyTraceButton: document.getElementById('copyTraceButton'),
    canvasArtifactActions: document.getElementById('canvasArtifactActions'),
};

function setupResizers() {
    const railResizer = document.getElementById('resizer-rail');
    const leftResizer = document.getElementById('resizer-left');
    const rightResizer = document.getElementById('resizer-right');

    let isDraggingRail = false;
    let isDraggingLeft = false;
    let isDraggingRight = false;
    let startX = 0;
    let startWidth = 0;

    const minRailWidth = 280;
    const maxRailWidth = 440;
    const minLeftWidth = 480;
    const maxLeftWidth = 800;
    const minRightWidth = 360;
    const maxRightWidth = 600;

    function getRootVar(name, fallback) {
        return parseInt(getComputedStyle(document.documentElement).getPropertyValue(name)) || fallback;
    }

    if (railResizer) {
        railResizer.addEventListener('pointerdown', (e) => {
            isDraggingRail = true;
            startX = e.clientX;
            startWidth = getRootVar('--rail-width', 264);
            railResizer.classList.add('is-dragging');
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });
        railResizer.addEventListener('dblclick', () => {
            document.documentElement.style.removeProperty('--rail-width');
        });
    }

    if (leftResizer) {
        leftResizer.addEventListener('pointerdown', (e) => {
            isDraggingLeft = true;
            startX = e.clientX;
            startWidth = getRootVar('--col-left', 480);
            leftResizer.classList.add('is-dragging');
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });
        leftResizer.addEventListener('dblclick', () => {
            document.documentElement.style.removeProperty('--col-left');
        });
    }

    if (rightResizer) {
        rightResizer.addEventListener('pointerdown', (e) => {
            isDraggingRight = true;
            startX = e.clientX;
            startWidth = getRootVar('--col-right', 384);
            rightResizer.classList.add('is-dragging');
            document.body.style.cursor = 'col-resize';
            e.preventDefault();
        });
        rightResizer.addEventListener('dblclick', () => {
            document.documentElement.style.removeProperty('--col-right');
        });
    }

    window.addEventListener('pointermove', (e) => {
        if (!isDraggingRail && !isDraggingLeft && !isDraggingRight) return;

        if (isDraggingRail) {
            let newWidth = startWidth + (e.clientX - startX);
            newWidth = Math.max(minRailWidth, Math.min(newWidth, maxRailWidth));
            document.documentElement.style.setProperty('--rail-width', `${newWidth}px`);
        }

        if (isDraggingLeft) {
            let newWidth = startWidth + (e.clientX - startX);
            newWidth = Math.max(minLeftWidth, Math.min(newWidth, maxLeftWidth));
            document.documentElement.style.setProperty('--col-left', `${newWidth}px`);
        }

        if (isDraggingRight) {
            let newWidth = startWidth - (e.clientX - startX);
            newWidth = Math.max(minRightWidth, Math.min(newWidth, maxRightWidth));
            document.documentElement.style.setProperty('--col-right', `${newWidth}px`);
        }
    });

    window.addEventListener('pointerup', () => {
        if (isDraggingRail || isDraggingLeft || isDraggingRight) {
            isDraggingRail = false;
            isDraggingLeft = false;
            isDraggingRight = false;
            if (railResizer) railResizer.classList.remove('is-dragging');
            if (leftResizer) leftResizer.classList.remove('is-dragging');
            if (rightResizer) rightResizer.classList.remove('is-dragging');
            document.body.style.cursor = '';
        }
    });
}

function init() {
    setupResizers();
    bindEvents();
    renderPriority();
    renderShell();
    boot();
}

function bindEvents() {
    elements.jobForm.addEventListener('submit', handleCreateJob);
    elements.priorityInput.addEventListener('input', renderPriority);
    elements.refreshButton.addEventListener('click', refreshAll);
    elements.newCreationButton.addEventListener('click', focusComposer);
    elements.similarButton.addEventListener('click', handleSimilarLookup);
    elements.resetParametersButton.addEventListener('click', handleResetParameters);
    if (elements.copyTraceButton) {
        elements.copyTraceButton.addEventListener('click', handleCopyTrace);
    }

    document.querySelectorAll('[data-filter-state]').forEach((button) => {
        button.addEventListener('click', () => {
            state.filterState = button.dataset.filterState;
            document.querySelectorAll('[data-filter-state]').forEach((pill) => pill.classList.remove('is-active'));
            button.classList.add('is-active');
            renderJobsList();
        });
    });
}

async function boot() {
    await Promise.allSettled([fetchHealth(), fetchJobs()]);
    startPolling();
}

async function refreshAll() {
    elements.refreshStatus.textContent = 'manual';
    await Promise.allSettled([
        fetchHealth(),
        fetchJobs(),
        state.selectedJobId ? fetchJobDetail(state.selectedJobId) : Promise.resolve(),
    ]);
    elements.refreshStatus.textContent = 'syncing';
}

async function fetchHealth() {
    try {
        const response = await fetch(`${API_BASE}/health`);
        if (!response.ok) {
            throw new Error('Health probe failed');
        }
        state.health = await response.json();
    } catch (error) {
        state.health = { status: 'offline', error: error.message };
    }
    renderHealth();
}

async function fetchJobs() {
    state.isLoadingJobs = true;
    renderJobsList();
    try {
        const response = await fetch(`${API_BASE}/jobs?limit=50&_t=${Date.now()}`, { cache: 'no-store' });
        if (!response.ok) {
            throw new Error('Failed to load jobs');
        }
        state.jobs = sortJobsByRecency(await response.json());

        if (!state.selectedJobId && state.jobs.length) {
            state.selectedJobId = state.jobs[0].job_id;
        }

        if (state.selectedJobId && !state.jobs.some((job) => job.job_id === state.selectedJobId)) {
            state.selectedJobId = state.jobs[0]?.job_id || null;
        }

        renderStats();
        renderJobsList();

        if (state.selectedJobId) {
            await fetchJobDetail(state.selectedJobId);
        } else {
            state.selectedJob = null;
            state.validations = [];
            state.parameterOverrides = {};
            renderWorkspace();
        }
    } catch (error) {
        state.jobs = [];
        state.selectedJob = null;
        state.validations = [];
        renderJobsList(error.message);
        renderWorkspace();
    } finally {
        state.isLoadingJobs = false;
        renderJobsList();
    }
}

function sortJobsByRecency(jobs) {
    return [...jobs].sort((left, right) => {
        const leftTime = Date.parse(left.updated_at || left.created_at || 0);
        const rightTime = Date.parse(right.updated_at || right.created_at || 0);
        return rightTime - leftTime;
    });
}

async function fetchJobDetail(jobId) {
    cancelPendingParameterUpdate();
    state.isLoadingDetail = true;
    renderWorkspace();

    try {
        const [detailResponse, validationResponse] = await Promise.all([
            fetch(`${API_BASE}/jobs/${jobId}?_t=${Date.now()}`, { cache: 'no-store' }),
            fetch(`${API_BASE}/jobs/${jobId}/validations?_t=${Date.now()}`, { cache: 'no-store' }),
        ]);

        if (!detailResponse.ok) {
            throw new Error('Failed to load creation detail');
        }

        state.selectedJob = await detailResponse.json();
        state.selectedJobId = jobId;
        state.parameterOverrides = {};

        if (validationResponse.ok) {
            state.validations = await validationResponse.json();
        } else {
            state.validations = normalizeValidations(state.selectedJob.validation_results);
        }

        state.isLoadingDetail = false;
        renderWorkspace();

        // Establish streaming connection for real-time updates
        setupJobEventStream(jobId);
    } catch (error) {
        state.selectedJob = null;
        state.validations = [];
        destroyViewer();
        elements.viewerPlaceholder.classList.remove('hidden');
        elements.viewerPlaceholder.innerHTML = `<p>${escapeHtml(error.message || 'Failed to load creation.')}</p>`;
    } finally {
        state.isLoadingDetail = false;
        renderWorkspace();
    }
}

/**
 * Establishment of SSE connection for real-time job updates
 */
function setupJobEventStream(jobId) {
    if (state.eventSource) {
        state.eventSource.close();
        state.eventSource = null;
    }

    const streamUrl = `${API_BASE}/jobs/${jobId}/events`;
    console.log(`[Stream] Connecting to ${streamUrl}`);
    
    const es = new EventSource(streamUrl);
    state.eventSource = es;

    es.onmessage = (event) => {
        try {
            const updatedJob = JSON.parse(event.data);
            console.log(`[Stream] Update for ${jobId}: ${updatedJob.state}`);

            // Only update if we are still looking at the same job
            if (state.selectedJobId !== updatedJob.id) {
                es.close();
                return;
            }

            const prevState = state.selectedJob?.state;
            state.selectedJob = updatedJob;

            // Update validations if they exist in the job
            if (updatedJob.validation_results && updatedJob.validation_results.length > 0) {
                state.validations = normalizeValidations(updatedJob.validation_results);
            }

            // Trigger targeted UI updates
            renderWorkspace();

            // If job reached terminal state, we can close the stream after a small delay
            if (TERMINAL_STATES.has(updatedJob.state)) {
                console.log(`[Stream] Terminal state reached: ${updatedJob.state}. Closing.`);
                setTimeout(() => {
                    if (state.selectedJobId === updatedJob.id) {
                        es.close();
                        if (state.eventSource === es) state.eventSource = null;
                    }
                }, 2000);
            }
        } catch (err) {
            console.error('[Stream] Parse error:', err);
        }
    };

    es.onerror = (err) => {
        console.error('[Stream] Connection error:', err);
        es.close();
        if (state.eventSource === es) state.eventSource = null;
    };
}

async function handleCreateJob(event) {
    event.preventDefault();

    const inputRequest = elements.requestInput.value.trim();
    const customerId = elements.customerId.value.trim();
    const priority = Number(elements.priorityInput.value);
    const referenceImages = Array.from(elements.referenceImages.files || []);

    if (inputRequest.length < 10) {
        return;
    }

    state.isSubmitting = true;
    updateSubmitState();

    try {
        let createResponse;
        if (referenceImages.length > 0) {
            const formData = new FormData();
            formData.append('input_request', inputRequest);
            formData.append('customer_id', customerId || '');
            formData.append('priority', String(priority));
            referenceImages.forEach((file) => formData.append('reference_images', file));
            createResponse = await fetch(`${API_BASE}/jobs`, {
                method: 'POST',
                body: formData,
            });
        } else {
            createResponse = await fetch(`${API_BASE}/jobs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    input_request: inputRequest,
                    customer_id: customerId || null,
                    priority,
                }),
            });
        }

        if (!createResponse.ok) {
            throw new Error('Job creation failed');
        }

        const created = await createResponse.json();

        const processResponse = await fetch(`${API_BASE}/jobs/${created.job_id}/process`, {
            method: 'POST',
        });

        if (!processResponse.ok) {
            throw new Error('Job dispatch failed');
        }

        elements.jobForm.reset();
        elements.priorityInput.value = '5';
        renderPriority();

        state.selectedJobId = created.job_id;
        state.similarCases = [];

        await fetchJobs();
    } catch (error) {
        elements.conversationStream.innerHTML = `
            <div class="empty-thread">
                <h3>Could not start the creation.</h3>
                <p>${escapeHtml(error.message || 'Unknown error')}</p>
            </div>
        `;
    } finally {
        state.isSubmitting = false;
        updateSubmitState();
    }
}

async function handleSimilarLookup() {
    const request = (state.selectedJob?.input_request || elements.requestInput.value || '').trim();
    if (request.length < 10) {
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/case-memory/similar?request=${encodeURIComponent(request)}&limit=3`);
        if (!response.ok) {
            throw new Error('Case memory unavailable');
        }
        const payload = await response.json();
        state.similarCases = Array.isArray(payload.cases) ? payload.cases : [];
    } catch (error) {
        state.similarCases = [];
    }

    renderConversation();
}

function handleResetParameters() {
    const job = state.selectedJob;
    if (!job) {
        return;
    }

    const editableParameters = Array.isArray(job?.parameter_schema?.parameters)
        ? job.parameter_schema.parameters.filter((parameter) => parameter && parameter.editable !== false)
        : [];

    if (!editableParameters.length) {
        state.parameterOverrides = {};
        renderParameters();
        return;
    }

    state.parameterOverrides = Object.fromEntries(
        editableParameters.map((parameter) => [parameter.key, parameter.value])
    );
    renderParameters();
    scheduleParameterRebuild();
}

async function handleCopyTrace() {
    const logs = state.selectedJob?.logs || [];
    if (!logs.length) {
        return;
    }
    
    const traceText = logs.slice().reverse().map((log, index) => {
        const title = `${log.agent || `agent-${index + 1}`} · ${log.action || 'event'}`;
        const time = formatCompactDate(log.timestamp || log.created_at || '');
        let bodyText = '';
        if (log.raw_message) {
            bodyText = log.raw_message;
        } else if (log.output_data) {
            bodyText = JSON.stringify(log.output_data, null, 2);
        } else if (log.input_data) {
            bodyText = JSON.stringify(log.input_data, null, 2);
        }
        return `[${time}] ${title}\n${bodyText}`;
    }).join('\n\n---\n\n');

    try {
        await navigator.clipboard.writeText(traceText);
        const originalText = elements.copyTraceButton.textContent;
        elements.copyTraceButton.textContent = 'Copied';
        setTimeout(() => {
            elements.copyTraceButton.textContent = originalText;
        }, 1500);
    } catch (err) {
        console.error('Failed to copy text: ', err);
    }
}

function focusComposer() {
    cancelPendingParameterUpdate();
    state.selectedJobId = null;
    state.selectedJob = null;
    state.validations = [];
    state.parameterOverrides = {};
    elements.requestInput.focus();
    renderWorkspace();
}

function renderShell() {
    renderHealth();
    renderStats();
    renderJobsList();
    renderWorkspace();
}

function renderPriority() {
    elements.priorityValue.textContent = elements.priorityInput.value;
}

function updateSubmitState() {
    elements.submitButton.disabled = state.isSubmitting;
    elements.submitButton.textContent = state.isSubmitting ? 'Generating...' : 'Generate creation';
    if (state.isSubmitting) {
        elements.submitButton.classList.add('is-loading');
    } else {
        elements.submitButton.classList.remove('is-loading');
    }
}

function renderHealth() {
    if (!state.health) {
        elements.healthCard.innerHTML = `
            <div class="status-lamp"></div>
            <div><strong>Connecting</strong><p>Checking API and OpenSCAD runtime.</p></div>
        `;
        return;
    }

    const online = state.health.status && state.health.status !== 'offline';
    const lampColor = online ? 'var(--success)' : 'var(--danger)';
    const glowColor = online ? 'rgba(147, 216, 107, 0.1)' : 'rgba(255, 141, 130, 0.1)';
    const settings = state.health.settings || {};

    elements.healthCard.innerHTML = `
        <div class="status-lamp" style="background:${lampColor};box-shadow:0 0 0 6px ${glowColor};"></div>
        <div>
            <strong>${escapeHtml(online ? `${state.health.status} · v${state.health.version}` : 'Offline')}</strong>
            <p>${escapeHtml(online ? shortPath(settings.openSCAD_path || 'unknown runtime') : state.health.error || 'API unreachable')}</p>
        </div>
    `;
    renderRuntimeMetrics();
}

function renderStats() {
    elements.jobCountBadge.textContent = String(filteredJobs().length);
    elements.generationCount.textContent = String(state.jobs.filter((job) => Boolean(job.generation_path)).length);
    elements.deliveredCount.textContent = String(state.jobs.filter((job) => job.state === 'DELIVERED').length);
    renderRuntimeMetrics();
}

function renderRuntimeMetrics() {
    if (!elements.runtimeMetrics) {
        return;
    }
    const metrics = summarizeRuntimeMetrics(state.jobs);
    const cards = [
        { label: 'Patch Hit Rate', value: `${metrics.patchHitRate}%`, tone: 'is-fast-patch' },
        { label: 'Avg Patch', value: metrics.avgPatch, tone: 'is-fast-patch' },
        { label: 'Avg Rebuild', value: metrics.avgRebuild, tone: 'is-full-rebuild' },
        { label: 'Implicit Active', value: String(metrics.activeImplicit), tone: '' },
    ];
    elements.runtimeMetrics.innerHTML = cards.map((card) => `
        <div class="mini-stat runtime-stat ${escapeHtml(card.tone)}">
            <span>${escapeHtml(card.label)}</span>
            <strong>${escapeHtml(card.value)}</strong>
        </div>
    `).join('');
}

function summarizeRuntimeMetrics(jobs) {
    let totalUpdates = 0;
    let patchHits = 0;
    let rebuildHits = 0;
    let patchDurationSum = 0;
    let rebuildDurationSum = 0;

    for (const job of jobs) {
        const stats = job?.parameter_update_stats;
        if (!stats) {
            continue;
        }
        const jobPatchHits = Number(stats.patch_hits || 0);
        const jobRebuildHits = Number(stats.rebuild_hits || 0);
        const jobTotalUpdates = Number(stats.total_updates || 0);
        totalUpdates += jobTotalUpdates;
        patchHits += jobPatchHits;
        rebuildHits += jobRebuildHits;
        if (jobPatchHits && stats.avg_patch_ms) {
            patchDurationSum += Number(stats.avg_patch_ms) * jobPatchHits;
        }
        if (jobRebuildHits && stats.avg_rebuild_ms) {
            rebuildDurationSum += Number(stats.avg_rebuild_ms) * jobRebuildHits;
        }
    }

    const activeImplicit = jobs.filter((job) => !TERMINAL_STATES.has(job.state) && job.generation_path === 'inferred_parametric_scad').length;
    return {
        patchHitRate: totalUpdates ? Math.round((patchHits / totalUpdates) * 100) : 0,
        avgPatch: patchHits ? formatDurationMs(Math.round(patchDurationSum / patchHits)) : 'n/a',
        avgRebuild: rebuildHits ? formatDurationMs(Math.round(rebuildDurationSum / rebuildHits)) : 'n/a',
        activeImplicit,
    };
}

function filteredJobs() {
    if (state.filterState === 'ALL') {
        return state.jobs;
    }
    if (state.filterState === 'ACTIVE') {
        return state.jobs.filter((job) => !TERMINAL_STATES.has(job.state));
    }
    if (state.filterState === 'BLOCKED') {
        return state.jobs.filter((job) => BLOCKED_STATES.has(job.state));
    }
    return state.jobs.filter((job) => job.state === state.filterState);
}

function renderJobsList(errorMessage) {
    if (errorMessage) {
        elements.jobsList.innerHTML = `<div class="empty-copy">${escapeHtml(errorMessage)}</div>`;
        return;
    }

    if (state.isLoadingJobs && !state.jobs.length) {
        elements.jobsList.innerHTML = '<div class="empty-copy">Loading creations...</div>';
        return;
    }

    const jobs = filteredJobs();
    if (!jobs.length) {
        elements.jobsList.innerHTML = '<div class="empty-copy">No creations match this filter.</div>';
        return;
    }

    elements.jobsList.innerHTML = jobs.map((job) => `
        <div class="creation-card ${state.selectedJobId === job.job_id ? 'is-selected' : ''}" data-job-id="${escapeHtml(job.job_id)}" tabindex="0">
            <div class="creation-content">
                <div class="creation-title">${escapeHtml(truncate(job.input_request, 72))}</div>
                <div class="creation-meta">
                    <div class="status-indicator">
                        <span class="status-dot ${job.state === 'ACTIVE' ? 'is-active' : (job.state === 'DELIVERED' ? 'is-delivered' : (BLOCKED_STATES.has(job.state) ? 'is-blocked' : ''))}"></span>
                        <span>${escapeHtml(job.state)}</span>
                    </div>
                    <span>${escapeHtml(formatCompactDate(job.updated_at))}</span>
                </div>
            </div>
            <button class="delete-job-button" data-delete-job-id="${escapeHtml(job.job_id)}" type="button" title="Delete Creation" aria-label="Delete">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>
            </button>
        </div>
    `).join('');

    elements.jobsList.querySelectorAll('[data-job-id]').forEach((card) => {
        card.addEventListener('click', () => {
            fetchJobDetail(card.dataset.jobId);
        });
    });

    elements.jobsList.querySelectorAll('[data-delete-job-id]').forEach((btn) => {
        let confirmTimeout = null;
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            if (btn.classList.contains('is-confirming')) {
                clearTimeout(confirmTimeout);
                btn.innerHTML = '<span style="font-size: 0.72rem; padding: 0 4px; color: var(--text-dim);">Deleting...</span>';
                const jobId = btn.dataset.deleteJobId;
                await handleDeleteJob(jobId, btn);
            } else {
                btn.classList.add('is-confirming');
                btn.innerHTML = '<span style="font-size: 0.72rem; padding: 0 4px; color: var(--danger);">Confirm?</span>';
                confirmTimeout = setTimeout(() => {
                    btn.classList.remove('is-confirming');
                    btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>';
                }, 3000);
            }
        });
    });
}

async function handleDeleteJob(jobId, btn) {
    try {
        const response = await fetch(`${API_BASE}/jobs/${jobId}?hard=true`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error('Failed to delete creation');
        }
        if (state.selectedJobId === jobId) {
            state.selectedJobId = null;
            state.selectedJob = null;
            state.validations = [];
            state.parameterOverrides = {};
            renderWorkspace();
        }
        await fetchJobs();
    } catch (error) {
        console.error(error);
        if (btn) {
            btn.innerHTML = '<span style="font-size: 0.72rem; padding: 0 4px; color: var(--danger);">Error</span>';
            setTimeout(() => {
                btn.classList.remove('is-confirming');
                btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"></path></svg>';
            }, 3000);
        }
    }
}

function renderWorkspace() {
    renderConversation();
    renderCanvas();
    renderParameters();
    renderPerformance();
    renderValidation();
    renderTimeline();
}

function renderConversation() {
    if (!state.selectedJob) {
        elements.threadTitle.textContent = 'Start a new CAD creation';
        elements.conversationStream.innerHTML = `
            <div class="empty-thread">
                <h3>Describe the part you want.</h3>
                <p>Try a gear, enclosure, bracket, mount, or clip with real dimensions and manufacturing intent.</p>
            </div>
        `;
        return;
    }

    const job = state.selectedJob;
    elements.threadTitle.textContent = truncate(job.input_request, 42);

    const assistantSummary = buildAssistantSummary(job);
    const generationPath = summarizeGenerationPath(job);
    const researchSummary = summarizeResearchState(job);
    const objectModelSummary = summarizeObjectModel(job);
    const parameterFacts = extractParameters(job).slice(0, 6).map((parameter) => `
        <span class="fact-chip">${escapeHtml(parameter.label)} · ${escapeHtml(formatParameterValue(parameter.value, parameter.unit))}</span>
    `).join('');
    const similarCases = state.similarCases.length ? `
        <div class="message-row">
            <div class="message-avatar agent">CM</div>
            <div class="message-card agent">
                <div class="message-header">
                    <strong>Case memory</strong>
                    <span>${escapeHtml(String(state.similarCases.length))} matches</span>
                </div>
                <div class="message-body">${state.similarCases.map((item) => escapeHtml(readCaseRequest(item))).join('<br>')}</div>
            </div>
        </div>
    ` : '';

    elements.conversationStream.innerHTML = `
        <div class="message-row">
            <div class="message-avatar user">U</div>
            <div class="message-card user">
                <div class="message-header">
                    <strong>You</strong>
                    <span>${escapeHtml(formatCompactDate(job.created_at))}</span>
                </div>
                <div class="message-body">${escapeHtml(job.input_request)}</div>
            </div>
        </div>

        <div class="message-row">
            <div class="message-avatar agent">AI</div>
            <div class="message-card agent">
                <div class="message-header">
                    <strong>CAD Agent</strong>
                    <span>${escapeHtml(job.state)}</span>
                </div>
                <div class="message-body">${escapeHtml(assistantSummary)}</div>
                <div class="message-tags">
                    <span class="thread-tag">${escapeHtml(generationPath)}</span>
                    <span class="thread-tag">${escapeHtml(researchSummary)}</span>
                    <span class="thread-tag">${escapeHtml(objectModelSummary)}</span>
                    <span class="thread-tag">${escapeHtml(summarizeValidation(state.validations))}</span>
                    <span class="thread-tag">${escapeHtml(summarizeArtifacts(job.artifacts))}</span>
                </div>
            </div>
        </div>

        <div class="message-row">
            <div class="message-avatar agent">PX</div>
            <div class="message-card agent">
                <div class="message-header">
                    <strong>Extracted parameters</strong>
                    <span>${escapeHtml(String(extractParameters(job).length))} fields</span>
                </div>
                <div class="thread-facts">${parameterFacts || '<span class="fact-chip">Waiting for structured dimensions</span>'}</div>
            </div>
        </div>

        ${similarCases}
    `;
}

function renderCanvas() {
    const job = state.selectedJob;

    if (!job) {
        elements.viewerTitle.textContent = 'Viewport ready';
        elements.viewerStateBadge.textContent = 'IDLE';
        elements.viewerStateBadge.className = 'state-chip';
        elements.viewerPathBadge.textContent = 'generation pending';
        elements.viewerPathBadge.className = 'soft-chip';
        if (elements.artifactSummary) elements.artifactSummary.textContent = 'Pending';
        if (elements.validationSummary) elements.validationSummary.textContent = 'Waiting';
        if (elements.updatedSummary) elements.updatedSummary.textContent = '-';
        elements.artifactActions.innerHTML = '';
        destroyViewer();
        elements.viewerPlaceholder.classList.remove('hidden');
        elements.viewerPlaceholder.innerHTML = '<p>Select a creation to inspect the generated STL here.</p>';
        return;
    }

    elements.viewerTitle.textContent = truncate(job.input_request, 56);
    elements.viewerStateBadge.textContent = job.state;
    elements.viewerStateBadge.className = `state-chip ${badgeStateClass(job.state)}`;
    elements.viewerPathBadge.textContent = summarizeGenerationPath(job);
    elements.viewerPathBadge.className = `soft-chip ${parameterStrategyClass(job.parameter_update_strategy)}`;
    if (elements.viewerPromptLabel) elements.viewerPromptLabel.textContent = truncate(job.input_request, 52);
    if (elements.artifactSummary) elements.artifactSummary.textContent = state.isUpdatingParameters ? 'Updating preview…' : summarizeArtifacts(job.artifacts);
    if (elements.validationSummary) elements.validationSummary.textContent = state.isUpdatingParameters ? 'Re-rendering' : summarizeValidation(state.validations);
    if (elements.updatedSummary) {
        elements.updatedSummary.textContent = job.parameter_update_duration_ms
            ? `${formatParameterUpdateTiming(job)} · ${formatCompactDate(job.parameter_updated_at || job.updated_at)}`
            : formatCompactDate(job.updated_at);
    }
    elements.artifactActions.innerHTML = buildArtifactActions(job);
    renderCanvasArtifacts(job);
    initializeStlPreview(job);
}

function renderParameters() {
    const job = state.selectedJob;
    if (!job) {
        elements.parametersPanel.innerHTML = '<div class="empty-copy">Generated parameters will appear here after the request is parsed.</div>';
        return;
    }

    const parameters = extractParameters(job);
    if (!parameters.length) {
        elements.parametersPanel.innerHTML = '<div class="empty-copy">No structured parameters are available yet for this creation.</div>';
        return;
    }

    const groups = groupParameters(parameters);
    elements.parametersPanel.innerHTML = `
        <div class="parameter-console-summary">
            <span class="parameter-console-chip ${escapeHtml(parameterStrategyClass(job.parameter_update_strategy))}">
                ${escapeHtml(prettyStrategyLabel(job.parameter_update_strategy))}
            </span>
            <strong>${escapeHtml(String(parameters.length))} live controls</strong>
            <span>${escapeHtml(String(groups.length))} groups${job.parameter_update_duration_ms ? ` · ${escapeHtml(formatParameterUpdateTiming(job))}` : ''}</span>
        </div>
        ${groups.map(({ key, title, parameters: groupParametersList }) => `
        <section class="parameter-group" data-parameter-group="${escapeHtml(key)}">
            <div class="parameter-group-head">
                <strong>${escapeHtml(title)}</strong>
                <span>${escapeHtml(String(groupParametersList.length))} controls</span>
            </div>
            <div class="parameter-group-grid">
                ${groupParametersList.map((parameter) => renderParameterCard(parameter)).join('')}
            </div>
        </section>
    `).join('')}
    `;

    elements.parametersPanel.querySelectorAll('[data-parameter-key]').forEach((input) => {
        input.addEventListener('input', () => {
            const numericValue = Number(input.value);
            if (!Number.isFinite(numericValue)) {
                return;
            }
            state.parameterOverrides[input.dataset.parameterKey] = numericValue;
            syncParameterInput(input.dataset.parameterKey, input.value);
            scheduleParameterRebuild({ previewOnly: true, delayMs: 140 });
        });
        input.addEventListener('change', () => {
            scheduleParameterRebuild({ previewOnly: true, delayMs: 40 });
        });
    });

    elements.parametersPanel.querySelectorAll('[data-parameter-input]').forEach((input) => {
        input.addEventListener('input', () => {
            const numericValue = Number(input.value);
            if (!Number.isFinite(numericValue)) {
                return;
            }
            state.parameterOverrides[input.dataset.parameterInput] = numericValue;
            syncParameterSlider(input.dataset.parameterInput, input.value);
            scheduleParameterRebuild({ previewOnly: true, delayMs: 220 });
        });
    });
}

function renderParameterCard(parameter) {
    const overrideKey = parameter.key;
    const value = state.parameterOverrides[overrideKey] ?? parameter.value;
    const range = deriveParameterRange(parameter, value);

    const commonAttributes = `
        data-parameter-key="${escapeHtml(parameter.key)}"
        min="${escapeHtml(String(range.min))}"
        max="${escapeHtml(String(range.max))}"
        step="${escapeHtml(String(range.step))}"
    `;

    return `
        <div class="parameter-card ${parameter.editable === false ? 'is-locked' : ''}">
            <div class="parameter-head">
                <strong title="${escapeHtml(parameter.description || '')}">${escapeHtml(parameter.label)}</strong>
            </div>
            <input
                class="parameter-value"
                type="number"
                data-parameter-input="${escapeHtml(parameter.key)}"
                value="${escapeHtml(String(roundNumber(value, range.step)))}"
                step="${escapeHtml(String(range.step))}"
                ${parameter.editable === false ? 'disabled' : ''}
            >
            <div class="parameter-readout">
                ${parameter.editable === false ? '' : `<input type="range" ${commonAttributes} value="${escapeHtml(String(value))}">`}
            </div>
        </div>
    `;
}

function groupParameters(parameters) {
    const order = ['dimensions', 'fit', 'support', 'details', 'general'];
    const grouped = new Map();
    for (const parameter of parameters) {
        const key = parameter.group || 'general';
        if (!grouped.has(key)) {
            grouped.set(key, []);
        }
        grouped.get(key).push(parameter);
    }
    return Array.from(grouped.entries())
        .sort(([left], [right]) => {
            const leftIndex = order.indexOf(left);
            const rightIndex = order.indexOf(right);
            const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
            const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
            return normalizedLeft - normalizedRight || left.localeCompare(right);
        })
        .map(([key, items]) => ({
            key,
            title: prettyGroupLabel(key),
            parameters: items,
        }));
}

function prettyGroupLabel(key) {
    const labels = {
        dimensions: 'Dimensions',
        fit: 'Fit & Tolerance',
        support: 'Support Geometry',
        details: 'Detail Controls',
        general: 'General Controls',
    };
    return labels[key] || prettyLabel(key);
}

function prettyStrategyLabel(strategy) {
    const labels = {
        scad_patch: 'Instant Update',
        full_rebuild: 'Full Rebuild',
    };
    return labels[strategy] || 'Adaptive Update';
}

function parameterStrategyClass(strategy) {
    if (strategy === 'scad_patch') {
        return 'is-fast-patch';
    }
    if (strategy === 'full_rebuild') {
        return 'is-full-rebuild';
    }
    return '';
}

function formatParameterUpdateTiming(job) {
    if (!job?.parameter_update_duration_ms) {
        return '';
    }
    if (job.parameter_update_duration_ms < 1000) {
        return `~${job.parameter_update_duration_ms}ms`;
    }
    return `~${(job.parameter_update_duration_ms / 1000).toFixed(1)}s`;
}

function renderPerformance() {
    const job = state.selectedJob;
    const stats = job?.parameter_update_stats;
    if (!job || !stats) {
        elements.performancePanel.innerHTML = '<div class="empty-copy">Patch and rebuild metrics will appear after parameter edits.</div>';
        return;
    }

    const cards = [
        {
            label: 'Patch Hit Rate',
            value: `${stats.patch_hit_rate ?? 0}%`,
            meta: `${stats.patch_hits ?? 0} patch / ${stats.total_updates ?? 0} total`,
            tone: 'is-fast-patch',
        },
        {
            label: 'Avg Patch',
            value: stats.avg_patch_ms ? formatDurationMs(stats.avg_patch_ms) : 'n/a',
            meta: 'Instant update path',
            tone: 'is-fast-patch',
        },
        {
            label: 'Avg Rebuild',
            value: stats.avg_rebuild_ms ? formatDurationMs(stats.avg_rebuild_ms) : 'n/a',
            meta: `${stats.rebuild_hits ?? 0} full rebuilds`,
            tone: 'is-full-rebuild',
        },
    ];

    elements.performancePanel.innerHTML = cards.map((card) => `
        <div class="telemetry-row ${escapeHtml(card.tone)}">
            <span>${escapeHtml(card.label)}</span>
            <strong>${escapeHtml(card.value)}</strong>
        </div>
    `).join('');
}

function formatDurationMs(durationMs) {
    if (durationMs < 1000) {
        return `${durationMs}ms`;
    }
    return `${(durationMs / 1000).toFixed(1)}s`;
}

function renderValidation() {
    if (!state.selectedJob) {
        elements.validationPanel.innerHTML = '<div class="empty-copy">No validation results yet.</div>';
        return;
    }

    if (!state.validations.length) {
        elements.validationPanel.innerHTML = '<div class="empty-copy">Validation will appear after render and review finish.</div>';
        return;
    }

    elements.validationPanel.innerHTML = state.validations.map((rule) => `
        <div class="validation-row ${rule.passed ? 'is-passed' : 'is-failed'}">
            <div class="rule-row">
                <strong>${escapeHtml(rule.rule_name || rule.rule_id)}</strong>
                <span class="rule-chip ${rule.is_critical ? 'is-critical' : ''}">${escapeHtml(rule.passed ? 'pass' : 'fail')}</span>
            </div>
            ${rule.message ? `<div class="validation-copy">${escapeHtml(rule.message)}</div>` : ''}
        </div>
    `).join('');
}

function renderTimeline() {
    const logs = state.selectedJob?.logs || [];

    if (!state.selectedJob) {
        elements.timelinePanel.innerHTML = '<div class="empty-copy">Execution logs will appear here.</div>';
        return;
    }

    if (!logs.length) {
        elements.timelinePanel.innerHTML = '<div class="empty-copy">The creation has not emitted execution events yet.</div>';
        return;
    }

    elements.timelinePanel.innerHTML = logs.slice().reverse().map((log, index) => `
        <div class="timeline-row">
            <div class="timeline-head">
                <strong>${escapeHtml(log.agent || `agent-${index + 1}`)} · ${escapeHtml(log.action || 'event')}</strong>
                <span class="timeline-meta">${escapeHtml(formatCompactDate(log.timestamp || log.created_at || ''))}</span>
            </div>
            <div class="timeline-copy">${formatTimelineBody(log)}</div>
        </div>
    `).join('');
}

function buildAssistantSummary(job) {
    const validations = state.validations;
    if (job.state === 'DELIVERED') {
        return `Creation delivered. ${summarizeArtifacts(job.artifacts)} are ready, and the model is available in the viewport.`;
    }
    if (BLOCKED_STATES.has(job.state)) {
        return `The creation is blocked at ${job.state}. Review validation and execution trace before re-running generation.`;
    }
    if (job.state === 'NEW') {
        return 'The request has been queued. The agent will parse geometry intent, choose a generation path, and start rendering.';
    }
    if (job.state === 'RENDERED') {
        return 'Render completed. The system is now validating geometry, printability, and semantic fit.';
    }
    if (job.state === 'VALIDATED') {
        return `Validation passed with ${validations.filter((item) => item.passed).length} checks recorded. Final packaging is next.`;
    }
    return `The creation is currently in ${job.state}. The workspace is tracking structure, artifacts, and validation as they land.`;
}

function summarizeGenerationPath(job) {
    if (!job) {
        return 'generation pending';
    }
    if (job.generation_path) {
        const labels = {
            object_model: 'path: object model',
            geometry_intent: 'path: geometry intent',
            dsl: 'path: geometry dsl',
            inferred_parametric_scad: 'path: inferred parametric',
            llm_native_scad: 'path: freeform llm',
        };
        const strategyLabels = {
            scad_patch: 'fast patch',
            full_rebuild: 'full rebuild',
        };
        const base = labels[job.generation_path] || `path: ${job.generation_path}`;
        const strategy = strategyLabels[job.parameter_update_strategy];
        const timing = formatParameterUpdateTiming(job);
        if (strategy && timing) {
            return `${base} · ${strategy} · ${timing}`;
        }
        return strategy ? `${base} · ${strategy}` : base;
    }
    return 'generation pending';
}

function summarizeResearchState(job) {
    const research = job?.design_pipeline?.research_result;
    if (!research) {
        return 'research: pending';
    }
    if (research.web_research_used) {
        return 'research: web enriched';
    }
    const hasDimensions = research.reference_dimensions && Object.keys(research.reference_dimensions).length > 0;
    const hasObjectModel = research.object_model && Object.keys(research.object_model).length > 0;
    if (research.object_name || hasDimensions || hasObjectModel) {
        return 'research: seeded model';
    }
    return 'research: pending';
}

function summarizeObjectModel(job) {
    const objectModel = job?.design_pipeline?.research_result?.object_model;
    if (objectModel?.synthesis_kind) {
        return `object model: ${objectModel.synthesis_kind}`;
    }
    if (objectModel?.category) {
        return `object model: ${objectModel.category}`;
    }
    return 'object model: none';
}

function buildArtifactActions(job) {
    // Current primary artifacts (STL, SCAD, PNG) are now in renderCanvasArtifacts overlay.
    // We return empty string here to save vertical space as requested.
    return '';
}

function renderCanvasArtifacts(job) {
    if (!elements.canvasArtifactActions) return;
    elements.canvasArtifactActions.innerHTML = '';
    
    if (!job || (!job.artifacts?.stl_path && !job.scad_content)) {
        return;
    }

    const stlUrl = `${API_BASE}/jobs/${job.job_id}/artifacts/stl`;
    const scadUrl = `${API_BASE}/jobs/${job.job_id}/artifacts/scad`;

    let html = '';

    if (job.artifacts?.stl_path) {
        html += `
            <a href="${escapeHtml(stlUrl)}" class="canvas-action-btn" target="_blank" rel="noreferrer" title="Download STL Mesh">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                <span>Download STL</span>
            </a>
        `;
    }

    if (job.artifacts?.png_path) {
        const pngUrl = `${API_BASE}/jobs/${job.job_id}/artifacts/png`;
        html += `
            <a href="${escapeHtml(pngUrl)}" class="canvas-action-btn" target="_blank" rel="noreferrer" title="View Preview Image">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
                <span>Preview PNG</span>
            </a>
        `;
    }

    if (job.scad_content || true) { // Always show scad link if we have a job
        html += `
            <button class="canvas-action-btn" onclick="copySource('${escapeHtml(scadUrl)}', this)" title="Copy OpenSCAD Source">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                <span>OpenSCAD source</span>
            </button>
        `;
    }

    elements.canvasArtifactActions.innerHTML = html;
}

function extractParameters(job) {
    const schemaParameters = job?.parameter_schema?.parameters;
    if (Array.isArray(schemaParameters) && schemaParameters.length) {
        return schemaParameters
            .filter((parameter) => parameter && parameter.editable !== false)
            .map((parameter) => ({
                key: parameter.key,
                value: state.parameterOverrides[parameter.key]
                    ?? job.parameter_values?.[parameter.key]
                    ?? parameter.value,
                label: parameter.label || prettyLabel(parameter.key),
                unit: parameter.unit || inferUnit(parameter.key),
                description: parameter.description || inferDescription(parameter.key),
                min: parameter.min,
                max: parameter.max,
                step: parameter.step,
                editable: parameter.editable !== false,
                group: parameter.group || 'general',
            }));
    }

    const dimensions = readStructuredDimensions(job);
    return Object.entries(dimensions)
        .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
        .map(([key, value]) => ({
            key,
            value,
            label: prettyLabel(key),
            unit: inferUnit(key),
            description: inferDescription(key),
            editable: true,
            group: 'dimensions',
        }));
}

function readStructuredDimensions(job) {
    const intakeLog = (job.logs || []).find((log) => log.agent === 'intake' && log.output_data?.spec?.dimensions);
    if (intakeLog?.output_data?.spec?.dimensions) {
        return intakeLog.output_data.spec.dimensions;
    }

    if (!job.spec_summary) {
        return {};
    }

    const match = job.spec_summary.match(/\{(.+)\}/);
    if (!match) {
        return {};
    }

    try {
        const normalized = `{${match[1].replace(/'/g, '"')}}`;
        return JSON.parse(normalized);
    } catch (error) {
        return {};
    }
}

function deriveParameterRange(parameter, value) {
    const magnitude = Math.max(Math.abs(value), 1);
    const isDiscrete = /teeth|count|quantity|index/i.test(parameter.key);
    const min = typeof parameter.min === 'number' ? parameter.min : undefined;
    const max = typeof parameter.max === 'number' ? parameter.max : undefined;
    const step = typeof parameter.step === 'number' ? parameter.step : undefined;
    return {
        min: min ?? (isDiscrete ? Math.max(1, Math.round(value * 0.5)) : roundNumber(Math.max(0, value - magnitude * 0.5), 0.1)),
        max: max ?? (isDiscrete ? Math.max(2, Math.round(value * 1.8)) : roundNumber(value + magnitude * 0.75 + 1, 0.1)),
        step: step ?? (isDiscrete ? 1 : magnitude < 10 ? 0.1 : 1),
    };
}

function scheduleParameterRebuild({ previewOnly = true, delayMs = 160 } = {}) {
    const jobId = state.selectedJob?.job_id;
    if (!jobId) {
        return;
    }

    if (state.parameterUpdateTimer) {
        clearTimeout(state.parameterUpdateTimer);
    }

    const seq = ++state.parameterUpdateSeq;
    state.parameterUpdateTimer = window.setTimeout(() => {
        void rebuildJobFromParameters(jobId, seq, { previewOnly });
    }, delayMs);
}

async function rebuildJobFromParameters(jobId, seq, { previewOnly = false } = {}) {
    if (!state.selectedJob || state.selectedJob.job_id !== jobId) {
        return;
    }

    const payload = collectEditableParameterValues(state.selectedJob);
    if (!Object.keys(payload).length) {
        return;
    }

    state.isUpdatingParameters = true;
    renderCanvas();

    try {
        const response = await fetch(`${API_BASE}/jobs/${jobId}/parameters`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                parameter_values: payload,
                preview_only: previewOnly,
            }),
        });

        if (!response.ok) {
            const errorPayload = await response.json().catch(() => null);
            throw new Error(errorPayload?.detail || 'Parameter rebuild failed');
        }

        const updatedJob = await response.json();
        if (seq !== state.parameterUpdateSeq || state.selectedJobId !== jobId) {
            return;
        }

        state.selectedJob = updatedJob;
        state.jobs = state.jobs.map((job) => (job.job_id === jobId ? { ...job, ...updatedJob } : job));
        state.validations = normalizeValidations(updatedJob.validation_results);
        state.parameterOverrides = {};
        state.justRebuilt = true;
        renderStats();
        renderJobsList();
        renderWorkspace();
    } catch (error) {
        if (seq === state.parameterUpdateSeq && state.selectedJobId === jobId) {
            elements.viewerPlaceholder.classList.remove('hidden');
            if (state.viewerInstance?.mesh) {
                elements.viewerPlaceholder.innerHTML = `<p>${escapeHtml(error.message || 'Parameter rebuild failed')} The previous model is still shown.</p>`;
            } else {
                elements.viewerPlaceholder.innerHTML = `<p>${escapeHtml(error.message || 'Parameter rebuild failed')}</p>`;
            }
        }
    } finally {
        if (seq === state.parameterUpdateSeq) {
            state.isUpdatingParameters = false;
            state.parameterUpdateTimer = null;
            renderCanvas();
        }
    }
}

function collectEditableParameterValues(job) {
    const values = {};
    for (const parameter of extractParameters(job)) {
        if (parameter.editable === false) {
            continue;
        }
        const value = state.parameterOverrides[parameter.key]
            ?? job.parameter_values?.[parameter.key]
            ?? parameter.value;
        if (typeof value === 'number' && Number.isFinite(value)) {
            values[parameter.key] = value;
        }
    }
    return values;
}

function cancelPendingParameterUpdate() {
    if (state.parameterUpdateTimer) {
        clearTimeout(state.parameterUpdateTimer);
    }
    state.parameterUpdateTimer = null;
    state.parameterUpdateSeq += 1;
    state.isUpdatingParameters = false;
}

function syncParameterInput(key, value) {
    const input = elements.parametersPanel.querySelector(`[data-parameter-input="${CSS.escape(key)}"]`);
    if (input) {
        input.value = value;
    }
}

function syncParameterSlider(key, value) {
    const slider = elements.parametersPanel.querySelector(`[data-parameter-key="${CSS.escape(key)}"]`);
    if (slider) {
        slider.value = value;
    }
}

function linkCard(label, href, description, showCopy = false) {
    return `
        <div class="artifact-link">
            <a href="${escapeHtml(href)}" class="artifact-link-info" target="_blank" rel="noreferrer">
                <strong>${escapeHtml(label)}</strong>
                <span>${escapeHtml(description)}</span>
            </a>
            ${showCopy ? `
                <div class="artifact-row-actions">
                    <button class="copy-artifact-btn" onclick="copySource('${escapeHtml(href)}', this)" title="Copy source to clipboard">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

async function copySource(url, btn) {
    try {
        const response = await fetch(url);
        if (!response.ok) throw new Error('Fetch failed');
        const text = await response.text();
        await navigator.clipboard.writeText(text);
        
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"></polyline></svg>';
        btn.classList.add('is-success');
        
        setTimeout(() => {
            btn.innerHTML = originalContent;
            btn.classList.remove('is-success');
        }, 2000);
    } catch (error) {
        console.error('Copy failed:', error);
        btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>';
        setTimeout(() => {
            btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';
        }, 2000);
    }
}

function destroyViewer() {
    if (typeof state.viewerCleanup === 'function') {
        state.viewerCleanup();
    }
    state.viewerCleanup = null;
    state.viewerInstance = null;
}

function ensureViewerInstance(container) {
    if (state.viewerInstance) {
        return state.viewerInstance;
    }

    const scene = new window.THREE.Scene();
    scene.background = new window.THREE.Color(0x2f2f2f);

    const camera = new window.THREE.PerspectiveCamera(44, container.clientWidth / container.clientHeight, 0.1, 5000);
    camera.position.set(120, 90, 120);

    const renderer = new window.THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(container.clientWidth || 1, container.clientHeight || 1);
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new window.THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.screenSpacePanning = true;

    scene.add(new window.THREE.HemisphereLight(0xffffff, 0x1b1b1b, 1.4));
    const keyLight = new window.THREE.DirectionalLight(0xffffff, 1.05);
    keyLight.position.set(100, 130, 60);
    scene.add(keyLight);

    const rimLight = new window.THREE.DirectionalLight(0x7cc8ff, 0.65);
    rimLight.position.set(-90, 50, -40);
    scene.add(rimLight);

    const grid = new window.THREE.GridHelper(220, 12, 0x5b5b5b, 0x3b3b3b);
    grid.position.y = -24;
    scene.add(grid);

    const axes = new window.THREE.AxesHelper(28);
    scene.add(axes);

    const viewer = {
        scene,
        camera,
        renderer,
        controls,
        mesh: null,
        loadSeq: 0,
        currentUrl: null,
        animationFrameId: null,
        handleResize: null,
    };

    function animate() {
        viewer.animationFrameId = window.requestAnimationFrame(animate);
        viewer.controls.update();
        viewer.renderer.render(viewer.scene, viewer.camera);
    }

    viewer.handleResize = () => {
        const width = container.clientWidth || 1;
        const height = container.clientHeight || 1;
        viewer.camera.aspect = width / height;
        viewer.camera.updateProjectionMatrix();
        viewer.renderer.setSize(width, height);
    };

    window.addEventListener('resize', viewer.handleResize);
    animate();

    state.viewerInstance = viewer;
    state.viewerCleanup = () => {
        window.removeEventListener('resize', viewer.handleResize);
        if (viewer.animationFrameId) {
            window.cancelAnimationFrame(viewer.animationFrameId);
        }
        viewer.controls.dispose();
        viewer.renderer.dispose();
        if (viewer.mesh) {
            viewer.mesh.geometry.dispose();
            viewer.mesh.material.dispose();
        }
        container.innerHTML = '';
    };

    return viewer;
}

function frameViewerToGeometry(viewer, geometry) {
    const size = new window.THREE.Vector3();
    geometry.boundingBox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z, 1);
    viewer.camera.position.set(maxDim * 1.9, maxDim * 1.35, maxDim * 1.9);
    viewer.controls.target.set(0, 0, 0);
    viewer.controls.update();
}

function loadStlIntoViewer(viewer, stlUrl, placeholder) {
    const forceReload = state.justRebuilt;
    if (!forceReload && viewer.currentUrl === stlUrl && viewer.mesh) {
        placeholder.classList.add('hidden');
        return;
    }

    if (forceReload) {
        state.justRebuilt = false;
        viewer.currentUrl = null;
        if (viewer.mesh) {
            viewer.mesh.geometry.dispose();
            viewer.mesh.material.dispose();
            viewer.mesh = null;
        }
    }

    const loadSeq = ++viewer.loadSeq;
    viewer.currentUrl = stlUrl;

    const loader = new window.THREE.STLLoader();
    loader.load(
        stlUrl,
        (geometry) => {
            if (state.viewerInstance !== viewer || loadSeq !== viewer.loadSeq) {
                geometry.dispose();
                return;
            }

            geometry.computeBoundingBox();
            geometry.computeVertexNormals();
            geometry.center();

            if (viewer.mesh) {
                const oldGeometry = viewer.mesh.geometry;
                viewer.mesh.geometry = geometry;
                oldGeometry.dispose();
            } else {
                const material = new window.THREE.MeshStandardMaterial({
                    color: 0x39a7ff,
                    metalness: 0.14,
                    roughness: 0.5,
                });
                viewer.mesh = new window.THREE.Mesh(geometry, material);
                viewer.mesh.rotation.x = -Math.PI / 2;
                viewer.scene.add(viewer.mesh);
            }

            frameViewerToGeometry(viewer, geometry);
            placeholder.classList.add('hidden');
        },
        undefined,
        () => {
            if (state.viewerInstance !== viewer || loadSeq !== viewer.loadSeq) {
                return;
            }
            if (!viewer.mesh) {
                placeholder.classList.remove('hidden');
                placeholder.innerHTML = '<p>The STL exists, but the browser could not render it. Download is still available below.</p>';
            }
        }
    );
}

function initializeStlPreview(job) {
    const container = elements.stlViewer;
    const placeholder = elements.viewerPlaceholder;
    const currentStlUrl = job?.artifacts?.stl_path
        ? `${API_BASE}/jobs/${job.job_id}/artifacts/stl?ts=${encodeURIComponent(job.updated_at || Date.now())}`
        : null;
    if (currentStlUrl) {
        state.lastStableStlUrl = currentStlUrl;
        state.lastStableViewerJobId = job.job_id;
    }
    const stlUrl = currentStlUrl
        || (state.isUpdatingParameters && state.lastStableViewerJobId === job?.job_id ? state.lastStableStlUrl : null);

    if (!container || !placeholder) {
        return;
    }

    if (!stlUrl) {
        destroyViewer();
        placeholder.classList.remove('hidden');
        placeholder.innerHTML = '<p>Rendering has not produced an STL yet. The viewport will light up as soon as the artifact is ready.</p>';
        return;
    }

    if (!currentStlUrl && state.isUpdatingParameters && state.viewerInstance?.mesh) {
        placeholder.classList.remove('hidden');
        placeholder.innerHTML = '<p>Updating preview… keeping the last stable model visible until the new STL lands.</p>';
        return;
    }

    if (!window.THREE || !window.THREE.STLLoader || !window.THREE.OrbitControls) {
        destroyViewer();
        placeholder.classList.remove('hidden');
        placeholder.innerHTML = '<p>The browser preview engine is unavailable, but the STL is ready to download.</p>';
        return;
    }

    const viewer = ensureViewerInstance(container);
    loadStlIntoViewer(viewer, stlUrl, placeholder);
}

function normalizeValidations(validations) {
    if (!Array.isArray(validations)) {
        return [];
    }
    return validations.map((item) => ({
        rule_id: item.rule_id || item.id || 'rule',
        rule_name: item.rule_name || item.rule_id || 'rule',
        level: item.level?.value || item.level || 'info',
        passed: item.passed,
        message: item.message || '',
        is_critical: Boolean(item.is_critical),
    }));
}

function summarizeArtifacts(artifacts) {
    if (!artifacts) {
        return 'Pending';
    }
    const names = [];
    if (artifacts.stl_path) names.push('STL');
    if (artifacts.png_path) names.push('PNG');
    if (artifacts.scad_source || artifacts.scad_content) names.push('SCAD');
    if (artifacts.report_path) names.push('REPORT');
    return names.length ? names.join(' · ') : 'Pending';
}

function summarizeValidation(validations) {
    if (!validations.length) {
        return 'Review pending';
    }
    const passed = validations.filter((item) => item.passed).length;
    return `${passed}/${validations.length} checks passed`;
}

function formatTimelineBody(log) {
    const output = log.output_data;
    if (output?.spec?.geometric_type) {
        return `Parsed ${output.spec.geometric_type} with ${Object.keys(output.spec.dimensions || {}).length} dimensions.`;
    }
    if (typeof output?.scad_source === 'string') {
        return `Generated OpenSCAD source and forwarded it to execution.`;
    }
    if (log.error_message) {
        return escapeHtml(log.error_message);
    }
    return escapeHtml(stringifyValue(output || log));
}

function readCaseRequest(item) {
    return item.input_request || item.customer_request || item.request || item.summary || JSON.stringify(item);
}

function prettyLabel(key) {
    return String(key)
        .replace(/_/g, ' ')
        .replace(/\b\w/g, (match) => match.toUpperCase());
}

function inferUnit(key) {
    if (/angle/i.test(key)) return 'deg';
    if (/count|teeth|quantity/i.test(key)) return 'count';
    return 'mm';
}

function inferDescription(key) {
    if (/outer/i.test(key)) return 'primary envelope';
    if (/inner|hole|bore/i.test(key)) return 'internal feature';
    if (/thickness/i.test(key)) return 'depth along Z';
    if (/angle/i.test(key)) return 'mechanical angle';
    if (/teeth/i.test(key)) return 'discrete count';
    return 'generated from spec';
}

function formatParameterValue(value, unit) {
    if (unit === 'count') {
        return String(Math.round(value));
    }
    if (unit === 'deg') {
        return `${roundNumber(value, 0.1)}°`;
    }
    return `${roundNumber(value, 0.1)} ${unit}`;
}

function badgeStateClass(status) {
    if (status === 'DELIVERED') return 'is-delivered';
    if (BLOCKED_STATES.has(status)) return 'is-blocked';
    return '';
}

function stringifyValue(value) {
    if (value === null || value === undefined) {
        return 'null';
    }
    if (typeof value === 'object') {
        const str = JSON.stringify(value);
        return str.length > 500 ? str.slice(0, 500) + '…' : str;
    }
    return String(value);
}

function formatCompactDate(dateString) {
    if (!dateString) {
        return '-';
    }
    const date = new Date(dateString);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

function shortPath(value) {
    if (!value) {
        return 'unknown';
    }
    const parts = String(value).split(/[\\/]/);
    return parts.slice(-2).join('/');
}

function roundNumber(value, step = 1) {
    if (!Number.isFinite(value)) return String(value);
    const precision = step < 1 ? Math.max(0, String(step).split('.')[1]?.length || 1) : 0;
    const rounded = Math.round(Number(value) / step) * step;
    return rounded.toFixed(precision).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
}

function truncate(value, length) {
    if (!value || value.length <= length) {
        return value || '';
    }
    return `${value.slice(0, length - 1)}…`;
}

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return '';
    }
    const div = document.createElement('div');
    div.textContent = String(value);
    return div.innerHTML;
}

function startPolling() {
    if (state.pollingHandle) {
        clearInterval(state.pollingHandle);
    }

    state.pollingHandle = setInterval(async () => {
        const shouldRefresh = state.jobs.some((job) => !TERMINAL_STATES.has(job.state))
            || (state.selectedJob && !TERMINAL_STATES.has(state.selectedJob.state));

        if (!shouldRefresh) {
            elements.refreshStatus.textContent = 'idle';
            return;
        }

        elements.refreshStatus.textContent = 'live';
        await Promise.allSettled([
            fetchJobs(),
            state.selectedJobId ? fetchJobDetail(state.selectedJobId) : Promise.resolve(),
        ]);
    }, 5000);
}

init();
