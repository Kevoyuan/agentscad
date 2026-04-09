const API_BASE = window.CAD_AGENT_API_BASE || `${window.location.protocol === 'file:' ? 'http:' : window.location.protocol}//${window.location.hostname || '127.0.0.1'}:8000`;
const TERMINAL_STATES = new Set(['DELIVERED', 'ARCHIVED', 'CANCELLED', 'HUMAN_REVIEW']);
const BLOCKED_STATES = new Set(['SPEC_FAILED', 'TEMPLATE_FAILED', 'RENDER_FAILED', 'VALIDATION_FAILED', 'DEBUGGING', 'REPAIRING', 'HUMAN_REVIEW', 'CANCELLED']);

const state = {
    jobs: [],
    selectedJobId: null,
    selectedJob: null,
    templates: [],
    health: null,
    validations: [],
    similarCases: [],
    filterState: 'ALL',
    pollingHandle: null,
    viewerCleanup: null,
    isLoadingJobs: false,
    isLoadingDetail: false,
    isSubmitting: false,
    parameterOverrides: {},
};

const elements = {
    healthCard: document.getElementById('healthCard'),
    refreshStatus: document.getElementById('refreshStatus'),
    jobCountBadge: document.getElementById('jobCountBadge'),
    deliveredCount: document.getElementById('deliveredCount'),
    templateCount: document.getElementById('templateCount'),
    jobsList: document.getElementById('jobsList'),
    threadTitle: document.getElementById('threadTitle'),
    conversationStream: document.getElementById('conversationStream'),
    jobForm: document.getElementById('jobForm'),
    requestInput: document.getElementById('requestInput'),
    customerId: document.getElementById('customerId'),
    priorityInput: document.getElementById('priorityInput'),
    priorityValue: document.getElementById('priorityValue'),
    submitButton: document.getElementById('submitButton'),
    similarButton: document.getElementById('similarButton'),
    refreshButton: document.getElementById('refreshButton'),
    newCreationButton: document.getElementById('newCreationButton'),
    viewerTitle: document.getElementById('viewerTitle'),
    viewerStateBadge: document.getElementById('viewerStateBadge'),
    viewerTemplateBadge: document.getElementById('viewerTemplateBadge'),
    viewerPromptLabel: document.getElementById('viewerPromptLabel'),
    artifactSummary: document.getElementById('artifactSummary'),
    validationSummary: document.getElementById('validationSummary'),
    updatedSummary: document.getElementById('updatedSummary'),
    stlViewer: document.getElementById('stlViewer'),
    viewerPlaceholder: document.getElementById('viewerPlaceholder'),
    artifactActions: document.getElementById('artifactActions'),
    parametersPanel: document.getElementById('parametersPanel'),
    validationPanel: document.getElementById('validationPanel'),
    timelinePanel: document.getElementById('timelinePanel'),
    resetParametersButton: document.getElementById('resetParametersButton'),
};

function init() {
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
    elements.resetParametersButton.addEventListener('click', () => {
        state.parameterOverrides = {};
        renderParameters();
    });

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
    await Promise.allSettled([fetchHealth(), fetchTemplates(), fetchJobs()]);
    startPolling();
}

async function refreshAll() {
    elements.refreshStatus.textContent = 'manual';
    await Promise.allSettled([
        fetchHealth(),
        fetchTemplates(),
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

async function fetchTemplates() {
    try {
        const response = await fetch(`${API_BASE}/templates`);
        if (!response.ok) {
            throw new Error('Could not load templates');
        }
        state.templates = await response.json();
    } catch (error) {
        state.templates = [];
    }
    renderStats();
}

async function fetchJobs() {
    state.isLoadingJobs = true;
    renderJobsList();
    try {
        const response = await fetch(`${API_BASE}/jobs?limit=50`);
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
    state.isLoadingDetail = true;
    renderWorkspace();

    try {
        const [detailResponse, validationResponse] = await Promise.all([
            fetch(`${API_BASE}/jobs/${jobId}`),
            fetch(`${API_BASE}/jobs/${jobId}/validations`),
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
    } catch (error) {
        state.selectedJob = null;
        state.validations = [];
        if (typeof state.viewerCleanup === 'function') {
            state.viewerCleanup();
            state.viewerCleanup = null;
        }
        elements.viewerPlaceholder.classList.remove('hidden');
        elements.viewerPlaceholder.innerHTML = `<p>${escapeHtml(error.message || 'Failed to load creation.')}</p>`;
    } finally {
        state.isLoadingDetail = false;
        renderWorkspace();
    }
}

async function handleCreateJob(event) {
    event.preventDefault();

    const inputRequest = elements.requestInput.value.trim();
    const customerId = elements.customerId.value.trim();
    const priority = Number(elements.priorityInput.value);

    if (inputRequest.length < 10) {
        return;
    }

    state.isSubmitting = true;
    updateSubmitState();

    try {
        const createResponse = await fetch(`${API_BASE}/jobs`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                input_request: inputRequest,
                customer_id: customerId || null,
                priority,
            }),
        });

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

function focusComposer() {
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
}

function renderStats() {
    elements.jobCountBadge.textContent = String(filteredJobs().length);
    elements.templateCount.textContent = String(state.templates.length);
    elements.deliveredCount.textContent = String(state.jobs.filter((job) => job.state === 'DELIVERED').length);
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
        <button class="creation-card ${state.selectedJobId === job.job_id ? 'is-selected' : ''}" data-job-id="${escapeHtml(job.job_id)}" type="button">
            <div class="creation-title">${escapeHtml(truncate(job.input_request, 78))}</div>
            <div class="creation-meta">
                <span>${escapeHtml(job.state)}</span>
                <span>${escapeHtml(formatCompactDate(job.updated_at))}</span>
            </div>
        </button>
    `).join('');

    elements.jobsList.querySelectorAll('[data-job-id]').forEach((button) => {
        button.addEventListener('click', () => {
            fetchJobDetail(button.dataset.jobId);
        });
    });
}

function renderWorkspace() {
    renderConversation();
    renderCanvas();
    renderParameters();
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
    const parameterFacts = extractParameters(job).slice(0, 6).map((parameter) => `
        <span class="fact-chip">${escapeHtml(parameter.label)} · ${escapeHtml(formatParameterValue(parameter.value, parameter.unit))}</span>
    `).join('');
    const similarCases = state.similarCases.length ? `
        <div class="message-row">
            <div class="message-avatar agent">CM</div>
            <div class="message-card">
                <div class="message-meta">
                    <span>Case memory</span>
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
                <div class="message-meta">
                    <span>You</span>
                    <span>${escapeHtml(formatCompactDate(job.created_at))}</span>
                </div>
                <div class="message-body">${escapeHtml(job.input_request)}</div>
            </div>
        </div>

        <div class="message-row">
            <div class="message-avatar agent">AI</div>
            <div class="message-card">
                <div class="message-meta">
                    <span>CAD Agent</span>
                    <span>${escapeHtml(job.state)}</span>
                </div>
                <div class="message-body">${escapeHtml(assistantSummary)}</div>
                <div class="message-tags">
                    <span class="thread-tag">${escapeHtml(job.template_id || 'template pending')}</span>
                    <span class="thread-tag">${escapeHtml(summarizeValidation(state.validations))}</span>
                    <span class="thread-tag">${escapeHtml(summarizeArtifacts(job.artifacts))}</span>
                </div>
            </div>
        </div>

        <div class="message-row">
            <div class="message-avatar agent">PX</div>
            <div class="message-card">
                <div class="message-meta">
                    <span>Extracted parameters</span>
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
        elements.viewerTemplateBadge.textContent = 'template pending';
        elements.viewerPromptLabel.textContent = 'No active creation';
        elements.artifactSummary.textContent = 'Pending';
        elements.validationSummary.textContent = 'Waiting';
        elements.updatedSummary.textContent = '-';
        elements.artifactActions.innerHTML = '';
        if (typeof state.viewerCleanup === 'function') {
            state.viewerCleanup();
            state.viewerCleanup = null;
        }
        elements.viewerPlaceholder.classList.remove('hidden');
        elements.viewerPlaceholder.innerHTML = '<p>Select a creation to inspect the generated STL here.</p>';
        return;
    }

    elements.viewerTitle.textContent = truncate(job.input_request, 56);
    elements.viewerStateBadge.textContent = job.state;
    elements.viewerStateBadge.className = `state-chip ${badgeStateClass(job.state)}`;
    elements.viewerTemplateBadge.textContent = job.template_id || 'template pending';
    elements.viewerPromptLabel.textContent = truncate(job.input_request, 52);
    elements.artifactSummary.textContent = summarizeArtifacts(job.artifacts);
    elements.validationSummary.textContent = summarizeValidation(state.validations);
    elements.updatedSummary.textContent = formatCompactDate(job.updated_at);
    elements.artifactActions.innerHTML = buildArtifactActions(job);
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

    elements.parametersPanel.innerHTML = parameters.map((parameter) => {
        const overrideKey = parameter.key;
        const value = state.parameterOverrides[overrideKey] ?? parameter.value;
        const range = deriveParameterRange(parameter, value);

        return `
            <div class="parameter-card">
                <div class="parameter-head">
                    <strong>${escapeHtml(parameter.label)}</strong>
                    <span>${escapeHtml(parameter.description)}</span>
                </div>
                <input
                    data-parameter-key="${escapeHtml(parameter.key)}"
                    type="range"
                    min="${escapeHtml(String(range.min))}"
                    max="${escapeHtml(String(range.max))}"
                    step="${escapeHtml(String(range.step))}"
                    value="${escapeHtml(String(value))}"
                >
                <div class="parameter-readout">
                    <input
                        class="parameter-value"
                        data-parameter-input="${escapeHtml(parameter.key)}"
                        type="number"
                        value="${escapeHtml(String(roundNumber(value, range.step)))}"
                        step="${escapeHtml(String(range.step))}"
                    >
                    <span class="parameter-unit">${escapeHtml(parameter.unit || 'value')}</span>
                </div>
            </div>
        `;
    }).join('');

    elements.parametersPanel.querySelectorAll('[data-parameter-key]').forEach((input) => {
        input.addEventListener('input', () => {
            state.parameterOverrides[input.dataset.parameterKey] = Number(input.value);
            syncParameterInput(input.dataset.parameterKey, input.value);
        });
    });

    elements.parametersPanel.querySelectorAll('[data-parameter-input]').forEach((input) => {
        input.addEventListener('input', () => {
            state.parameterOverrides[input.dataset.parameterInput] = Number(input.value);
            syncParameterSlider(input.dataset.parameterInput, input.value);
        });
    });
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
        <div class="validation-card ${rule.passed ? 'is-passed' : 'is-failed'}">
            <div class="rule-row">
                <strong>${escapeHtml(rule.rule_name || rule.rule_id)}</strong>
                <span class="rule-chip ${rule.is_critical ? 'is-critical' : ''}">${escapeHtml(rule.passed ? 'pass' : 'fail')}</span>
            </div>
            <div class="validation-copy">${escapeHtml(rule.message || 'No validation message.')}</div>
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
        <div class="timeline-card">
            <div class="timeline-head">
                <strong class="timeline-title">${escapeHtml(log.agent || `agent-${index + 1}`)} · ${escapeHtml(log.action || 'event')}</strong>
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

function buildArtifactActions(job) {
    const actions = [];
    if (job.artifacts?.stl_path) {
        actions.push(linkCard('Download STL', `${API_BASE}/jobs/${job.job_id}/artifacts/stl`, 'Manufacturable mesh export'));
    }
    if (job.artifacts?.png_path) {
        actions.push(linkCard('Download PNG', `${API_BASE}/jobs/${job.job_id}/artifacts/png`, 'Rendered preview image'));
    }
    if (job.scad_content) {
        actions.push(`
            <div class="artifact-link">
                <strong>OpenSCAD source</strong>
                <span>${escapeHtml(truncate(job.scad_content.replace(/\s+/g, ' '), 84))}</span>
            </div>
        `);
    }
    if (!actions.length) {
        actions.push('<div class="artifact-link"><strong>Artifacts pending</strong><span>Files will appear here as soon as execution finishes.</span></div>');
    }
    return actions.join('');
}

function extractParameters(job) {
    const dimensions = readStructuredDimensions(job);
    return Object.entries(dimensions)
        .filter(([, value]) => typeof value === 'number' && Number.isFinite(value))
        .map(([key, value]) => ({
            key,
            value,
            label: prettyLabel(key),
            unit: inferUnit(key),
            description: inferDescription(key),
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
    return {
        min: isDiscrete ? Math.max(1, Math.round(value * 0.5)) : roundNumber(Math.max(0, value - magnitude * 0.5), 0.1),
        max: isDiscrete ? Math.max(2, Math.round(value * 1.8)) : roundNumber(value + magnitude * 0.75 + 1, 0.1),
        step: isDiscrete ? 1 : magnitude < 10 ? 0.1 : 1,
    };
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

function linkCard(label, href, copy) {
    return `
        <a class="artifact-link" href="${escapeHtml(href)}" target="_blank" rel="noreferrer">
            <strong>${escapeHtml(label)}</strong>
            <span>${escapeHtml(copy)}</span>
        </a>
    `;
}

function initializeStlPreview(job) {
    if (typeof state.viewerCleanup === 'function') {
        state.viewerCleanup();
        state.viewerCleanup = null;
    }

    const container = elements.stlViewer;
    const placeholder = elements.viewerPlaceholder;
    const stlUrl = job?.artifacts?.stl_path ? `${API_BASE}/jobs/${job.job_id}/artifacts/stl` : null;

    if (!container || !placeholder) {
        return;
    }

    if (!stlUrl) {
        container.innerHTML = '';
        placeholder.classList.remove('hidden');
        placeholder.innerHTML = '<p>Rendering has not produced an STL yet. The viewport will light up as soon as the artifact is ready.</p>';
        return;
    }

    if (!window.THREE || !window.THREE.STLLoader || !window.THREE.OrbitControls) {
        container.innerHTML = '';
        placeholder.classList.remove('hidden');
        placeholder.innerHTML = '<p>The browser preview engine is unavailable, but the STL is ready to download.</p>';
        return;
    }

    placeholder.classList.add('hidden');
    container.innerHTML = '';

    const scene = new window.THREE.Scene();
    scene.background = new window.THREE.Color(0x2f2f2f);

    const camera = new window.THREE.PerspectiveCamera(44, container.clientWidth / container.clientHeight, 0.1, 5000);
    camera.position.set(120, 90, 120);

    const renderer = new window.THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(window.devicePixelRatio || 1);
    renderer.setSize(container.clientWidth, container.clientHeight);
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

    let mesh = null;
    let animationFrameId = null;

    const loader = new window.THREE.STLLoader();
    loader.load(
        stlUrl,
        (geometry) => {
            geometry.computeBoundingBox();
            geometry.computeVertexNormals();
            geometry.center();

            const material = new window.THREE.MeshStandardMaterial({
                color: 0x39a7ff,
                metalness: 0.14,
                roughness: 0.5,
            });

            mesh = new window.THREE.Mesh(geometry, material);
            mesh.rotation.x = -Math.PI / 2;
            scene.add(mesh);

            const size = new window.THREE.Vector3();
            geometry.boundingBox.getSize(size);
            const maxDim = Math.max(size.x, size.y, size.z, 1);
            camera.position.set(maxDim * 1.9, maxDim * 1.35, maxDim * 1.9);
            controls.target.set(0, 0, 0);
            controls.update();
        },
        undefined,
        () => {
            placeholder.classList.remove('hidden');
            placeholder.innerHTML = '<p>The STL exists, but the browser could not render it. Download is still available below.</p>';
        }
    );

    function animate() {
        animationFrameId = window.requestAnimationFrame(animate);
        controls.update();
        renderer.render(scene, camera);
    }

    animate();

    const handleResize = () => {
        const width = container.clientWidth || 1;
        const height = container.clientHeight || 1;
        camera.aspect = width / height;
        camera.updateProjectionMatrix();
        renderer.setSize(width, height);
    };

    window.addEventListener('resize', handleResize);

    state.viewerCleanup = () => {
        window.removeEventListener('resize', handleResize);
        if (animationFrameId) {
            window.cancelAnimationFrame(animationFrameId);
        }
        controls.dispose();
        renderer.dispose();
        if (mesh) {
            mesh.geometry.dispose();
            mesh.material.dispose();
        }
        container.innerHTML = '';
    };
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
    if (output?.template_choice?.template_name) {
        return `Selected ${output.template_choice.template_name} as the active generation path.`;
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
        return JSON.stringify(value);
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
    const precision = step < 1 ? String(step).split('.')[1]?.length || 1 : 0;
    return Number(value).toFixed(precision).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1');
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
