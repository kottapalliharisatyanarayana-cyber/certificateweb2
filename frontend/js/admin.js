/**
 * Admin Management Portal JavaScript
 * Sri Vasavi Engineering College
 */

let authToken = localStorage.getItem('cert_admin_token') || null;
let currentAdminUser = null;
let currentTemplate = null;
let eventsCache = [];
let studentCurrentPage = 1;
let currentUploadMode = 'excel'; // 'excel' or 'pdf'
let selectedFile = null;

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupDragAndDrop();
  checkAuth();
});

// Check JWT Auth status
// Safe fetch helper that handles text/HTML error responses gracefully
async function safeFetch(url, options = {}) {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      data = {
        success: false,
        message: text.replace(/<[^>]*>/g, '').trim().slice(0, 180) || `Server returned HTTP ${res.status}`
      };
    }
    return { res, data };
  } catch (netErr) {
    return {
      res: { ok: false, status: 0 },
      data: { success: false, message: 'Network error: ' + netErr.message }
    };
  }
}

// Check JWT Auth status
async function checkAuth() {
  if (!authToken) {
    showLoginView();
    return;
  }

  try {
    const { res, data } = await safeFetch('/api/auth/verify', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (res.ok && data.success) {
      currentAdminUser = data.user;
      showDashboardView();
      loadInitialData();
    } else {
      localStorage.removeItem('cert_admin_token');
      authToken = null;
      currentAdminUser = null;
      showLoginView();
    }
  } catch (err) {
    console.error('Auth verification error:', err);
    showLoginView();
  }
}

function showLoginView() {
  document.getElementById('loginView').style.display = 'block';
  document.getElementById('dashboardView').style.display = 'none';
  document.getElementById('logoutBtn').style.display = 'none';
  const secBtn = document.getElementById('securityNavBtn');
  if (secBtn) secBtn.style.display = 'none';
  document.getElementById('dbStatusBadge').style.display = 'none';
}

function showDashboardView() {
  document.getElementById('loginView').style.display = 'none';
  document.getElementById('dashboardView').style.display = 'grid';
  document.getElementById('logoutBtn').style.display = 'inline-flex';
  const secBtn = document.getElementById('securityNavBtn');
  if (secBtn) secBtn.style.display = 'inline-flex';
  updateAdminDisplay();
}

// Handle Admin Sign In
async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('username').value.trim();
  const password = document.getElementById('password').value;
  const submitBtn = document.getElementById('loginSubmitBtn');

  submitBtn.disabled = true;
  submitBtn.textContent = 'Authenticating...';

  try {
    const { res, data } = await safeFetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In to Dashboard';

    if (res.ok && data.success) {
      authToken = data.token;
      currentAdminUser = data.user;
      localStorage.setItem('cert_admin_token', authToken);
      showToast('Welcome back, Administrator!', 'success');
      showDashboardView();
      loadInitialData();
    } else {
      showToast(data.message || 'Invalid username or password', 'error');
    }
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Sign In to Dashboard';
    showToast('Login failed: ' + err.message, 'error');
  }
}

// Handle Admin Logout
function handleLogout() {
  localStorage.removeItem('cert_admin_token');
  authToken = null;
  currentAdminUser = null;
  showToast('Logged out successfully', 'info');
  showLoginView();
}

// Load initial data on login
async function loadInitialData() {
  await Promise.all([
    loadStats(),
    loadEvents(),
    loadTemplateStudio(),
    loadStudents(1)
  ]);
}

// Tab navigation
function switchTab(tabId) {
  const links = document.querySelectorAll('.sidebar-link');
  links.forEach(l => l.classList.remove('active'));
  const currentLink = Array.from(links).find(l => l.getAttribute('onclick')?.includes(tabId));
  if (currentLink) currentLink.classList.add('active');

  const sections = document.querySelectorAll('.admin-main > section');
  sections.forEach(s => s.style.display = 'none');

  const target = document.getElementById(`tab-${tabId}`);
  if (target) {
    target.style.display = 'block';
  }

  if (tabId === 'overview') loadStats();
  if (tabId === 'students') loadStudents(studentCurrentPage);
  if (tabId === 'events') loadEvents();
  if (tabId === 'event-certs') initEventCertsTab();
  if (tabId === 'manual') renderManualEventsCheckboxes();
  if (tabId === 'upload') populatePdfEventSelect();
  if (tabId === 'template') drawStudioPreview();
  if (tabId === 'credentials') {
    updateAdminDisplay();
    resetCredentialsForm();
  }
}

// 1. STATS
async function loadStats() {
  try {
    const res = await fetch('/api/stats', {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();

    if (data.success && data.stats) {
      document.getElementById('statStudents').textContent = data.stats.totalStudents || 0;
      document.getElementById('statEvents').textContent = data.stats.totalEvents || 0;
      document.getElementById('statParticipations').textContent = data.stats.totalParticipations || 0;
      
      const dbBadge = document.getElementById('dbStatusBadge');
      const statDbMode = document.getElementById('statDbMode');
      const sidebarTemplate = document.getElementById('sidebarActiveTemplate');
      const sidebarCoordTemplate = document.getElementById('sidebarActiveCoordTemplate');
      const sidebarApprecTemplate = document.getElementById('sidebarActiveApprecTemplate');

      statDbMode.textContent = data.stats.dbMode || 'Connected';
      if (sidebarTemplate) sidebarTemplate.textContent = data.stats.activeTemplate || 'Sri Vasavi College (Participation)';
      if (sidebarCoordTemplate) sidebarCoordTemplate.textContent = data.stats.activeCoordTemplate || 'Certificate of Coordination';
      if (sidebarApprecTemplate) sidebarApprecTemplate.textContent = data.stats.activeApprecTemplate || 'Certificate of Appreciation';

      dbBadge.style.display = 'inline-flex';
      dbBadge.textContent = `● ${data.stats.dbMode || 'DB Connected'}`;
    }
  } catch (err) {
    console.error('Stats error:', err);
  }
}

// 2. EXCEL & PDF DRAG & DROP & UPLOAD
function setUploadMode(mode) {
  currentUploadMode = mode;
  selectedFile = null;

  const btnExcel = document.getElementById('modeBtnExcel');
  const btnPdf = document.getElementById('modeBtnPdf');
  const boxExcel = document.getElementById('excelUploadBox');
  const boxPdf = document.getElementById('pdfUploadBox');
  const fileInfoArea = document.getElementById('fileInfoArea');
  const uploadResultArea = document.getElementById('uploadResultArea');

  fileInfoArea.style.display = 'none';
  uploadResultArea.style.display = 'none';

  if (mode === 'excel') {
    btnExcel.className = 'btn btn-primary';
    btnPdf.className = 'btn btn-secondary';
    boxExcel.style.display = 'block';
    boxPdf.style.display = 'none';
  } else {
    btnExcel.className = 'btn btn-secondary';
    btnPdf.className = 'btn btn-primary';
    boxExcel.style.display = 'none';
    boxPdf.style.display = 'block';
    populatePdfEventSelect();
  }
}

function setupDragAndDrop() {
  ['dropzoneExcel', 'dropzonePdf'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;

    ['dragenter', 'dragover'].forEach(name => {
      el.addEventListener(name, (e) => {
        e.preventDefault();
        el.classList.add('dragover');
      });
    });

    ['dragleave', 'drop'].forEach(name => {
      el.addEventListener(name, (e) => {
        e.preventDefault();
        el.classList.remove('dragover');
      });
    });

    el.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files.length > 0) {
        handleFileSelected({ target: { files } }, id === 'dropzonePdf' ? 'pdf' : 'excel');
      }
    });
  });
}

function handleFileSelected(e, type) {
  const file = e.target.files[0];
  if (!file) return;

  selectedFile = file;
  const fileInfoArea = document.getElementById('fileInfoArea');
  const selectedFileName = document.getElementById('selectedFileName');
  const selectedFileSize = document.getElementById('selectedFileSize');

  selectedFileName.textContent = `${type.toUpperCase()}: ${file.name}`;
  selectedFileSize.textContent = `(${(file.size / 1024).toFixed(1)} KB)`;
  fileInfoArea.style.display = 'flex';
}

function populatePdfEventSelect() {
  const select = document.getElementById('pdfEventSelect');
  if (!select) return;

  const currentVal = select.value;
  select.innerHTML = '<option value="">-- Auto-detect event name from PDF header --</option>';

  eventsCache.forEach(evt => {
    const opt = document.createElement('option');
    opt.value = evt.event_name;
    opt.textContent = evt.event_name;
    select.appendChild(opt);
  });

  if (currentVal) select.value = currentVal;
}

async function startFileUpload() {
  if (!selectedFile) {
    showToast('Please choose a file to upload.', 'error');
    return;
  }

  const uploadBtn = document.getElementById('startUploadBtn');
  uploadBtn.disabled = true;
  uploadBtn.textContent = 'Processing & Extracting Records...';

  const formData = new FormData();
  formData.append('file', selectedFile);

  const endpoint = currentUploadMode === 'pdf' ? '/api/upload/pdf' : '/api/upload/excel';

  if (currentUploadMode === 'pdf') {
    const chosenEvent = document.getElementById('pdfEventSelect').value;
    if (chosenEvent) {
      formData.append('event_name', chosenEvent);
    }
  }

  try {
    const { res, data } = await safeFetch(endpoint, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    uploadBtn.disabled = false;
    uploadBtn.textContent = '⚡ Process & Import Records';

    if (res.ok && data.success) {
      showToast(data.message, 'success');
      displayUploadResults(data, currentUploadMode);
      loadStats();
      loadEvents();
      loadStudents(1);
    } else {
      showToast(data.message || 'File processing failed', 'error');
    }
  } catch (err) {
    uploadBtn.disabled = false;
    uploadBtn.textContent = '⚡ Process & Import Records';
    showToast('Upload error: ' + err.message, 'error');
  }
}

function displayUploadResults(data, mode) {
  const resultArea = document.getElementById('uploadResultArea');
  const summaryGrid = document.getElementById('uploadSummaryGrid');
  const invalidArea = document.getElementById('invalidRecordsTableArea');
  const invalidBody = document.getElementById('invalidRecordsBody');

  resultArea.style.display = 'block';

  const s = data.summary;
  if (mode === 'pdf') {
    summaryGrid.innerHTML = `
      <div class="card" style="padding: 1rem; text-align: center; margin: 0;">
        <p style="font-size: 0.8rem; color: var(--text-muted);">PDF Pages</p>
        <h3 style="font-size: 1.5rem; color: var(--primary);">${s.numPages || 1}</h3>
      </div>
      <div class="card" style="padding: 1rem; text-align: center; margin: 0;">
        <p style="font-size: 0.8rem; color: var(--text-muted);">Extracted Students</p>
        <h3 style="font-size: 1.5rem; color: var(--success);">${s.totalExtracted}</h3>
      </div>
      <div class="card" style="padding: 1rem; text-align: center; margin: 0;">
        <p style="font-size: 0.8rem; color: var(--text-muted);">Event Assigned</p>
        <h3 style="font-size: 1.1rem; color: #2563eb; margin-top: 0.35rem;">${escapeHtml(s.eventName)}</h3>
      </div>
      <div class="card" style="padding: 1rem; text-align: center; margin: 0;">
        <p style="font-size: 0.8rem; color: var(--text-muted);">Participations</p>
        <h3 style="font-size: 1.5rem; color: #7c3aed;">${s.participationsCreated}</h3>
      </div>
    `;
    invalidArea.style.display = 'none';
  } else {
    summaryGrid.innerHTML = `
      <div class="card" style="padding: 1rem; text-align: center; margin: 0;">
        <p style="font-size: 0.8rem; color: var(--text-muted);">Total Rows</p>
        <h3 style="font-size: 1.5rem; color: var(--primary);">${s.totalRows}</h3>
      </div>
      <div class="card" style="padding: 1rem; text-align: center; margin: 0;">
        <p style="font-size: 0.8rem; color: var(--text-muted);">Valid Records</p>
        <h3 style="font-size: 1.5rem; color: var(--success);">${s.validCount}</h3>
      </div>
      <div class="card" style="padding: 1rem; text-align: center; margin: 0;">
        <p style="font-size: 0.8rem; color: var(--text-muted);">New Students</p>
        <h3 style="font-size: 1.5rem; color: #2563eb;">${s.studentsCreated}</h3>
      </div>
      <div class="card" style="padding: 1rem; text-align: center; margin: 0;">
        <p style="font-size: 0.8rem; color: var(--text-muted);">Participations</p>
        <h3 style="font-size: 1.5rem; color: #7c3aed;">${s.participationsCreated}</h3>
      </div>
    `;

    if (data.invalidRecords && data.invalidRecords.length > 0) {
      invalidArea.style.display = 'block';
      invalidBody.innerHTML = data.invalidRecords.map(inv => `
        <tr>
          <td>${inv.row}</td>
          <td><strong>${escapeHtml(inv.roll_no || 'Missing')}</strong></td>
          <td>${escapeHtml(inv.name || 'Missing')}</td>
          <td style="color: var(--danger);">${escapeHtml(inv.errors.join(', '))}</td>
        </tr>
      `).join('');
    } else {
      invalidArea.style.display = 'none';
    }
  }
}

// 3. EVENTS MANAGEMENT
async function loadEvents() {
  try {
    const res = await fetch('/api/events');
    const data = await res.json();
    if (data.success) {
      eventsCache = data.events || [];
      renderEventsTable();
      renderManualEventsCheckboxes();
      populatePdfEventSelect();
      populateEventCertSelect();
      populateEventTemplateDropdowns();
    }
  } catch (err) {
    console.error('Events load error:', err);
  }
}

function renderEventsTable() {
  const tbody = document.getElementById('eventsTableBody');
  if (!tbody) return;

  if (eventsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; padding: 2rem;">No events registered yet.</td></tr>';
    return;
  }

  tbody.innerHTML = eventsCache.map(evt => {
    // Template badge
    let templateBadge = '';
    if (evt.use_main_template !== false) {
      templateBadge = '<span class="badge badge-success" style="font-size: 0.725rem;" title="Official Institutional Participation & Coordinator Templates">🏛️ Institutional Main</span>';
    } else {
      const partName = evt.template ? evt.template.template_name : 'Active Participation';
      const coordName = evt.coordinator_template ? evt.coordinator_template.template_name : 'Active Coordination';
      templateBadge = `
        <div style="display: flex; flex-direction: column; gap: 0.2rem;">
          <span class="badge badge-primary" style="font-size: 0.7rem;" title="Custom Participant Template">🎓 ${escapeHtml(partName)}</span>
          <span class="badge badge-warning" style="font-size: 0.7rem;" title="Custom Coordinator Template">⭐ ${escapeHtml(coordName)}</span>
        </div>
      `;
    }

    const participantsBadge = `<span class="badge badge-primary">${evt.participantCount || 0} students</span>` +
      (evt.coordinatorCount > 0 ? ` <span class="badge badge-warning" style="margin-left: 0.25rem;">⭐ ${evt.coordinatorCount} coords</span>` : '');

    return `
      <tr>
        <td>
          <strong style="color: var(--text-main); font-size: 0.95rem;">${escapeHtml(evt.event_name)}</strong>
          ${evt.category && evt.category !== 'Separate Event' ? `<br><small style="color: var(--text-muted); font-size: 0.75rem;">${escapeHtml(evt.category)}</small>` : ''}
        </td>
        <td style="white-space: nowrap; font-size: 0.85rem;">${escapeHtml(evt.event_date || 'N/A')}</td>
        <td>${templateBadge}</td>
        <td>${participantsBadge}</td>
        <td style="text-align: right; white-space: nowrap;">
          <div style="display: inline-flex; gap: 0.35rem;">
            <button class="btn btn-secondary btn-sm" onclick="openEditEventModal('${evt._id}')" title="Edit Event Details & Templates">
              ✏️ Edit
            </button>
            <button class="btn btn-danger btn-sm" onclick="deleteEvent('${evt._id}', '${escapeHtml(evt.event_name)}')">
              Delete
            </button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

function toggleNewEventTemplateConfig() {
  const cb = document.getElementById('newEventUseMainTemplate');
  const group = document.getElementById('newEventCustomTemplatesGroup');
  if (group && cb) {
    group.style.display = cb.checked ? 'none' : 'block';
  }
}

function toggleEditEventTemplateConfig() {
  const cb = document.getElementById('editEventUseMainTemplate');
  const group = document.getElementById('editEventCustomTemplatesGroup');
  if (group && cb) {
    group.style.display = cb.checked ? 'none' : 'block';
  }
}

function openEditEventModal(eventId) {
  const event = eventsCache.find(e => e._id === eventId);
  if (!event) return;

  document.getElementById('editEventId').value = event._id;
  document.getElementById('editEventName').value = event.event_name || '';
  document.getElementById('editEventDate').value = event.event_date || '';
  document.getElementById('editEventCategory').value = event.category || 'Separate Event';
  document.getElementById('editEventDesc').value = event.description || '';

  const useMain = event.use_main_template !== false;
  document.getElementById('editEventUseMainTemplate').checked = useMain;
  toggleEditEventTemplateConfig();

  populateEventTemplateDropdowns();

  const partId = event.template ? (event.template._id || event.template) : '';
  const coordId = event.coordinator_template ? (event.coordinator_template._id || event.coordinator_template) : '';
  const apprecId = event.appreciation_template ? (event.appreciation_template._id || event.appreciation_template) : '';

  if (document.getElementById('editEventParticipantTemplate')) {
    document.getElementById('editEventParticipantTemplate').value = partId || '';
  }
  if (document.getElementById('editEventCoordinatorTemplate')) {
    document.getElementById('editEventCoordinatorTemplate').value = coordId || '';
  }
  if (document.getElementById('editEventAppreciationTemplate')) {
    document.getElementById('editEventAppreciationTemplate').value = apprecId || '';
  }

  document.getElementById('editEventModal').classList.add('active');
}

function closeEditEventModal() {
  const modal = document.getElementById('editEventModal');
  if (modal) modal.classList.remove('active');
}

async function handleUpdateEvent(e) {
  e.preventDefault();
  const id = document.getElementById('editEventId').value;
  const name = document.getElementById('editEventName').value.trim();
  const date = document.getElementById('editEventDate').value.trim();
  const category = document.getElementById('editEventCategory').value.trim();
  const desc = document.getElementById('editEventDesc').value.trim();
  const useMain = document.getElementById('editEventUseMainTemplate').checked;
  const partTpl = document.getElementById('editEventParticipantTemplate').value || null;
  const coordTpl = document.getElementById('editEventCoordinatorTemplate').value || null;
  const apprecTpl = document.getElementById('editEventAppreciationTemplate')?.value || null;

  const submitBtn = document.getElementById('editEventSubmitBtn');
  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Saving...';
  }

  try {
    const res = await fetch(`/api/events/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        event_name: name,
        event_date: date,
        category,
        description: desc,
        use_main_template: useMain,
        template: useMain ? null : partTpl,
        coordinator_template: useMain ? null : coordTpl,
        appreciation_template: useMain ? null : apprecTpl
      })
    });

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes';
    }

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Event "${name}" updated successfully!`, 'success');
      closeEditEventModal();
      await loadEvents();
      if (typeof currentEventCertEventId !== 'undefined' && currentEventCertEventId === id) {
        await loadEventCertificates(id);
      }
      await loadTemplateLibrary();
    } else {
      showToast(data.message || 'Failed to update event', 'error');
    }
  } catch (err) {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Save Changes';
    }
    showToast('Failed to update event: ' + err.message, 'error');
  }
}

async function handleCreateEvent(e) {
  e.preventDefault();
  const name = document.getElementById('newEventName').value.trim();
  const date = document.getElementById('newEventDate').value.trim();
  const desc = document.getElementById('newEventDesc').value.trim();
  const useMain = document.getElementById('newEventUseMainTemplate') ? document.getElementById('newEventUseMainTemplate').checked : true;
  const participantTemplate = document.getElementById('newEventParticipantTemplate')?.value || null;
  const coordinatorTemplate = document.getElementById('newEventCoordinatorTemplate')?.value || null;
  const appreciationTemplate = document.getElementById('newEventAppreciationTemplate')?.value || null;

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        event_name: name,
        event_date: date,
        description: desc,
        use_main_template: useMain,
        template: useMain ? null : participantTemplate,
        coordinator_template: useMain ? null : coordinatorTemplate,
        appreciation_template: useMain ? null : appreciationTemplate
      })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Event "${name}" created successfully!`, 'success');
      document.getElementById('newEventName').value = '';
      document.getElementById('newEventDate').value = '';
      document.getElementById('newEventDesc').value = '';
      if (document.getElementById('newEventUseMainTemplate')) {
        document.getElementById('newEventUseMainTemplate').checked = true;
        toggleNewEventTemplateConfig();
      }
      await loadEvents();
      await loadTemplateLibrary();
      loadStats();
    } else {
      showToast(data.message || 'Failed to create event', 'error');
    }
  } catch (err) {
    showToast('Failed to create event: ' + err.message, 'error');
  }
}

async function promptNewEventInline() {
  const eventName = prompt('Enter New Event Name:');
  if (!eventName || !eventName.trim()) return;

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        event_name: eventName.trim(),
        event_date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Event "${eventName}" created!`, 'success');
      await loadEvents();
      // Auto-check newly created event
      const cb = document.querySelector(`input[name="manualEvent"][value="${data.event._id}"]`);
      if (cb) cb.checked = true;
    } else {
      showToast(data.message || 'Failed to create event', 'error');
    }
  } catch (err) {
    showToast('Error: ' + err.message, 'error');
  }
}

async function deleteEvent(id, name) {
  if (!confirm(`Are you sure you want to delete "${name}"? This will also remove participation records for this event.`)) {
    return;
  }

  try {
    const res = await fetch(`/api/events/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Event deleted successfully`, 'success');
      loadEvents();
      loadStats();
      loadTemplateLibrary();
    } else {
      showToast(data.message || 'Failed to delete event', 'error');
    }
  } catch (err) {
    showToast('Error deleting event: ' + err.message, 'error');
  }
}

function renderManualEventsCheckboxes() {
  const container = document.getElementById('manualEventsList');
  if (!container) return;

  if (eventsCache.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); font-size: 0.85rem;">No events available. Click "+ Create New Event" above to add one.</p>';
    return;
  }

  container.innerHTML = eventsCache.map(evt => `
    <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.875rem; cursor: pointer; background: #fff; padding: 0.35rem 0.65rem; border-radius: var(--radius-sm); border: 1px solid var(--surface-border);">
      <input type="checkbox" name="manualEvent" value="${evt._id}">
      <span>${escapeHtml(evt.event_name)}</span>
    </label>
  `).join('');
}

// 4. MANUAL PARTICIPANT ENTRY
function clearManualForm() {
  document.getElementById('manualRoll').value = '';
  document.getElementById('manualName').value = '';
  document.getElementById('manualEmail').value = '';
  document.querySelectorAll('input[name="manualEvent"]:checked').forEach(cb => cb.checked = false);
}

async function handleManualStudentSubmit(e) {
  e.preventDefault();
  const roll_no = document.getElementById('manualRoll').value.trim().toUpperCase();
  const name = document.getElementById('manualName').value.trim();
  const branch = document.getElementById('manualBranch').value.trim();
  const semester = document.getElementById('manualSem').value.trim();
  const email = document.getElementById('manualEmail').value.trim();

  const checkboxes = document.querySelectorAll('input[name="manualEvent"]:checked');
  const eventIds = Array.from(checkboxes).map(cb => cb.value);

  try {
    const { res, data } = await safeFetch('/api/students', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ roll_no, name, branch, semester, email, eventIds })
    });

    if (res.ok && data.success) {
      showToast(`Participant ${roll_no} saved successfully!`, 'success');
      clearManualForm();
      loadStats();
      loadStudents(1);
    } else {
      showToast(data.message || 'Failed to save participant', 'error');
    }
  } catch (err) {
    showToast('Error saving participant: ' + err.message, 'error');
  }
}

// 5. STUDENTS MANAGEMENT & EDIT MODAL
let studentSearchDebounce = null;
function handleStudentSearchInput(val) {
  clearTimeout(studentSearchDebounce);
  studentSearchDebounce = setTimeout(() => {
    loadStudents(1);
  }, 350);
}

async function loadStudents(page = 1) {
  studentCurrentPage = page;
  const searchInput = document.getElementById('studentSearchInput');
  const search = searchInput ? searchInput.value.trim() : '';

  const tbody = document.getElementById('studentsTableBody');
  if (!tbody) return;

  try {
    const { res, data } = await safeFetch(`/api/students?page=${page}&limit=15&search=${encodeURIComponent(search)}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (res.ok && data.success) {
      const students = data.students || [];
      if (students.length === 0) {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 2rem;">No student records match the query.</td></tr>';
      } else {
        tbody.innerHTML = students.map(s => `
          <tr>
            <td><strong>${escapeHtml(s.roll_no)}</strong></td>
            <td>${escapeHtml(s.name)}</td>
            <td>${escapeHtml(s.branch || '-')}</td>
            <td>${escapeHtml(s.semester || '-')}</td>
            <td>
              <span class="badge badge-primary">${s.eventsCount || 0} event${s.eventsCount === 1 ? '' : 's'}</span>
              <span style="font-size: 0.775rem; color: var(--text-muted); margin-left: 0.35rem;">(${escapeHtml((s.events || []).slice(0, 2).join(', '))}${s.events.length > 2 ? '...' : ''})</span>
            </td>
            <td style="text-align: right; white-space: nowrap;">
              <button class="btn btn-secondary btn-sm" onclick="openEditStudentModal('${s._id}')">✏️ Edit</button>
              <button class="btn btn-danger btn-sm" onclick="deleteStudent('${s._id}', '${escapeHtml(s.roll_no)}')">🗑️</button>
            </td>
          </tr>
        `).join('');
      }

      const p = data.pagination;
      document.getElementById('pageInfo').textContent = `Page ${p.page} of ${p.pages || 1} (${p.total} total)`;
      document.getElementById('prevPageBtn').disabled = p.page <= 1;
      document.getElementById('nextPageBtn').disabled = p.page >= p.pages;
    }
  } catch (err) {
    console.error('Students load error:', err);
  }
}

function changeStudentPage(delta) {
  loadStudents(studentCurrentPage + delta);
}

// Edit Student Modal Handling
async function openEditStudentModal(studentId) {
  try {
    const { res, data } = await safeFetch(`/api/students/${studentId}`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!res.ok || !data.success) {
      showToast(data.message || 'Failed to load student details', 'error');
      return;
    }

    const s = data.student;
    document.getElementById('editStudentId').value = s._id;
    document.getElementById('editRoll').value = s.roll_no || '';
    document.getElementById('editName').value = s.name || '';
    document.getElementById('editBranch').value = s.branch || '';
    document.getElementById('editSem').value = s.semester || '';
    document.getElementById('editEmail').value = s.email || '';

    const participatingEventIds = new Set(
      (data.participations || []).filter(p => p.participated).map(p => p.event?._id || p.event)
    );

    const editList = document.getElementById('editEventsList');
    editList.innerHTML = eventsCache.map(evt => `
      <label style="display: flex; align-items: center; gap: 0.5rem; font-size: 0.85rem; cursor: pointer; background: #fff; padding: 0.35rem 0.5rem; border-radius: var(--radius-sm); border: 1px solid var(--surface-border);">
        <input type="checkbox" name="editEvent" value="${evt._id}" ${participatingEventIds.has(evt._id) ? 'checked' : ''}>
        <span>${escapeHtml(evt.event_name)}</span>
      </label>
    `).join('');

    const modal = document.getElementById('editStudentModal');
    modal.classList.add('active');
  } catch (err) {
    showToast('Failed to open editor: ' + err.message, 'error');
  }
}

function closeEditModal() {
  document.getElementById('editStudentModal').classList.remove('active');
}

async function saveEditedStudent() {
  const studentId = document.getElementById('editStudentId').value;
  const roll_no = document.getElementById('editRoll').value.trim().toUpperCase();
  const name = document.getElementById('editName').value.trim();
  const branch = document.getElementById('editBranch').value.trim();
  const semester = document.getElementById('editSem').value.trim();
  const email = document.getElementById('editEmail').value.trim();

  const checkboxes = document.querySelectorAll('input[name="editEvent"]:checked');
  const eventIds = Array.from(checkboxes).map(cb => cb.value);

  try {
    const { res, data } = await safeFetch(`/api/students/${studentId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ roll_no, name, branch, semester, email, eventIds })
    });

    if (res.ok && data.success) {
      showToast(`Participant ${roll_no} updated successfully!`, 'success');
      closeEditModal();
      loadStudents(studentCurrentPage);
      loadStats();
    } else {
      showToast(data.message || 'Failed to update student', 'error');
    }
  } catch (err) {
    showToast('Update error: ' + err.message, 'error');
  }
}

async function deleteStudent(id, roll) {
  if (!confirm(`Delete student ${roll} and their participation records?`)) return;

  try {
    const { res, data } = await safeFetch(`/api/students/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (res.ok && data.success) {
      showToast(`Student ${roll} deleted`, 'success');
      loadStudents(studentCurrentPage);
      loadStats();
    } else {
      showToast(data.message || 'Failed to delete student', 'error');
    }
  } catch (err) {
    showToast('Delete error: ' + err.message, 'error');
  }
}

// 6. TEMPLATE STUDIO & TEMPLATE LIBRARY (DUAL-MODE & LIVE TUNING)
let currentTemplateType = 'participation';
let allTemplatesList = [];

async function loadTemplateStudio(templateId) {
  try {
    // 1. Refresh templates library and selector dropdowns
    await loadTemplateLibrary();

    // 2. Fetch active template for type, or specific template by id
    let url = `/api/templates/active?type=${encodeURIComponent(currentTemplateType)}`;
    if (templateId) {
      url = `/api/templates/${templateId}`;
    }

    const res = await fetch(url, {
      headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
    });
    const data = await res.json();

    if (res.ok && data.success && data.template) {
      currentTemplate = data.template;
      currentTemplateType = currentTemplate.template_type || currentTemplateType;

      // Update UI active badges and pills
      updateStudioUIState();
      populateStudioInputs(currentTemplate.fields_config, currentTemplateType);
      await drawStudioPreview();

      // Sidebar active templates are managed strictly via loadStats() and manual activation
    }
  } catch (err) {
    console.error('Template load error:', err);
  }
}

async function switchStudioTemplateType(type) {
  currentTemplateType = type;
  updateStudioUIState();
  await loadTemplateStudio();
}

function updateStudioUIState() {
  const btnPart = document.getElementById('btnStudioTypePart');
  const btnCoord = document.getElementById('btnStudioTypeCoord');
  const btnApprec = document.getElementById('btnStudioTypeApprec');
  const typeBadge = document.getElementById('studioTypeBadge');
  const activeBadge = document.getElementById('studioActiveBadge');
  const btnActivate = document.getElementById('btnStudioActivate');
  const selector = document.getElementById('studioTemplateSelector');
  const groupPosition = document.getElementById('group-position-line');
  const groupEvents = document.getElementById('group-events-line');
  const noticeCoord = document.getElementById('coordinatorTemplateNotice');
  const noticeApprec = document.getElementById('appreciationTemplateNotice');

  const isCoord = (currentTemplateType === 'coordination');
  const isApprec = (currentTemplateType === 'appreciation');

  if (btnPart) {
    btnPart.className = (!isCoord && !isApprec) ? 'template-pill-btn active' : 'template-pill-btn';
  }
  if (btnCoord) {
    btnCoord.className = isCoord ? 'template-pill-btn active' : 'template-pill-btn';
  }
  if (btnApprec) {
    btnApprec.className = isApprec ? 'template-pill-btn active' : 'template-pill-btn';
  }

  if (typeBadge && currentTemplate) {
    if (isCoord) {
      typeBadge.textContent = '⭐ Coordination';
      typeBadge.className = 'badge badge-warning';
    } else if (isApprec) {
      typeBadge.textContent = '🏅 Appreciation';
      typeBadge.className = 'badge badge-success';
    } else {
      typeBadge.textContent = '🎓 Participation';
      typeBadge.className = 'badge badge-primary';
    }
  }

  // Active badge and manual activation button
  if (currentTemplate) {
    if (currentTemplate.is_active) {
      if (activeBadge) activeBadge.style.display = 'inline-block';
      if (btnActivate) btnActivate.style.display = 'none';
    } else {
      if (activeBadge) activeBadge.style.display = 'none';
      if (btnActivate) {
        btnActivate.style.display = 'inline-block';
        const tplName = isCoord ? 'Coordinator' : isApprec ? 'Appreciation' : 'Participation';
        btnActivate.textContent = `⭐ Set as Active ${tplName} Template`;
      }
    }
  }

  if (selector && currentTemplate) {
    selector.value = currentTemplate._id;
  }

  // Position line is ONLY for Appreciation templates
  if (groupPosition) {
    groupPosition.style.display = isApprec ? 'block' : 'none';
  }

  // Events line is for Participation and Appreciation templates, hidden for Coordinator template
  if (groupEvents) {
    groupEvents.style.display = isCoord ? 'none' : 'block';
  }

  // Notices
  if (noticeCoord) {
    noticeCoord.style.display = isCoord ? 'block' : 'none';
  }
  if (noticeApprec) {
    noticeApprec.style.display = isApprec ? 'block' : 'none';
  }
}

function populateStudioInputs(cfg, templateType) {
  if (!cfg) return;

  setInputValue('coord-name-x', cfg.name?.x || 350);
  setInputValue('coord-name-y', cfg.name?.y || 355);
  setInputValue('coord-name-size', cfg.name?.fontSize || 20);

  setInputValue('coord-semester-x', cfg.semester?.x || 125);
  setInputValue('coord-semester-y', cfg.semester?.y || 382);
  setInputValue('coord-semester-size', cfg.semester?.fontSize || 16);

  setInputValue('coord-branch-x', cfg.branch?.x || 360);
  setInputValue('coord-branch-y', cfg.branch?.y || 382);
  setInputValue('coord-branch-size', cfg.branch?.fontSize || 16);

  setInputValue('coord-roll-x', cfg.roll_no?.x || 690);
  setInputValue('coord-roll-y', cfg.roll_no?.y || 382);
  setInputValue('coord-roll-size', cfg.roll_no?.fontSize || 16);

  setInputValue('coord-position-x', cfg.position?.x || 210);
  setInputValue('coord-position-y', cfg.position?.y || 409);
  setInputValue('coord-position-size', cfg.position?.fontSize || 17);

  setInputValue('coord-events-x', cfg.events?.x || 400);
  setInputValue('coord-events-y', cfg.events?.y || 409);
  setInputValue('coord-events-size', cfg.events?.fontSize || 16);

  const isCoord = (templateType === 'coordination');
  const isApprec = (templateType === 'appreciation');
  const groupPosition = document.getElementById('group-position-line');
  const groupEvents = document.getElementById('group-events-line');
  if (groupPosition) {
    groupPosition.style.display = isApprec ? 'block' : 'none';
  }
  if (groupEvents) {
    groupEvents.style.display = isCoord ? 'none' : 'block';
  }

  const noticeCoord = document.getElementById('coordinatorTemplateNotice');
  if (noticeCoord) {
    noticeCoord.style.display = isCoord ? 'block' : 'none';
  }
  const noticeApprec = document.getElementById('appreciationTemplateNotice');
  if (noticeApprec) {
    noticeApprec.style.display = isApprec ? 'block' : 'none';
  }
}

function setInputValue(id, val) {
  const el = document.getElementById(id);
  if (el) el.value = val;
}

function getInputValue(id, defaultVal = 0) {
  const el = document.getElementById(id);
  return el ? parseInt(el.value, 10) || defaultVal : defaultVal;
}

function updateStudioLive() {
  drawStudioPreview();
}

async function drawStudioPreview() {
  const canvas = document.getElementById('studioCanvas');
  if (!canvas || !currentTemplate) return;

  const ctx = canvas.getContext('2d');
  canvas.width = currentTemplate.fields_config?.canvas_width || 1024;
  canvas.height = currentTemplate.fields_config?.canvas_height || 682;

  const defaultImage = currentTemplate.template_type === 'coordination'
    ? '/templates/svec_coordinator_template.jpg'
    : currentTemplate.template_type === 'appreciation'
      ? '/templates/svec_appreciation_template.jpg'
      : '/templates/svec_template.jpg';

  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => {
      if (img.src && !img.src.includes(defaultImage)) {
        console.warn('Template image failed to load, falling back:', currentTemplate.template_file);
        img.onerror = () => reject(new Error('Failed to load template image'));
        img.src = defaultImage;
      } else {
        reject(new Error('Failed to load template image'));
      }
    };
    img.src = currentTemplate.template_file || defaultImage;
  });

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const nameX = getInputValue('coord-name-x', 350);
  const nameY = getInputValue('coord-name-y', 355);
  const nameSize = getInputValue('coord-name-size', 20);

  const semX = getInputValue('coord-semester-x', 125);
  const semY = getInputValue('coord-semester-y', 382);
  const semSize = getInputValue('coord-semester-size', 16);

  const branchX = getInputValue('coord-branch-x', 360);
  const branchY = getInputValue('coord-branch-y', 382);
  const branchSize = getInputValue('coord-branch-size', 16);

  const rollX = getInputValue('coord-roll-x', 690);
  const rollY = getInputValue('coord-roll-y', 382);
  const rollSize = getInputValue('coord-roll-size', 16);

  const posX = getInputValue('coord-position-x', 210);
  const posY = getInputValue('coord-position-y', 409);
  const posSize = getInputValue('coord-position-size', 17);

  const evtX = getInputValue('coord-events-x', 400);
  const evtY = getInputValue('coord-events-y', 409);
  const evtSize = getInputValue('coord-events-size', 16);

  ctx.textBaseline = 'middle';

  // Name
  ctx.font = `bold ${nameSize}px "Playfair Display", Georgia, serif`;
  ctx.fillStyle = '#1a1a2e';
  ctx.textAlign = 'left';
  ctx.fillText('Aarav Sharma', nameX, nameY);

  // Semester
  ctx.font = `bold ${semSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#1a1a2e';
  ctx.fillText('IV Semester', semX, semY);

  // Branch
  ctx.font = `bold ${branchSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#1a1a2e';
  ctx.fillText('CSE', branchX, branchY);

  // Roll No
  ctx.font = `bold ${rollSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#1a1a2e';
  ctx.fillText('22A81A0501', rollX, rollY);

  const isCoord = (currentTemplate.template_type === 'coordination');
  const isApprec = (currentTemplate.template_type === 'appreciation');

  // Position line - only rendered for appreciation templates
  if (isApprec) {
    ctx.font = `bold ${posSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = '#7b1113';
    ctx.fillText('1st Prize', posX, posY);
  }

  // Events line - rendered for participation & appreciation templates, NOT coordination templates
  if (!isCoord) {
    ctx.font = `bold ${evtSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = isApprec ? '#1a1a2e' : '#7b1113';
    ctx.fillText('Tech Trifecta & AI Summit', evtX, evtY);
  }
}

// Save template coordinates
async function saveTemplateCoordinates() {
  if (!currentTemplate) return;

  const isCoord = (currentTemplate.template_type === 'coordination');
  const isApprec = (currentTemplate.template_type === 'appreciation');

  const updatedConfig = {
    canvas_width: 1024,
    canvas_height: 682,
    name: {
      x: getInputValue('coord-name-x', 350),
      y: getInputValue('coord-name-y', 355),
      fontSize: getInputValue('coord-name-size', 20),
      fontFamily: 'Playfair Display, serif',
      fontWeight: 'bold',
      color: '#1a1a2e',
      align: 'left'
    },
    semester: {
      x: getInputValue('coord-semester-x', 125),
      y: getInputValue('coord-semester-y', 382),
      fontSize: getInputValue('coord-semester-size', 16),
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'bold',
      color: '#1a1a2e',
      align: 'left'
    },
    branch: {
      x: getInputValue('coord-branch-x', 360),
      y: getInputValue('coord-branch-y', 382),
      fontSize: getInputValue('coord-branch-size', 16),
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'bold',
      color: '#1a1a2e',
      align: 'left'
    },
    roll_no: {
      x: getInputValue('coord-roll-x', 690),
      y: getInputValue('coord-roll-y', 382),
      fontSize: getInputValue('coord-roll-size', 16),
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'bold',
      color: '#1a1a2e',
      align: 'left'
    }
  };

  // Position is stored for appreciation templates
  if (isApprec) {
    updatedConfig.position = {
      x: getInputValue('coord-position-x', 210),
      y: getInputValue('coord-position-y', 409),
      fontSize: getInputValue('coord-position-size', 17),
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'bold',
      color: '#7b1113',
      align: 'left'
    };
  }

  // Events line is stored for participation and appreciation templates
  if (!isCoord) {
    updatedConfig.events = {
      x: getInputValue('coord-events-x', 400),
      y: getInputValue('coord-events-y', 409),
      fontSize: getInputValue('coord-events-size', 16),
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'bold',
      color: isApprec ? '#1a1a2e' : '#7b1113',
      align: 'left'
    };
  }

  try {
    const res = await fetch(`/api/templates/${currentTemplate._id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ fields_config: updatedConfig })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      currentTemplate.fields_config = updatedConfig;
      showToast(`Coordinates saved for "${currentTemplate.template_name}"!`, 'success');
      await loadTemplateLibrary();
    } else {
      showToast(data.message || 'Failed to save template coordinates', 'error');
    }
  } catch (err) {
    showToast('Save error: ' + err.message, 'error');
  }
}

function resetStudioCoordinates() {
  const isCoord = (currentTemplate?.template_type === 'coordination');
  const isApprec = (currentTemplate?.template_type === 'appreciation');
  let defaults = {
    name: { x: 350, y: 355, fontSize: 20 },
    semester: { x: 125, y: 382, fontSize: 16 },
    branch: { x: 360, y: 382, fontSize: 16 },
    roll_no: { x: 690, y: 382, fontSize: 16 }
  };

  if (isApprec) {
    defaults = {
      name: { x: 340, y: 355, fontSize: 20 },
      semester: { x: 125, y: 382, fontSize: 16 },
      branch: { x: 360, y: 382, fontSize: 16 },
      roll_no: { x: 690, y: 382, fontSize: 16 },
      position: { x: 210, y: 409, fontSize: 17 },
      events: { x: 500, y: 409, fontSize: 16 }
    };
  } else if (!isCoord) {
    defaults.events = { x: 400, y: 409, fontSize: 16 };
  }

  populateStudioInputs(defaults, currentTemplate?.template_type);
  drawStudioPreview();
  showToast('Coordinates reset to defaults', 'info');
}

// Upload new template image with category assignment
async function handleUploadNewTemplate(e) {
  if (e) e.preventDefault();
  const fileInput = document.getElementById('newTemplateFileInput');
  const nameInput = document.getElementById('newTemplateNameInput');
  const typeSelect = document.getElementById('newTemplateTypeSelect');
  const submitBtn = document.getElementById('btnUploadTemplateSubmit');

  const file = fileInput?.files[0];
  if (!file) {
    showToast('Please select a template image (.jpg or .png)', 'error');
    return;
  }

  const templateName = (nameInput?.value || '').trim() || file.name.replace(/\.[^/.]+$/, '');
  const templateType = typeSelect?.value || 'participation';

  if (submitBtn) {
    submitBtn.disabled = true;
    submitBtn.textContent = 'Uploading...';
  }

  const setActiveCheckbox = document.getElementById('newTemplateSetActive');
  const shouldBeActive = setActiveCheckbox ? setActiveCheckbox.checked : true;

  const formData = new FormData();
  formData.append('template_image', file);
  formData.append('template_name', templateName);
  formData.append('template_type', templateType);
  formData.append('is_active', shouldBeActive ? 'true' : 'false');

  try {
    const res = await fetch('/api/templates/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '📤 Upload & Tune Template';
    }

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Template "${templateName}" uploaded successfully!`, 'success');
      fileInput.value = '';
      if (nameInput) nameInput.value = '';
      currentTemplateType = templateType;
      await loadTemplateLibrary();
      await loadTemplateStudio(data.template._id);
      await loadEvents();
      await loadStats();
    } else {
      showToast(data.message || 'Template upload failed', 'error');
    }
  } catch (err) {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = '📤 Upload & Tune Template';
    }
    showToast('Upload error: ' + err.message, 'error');
  }
}

// Load and render Template Library cards
async function loadTemplateLibrary() {
  const container = document.getElementById('templateLibraryGrid');
  try {
    const res = await fetch('/api/templates', {
      headers: authToken ? { 'Authorization': `Bearer ${authToken}` } : {}
    });
    const data = await res.json();

    if (!res.ok || !data.success) {
      if (container) container.innerHTML = '<div style="color: var(--danger); padding: 1rem;">Failed to load template library.</div>';
      return;
    }

    allTemplatesList = data.templates || [];
    populateTemplateSelectors();

    if (!container) return;

    if (allTemplatesList.length === 0) {
      container.innerHTML = '<div style="grid-column: 1 / -1; text-align: center; padding: 2rem; color: var(--text-muted);">No templates uploaded yet.</div>';
      return;
    }

    container.innerHTML = allTemplatesList.map(t => {
      const isCoord = (t.template_type === 'coordination');
      const isApprec = (t.template_type === 'appreciation');
      const isCurrent = (currentTemplate && currentTemplate._id === t._id);
      const activeClass = isCurrent ? 'template-card active-tpl' : 'template-card';

      let typeBadge = '<span class="badge badge-primary" style="font-size: 0.725rem;">🎓 Participation</span>';
      if (isCoord) {
        typeBadge = '<span class="badge badge-warning" style="font-size: 0.725rem;">⭐ Coordination</span>';
      } else if (isApprec) {
        typeBadge = '<span class="badge badge-success" style="font-size: 0.725rem; background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0;">🏅 Appreciation</span>';
      }

      const activeBadge = t.is_active 
        ? '<span class="badge badge-success" style="font-size: 0.725rem;">● Active Default</span>' 
        : '';

      const usageText = t.eventUsageCount > 0 
        ? `<span style="color: var(--primary); font-weight: 600;">Used in ${t.eventUsageCount} event(s)</span>`
        : `<span style="color: var(--text-muted);">Global template</span>`;

      return `
        <div class="${activeClass}">
          <div class="template-card-preview">
            <img src="${t.template_file}" alt="${escapeHtml(t.template_name)}" onerror="this.src='/templates/svec_template.jpg'">
          </div>
          <div class="template-card-body">
            <h4 class="template-card-title">${escapeHtml(t.template_name)}</h4>
            <div class="template-card-meta">
              ${typeBadge}
              ${activeBadge}
            </div>
            <p style="font-size: 0.785rem; margin-bottom: 0.5rem;">${usageText}</p>
            <div class="template-card-actions">
              <button class="btn btn-secondary btn-sm" onclick="selectTemplateForStudio('${t._id}')" title="Tune coordinates">
                🎨 Tune
              </button>
              ${!t.is_active ? `
                <button class="btn btn-secondary btn-sm" onclick="activateTemplate('${t._id}', '${escapeHtml(t.template_name)}', '${t.template_type}')" title="Set as default active">
                  ⭐ Set Active
                </button>
              ` : '<span class="badge badge-success" style="font-size: 0.75rem;">Active</span>'}
              <button class="btn btn-danger btn-sm" onclick="deleteTemplate('${t._id}', '${escapeHtml(t.template_name)}')" title="Delete template">
                🗑️
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Library load error:', err);
    if (container) container.innerHTML = `<div style="color: var(--danger); padding: 1rem;">Error: ${err.message}</div>`;
  }
}

function selectTemplateForStudio(templateId) {
  loadTemplateStudio(templateId);
  const studioTab = document.getElementById('tab-template');
  if (studioTab) {
    window.scrollTo({ top: studioTab.offsetTop - 80, behavior: 'smooth' });
  }
}

function onStudioTemplateSelected(templateId) {
  if (templateId) {
    selectTemplateForStudio(templateId);
  }
}

async function activateTemplate(id, name, type) {
  try {
    const res = await fetch(`/api/templates/${id}/activate`, {
      method: 'PUT',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Template "${name}" is now the active ${type} template!`, 'success');
      currentTemplateType = type;
      await loadTemplateStudio(id);
      await loadStats();
      await loadTemplateLibrary();
    } else {
      showToast(data.message || 'Failed to activate template', 'error');
    }
  } catch (err) {
    showToast('Activation error: ' + err.message, 'error');
  }
}

async function manuallyActivateCurrentTemplate() {
  if (!currentTemplate) return;
  await activateTemplate(currentTemplate._id, currentTemplate.template_name, currentTemplate.template_type);
}

async function deleteTemplate(id, name) {
  if (!confirm(`Are you sure you want to delete template "${name}"?`)) return;

  try {
    const res = await fetch(`/api/templates/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Template deleted successfully', 'success');
      await loadTemplateStudio();
    } else {
      showToast(data.message || 'Failed to delete template', 'error');
    }
  } catch (err) {
    showToast('Delete error: ' + err.message, 'error');
  }
}

function populateTemplateSelectors() {
  const studioSelector = document.getElementById('studioTemplateSelector');
  if (studioSelector) {
    const opts = ['<option value="">-- Choose From Template Library --</option>'];
    allTemplatesList.forEach(t => {
      let typeLabel = '🎓 Participant';
      if (t.template_type === 'coordination') typeLabel = '⭐ Coordinator';
      else if (t.template_type === 'appreciation') typeLabel = '🏅 Appreciation';
      const activeLabel = t.is_active ? ' (Active)' : '';
      const selected = (currentTemplate && currentTemplate._id === t._id) ? ' selected' : '';
      opts.push(`<option value="${t._id}"${selected}>${escapeHtml(t.template_name)} [${typeLabel}]${activeLabel}</option>`);
    });
    studioSelector.innerHTML = opts.join('');
  }
  populateEventTemplateDropdowns();
}

function populateEventTemplateDropdowns() {
  const newPartSelect = document.getElementById('newEventParticipantTemplate');
  const newCoordSelect = document.getElementById('newEventCoordinatorTemplate');
  const newApprecSelect = document.getElementById('newEventAppreciationTemplate');
  const editPartSelect = document.getElementById('editEventParticipantTemplate');
  const editCoordSelect = document.getElementById('editEventCoordinatorTemplate');
  const editApprecSelect = document.getElementById('editEventAppreciationTemplate');

  const partOptions = ['<option value="">-- Active Institutional Participation Template --</option>'];
  const coordOptions = ['<option value="">-- Active Institutional Coordination Template --</option>'];
  const apprecOptions = ['<option value="">-- Active Institutional Appreciation Template --</option>'];

  allTemplatesList.forEach(t => {
    const opt = `<option value="${t._id}">${escapeHtml(t.template_name)}${t.is_active ? ' (Active)' : ''}</option>`;
    if (t.template_type === 'coordination') {
      coordOptions.push(opt);
    } else if (t.template_type === 'appreciation') {
      apprecOptions.push(opt);
    } else {
      partOptions.push(opt);
    }
  });

  if (newPartSelect) newPartSelect.innerHTML = partOptions.join('');
  if (newCoordSelect) newCoordSelect.innerHTML = coordOptions.join('');
  if (newApprecSelect) newApprecSelect.innerHTML = apprecOptions.join('');
  if (editPartSelect) editPartSelect.innerHTML = partOptions.join('');
  if (editCoordSelect) editCoordSelect.innerHTML = coordOptions.join('');
  if (editApprecSelect) editApprecSelect.innerHTML = apprecOptions.join('');
}

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);
  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ==========================================
// ADMIN CREDENTIALS & SECURITY MANAGEMENT
// ==========================================

function updateAdminDisplay() {
  const username = (currentAdminUser && currentAdminUser.username) ? currentAdminUser.username : 'admin';
  const badge = document.getElementById('currentAdminBadge');
  if (badge) badge.textContent = username;
}

function togglePasswordVisibility(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
}

function showCredentialsAlert(message, type = 'error') {
  const alertBox = document.getElementById('credentialsAlertBox');
  if (!alertBox) return;
  alertBox.textContent = message;
  alertBox.style.display = 'block';

  if (type === 'success') {
    alertBox.style.background = '#d1fae5';
    alertBox.style.color = '#065f46';
    alertBox.style.border = '1px solid #a7f3d0';
  } else {
    alertBox.style.background = '#fee2e2';
    alertBox.style.color = '#991b1b';
    alertBox.style.border = '1px solid #fecaca';
  }
}

function resetCredentialsForm() {
  const form = document.getElementById('changeCredentialsForm');
  if (form) form.reset();
  const alertBox = document.getElementById('credentialsAlertBox');
  if (alertBox) {
    alertBox.style.display = 'none';
    alertBox.textContent = '';
  }
}

async function handleChangeCredentials(e) {
  e.preventDefault();

  const currentPassword = document.getElementById('currentPassword').value;
  const newUsername = document.getElementById('newUsername').value.trim();
  const newPassword = document.getElementById('newPassword').value;
  const confirmNewPassword = document.getElementById('confirmNewPassword').value;
  const submitBtn = document.getElementById('saveCredentialsBtn');

  // Validation
  if (!currentPassword) {
    showCredentialsAlert('Please enter your current password to confirm your identity.', 'error');
    return;
  }

  if (!newUsername && !newPassword) {
    showCredentialsAlert('Please provide a new username or a new password to update.', 'error');
    return;
  }

  if (newUsername && newUsername.length < 3) {
    showCredentialsAlert('New username must be at least 3 characters long.', 'error');
    return;
  }

  if (newPassword) {
    if (newPassword.length < 6) {
      showCredentialsAlert('New password must be at least 6 characters long.', 'error');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      showCredentialsAlert('New password and confirmation do not match.', 'error');
      return;
    }
  }

  submitBtn.disabled = true;
  submitBtn.textContent = 'Updating Credentials...';

  try {
    const { res, data } = await safeFetch('/api/auth/change-credentials', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        currentPassword,
        newUsername: newUsername || undefined,
        newPassword: newPassword || undefined
      })
    });

    submitBtn.disabled = false;
    submitBtn.textContent = '💾 Save New Credentials';

    if (res.ok && data.success) {
      if (data.token) {
        authToken = data.token;
        localStorage.setItem('cert_admin_token', authToken);
      }
      if (data.user) {
        currentAdminUser = data.user;
        updateAdminDisplay();
      }

      showCredentialsAlert(data.message || 'Credentials updated successfully!', 'success');
      showToast(data.message || 'Credentials updated successfully!', 'success');
      resetCredentialsForm();
    } else {
      showCredentialsAlert(data.message || 'Failed to update credentials', 'error');
      showToast(data.message || 'Failed to update credentials', 'error');
    }
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = '💾 Save New Credentials';
    showCredentialsAlert('Network error: ' + err.message, 'error');
    showToast('Failed to update credentials: ' + err.message, 'error');
  }
}

// =======================================================
// EVENT CERTIFICATE MANAGEMENT (MAIN TEMPLATE & ROLES)
// =======================================================

let currentEventCertEventId = null;
let currentEventCertsList = [];
let currentEventCertFilter = 'all'; // 'all', 'students', 'coordinators'
let activeAdminPreviewCert = null;

// Initialize Event Certificates Tab
async function initEventCertsTab() {
  if (eventsCache.length === 0) {
    await loadEvents();
  }
  populateEventCertSelect(currentEventCertEventId);

  // If no event selected but events exist, auto-select first event
  if (!currentEventCertEventId && eventsCache.length > 0) {
    currentEventCertEventId = eventsCache[0]._id;
    const select = document.getElementById('eventCertEventSelect');
    if (select) select.value = currentEventCertEventId;
  }

  if (currentEventCertEventId) {
    await loadEventCertificates(currentEventCertEventId);
  }
}

// Populate the Event Select dropdown in Event Certificates tab
function populateEventCertSelect(selectedId) {
  const select = document.getElementById('eventCertEventSelect');
  if (!select) return;

  const prevVal = selectedId || select.value;
  select.innerHTML = '<option value="">-- Choose an Event to Manage Certificates --</option>' +
    eventsCache.map(e => `
      <option value="${e._id}" ${e._id === prevVal ? 'selected' : ''}>
        ${escapeHtml(e.event_name)} (${escapeHtml(e.event_date || 'N/A')}) — ${e.participantCount || 0} certs
      </option>
    `).join('');

  if (prevVal && eventsCache.some(e => e._id === prevVal)) {
    select.value = prevVal;
  }
}

// Triggered when user selects a different event
async function onEventCertEventChanged(eventId) {
  currentEventCertEventId = eventId || null;
  if (!eventId) {
    document.getElementById('eventCertSummaryBar').style.display = 'none';
    document.getElementById('eventCertIssuanceContainer').style.display = 'none';
    return;
  }
  await loadEventCertificates(eventId);
}

// Reload current event certificates
async function reloadCurrentEventCertificates() {
  if (!currentEventCertEventId) {
    showToast('Please select an event first', 'info');
    return;
  }
  await loadEventCertificates(currentEventCertEventId);
  showToast('Event certificates refreshed', 'success');
}

// Fetch and display certificates for selected event
async function loadEventCertificates(eventId) {
  if (!eventId) return;

  try {
    const { res, data } = await safeFetch(`/api/events/${eventId}/certificates`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (!res.ok || !data.success) {
      showToast(data.message || 'Failed to load event certificates', 'error');
      return;
    }

    const event = data.event;
    currentEventCertsList = data.certificates || [];

    // 1. Update summary bar
    document.getElementById('eventCertActiveName').textContent = event.name;
    document.getElementById('eventCertActiveDate').textContent = `${event.date} • ${event.category || 'Separate Event'}`;
    document.getElementById('eventCertStatTotal').textContent = data.counts?.total || currentEventCertsList.length;
    document.getElementById('eventCertStatStudents').textContent = data.counts?.students || 0;
    document.getElementById('eventCertStatCoordinators').textContent = data.counts?.coordinators || 0;
    const statApprec = document.getElementById('eventCertStatAppreciation');
    if (statApprec) statApprec.textContent = data.counts?.appreciation || 0;

    // 2. Update count pills
    const pillAll = document.getElementById('countPillAll');
    const pillStudents = document.getElementById('countPillStudents');
    const pillCoords = document.getElementById('countPillCoordinators');
    const pillApprec = document.getElementById('countPillAppreciation');
    if (pillAll) pillAll.textContent = data.counts?.total || currentEventCertsList.length;
    if (pillStudents) pillStudents.textContent = data.counts?.students || 0;
    if (pillCoords) pillCoords.textContent = data.counts?.coordinators || 0;
    if (pillApprec) pillApprec.textContent = data.counts?.appreciation || 0;

    // 3. Show sections
    document.getElementById('eventCertSummaryBar').style.display = 'block';
    document.getElementById('eventCertIssuanceContainer').style.display = 'block';

    // Update Dynamic Template Banner
    const bannerTitle = document.getElementById('eventCertBannerTitle');
    const bannerDetail = document.getElementById('eventCertBannerDetail');
    const bannerBadge = document.getElementById('eventCertBannerBadge');
    const bannerIcon = document.getElementById('eventCertBannerIcon');

    if (bannerTitle && bannerDetail && bannerBadge) {
      if (event.useMainTemplate) {
        if (bannerIcon) bannerIcon.textContent = '🏛️';
        bannerTitle.textContent = 'Using Main Institutional Templates:';
        bannerDetail.textContent = 'Sri Vasavi Engineering College (Participation, Coordination & Appreciation Templates)';
        bannerBadge.textContent = '✓ Institutional Defaults';
        bannerBadge.className = 'badge badge-success';
      } else {
        if (bannerIcon) bannerIcon.textContent = '🎨';
        bannerTitle.textContent = 'Using Custom Event Templates:';
        const partName = event.template ? event.template.name : 'Active Participation';
        const coordName = event.coordinatorTemplate ? event.coordinatorTemplate.name : 'Active Coordination';
        const apprecName = event.appreciationTemplate ? event.appreciationTemplate.name : 'Active Appreciation';
        bannerDetail.textContent = `Participant: "${partName}" • Coordinator: "${coordName}" • Appreciation: "${apprecName}"`;
        bannerBadge.textContent = '🎨 Custom Templates';
        bannerBadge.className = 'badge badge-primary';
      }
    }

    // 4. Render table
    renderEventCertificatesTable();
  } catch (err) {
    console.error('Event certificates load error:', err);
    showToast('Failed to load certificates: ' + err.message, 'error');
  }
}

// Filter tabs handling (All, Students, Coordinators, Appreciation)
function setEventCertFilter(filter) {
  currentEventCertFilter = filter;
  const tabAll = document.getElementById('filterTabAll');
  const tabStudents = document.getElementById('filterTabStudents');
  const tabCoords = document.getElementById('filterTabCoordinators');
  const tabApprec = document.getElementById('filterTabAppreciation');

  if (tabAll) tabAll.className = filter === 'all' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost';
  if (tabStudents) tabStudents.className = filter === 'students' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost';
  if (tabCoords) tabCoords.className = filter === 'coordinators' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost';
  if (tabApprec) tabApprec.className = filter === 'appreciation' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost';

  renderEventCertificatesTable();
}

// Search input handling within loaded certificates
function handleEventCertSearch(query) {
  renderEventCertificatesTable();
}

// Render the event certificates table
function renderEventCertificatesTable() {
  const tbody = document.getElementById('eventCertsTableBody');
  if (!tbody) return;

  const searchInput = document.getElementById('eventCertSearchInput');
  const query = (searchInput ? searchInput.value : '').trim().toLowerCase();

  // Filter list
  let list = currentEventCertsList.filter(c => {
    const isApprec = c.isAppreciation || c.certificateType === 'Appreciation' || Boolean(c.position);
    const isCoord = !isApprec && (c.isCoordinator || (c.role || '').toLowerCase().includes('coordinator'));

    // Role filter
    if (currentEventCertFilter === 'students' && (isCoord || isApprec)) return false;
    if (currentEventCertFilter === 'coordinators' && !isCoord) return false;
    if (currentEventCertFilter === 'appreciation' && !isApprec) return false;

    // Search query filter
    if (query) {
      const matchRoll = (c.student?.roll_no || '').toLowerCase().includes(query);
      const matchName = (c.student?.name || '').toLowerCase().includes(query);
      const matchBranch = (c.student?.branch || '').toLowerCase().includes(query);
      const matchDesig = (c.designation || '').toLowerCase().includes(query);
      const matchPos = (c.position || '').toLowerCase().includes(query);
      return matchRoll || matchName || matchBranch || matchDesig || matchPos;
    }
    return true;
  });

  if (list.length === 0) {
    const filterLabel = currentEventCertFilter === 'coordinators' ? 'coordinator' : currentEventCertFilter === 'appreciation' ? 'appreciation / winner' : currentEventCertFilter === 'students' ? 'student' : '';
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          No ${filterLabel} certificates found matching your criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(c => {
    const isApprec = c.isAppreciation || c.certificateType === 'Appreciation' || Boolean(c.position);
    const isCoord = !isApprec && (c.isCoordinator || (c.role || '').toLowerCase().includes('coordinator'));

    let roleBadge = `<span class="badge badge-primary">🎓 Student</span>`;
    let certTypeBadge = `<span style="font-size: 0.8rem; font-weight: 600; color: #1e40af;">📜 Participation</span>`;
    const posText = c.position || c.designation || '';

    if (isApprec) {
      const displayPos = posText || 'Winner';
      roleBadge = `<span class="badge" style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; font-weight: 700;">🏅 ${escapeHtml(displayPos)}</span>`;
      certTypeBadge = `<span style="font-size: 0.8rem; font-weight: 600; color: #047857;">📜 Appreciation</span>`;
    } else if (isCoord) {
      roleBadge = `<span class="badge" style="background: #fef3c7; color: #92400e; border: 1px solid #fde68a;">⭐ ${escapeHtml(c.designation || 'Coordinator')}</span>`;
      certTypeBadge = `<span style="font-size: 0.8rem; font-weight: 600; color: #b45309;">📜 Coordination</span>`;
    }

    // Package certificate data safely for button onclick
    const certJsonStr = encodeURIComponent(JSON.stringify(c));

    return `
      <tr>
        <td><strong style="color: ${isCoord ? '#b45309' : 'var(--primary)'}; font-family: monospace;">${escapeHtml(c.student?.roll_no || '-')}</strong></td>
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(c.student?.name || '-')}</div>
          ${c.student?.email ? `<span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(c.student.email)}</span>` : ''}
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;">
            ${roleBadge}
            <button class="btn btn-ghost btn-sm" onclick="openEditPositionModal('${c.participationId}', '${escapeHtml(c.student?.name || '')}', '${escapeHtml(c.student?.roll_no || '')}', '${escapeHtml(posText)}')" title="Change Position / Rank (e.g. 1st, 2nd, 3rd, 4th, 5th)" style="padding: 0.15rem 0.45rem; font-size: 0.75rem; border: 1px dashed var(--surface-border); border-radius: 4px;">
              ✏️ Rank
            </button>
          </div>
        </td>
        <td>${certTypeBadge}</td>
        <td>
          <span style="font-size: 0.85rem;">${escapeHtml(c.student?.branch || 'CSE')}</span>
          <span style="font-size: 0.75rem; color: var(--text-muted); display: block;">${escapeHtml(c.student?.semester || '-')}</span>
        </td>
        <td>
          <span style="font-size: 0.85rem;">${escapeHtml(c.issueDate || 'N/A')}</span>
          <span style="font-size: 0.7rem; color: var(--text-muted); display: block; font-family: monospace;">${escapeHtml(c.certificateId || '')}</span>
        </td>
        <td style="text-align: right; white-space: nowrap;">
          <button class="btn btn-secondary btn-sm" onclick="openAdminCertPreviewFromEncoded('${certJsonStr}')" title="Preview Certificate on Main Template">
            👁️ Preview
          </button>
          <button class="btn btn-success btn-sm" onclick="directDownloadEventCertFromEncoded('${certJsonStr}', 'pdf')" title="Download High-Res PDF">
            ⬇️ PDF
          </button>
          <button class="btn btn-secondary btn-sm" onclick="directDownloadEventCertFromEncoded('${certJsonStr}', 'png')" title="Download PNG Image">
            🖼️
          </button>
          <button class="btn btn-danger btn-sm" onclick="revokeEventCertificate('${c.participationId}', '${escapeHtml(c.student?.name)}')" title="Revoke Certificate">
            🗑️
          </button>
        </td>
      </tr>
    `;
  }).join('');
}

// Role toggle in single issuance form (Student vs Coordinator vs Appreciation)
function handleCertRoleChange(role) {
  const cardStudent = document.getElementById('roleCardStudent');
  const cardCoordinator = document.getElementById('roleCardCoordinator');
  const cardApprec = document.getElementById('roleCardAppreciation');
  const coordinatorFieldsArea = document.getElementById('coordinatorFieldsArea');
  const appreciationFieldsArea = document.getElementById('appreciationFieldsArea');
  const labelRollText = document.getElementById('labelRollText');
  const certTypeSelect = document.getElementById('eventCertType');

  if (cardStudent) { cardStudent.style.borderColor = 'var(--surface-border)'; cardStudent.style.background = '#fff'; }
  if (cardCoordinator) { cardCoordinator.style.borderColor = 'var(--surface-border)'; cardCoordinator.style.background = '#fff'; }
  if (cardApprec) { cardApprec.style.borderColor = 'var(--surface-border)'; cardApprec.style.background = '#fff'; }

  if (role === 'Coordinator') {
    if (cardCoordinator) {
      cardCoordinator.style.borderColor = '#d97706';
      cardCoordinator.style.background = '#fffaf0';
    }
    if (coordinatorFieldsArea) coordinatorFieldsArea.style.display = 'block';
    if (appreciationFieldsArea) appreciationFieldsArea.style.display = 'none';
    if (labelRollText) labelRollText.textContent = 'Coordinator ID / Roll Number';
    if (certTypeSelect) certTypeSelect.value = 'Coordination';
  } else if (role === 'Appreciation') {
    if (cardApprec) {
      cardApprec.style.borderColor = '#059669';
      cardApprec.style.background = '#ecfdf5';
    }
    if (coordinatorFieldsArea) coordinatorFieldsArea.style.display = 'none';
    if (appreciationFieldsArea) appreciationFieldsArea.style.display = 'block';
    if (labelRollText) labelRollText.textContent = 'Student Roll Number / Reg No';
  } else {
    if (cardStudent) {
      cardStudent.style.borderColor = 'var(--primary-light)';
      cardStudent.style.background = '#eff6ff';
    }
    if (coordinatorFieldsArea) coordinatorFieldsArea.style.display = 'none';
    if (appreciationFieldsArea) appreciationFieldsArea.style.display = 'none';
    if (labelRollText) labelRollText.textContent = 'Roll Number';
    if (certTypeSelect) certTypeSelect.value = 'Participation';
  }
}

// Handle custom position input visibility
function checkCustomPosition(val) {
  const customInput = document.getElementById('eventCertCustomPosition');
  if (!customInput) return;
  if (val === '__custom__') {
    customInput.style.display = 'block';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
  }
}

// Handle custom designation input visibility
function checkCustomDesignation(val) {
  const customInput = document.getElementById('eventCertCustomDesignation');
  if (!customInput) return;
  if (val === '__custom__') {
    customInput.style.display = 'block';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
  }
}

// Autofill student data if they already exist in database
async function autoFillStudentDetails(roll) {
  if (!roll || !roll.trim()) return;
  const rollClean = roll.trim().toUpperCase();

  try {
    const { res, data } = await safeFetch(`/api/students/search/${encodeURIComponent(rollClean)}`);
    if (res.ok && data.success && data.student) {
      const nameInput = document.getElementById('eventCertName');
      const branchInput = document.getElementById('eventCertBranch');
      const semInput = document.getElementById('eventCertSem');
      const emailInput = document.getElementById('eventCertEmail');

      if (nameInput && !nameInput.value) nameInput.value = data.student.name || '';
      if (branchInput && (!branchInput.value || branchInput.value === 'CSE')) branchInput.value = data.student.branch || 'CSE';
      if (semInput && (!semInput.value || semInput.value === 'IV Semester B.Tech')) semInput.value = data.student.semester || 'IV Semester B.Tech';
      if (emailInput && !emailInput.value) emailInput.value = data.student.email || '';

      showToast(`Autofilled details for ${data.student.name}`, 'info');
    }
  } catch (err) {
    // Silent fail if not found
  }
}

// Single Certificate Issuance Submission
async function handleIssueEventCertificate(e) {
  e.preventDefault();
  if (!currentEventCertEventId) {
    showToast('Please select an event before issuing certificates', 'error');
    return;
  }

  const roll_no = document.getElementById('eventCertRoll').value.trim().toUpperCase();
  const name = document.getElementById('eventCertName').value.trim();
  const branch = document.getElementById('eventCertBranch').value.trim();
  const semester = document.getElementById('eventCertSem').value.trim();
  const email = document.getElementById('eventCertEmail').value.trim();

  const roleRadio = document.querySelector('input[name="eventCertRoleOption"]:checked');
  const role = roleRadio ? roleRadio.value : 'Student';
  const isCoord = role === 'Coordinator';
  const isApprec = role === 'Appreciation';

  let designation = 'Participant';
  let certificate_type = 'Participation';
  let position = '';

  if (isCoord) {
    const desigSelect = document.getElementById('eventCertDesignation');
    if (desigSelect && desigSelect.value === '__custom__') {
      designation = (document.getElementById('eventCertCustomDesignation').value || '').trim() || 'Student Coordinator';
    } else if (desigSelect) {
      designation = desigSelect.value;
    } else {
      designation = 'Student Coordinator';
    }
    const typeSelect = document.getElementById('eventCertType');
    certificate_type = typeSelect ? typeSelect.value : 'Coordination';
  } else if (isApprec) {
    const posSelect = document.getElementById('eventCertPosition');
    if (posSelect && posSelect.value === '__custom__') {
      position = (document.getElementById('eventCertCustomPosition').value || '').trim() || 'Winner';
    } else if (posSelect) {
      position = posSelect.value;
    } else {
      position = 'Winner';
    }
    designation = position;
    certificate_type = 'Appreciation';
  }

  const submitBtn = document.getElementById('issueCertSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Issuing Certificate...';

  try {
    const { res, data } = await safeFetch(`/api/events/${currentEventCertEventId}/issue-certificate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        roll_no,
        name,
        branch,
        semester,
        email,
        role: isCoord ? (designation || 'Coordinator') : isApprec ? 'Winner' : 'Student',
        designation,
        position,
        certificate_type
      })
    });

    submitBtn.disabled = false;
    submitBtn.textContent = '💾 Issue Certificate Now';

    if (res.ok && data.success) {
      showToast(data.message || 'Certificate issued successfully!', 'success');
      resetEventCertSingleForm();
      await loadEventCertificates(currentEventCertEventId);
      loadStats();
    } else {
      showToast(data.message || 'Failed to issue certificate', 'error');
    }
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = '💾 Issue Certificate Now';
    showToast('Issuance error: ' + err.message, 'error');
  }
}

// Reset single issuance form
function resetEventCertSingleForm() {
  document.getElementById('eventCertRoll').value = '';
  document.getElementById('eventCertName').value = '';
  document.getElementById('eventCertEmail').value = '';
  const posInput = document.getElementById('eventCertCustomPosition');
  if (posInput) { posInput.value = ''; posInput.style.display = 'none'; }
  const desigInput = document.getElementById('eventCertCustomDesignation');
  if (desigInput) { desigInput.value = ''; desigInput.style.display = 'none'; }
  const radioStudent = document.querySelector('input[name="eventCertRoleOption"][value="Student"]');
  if (radioStudent) radioStudent.checked = true;
  handleCertRoleChange('Student');
}

// ----------------------------------------------------
// BULK / BATCH ISSUANCE MANAGEMENT (COORDINATORS & PARTICIPANTS)
// ----------------------------------------------------
let currentBulkTarget = 'coordinators'; // 'coordinators' | 'participants' | 'mixed'
let currentBulkMethod = 'file'; // 'file' | 'paste'
let currentBulkParsedRecipients = [];

// Toggle between Single and Batch issuance forms
function setEventCertMode(mode) {
  const btnSingle = document.getElementById('issuanceModeSingleBtn');
  const btnBulk = document.getElementById('issuanceModeBulkBtn');
  const areaSingle = document.getElementById('eventCertSingleFormArea');
  const areaBulk = document.getElementById('eventCertBulkFormArea');

  if (mode === 'bulk') {
    btnSingle.className = 'btn btn-secondary btn-sm';
    btnBulk.className = 'btn btn-primary btn-sm';
    areaSingle.style.display = 'none';
    areaBulk.style.display = 'block';
    // Initialize default target
    setBulkRecipientTarget(currentBulkTarget || 'coordinators');
    setBulkInputMethod(currentBulkMethod || 'file');
  } else {
    btnSingle.className = 'btn btn-primary btn-sm';
    btnBulk.className = 'btn btn-secondary btn-sm';
    areaSingle.style.display = 'block';
    areaBulk.style.display = 'none';
  }
}

// Set Bulk Target Category (Coordinators, Appreciation, Participants, Mixed)
function setBulkRecipientTarget(target) {
  currentBulkTarget = target;
  const btnCoord = document.getElementById('bulkTargetCoordBtn');
  const btnApprec = document.getElementById('bulkTargetApprecBtn');
  const btnPart = document.getElementById('bulkTargetPartBtn');
  const btnMixed = document.getElementById('bulkTargetMixedBtn');
  const notice = document.getElementById('bulkTargetDescNotice');
  const hint = document.getElementById('bulkPasteFormatHint');

  if (btnCoord) btnCoord.className = target === 'coordinators' ? 'btn btn-warning btn-sm' : 'btn btn-secondary btn-sm';
  if (btnApprec) btnApprec.className = target === 'appreciation' ? 'btn btn-success btn-sm' : 'btn btn-secondary btn-sm';
  if (btnPart) btnPart.className = target === 'participants' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
  if (btnMixed) btnMixed.className = target === 'mixed' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';

  if (notice) {
    if (target === 'coordinators') {
      notice.style.display = 'block';
      notice.style.background = '#fffaf0';
      notice.style.borderColor = '#f59e0b';
      notice.style.color = '#92400e';
      notice.innerHTML = '⭐ <strong>Coordinator Mode:</strong> All imported rows will be registered as <strong>Event Coordinators</strong> with dedicated Coordinator Certificates.';
    } else if (target === 'appreciation') {
      notice.style.display = 'block';
      notice.style.background = '#ecfdf5';
      notice.style.borderColor = '#10b981';
      notice.style.color = '#047857';
      notice.innerHTML = '🏅 <strong>Appreciation / Winner Mode:</strong> All imported rows will be registered as <strong>Winners / Honorees</strong> with Certificates of Appreciation and position/prize.';
    } else if (target === 'participants') {
      notice.style.display = 'block';
      notice.style.background = '#eff6ff';
      notice.style.borderColor = '#3b82f6';
      notice.style.color = '#1e40af';
      notice.innerHTML = '🎓 <strong>Participant Mode:</strong> All imported rows will be registered as <strong>Student Participants</strong> with Participation Certificates.';
    } else {
      notice.style.display = 'block';
      notice.style.background = '#f8fafc';
      notice.style.borderColor = '#94a3b8';
      notice.style.color = '#334155';
      notice.innerHTML = '🔀 <strong>Mixed Mode:</strong> Specify the role (<em>Student</em>, <em>Coordinator</em>, or <em>Winner/Prize</em>) in the file or per line.';
    }
  }

  if (hint) {
    if (target === 'coordinators') {
      hint.textContent = 'RollNo, Full Name, Branch, Semester, Coordinator Designation';
    } else if (target === 'appreciation') {
      hint.textContent = 'RollNo, Full Name, Branch, Semester, Position / Prize (e.g. 1st Prize, Winner)';
    } else if (target === 'participants') {
      hint.textContent = 'RollNo, Full Name, Branch, Semester';
    } else {
      hint.textContent = 'RollNo, Full Name, Role (Student, Coordinator, Winner), Branch, Semester, Designation/Position';
    }
  }
}

// Toggle between File upload and Paste input methods
function setBulkInputMethod(method) {
  currentBulkMethod = method;
  const btnFile = document.getElementById('bulkMethodFileBtn');
  const btnPaste = document.getElementById('bulkMethodPasteBtn');
  const areaFile = document.getElementById('bulkFileMethodArea');
  const areaPaste = document.getElementById('bulkPasteMethodArea');

  if (btnFile) btnFile.className = method === 'file' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';
  if (btnPaste) btnPaste.className = method === 'paste' ? 'btn btn-primary btn-sm' : 'btn btn-secondary btn-sm';

  if (areaFile) areaFile.style.display = method === 'file' ? 'block' : 'none';
  if (areaPaste) areaPaste.style.display = method === 'paste' ? 'block' : 'none';
}

// Download Sample Coordinators Excel file
function downloadCoordinatorSampleExcel() {
  window.location.href = '/api/upload/sample-coordinators-excel';
}

// Download Sample Appreciation Excel file
function downloadAppreciationSampleExcel() {
  window.location.href = '/api/upload/sample-appreciation-excel';
}

// Handle Excel/CSV file selection for bulk issuance
async function handleBulkFileInputChange(e) {
  const file = e.target.files ? e.target.files[0] : null;
  if (!file) return;

  if (typeof XLSX !== 'undefined') {
    // Client-side instant parsing with live table preview
    try {
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[0];
      const rawRows = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

      if (!rawRows || rawRows.length === 0) {
        showToast('Spreadsheet contains no data rows.', 'error');
        return;
      }

      const isTargetCoord = currentBulkTarget === 'coordinators';
      const isTargetApprec = currentBulkTarget === 'appreciation';
      const defaultRole = isTargetCoord ? 'Coordinator' : isTargetApprec ? 'Winner' : 'Student';
      const defaultDesig = isTargetApprec ? 'Winner' : (document.getElementById('bulkDefaultDesignation')?.value || 'Student Coordinator');

      currentBulkParsedRecipients = [];

      for (const row of rawRows) {
        const keys = Object.keys(row);
        const findVal = (patterns) => {
          const k = keys.find(key => patterns.some(p => key.trim().toLowerCase().includes(p)));
          return k ? String(row[k]).trim() : '';
        };

        const roll_no = findVal(['roll', 'reg', 'ht', 'id', 'ticket']);
        const name = findVal(['name', 'student', 'coordinator', 'winner']);
        const branch = findVal(['branch', 'dept', 'department']) || 'CSE';
        const semester = findVal(['sem', 'year']) || 'IV Semester B.Tech';
        const rawPos = findVal(['position', 'pos', 'prize', 'rank', 'award', 'place', 'medal', 'standing', 'secured', 'merit', 'achievement', 'result']);
        const position = formatPositionClient(rawPos);
        const designation = position || findVal(['designation', 'title']) || (isTargetCoord ? defaultDesig : isTargetApprec ? 'Winner' : 'Participant');
        const role = findVal(['role', 'category', 'type']) || (position ? 'Winner' : defaultRole);
        const email = findVal(['email', 'mail']) || '';

        if (roll_no && name) {
          const isApprec = isTargetApprec || Boolean(position) || role.toLowerCase().includes('winner') || role.toLowerCase().includes('prize') || role.toLowerCase().includes('appreciation');
          const isCoord = !isApprec && (role.toLowerCase().includes('coordinator') || isTargetCoord);

          let assignedRole = 'Student';
          let assignedCertType = 'Participation';
          let assignedDesig = 'Participant';
          let assignedPos = '';

          if (isApprec) {
            assignedRole = 'Winner';
            assignedCertType = 'Appreciation';
            assignedPos = position || designation || 'Winner';
            assignedDesig = assignedPos;
          } else if (isCoord) {
            assignedRole = 'Coordinator';
            assignedCertType = 'Coordination';
            assignedDesig = designation || defaultDesig;
          }

          currentBulkParsedRecipients.push({
            roll_no,
            name,
            branch,
            semester,
            role: assignedRole,
            designation: assignedDesig,
            position: assignedPos,
            email,
            certificate_type: assignedCertType
          });
        }
      }

      if (currentBulkParsedRecipients.length === 0) {
        showToast('No valid rows found. Please ensure the file has Roll No and Name columns.', 'error');
        return;
      }

      renderBulkFilePreview();
      showToast(`Parsed ${currentBulkParsedRecipients.length} recipients from ${file.name}!`, 'success');

    } catch (err) {
      console.error('Client excel parse error:', err);
      // Fallback: upload file directly via backend API
      uploadBulkFileToServer(file);
    }
  } else {
    // Direct server-side upload fallback
    uploadBulkFileToServer(file);
  }
}

// Render Preview table for parsed bulk file
function renderBulkFilePreview() {
  const area = document.getElementById('bulkFilePreviewArea');
  const title = document.getElementById('bulkPreviewTitle');
  const badge = document.getElementById('bulkPreviewBadge');
  const tbody = document.getElementById('bulkFilePreviewTableBody');

  if (!area || !tbody) return;

  const count = currentBulkParsedRecipients.length;
  const isCoord = currentBulkTarget === 'coordinators';
  const isApprec = currentBulkTarget === 'appreciation';

  if (title) title.textContent = `Parsed ${count} ${isCoord ? 'Coordinators' : isApprec ? 'Winners / Honorees' : 'Recipients'}`;
  if (badge) {
    badge.textContent = `${count} Ready to Issue`;
    badge.className = isCoord ? 'badge badge-warning' : isApprec ? 'badge badge-success' : 'badge badge-primary';
  }

  tbody.innerHTML = currentBulkParsedRecipients.slice(0, 50).map((r, idx) => {
    let rBadge = `<span class="badge badge-primary">${r.role}</span>`;
    let dColor = '#64748b';
    if (r.role === 'Coordinator' || r.certificate_type === 'Coordination') {
      rBadge = `<span class="badge badge-warning">Coordinator</span>`;
      dColor = '#b45309';
    } else if (r.role === 'Winner' || r.certificate_type === 'Appreciation' || r.position) {
      rBadge = `<span class="badge badge-success" style="background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0;">🏅 ${escapeHtml(r.position || 'Winner')}</span>`;
      dColor = '#047857';
    }
    return `
      <tr>
        <td>${idx + 1}</td>
        <td><strong>${escapeHtml(r.roll_no)}</strong></td>
        <td>${escapeHtml(r.name)}</td>
        <td>${escapeHtml(r.branch)}</td>
        <td>${escapeHtml(r.semester)}</td>
        <td>${rBadge}</td>
        <td style="color: ${dColor}; font-weight: 600;">${escapeHtml(r.position || r.designation)}</td>
      </tr>
    `;
  }).join('') + (count > 50 ? `<tr><td colspan="7" style="text-align: center; color: var(--text-muted);">... and ${count - 50} more rows</td></tr>` : '');

  area.style.display = 'block';
}

// Clear selected file preview
function clearBulkFileSelection() {
  currentBulkParsedRecipients = [];
  const fileInput = document.getElementById('bulkCertFileInput');
  if (fileInput) fileInput.value = '';
  const area = document.getElementById('bulkFilePreviewArea');
  if (area) area.style.display = 'none';
}

// Submit parsed file recipients
async function submitBulkFileRecipients() {
  if (!currentEventCertEventId) {
    showToast('Please select an event before issuing certificates', 'error');
    return;
  }
  if (!currentBulkParsedRecipients || currentBulkParsedRecipients.length === 0) {
    showToast('No recipients parsed to issue', 'error');
    return;
  }

  const btn = document.getElementById('btnSubmitBulkFile');
  if (btn) {
    btn.disabled = true;
    btn.textContent = `Issuing ${currentBulkParsedRecipients.length} certificates...`;
  }

  try {
    const defaultRole = currentBulkTarget === 'coordinators' ? 'Coordinator' : currentBulkTarget === 'appreciation' ? 'Winner' : 'Student';
    const defaultCertType = currentBulkTarget === 'coordinators' ? 'Coordination' : currentBulkTarget === 'appreciation' ? 'Appreciation' : 'Participation';

    const { res, data } = await safeFetch(`/api/events/${currentEventCertEventId}/bulk-issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        recipients: currentBulkParsedRecipients,
        default_role: defaultRole,
        default_certificate_type: defaultCertType,
        default_designation: document.getElementById('bulkDefaultDesignation')?.value || 'Student Coordinator'
      })
    });

    if (btn) {
      btn.disabled = false;
      btn.textContent = '⚡ Issue All Certificates Now';
    }

    if (res.ok && data.success) {
      showToast(data.message || 'Bulk certificates issued successfully!', 'success');
      clearBulkFileSelection();
      await loadEventCertificates(currentEventCertEventId);
      loadStats();
    } else {
      showToast(data.message || 'Failed to complete batch issuance', 'error');
    }
  } catch (err) {
    if (btn) {
      btn.disabled = false;
      btn.textContent = '⚡ Issue All Certificates Now';
    }
    showToast('Bulk issue error: ' + err.message, 'error');
  }
}

// Direct server-side upload fallback
async function uploadBulkFileToServer(file) {
  if (!currentEventCertEventId) {
    showToast('Please select an event before uploading', 'error');
    return;
  }

  const defaultRole = currentBulkTarget === 'coordinators' ? 'Coordinator' : currentBulkTarget === 'appreciation' ? 'Winner' : 'Student';
  const defaultCertType = currentBulkTarget === 'coordinators' ? 'Coordination' : currentBulkTarget === 'appreciation' ? 'Appreciation' : 'Participation';

  const formData = new FormData();
  formData.append('file', file);
  formData.append('default_role', defaultRole);
  formData.append('default_certificate_type', defaultCertType);
  formData.append('default_designation', document.getElementById('bulkDefaultDesignation')?.value || 'Student Coordinator');

  showToast(`Uploading and processing "${file.name}"...`, 'info');

  try {
    const res = await fetch(`/api/events/${currentEventCertEventId}/upload-bulk`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast(data.message || 'Bulk file processed successfully!', 'success');
      clearBulkFileSelection();
      await loadEventCertificates(currentEventCertEventId);
      loadStats();
    } else {
      showToast(data.message || 'File upload failed', 'error');
    }
  } catch (err) {
    showToast('Upload error: ' + err.message, 'error');
  }
}

// Fill sample bulk rows based on active category
function fillSampleBulkEventCerts() {
  const input = document.getElementById('eventCertBulkInput');
  if (!input) return;

  if (currentBulkTarget === 'coordinators') {
    input.value = [
      '22A81A0501, Aarav Sharma, CSE, IV Semester B.Tech, Student Coordinator',
      '22A81A0502, Bhavya Sri, AIML, IV Semester B.Tech, Lead Event Coordinator',
      '22A81A0503, Chaitanya Varma, ECE, IV Semester B.Tech, Technical Coordinator',
      '22A81A0504, Divya Jyothi, IT, IV Semester B.Tech, Organizing Committee Lead',
      '22A81A0505, Eshwar Prasad, Mechanical, IV Semester B.Tech, Student Coordinator'
    ].join('\n');
  } else if (currentBulkTarget === 'appreciation') {
    input.value = [
      '22A81A0501, Aarav Sharma, CSE, IV Semester B.Tech, 1st Prize',
      '22A81A0502, Bhavya Sri, AIML, IV Semester B.Tech, 2nd Prize',
      '22A81A0503, Chaitanya Varma, ECE, IV Semester B.Tech, 3rd Prize',
      '22A81A0504, Divya Jyothi, IT, IV Semester B.Tech, Winner',
      '22A81A0505, Eshwar Prasad, Mechanical, IV Semester B.Tech, Runner-Up'
    ].join('\n');
  } else if (currentBulkTarget === 'participants') {
    input.value = [
      '22A81A0501, Aarav Sharma, CSE, IV Semester B.Tech',
      '22A81A0502, Bhavya Sri, AIML, IV Semester B.Tech',
      '22A81A0503, Chaitanya Varma, ECE, IV Semester B.Tech',
      '22A81A0504, Divya Jyothi, IT, IV Semester B.Tech',
      '22A81A0505, Eshwar Prasad, Mechanical, IV Semester B.Tech'
    ].join('\n');
  } else {
    input.value = [
      '22A81A0501, Aarav Sharma, Student, CSE, IV Semester B.Tech, Participant',
      '22A81A0502, Bhavya Sri, Coordinator, AIML, IV Semester B.Tech, Student Coordinator',
      '22A81A0503, Chaitanya Varma, Winner, ECE, IV Semester B.Tech, 1st Prize',
      '22A81A0504, Divya Jyothi, Coordinator, CSE, IV Semester B.Tech, Technical Coordinator'
    ].join('\n');
  }
}

// Process and submit batch/bulk certificate issuance from text paste
async function submitBulkEventCertificates() {
  if (!currentEventCertEventId) {
    showToast('Please select an event before issuing batch certificates', 'error');
    return;
  }

  const rawText = (document.getElementById('eventCertBulkInput')?.value || '').trim();
  if (!rawText) {
    showToast('Please paste at least one recipient line to proceed', 'error');
    return;
  }

  const defaultDesig = document.getElementById('bulkDefaultDesignation')?.value || 'Student Coordinator';
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const recipients = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Support tab-separated (from Excel) or comma-separated
    const parts = line.includes('\t') 
      ? line.split('\t').map(p => p.trim())
      : line.split(',').map(p => p.trim());

    if (parts.length < 2) continue;

    const roll_no = parts[0];
    const name = parts[1];

    if (currentBulkTarget === 'coordinators') {
      // Coordinator Mode: RollNo, Name, [Branch], [Semester], [Designation]
      const branch = parts[2] || 'CSE';
      const semester = parts[3] || 'IV Semester B.Tech';
      const designation = parts[4] || defaultDesig;

      recipients.push({
        roll_no,
        name,
        branch,
        semester,
        role: 'Coordinator',
        designation,
        certificate_type: 'Coordination'
      });

    } else if (currentBulkTarget === 'appreciation') {
      // Appreciation Mode: RollNo, Name, [Branch], [Semester], [Position]
      const branch = parts[2] || 'CSE';
      const semester = parts[3] || 'IV Semester B.Tech';
      const position = parts[4] || 'Winner';

      recipients.push({
        roll_no,
        name,
        branch,
        semester,
        role: 'Winner',
        designation: position,
        position: position,
        certificate_type: 'Appreciation'
      });

    } else if (currentBulkTarget === 'participants') {
      // Participant Mode: RollNo, Name, [Branch], [Semester]
      const branch = parts[2] || 'CSE';
      const semester = parts[3] || 'IV Semester B.Tech';

      recipients.push({
        roll_no,
        name,
        branch,
        semester,
        role: 'Student',
        designation: 'Participant',
        certificate_type: 'Participation'
      });

    } else {
      // Mixed Mode: RollNo, Name, [Role], [Branch], [Semester], [Designation]
      const roleInput = parts[2] || 'Student';
      const isApprec = roleInput.toLowerCase().includes('winner') || roleInput.toLowerCase().includes('prize') || roleInput.toLowerCase().includes('appreciation');
      const isCoord = !isApprec && roleInput.toLowerCase().includes('coordinator');
      const branch = parts[3] || 'CSE';
      const semester = parts[4] || 'IV Semester B.Tech';
      const designation = parts[5] || (isApprec ? 'Winner' : isCoord ? defaultDesig : 'Participant');

      recipients.push({
        roll_no,
        name,
        role: isApprec ? 'Winner' : isCoord ? 'Coordinator' : 'Student',
        branch,
        semester,
        designation,
        position: isApprec ? designation : '',
        certificate_type: isApprec ? 'Appreciation' : isCoord ? 'Coordination' : 'Participation'
      });
    }
  }

  if (recipients.length === 0) {
    showToast('Could not parse any valid recipient lines from input', 'error');
    return;
  }

  const submitBtn = document.getElementById('bulkCertSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = `Processing ${recipients.length} recipients...`;

  try {
    const defaultRole = currentBulkTarget === 'coordinators' ? 'Coordinator' : currentBulkTarget === 'appreciation' ? 'Winner' : 'Student';
    const defaultCertType = currentBulkTarget === 'coordinators' ? 'Coordination' : currentBulkTarget === 'appreciation' ? 'Appreciation' : 'Participation';

    const { res, data } = await safeFetch(`/api/events/${currentEventCertEventId}/bulk-issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        recipients,
        default_role: defaultRole,
        default_certificate_type: defaultCertType,
        default_designation: defaultDesig
      })
    });

    submitBtn.disabled = false;
    submitBtn.textContent = '⚡ Process & Issue All Batch Certificates';

    if (res.ok && data.success) {
      showToast(data.message || 'Batch certificates issued successfully!', 'success');
      document.getElementById('eventCertBulkInput').value = '';
      await loadEventCertificates(currentEventCertEventId);
      loadStats();
    } else {
      showToast(data.message || 'Failed to complete batch issuance', 'error');
    }
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = '⚡ Process & Issue All Batch Certificates';
    showToast('Batch issuance error: ' + err.message, 'error');
  }
}

// Revoke/Delete a certificate
async function revokeEventCertificate(participationId, name) {
  if (!confirm(`Are you sure you want to revoke and delete the certificate for "${name}"?`)) {
    return;
  }

  try {
    const { res, data } = await safeFetch(`/api/events/${currentEventCertEventId}/certificates/${participationId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });

    if (res.ok && data.success) {
      showToast('Certificate revoked successfully', 'info');
      await loadEventCertificates(currentEventCertEventId);
      loadStats();
    } else {
      showToast(data.message || 'Failed to revoke certificate', 'error');
    }
  } catch (err) {
    showToast('Revocation error: ' + err.message, 'error');
  }
}

// Format numeric positions (e.g. 4, 5) to ordinals (4th, 5th)
function formatPositionClient(val) {
  if (val === null || val === undefined) return '';
  let str = String(val).trim();
  if (!str) return '';

  // If pure number like 1, 2, 3, 4, 5, etc., convert to 1st, 2nd, 3rd, 4th, 5th
  if (/^\d+$/.test(str)) {
    const num = parseInt(str, 10);
    const j = num % 10;
    const k = num % 100;
    if (j === 1 && k !== 11) return `${num}st`;
    if (j === 2 && k !== 12) return `${num}nd`;
    if (j === 3 && k !== 13) return `${num}rd`;
    return `${num}th`;
  }
  return str;
}

// Open Edit Position Modal for single certificate
function openEditPositionModal(partId, studentName, studentRoll, currentPos) {
  const modal = document.getElementById('editPositionModal');
  if (!modal) return;

  document.getElementById('editPosParticipationId').value = partId;
  document.getElementById('editPosStudentName').textContent = studentName || 'Student';
  document.getElementById('editPosStudentRoll').textContent = studentRoll || '';

  const select = document.getElementById('editPosSelect');
  const customInput = document.getElementById('editPosCustomInput');
  const formatted = formatPositionClient(currentPos) || '1st';

  let found = false;
  for (let i = 0; i < select.options.length; i++) {
    if (select.options[i].value.toLowerCase() === formatted.toLowerCase()) {
      select.selectedIndex = i;
      found = true;
      break;
    }
  }

  if (!found) {
    select.value = '__custom__';
    customInput.value = formatted;
    customInput.style.display = 'block';
  } else {
    customInput.style.display = 'none';
  }

  modal.classList.add('active');
}

function closeEditPositionModal() {
  const modal = document.getElementById('editPositionModal');
  if (modal) modal.classList.remove('active');
}

function checkEditPosCustom(val) {
  const customInput = document.getElementById('editPosCustomInput');
  if (!customInput) return;
  if (val === '__custom__') {
    customInput.style.display = 'block';
    customInput.focus();
  } else {
    customInput.style.display = 'none';
  }
}

// Save Position / Rank Modal submission
async function handleSavePositionModal(e) {
  e.preventDefault();
  if (!currentEventCertEventId) {
    showToast('No active event selected', 'error');
    return;
  }

  const partId = document.getElementById('editPosParticipationId').value;
  const select = document.getElementById('editPosSelect');
  const customInput = document.getElementById('editPosCustomInput');

  let pos = select.value === '__custom__' ? customInput.value.trim() : select.value;
  pos = formatPositionClient(pos);

  if (!pos) {
    showToast('Please select or specify a position/rank', 'error');
    return;
  }

  const submitBtn = document.getElementById('editPosSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Saving...';

  try {
    const { res, data } = await safeFetch(`/api/events/${currentEventCertEventId}/certificates/${partId}/position`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        position: pos,
        designation: pos,
        role: 'Winner',
        certificate_type: 'Appreciation'
      })
    });

    submitBtn.disabled = false;
    submitBtn.textContent = '💾 Save Position';

    if (res.ok && data.success) {
      showToast(data.message || `Position updated to "${pos}"!`, 'success');
      closeEditPositionModal();
      await loadEventCertificates(currentEventCertEventId);
      loadStats();
    } else {
      showToast(data.message || 'Failed to update position', 'error');
    }
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = '💾 Save Position';
    showToast('Position update error: ' + err.message, 'error');
  }
}

// Export All Certificates for Current Event to an Excel File (.xlsx)
async function exportCurrentEventCertificatesToExcel() {
  if (!currentEventCertEventId) {
    showToast('Please select an event before exporting', 'error');
    return;
  }

  const activeEvent = eventsCache.find(e => e._id === currentEventCertEventId) || {};
  const eventName = activeEvent.event_name || 'Event';

  // Client-side export using currentEventCertsList if available
  if (typeof XLSX !== 'undefined' && currentEventCertsList && currentEventCertsList.length > 0) {
    try {
      const rows = currentEventCertsList.map((c, idx) => {
        const isApprec = c.isAppreciation || c.certificateType === 'Appreciation' || Boolean(c.position);
        const isCoord = !isApprec && (c.isCoordinator || (c.role || '').toLowerCase().includes('coordinator'));

        let category = 'Participation';
        let positionVal = '';
        if (isApprec) {
          category = 'Appreciation';
          positionVal = c.position || c.designation || 'Winner';
        } else if (isCoord) {
          category = 'Coordination';
          positionVal = '';
        }

        return {
          'S.No': idx + 1,
          'Roll Number': c.student?.roll_no || '',
          'Full Name': c.student?.name || '',
          'Branch': c.student?.branch || 'CSE',
          'Semester': c.student?.semester || 'IV Semester B.Tech',
          'Category': category,
          'Role': c.role || (isApprec ? 'Winner' : isCoord ? 'Coordinator' : 'Student'),
          'Position / Rank': positionVal,
          'Designation': c.designation || (isApprec ? positionVal : isCoord ? 'Student Coordinator' : 'Participant'),
          'Certificate ID': c.certificateId || '',
          'Issue Date': c.issueDate || '',
          'Email': c.student?.email || ''
        };
      });

      const ws = XLSX.utils.json_to_sheet(rows);
      ws['!cols'] = [
        { wch: 6 },
        { wch: 16 },
        { wch: 26 },
        { wch: 14 },
        { wch: 22 },
        { wch: 16 },
        { wch: 16 },
        { wch: 18 },
        { wch: 24 },
        { wch: 28 },
        { wch: 16 },
        { wch: 26 }
      ];

      const wb = XLSX.utils.book_new();
      const safeSheet = eventName.substring(0, 31).replace(/[\\/?*[\]]/g, '') || 'Certificates';
      XLSX.utils.book_append_sheet(wb, ws, safeSheet);

      const fileName = `${eventName.replace(/[^a-zA-Z0-9_-]/g, '_')}_certificates.xlsx`;
      XLSX.writeFile(wb, fileName);
      showToast(`Exported ${rows.length} certificate records to Excel!`, 'success');
      return;
    } catch (err) {
      console.warn('Client Excel export failed, falling back to server download:', err);
    }
  }

  // Server-side fallback
  try {
    const res = await fetch(`/api/events/${currentEventCertEventId}/export-excel`, {
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    if (!res.ok) throw new Error('Server export failed');
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${eventName.replace(/[^a-zA-Z0-9_-]/g, '_')}_certificates.xlsx`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
    showToast('Exported certificates to Excel successfully!', 'success');
  } catch (err) {
    showToast('Failed to export Excel: ' + err.message, 'error');
  }
}

// Upload Excel to Batch Update Student Positions
async function handleExcelPositionsUpload(e) {
  const file = e.target.files ? e.target.files[0] : null;
  if (!file) return;

  if (!currentEventCertEventId) {
    showToast('Please select an event before updating positions', 'error');
    e.target.value = '';
    return;
  }

  showToast(`Uploading ${file.name} to update positions...`, 'info');

  try {
    const formData = new FormData();
    formData.append('file', file);

    const res = await fetch(`/api/events/${currentEventCertEventId}/update-positions-excel`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    const data = await res.json();
    e.target.value = '';

    if (res.ok && data.success) {
      showToast(data.message || `Positions updated for ${data.updatedCount} students!`, 'success');
      await loadEventCertificates(currentEventCertEventId);
      loadStats();
    } else {
      showToast(data.message || 'Failed to update positions from Excel', 'error');
    }
  } catch (err) {
    e.target.value = '';
    showToast('Excel update error: ' + err.message, 'error');
  }
}

// Quick Create Separate Event Modal
function openQuickEventModal() {
  document.getElementById('quickEventName').value = '';
  document.getElementById('quickEventDate').value = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  document.getElementById('quickEventDesc').value = '';
  document.getElementById('quickEventModal').classList.add('active');
}

function closeQuickEventModal() {
  document.getElementById('quickEventModal').classList.remove('active');
}

async function handleQuickCreateEvent(e) {
  e.preventDefault();
  const name = document.getElementById('quickEventName').value.trim();
  const date = document.getElementById('quickEventDate').value.trim();
  const category = document.getElementById('quickEventCategory').value.trim();
  const description = document.getElementById('quickEventDesc').value.trim();

  const submitBtn = document.getElementById('quickEventSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Creating Event...';

  try {
    const { res, data } = await safeFetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({
        event_name: name,
        event_date: date,
        category: category || 'Separate Event',
        description
      })
    });

    submitBtn.disabled = false;
    submitBtn.textContent = 'Create & Select Event';

    if (res.ok && data.success && data.event) {
      showToast(`Separate event "${name}" created successfully!`, 'success');
      closeQuickEventModal();
      await loadEvents();
      currentEventCertEventId = data.event._id;
      populateEventCertSelect(currentEventCertEventId);
      await loadEventCertificates(currentEventCertEventId);
    } else {
      showToast(data.message || 'Failed to create event', 'error');
    }
  } catch (err) {
    submitBtn.disabled = false;
    submitBtn.textContent = 'Create & Select Event';
    showToast('Event creation error: ' + err.message, 'error');
  }
}

// Decode helper for button handlers
function openAdminCertPreviewFromEncoded(jsonStr) {
  try {
    const cert = JSON.parse(decodeURIComponent(jsonStr));
    openAdminCertPreview(cert);
  } catch (e) {
    showToast('Preview error: ' + e.message, 'error');
  }
}

function directDownloadEventCertFromEncoded(jsonStr, type) {
  try {
    const cert = JSON.parse(decodeURIComponent(jsonStr));
    directDownloadAdminEventCert(cert, type);
  } catch (e) {
    showToast('Download error: ' + e.message, 'error');
  }
}

// Preview Modal Open & Render
async function openAdminCertPreview(cert) {
  activeAdminPreviewCert = cert;
  const modal = document.getElementById('adminCertPreviewModal');
  const title = document.getElementById('adminModalCertTitle');
  const badge = document.getElementById('adminModalRoleBadge');
  const subtitle = document.getElementById('adminModalCertSubtitle');

  const isCoord = cert.isCoordinator || (cert.role || '').toLowerCase().includes('coordinator') || cert.certificateType === 'Coordination';
  const isApprec = cert.isAppreciation || cert.certificateType === 'Appreciation' || Boolean(cert.position) || (cert.role || '').toLowerCase().includes('winner');

  if (isApprec) {
    title.textContent = 'Certificate of Appreciation';
    badge.textContent = `🏅 ${cert.position || 'Winner'}`;
    badge.className = 'badge badge-success';
  } else if (isCoord) {
    title.textContent = 'Coordinator Certificate of Appreciation';
    badge.textContent = `⭐ ${cert.designation || 'Coordinator'}`;
    badge.className = 'badge badge-warning';
  } else {
    title.textContent = 'Student Certificate of Participation';
    badge.textContent = '🎓 Participant';
    badge.className = 'badge badge-primary';
  }

  const activeEvent = eventsCache.find(e => e._id === currentEventCertEventId) || {};
  let tplDesc = '';
  if (activeEvent.use_main_template !== false) {
    tplDesc = isApprec ? 'Institutional Appreciation Template' : (isCoord ? 'Dedicated Coordination Template' : 'Institutional Participation Template');
  } else {
    if (isApprec) {
      tplDesc = activeEvent.appreciation_template?.template_name || 'Custom Appreciation Template';
    } else if (isCoord) {
      tplDesc = activeEvent.coordinator_template?.template_name || 'Custom Coordinator Template';
    } else {
      tplDesc = activeEvent.template?.template_name || 'Custom Participant Template';
    }
  }

  subtitle.textContent = `${cert.student?.name} (${cert.student?.roll_no}) • ${tplDesc}`;

  modal.classList.add('active');
  await drawAdminCertificateCanvas(cert);
}

function closeAdminCertModal() {
  document.getElementById('adminCertPreviewModal').classList.remove('active');
}

// Core Canvas Drawing Engine using Dedicated Coordinator, Appreciation & Participation Templates
async function drawAdminCertificateCanvas(cert) {
  const canvas = document.getElementById('adminCertCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  const isCoord = cert.isCoordinator || (cert.role || '').toLowerCase().includes('coordinator') || cert.certificateType === 'Coordination';
  const isApprec = cert.isAppreciation || cert.certificateType === 'Appreciation' || Boolean(cert.position) || (cert.role || '').toLowerCase().includes('winner');
  const activeEvent = eventsCache.find(e => e._id === currentEventCertEventId) || {};
  const eventName = activeEvent.event_name || 'College Event';

  // 1. Resolve template dynamically from event or active library templates
  let chosenTemplate = null;
  if (isApprec) {
    if (activeEvent.use_main_template === false && activeEvent.appreciation_template) {
      chosenTemplate = activeEvent.appreciation_template;
    }
    if (!chosenTemplate) {
      chosenTemplate = allTemplatesList.find(t => t.template_type === 'appreciation' && t.is_active)
        || allTemplatesList.find(t => t.template_type === 'appreciation');
    }
  } else if (isCoord) {
    if (activeEvent.use_main_template === false && activeEvent.coordinator_template) {
      chosenTemplate = activeEvent.coordinator_template;
    }
    if (!chosenTemplate) {
      chosenTemplate = allTemplatesList.find(t => t.template_type === 'coordination' && t.is_active)
        || allTemplatesList.find(t => t.template_type === 'coordination');
    }
  } else {
    if (activeEvent.use_main_template === false && activeEvent.template) {
      chosenTemplate = activeEvent.template;
    }
    if (!chosenTemplate) {
      chosenTemplate = allTemplatesList.find(t => t.template_type === 'participation' && t.is_active)
        || allTemplatesList.find(t => t.template_type === 'participation');
    }
  }

  // Fallback to currently selected template in studio if needed
  if (!chosenTemplate && currentTemplate) {
    if (isApprec && currentTemplate.template_type === 'appreciation') {
      chosenTemplate = currentTemplate;
    } else if (isCoord && currentTemplate.template_type === 'coordination') {
      chosenTemplate = currentTemplate;
    } else if (!isCoord && !isApprec && currentTemplate.template_type === 'participation') {
      chosenTemplate = currentTemplate;
    }
  }

  const defaultImage = isApprec
    ? '/templates/svec_appreciation_template.jpg'
    : (isCoord ? '/templates/svec_coordinator_template.jpg' : '/templates/svec_template.jpg');
  const templateFile = chosenTemplate?.template_file || defaultImage;
  const cfg = chosenTemplate?.fields_config || {};

  canvas.width = cfg.canvas_width || 1024;
  canvas.height = cfg.canvas_height || 682;

  const isDedicatedCoordTemplate = isCoord && (
    (chosenTemplate?.template_type === 'coordination') ||
    templateFile.includes('coordinator') ||
    templateFile.includes('COORD')
  );

  const isDedicatedApprecTemplate = isApprec && (
    (chosenTemplate?.template_type === 'appreciation') ||
    templateFile.includes('appreciation')
  );

  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => {
      if (img.src && !img.src.includes(defaultImage)) {
        img.src = defaultImage;
      } else {
        reject(new Error('Failed to load certificate template image'));
      }
    };
    img.src = templateFile;
  });

  // 1. Draw base certificate template
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const student = cert.student || {};

  // Extract tuned coordinates with safe defaults for each template type
  let defaultNameX = 350, defaultNameY = 355, defaultNameSize = 20;
  let defaultSemX = 125, defaultSemY = 382, defaultSemSize = 16;
  let defaultBranchX = 360, defaultBranchY = 382, defaultBranchSize = 16;
  let defaultRollX = 690, defaultRollY = 382, defaultRollSize = 16;
  let defaultEventX = 400, defaultEventY = 409, defaultEventSize = 16, defaultEventColor = '#7b1113';

  if (isDedicatedCoordTemplate) {
    defaultNameX = 390; defaultNameY = 300; defaultNameSize = 20;
    defaultSemX = 170; defaultSemY = 332; defaultSemSize = 18;
    defaultBranchX = 404; defaultBranchY = 332; defaultBranchSize = 18;
    defaultRollX = 731; defaultRollY = 332; defaultRollSize = 18;
  } else if (isDedicatedApprecTemplate || isApprec) {
    defaultNameX = 340; defaultNameY = 355; defaultNameSize = 20;
    defaultSemX = 125; defaultSemY = 382; defaultSemSize = 16;
    defaultBranchX = 360; defaultBranchY = 382; defaultBranchSize = 16;
    defaultRollX = 690; defaultRollY = 382; defaultRollSize = 16;
    defaultEventX = 500; defaultEventY = 409; defaultEventSize = 16; defaultEventColor = '#1a1a2e';
  }

  const nameX = cfg.name?.x ?? defaultNameX;
  const nameY = cfg.name?.y ?? defaultNameY;
  const nameSize = cfg.name?.fontSize ?? defaultNameSize;

  const semX = cfg.semester?.x ?? defaultSemX;
  const semY = cfg.semester?.y ?? defaultSemY;
  const semSize = cfg.semester?.fontSize ?? defaultSemSize;

  const branchX = cfg.branch?.x ?? defaultBranchX;
  const branchY = cfg.branch?.y ?? defaultBranchY;
  const branchSize = cfg.branch?.fontSize ?? defaultBranchSize;

  const rollX = cfg.roll_no?.x ?? defaultRollX;
  const rollY = cfg.roll_no?.y ?? defaultRollY;
  const rollSize = cfg.roll_no?.fontSize ?? defaultRollSize;

  const posX = cfg.position?.x ?? 210;
  const posY = cfg.position?.y ?? 409;
  const posSize = cfg.position?.fontSize ?? 17;
  const posColor = cfg.position?.color ?? '#7b1113';

  const eventX = cfg.events?.x ?? defaultEventX;
  const eventY = cfg.events?.y ?? defaultEventY;
  const eventSize = cfg.events?.fontSize ?? defaultEventSize;
  const eventColor = cfg.events?.color ?? defaultEventColor;

  ctx.textBaseline = 'middle';

  // 2. COORDINATOR ADAPTATIONS (ONLY when rendering coordinator on participation template)
  if (isCoord && !isDedicatedCoordTemplate && !isDedicatedApprecTemplate) {
    ctx.fillStyle = '#faf8f5';
    ctx.beginPath();
    ctx.roundRect(320, 285, 384, 26, 4);
    ctx.fill();

    ctx.font = '700 19px "Playfair Display", Georgia, serif';
    ctx.fillStyle = '#7b1113';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '3px';
    ctx.fillText('OF  APPRECIATION', 512, 298);
    ctx.letterSpacing = '0px';

    // Ribbon badge top right
    const desigText = (cert.designation || 'EVENT COORDINATOR').toUpperCase();
    ctx.save();
    ctx.textAlign = 'center';
    const badgeW = Math.max(220, desigText.length * 9 + 40);
    const badgeX = 860 - badgeW / 2;
    const badgeY = 248;
    ctx.fillStyle = 'rgba(123, 17, 19, 0.95)';
    ctx.beginPath();
    ctx.roundRect(badgeX, badgeY - 13, badgeW, 26, 13);
    ctx.fill();
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.font = '700 10.5px "Plus Jakarta Sans", sans-serif';
    ctx.fillStyle = '#fef3c7';
    ctx.fillText(`★  ${desigText}  ★`, 860, badgeY);
    ctx.restore();
  }

  // 3. Render Recipient Dynamic Data with tuned font sizes and colors
  ctx.textAlign = 'left';

  // Name (Playfair serif)
  ctx.font = `bold ${nameSize}px "Playfair Display", Georgia, serif`;
  ctx.fillStyle = cfg.name?.color || '#1a1a2e';
  ctx.fillText(student.name || '-', nameX, nameY);

  // Semester
  ctx.font = `bold ${semSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = cfg.semester?.color || '#1a1a2e';
  ctx.fillText(student.semester || 'IV Semester', semX, semY);

  // Branch (with auto-scaling for long branch names)
  const branchText = student.branch || 'CSE';
  let curBranchSize = branchSize;
  ctx.font = `bold ${curBranchSize}px "Plus Jakarta Sans", sans-serif`;
  while (ctx.measureText(branchText).width > 220 && curBranchSize > 11) {
    curBranchSize--;
    ctx.font = `bold ${curBranchSize}px "Plus Jakarta Sans", sans-serif`;
  }
  ctx.fillStyle = cfg.branch?.color || '#1a1a2e';
  ctx.fillText(branchText, branchX, branchY);

  // Roll Number / Coordinator ID
  ctx.font = `bold ${rollSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = cfg.roll_no?.color || '#1a1a2e';
  ctx.fillText(student.roll_no || '-', rollX, rollY);

  // Appreciation Position Field
  if (isApprec || isDedicatedApprecTemplate) {
    let positionText = (cert.position || '').trim();
    if (!positionText || positionText.toLowerCase() === 'participant' || positionText.toLowerCase() === 'student') {
      if (cert.designation && !['participant', 'student', 'student coordinator'].includes(cert.designation.toLowerCase())) {
        positionText = cert.designation.trim();
      } else if (cert.role && !['participant', 'student', 'coordinator'].includes(cert.role.toLowerCase())) {
        positionText = cert.role.trim();
      } else {
        positionText = 'Winner';
      }
    }
    ctx.font = `bold ${posSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = posColor;
    ctx.fillText(positionText, posX, posY);
  }

  // Event & Role display: ONLY on participation and appreciation templates (dedicated coordinator template omits events line)
  if (!isDedicatedCoordTemplate) {
    let curEventSize = eventSize;
    ctx.font = `bold ${curEventSize}px "Plus Jakarta Sans", sans-serif`;
    ctx.fillStyle = eventColor;
    let fullEventText = eventName;
    if (isCoord) {
      fullEventText = `${eventName} (${cert.designation || 'Student Coordinator'})`;
    }
    const maxEvtWidth = (isApprec || isDedicatedApprecTemplate) ? 460 : 540;
    while (ctx.measureText(fullEventText).width > maxEvtWidth && curEventSize > 11) {
      curEventSize--;
      ctx.font = `bold ${curEventSize}px "Plus Jakarta Sans", sans-serif`;
    }
    ctx.fillText(fullEventText, eventX, eventY);
  }

  // 4. Security Verification ID & Issue Date at Bottom
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
  ctx.textAlign = 'left';
  const roleCode = isApprec ? 'APPR' : (isCoord ? 'COORD' : 'CERT');
  const certIdDisplay = cert.certificateId || `SVEC-${roleCode}-${(student.roll_no || 'REC')}`;
  ctx.fillText(`ID: ${certIdDisplay} | Issued: ${cert.issueDate || 'Verified'} | Sri Vasavi Engg College`, 32, canvas.height - 18);
}

// Download Active Canvas as PDF
function downloadAdminActivePDF() {
  const canvas = document.getElementById('adminCertCanvas');
  if (!canvas || !activeAdminPreviewCert) return;

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [canvas.width, canvas.height]
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    doc.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);

    const safeRoll = (activeAdminPreviewCert.student?.roll_no || 'Roll').replace(/[^a-zA-Z0-9]/g, '_');
    const safeName = (activeAdminPreviewCert.student?.name || 'Recipient').replace(/[^a-zA-Z0-9]/g, '_');
    const isCoord = activeAdminPreviewCert.isCoordinator || (activeAdminPreviewCert.role || '').toLowerCase().includes('coordinator') || activeAdminPreviewCert.certificateType === 'Coordination';
    const isApprec = activeAdminPreviewCert.isAppreciation || activeAdminPreviewCert.certificateType === 'Appreciation' || Boolean(activeAdminPreviewCert.position) || (activeAdminPreviewCert.role || '').toLowerCase().includes('winner');
    const roleTag = isApprec ? 'Appreciation' : (isCoord ? 'Coordinator' : 'Participant');
    const filename = `${safeRoll}_${safeName}_${roleTag}_Certificate.pdf`;

    doc.save(filename);
    showToast(`PDF Downloaded: ${filename}`, 'success');
  } catch (err) {
    console.error('PDF Export error:', err);
    showToast('Failed to export PDF: ' + err.message, 'error');
  }
}

// Download Active Canvas as PNG
function downloadAdminActivePNG() {
  const canvas = document.getElementById('adminCertCanvas');
  if (!canvas || !activeAdminPreviewCert) return;

  const safeRoll = (activeAdminPreviewCert.student?.roll_no || 'Roll').replace(/[^a-zA-Z0-9]/g, '_');
  const safeName = (activeAdminPreviewCert.student?.name || 'Recipient').replace(/[^a-zA-Z0-9]/g, '_');
  const isCoord = activeAdminPreviewCert.isCoordinator || (activeAdminPreviewCert.role || '').toLowerCase().includes('coordinator') || activeAdminPreviewCert.certificateType === 'Coordination';
  const isApprec = activeAdminPreviewCert.isAppreciation || activeAdminPreviewCert.certificateType === 'Appreciation' || Boolean(activeAdminPreviewCert.position) || (activeAdminPreviewCert.role || '').toLowerCase().includes('winner');
  const roleTag = isApprec ? 'Appreciation' : (isCoord ? 'Coordinator' : 'Participant');
  const filename = `${safeRoll}_${safeName}_${roleTag}_Certificate.png`;

  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast(`Image Downloaded: ${filename}`, 'success');
}

// Direct Download from table row without opening modal first
async function directDownloadAdminEventCert(cert, format = 'pdf') {
  activeAdminPreviewCert = cert;
  showToast(`Generating ${format.toUpperCase()} certificate...`, 'info');
  await drawAdminCertificateCanvas(cert);

  if (format === 'pdf') {
    downloadAdminActivePDF();
  } else {
    downloadAdminActivePNG();
  }
}


