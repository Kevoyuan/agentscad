const API_BASE = 'http://localhost:8000';

const jobForm = document.getElementById('jobForm');
const jobsTableBody = document.getElementById('jobsTableBody');
const detailSection = document.getElementById('detailSection');
const detailContent = document.getElementById('detailContent');
const closeDetailBtn = document.getElementById('closeDetail');

async function fetchJobs() {
    try {
        const response = await fetch(`${API_BASE}/jobs`);
        if (!response.ok) throw new Error('Failed to fetch jobs');
        const jobs = await response.json();
        renderJobs(jobs);
    } catch (error) {
        console.error('Error fetching jobs:', error);
        jobsTableBody.innerHTML = `
            <tr>
                <td colspan="5" style="color: var(--error); text-align: center;">
                    Error loading jobs. Is the server running?
                </td>
            </tr>
        `;
    }
}

function renderJobs(jobs) {
    if (!jobs || jobs.length === 0) {
        jobsTableBody.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--text-muted);">
                    No jobs yet. Create one above.
                </td>
            </tr>
        `;
        return;
    }

    jobsTableBody.innerHTML = jobs.map(job => `
        <tr data-job-id="${job.id}">
            <td><code>${job.id}</code></td>
            <td class="request-preview" title="${escapeHtml(job.input_request)}">${escapeHtml(job.input_request)}</td>
            <td><span class="status-badge status-${job.status}">${job.status}</span></td>
            <td>${formatDate(job.created_at)}</td>
            <td>
                <button class="btn btn-secondary action-btn" onclick="viewJob('${job.id}')">View</button>
            </td>
        </tr>
    `).join('');
}

async function viewJob(jobId) {
    try {
        const response = await fetch(`${API_BASE}/jobs/${jobId}`);
        if (!response.ok) throw new Error('Failed to fetch job details');
        const job = await response.json();
        renderJobDetail(job);
    } catch (error) {
        console.error('Error fetching job details:', error);
        detailContent.innerHTML = `
            <div class="detail-error">
                <h3>Error</h3>
                <p>Failed to load job details: ${escapeHtml(error.message)}</p>
            </div>
        `;
        detailSection.classList.remove('hidden');
    }
}

function renderJobDetail(job) {
    let artifactsHtml = '';
    if (job.artifacts && Object.keys(job.artifacts).length > 0) {
        const artifactLinks = Object.entries(job.artifacts)
            .map(([type, url]) => `
                <a href="${escapeHtml(url)}" class="artifact-link" target="_blank" download>
                    ${escapeHtml(type.toUpperCase())}
                </a>
            `).join('');
        artifactsHtml = `
            <div class="detail-artifacts">
                <h3>Download Artifacts</h3>
                <div class="artifact-links">${artifactLinks}</div>
            </div>
        `;
    }

    let errorHtml = '';
    if (job.error_message) {
        errorHtml = `
            <div class="detail-error">
                <h3>Error Message</h3>
                <pre>${escapeHtml(job.error_message)}</pre>
            </div>
        `;
    }

    detailContent.innerHTML = `
        <div class="detail-grid">
            <div class="detail-item">
                <label>Job ID</label>
                <div class="value"><code>${job.id}</code></div>
            </div>
            <div class="detail-item">
                <label>Status</label>
                <div class="value status-${job.status}">${job.status}</div>
            </div>
            <div class="detail-item">
                <label>Created</label>
                <div class="value">${formatDate(job.created_at)}</div>
            </div>
            <div class="detail-item">
                <label>Updated</label>
                <div class="value">${formatDate(job.updated_at)}</div>
            </div>
        </div>
        
        <div class="detail-item" style="margin-top: var(--space-element);">
            <label>Request</label>
            <div class="value">${escapeHtml(job.input_request)}</div>
        </div>
        
        ${job.generated_code ? `
        <div class="detail-item">
            <label>Generated Code</label>
            <pre style="background: var(--bg-primary); padding: 12px; border-radius: var(--radius-sm); margin-top: 8px; overflow-x: auto; font-size: 0.875rem;">${escapeHtml(job.generated_code)}</pre>
        </div>
        ` : ''}
        
        ${artifactsHtml}
        ${errorHtml}
    `;
    detailSection.classList.remove('hidden');
}

jobForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(jobForm);
    const inputRequest = formData.get('input_request');
    
    if (!inputRequest.trim()) return;
    
    const submitBtn = jobForm.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Creating...';
    
    try {
        const response = await fetch(`${API_BASE}/jobs`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                input_request: inputRequest,
            }),
        });
        
        if (!response.ok) throw new Error('Failed to create job');
        
        const job = await response.json();
        jobForm.reset();
        await fetchJobs();
        viewJob(job.id);
        
        // Start processing
        fetch(`${API_BASE}/jobs/${job.id}/process`, { method: 'POST' });
        
    } catch (error) {
        console.error('Error creating job:', error);
        alert('Failed to create job: ' + error.message);
    } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Create Job';
    }
});

closeDetailBtn.addEventListener('click', () => {
    detailSection.classList.add('hidden');
});

function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleString();
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initial load
fetchJobs();
