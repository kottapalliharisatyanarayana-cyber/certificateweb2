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

      statDbMode.textContent = data.stats.dbMode || 'Connected';
      sidebarTemplate.textContent = data.stats.activeTemplate || 'Sri Vasavi College';

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
    }
  } catch (err) {
    console.error('Events load error:', err);
  }
}

function renderEventsTable() {
  const tbody = document.getElementById('eventsTableBody');
  if (!tbody) return;

  if (eventsCache.length === 0) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 2rem;">No events registered yet.</td></tr>';
    return;
  }

  tbody.innerHTML = eventsCache.map(evt => `
    <tr>
      <td><strong>${escapeHtml(evt.event_name)}</strong></td>
      <td>${escapeHtml(evt.event_date || 'N/A')}</td>
      <td><span class="badge badge-primary">${evt.participantCount || 0} participants</span></td>
      <td style="text-align: right;">
        <button class="btn btn-danger btn-sm" onclick="deleteEvent('${evt._id}', '${escapeHtml(evt.event_name)}')">Delete</button>
      </td>
    </tr>
  `).join('');
}

async function handleCreateEvent(e) {
  e.preventDefault();
  const name = document.getElementById('newEventName').value.trim();
  const date = document.getElementById('newEventDate').value.trim();
  const desc = document.getElementById('newEventDesc').value.trim();

  try {
    const res = await fetch('/api/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ event_name: name, event_date: date, description: desc })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast(`Event "${name}" created successfully!`, 'success');
      document.getElementById('newEventName').value = '';
      document.getElementById('newEventDate').value = '';
      document.getElementById('newEventDesc').value = '';
      loadEvents();
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

// 6. TEMPLATE STUDIO (LIVE INTERACTIVE COORDINATE TUNING)
async function loadTemplateStudio() {
  try {
    const res = await fetch('/api/templates/active');
    const data = await res.json();

    if (res.ok && data.success && data.template) {
      currentTemplate = data.template;
      populateStudioInputs(data.template.fields_config);
      await drawStudioPreview();
    }
  } catch (err) {
    console.error('Template load error:', err);
  }
}

function populateStudioInputs(cfg) {
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

  setInputValue('coord-events-x', cfg.events?.x || 400);
  setInputValue('coord-events-y', cfg.events?.y || 409);
  setInputValue('coord-events-size', cfg.events?.fontSize || 16);
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

  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => {
      const fallbackSrc = '/templates/svec_template.jpg';
      if (img.src && !img.src.includes(fallbackSrc)) {
        console.warn('Template image failed to load, falling back to default:', currentTemplate.template_file);
        img.onerror = () => reject(new Error('Failed to load template'));
        img.src = fallbackSrc;
      } else {
        reject(new Error('Failed to load template'));
      }
    };
    img.src = currentTemplate.template_file || '/templates/svec_template.jpg';
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

  const evtX = getInputValue('coord-events-x', 400);
  const evtY = getInputValue('coord-events-y', 409);
  const evtSize = getInputValue('coord-events-size', 16);

  ctx.textBaseline = 'middle';

  ctx.font = `bold ${nameSize}px "Playfair Display", Georgia, serif`;
  ctx.fillStyle = '#1a1a2e';
  ctx.fillText('Aarav Sharma', nameX, nameY);

  ctx.font = `bold ${semSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#1a1a2e';
  ctx.fillText('IV Semester', semX, semY);

  ctx.font = `bold ${branchSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#1a1a2e';
  ctx.fillText('CSE', branchX, branchY);

  ctx.font = `bold ${rollSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#1a1a2e';
  ctx.fillText('22A81A0501', rollX, rollY);

  ctx.font = `bold ${evtSize}px "Plus Jakarta Sans", sans-serif`;
  ctx.fillStyle = '#7b1113';
  ctx.fillText('Tech Trifecta & Engineers Day', evtX, evtY);
}

// Save template coordinates
async function saveTemplateCoordinates() {
  if (!currentTemplate) return;

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
    },
    events: {
      x: getInputValue('coord-events-x', 400),
      y: getInputValue('coord-events-y', 409),
      fontSize: getInputValue('coord-events-size', 16),
      fontFamily: 'Inter, sans-serif',
      fontWeight: 'bold',
      color: '#7b1113',
      align: 'left'
    }
  };

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
      showToast('Template coordinates saved successfully!', 'success');
    } else {
      showToast(data.message || 'Failed to save template coordinates', 'error');
    }
  } catch (err) {
    showToast('Save error: ' + err.message, 'error');
  }
}

function resetStudioCoordinates() {
  populateStudioInputs({
    name: { x: 350, y: 355, fontSize: 20 },
    semester: { x: 125, y: 382, fontSize: 16 },
    branch: { x: 360, y: 382, fontSize: 16 },
    roll_no: { x: 690, y: 382, fontSize: 16 },
    events: { x: 400, y: 409, fontSize: 16 }
  });
  drawStudioPreview();
  showToast('Coordinates reset to defaults', 'info');
}

// Upload new template image
async function handleUploadNewTemplate(e) {
  const file = e.target.files[0];
  if (!file) return;

  const formData = new FormData();
  formData.append('template_image', file);
  formData.append('template_name', file.name.replace(/\.[^/.]+$/, ''));

  try {
    const res = await fetch('/api/templates/upload', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${authToken}` },
      body: formData
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showToast('New template uploaded!', 'success');
      await fetch(`/api/templates/${data.template._id}/activate`, {
        method: 'PUT',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      currentTemplate = data.template;
      populateStudioInputs(currentTemplate.fields_config);
      drawStudioPreview();
    } else {
      showToast(data.message || 'Template upload failed', 'error');
    }
  } catch (err) {
    showToast('Upload error: ' + err.message, 'error');
  }
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

    // 2. Update count pills
    const pillAll = document.getElementById('countPillAll');
    const pillStudents = document.getElementById('countPillStudents');
    const pillCoords = document.getElementById('countPillCoordinators');
    if (pillAll) pillAll.textContent = data.counts?.total || currentEventCertsList.length;
    if (pillStudents) pillStudents.textContent = data.counts?.students || 0;
    if (pillCoords) pillCoords.textContent = data.counts?.coordinators || 0;

    // 3. Show sections
    document.getElementById('eventCertSummaryBar').style.display = 'block';
    document.getElementById('eventCertIssuanceContainer').style.display = 'block';

    // 4. Render table
    renderEventCertificatesTable();
  } catch (err) {
    console.error('Event certificates load error:', err);
    showToast('Failed to load certificates: ' + err.message, 'error');
  }
}

// Filter tabs handling (All, Students, Coordinators)
function setEventCertFilter(filter) {
  currentEventCertFilter = filter;
  const tabAll = document.getElementById('filterTabAll');
  const tabStudents = document.getElementById('filterTabStudents');
  const tabCoords = document.getElementById('filterTabCoordinators');

  if (tabAll) tabAll.className = filter === 'all' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost';
  if (tabStudents) tabStudents.className = filter === 'students' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost';
  if (tabCoords) tabCoords.className = filter === 'coordinators' ? 'btn btn-sm btn-primary' : 'btn btn-sm btn-ghost';

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
    // Role filter
    if (currentEventCertFilter === 'students' && c.isCoordinator) return false;
    if (currentEventCertFilter === 'coordinators' && !c.isCoordinator) return false;

    // Search query filter
    if (query) {
      const matchRoll = (c.student?.roll_no || '').toLowerCase().includes(query);
      const matchName = (c.student?.name || '').toLowerCase().includes(query);
      const matchBranch = (c.student?.branch || '').toLowerCase().includes(query);
      const matchDesig = (c.designation || '').toLowerCase().includes(query);
      return matchRoll || matchName || matchBranch || matchDesig;
    }
    return true;
  });

  if (list.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; padding: 2.5rem; color: var(--text-muted);">
          No ${currentEventCertFilter === 'coordinators' ? 'coordinator' : currentEventCertFilter === 'students' ? 'student' : ''} certificates found matching your criteria.
        </td>
      </tr>
    `;
    return;
  }

  tbody.innerHTML = list.map(c => {
    const isCoord = c.isCoordinator;
    const roleBadge = isCoord
      ? `<span class="badge" style="background: #fef3c7; color: #92400e; border: 1px solid #fde68a;">⭐ ${escapeHtml(c.designation || 'Coordinator')}</span>`
      : `<span class="badge badge-primary">🎓 Student</span>`;

    const certTypeBadge = isCoord
      ? `<span style="font-size: 0.8rem; font-weight: 600; color: #b45309;">📜 Appreciation</span>`
      : `<span style="font-size: 0.8rem; font-weight: 600; color: #1e40af;">📜 Participation</span>`;

    // Package certificate data safely for button onclick
    const certJsonStr = encodeURIComponent(JSON.stringify(c));

    return `
      <tr>
        <td><strong style="color: ${isCoord ? '#b45309' : 'var(--primary)'}; font-family: monospace;">${escapeHtml(c.student?.roll_no || '-')}</strong></td>
        <td>
          <div style="font-weight: 700; color: var(--text-main);">${escapeHtml(c.student?.name || '-')}</div>
          ${c.student?.email ? `<span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(c.student.email)}</span>` : ''}
        </td>
        <td>${roleBadge}</td>
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

// Role toggle in single issuance form (Student vs Coordinator)
function handleCertRoleChange(role) {
  const cardStudent = document.getElementById('roleCardStudent');
  const cardCoordinator = document.getElementById('roleCardCoordinator');
  const coordinatorFieldsArea = document.getElementById('coordinatorFieldsArea');
  const labelRollText = document.getElementById('labelRollText');
  const certTypeSelect = document.getElementById('eventCertType');

  if (role === 'Coordinator') {
    if (cardCoordinator) {
      cardCoordinator.style.borderColor = '#d97706';
      cardCoordinator.style.background = '#fffaf0';
    }
    if (cardStudent) {
      cardStudent.style.borderColor = 'var(--surface-border)';
      cardStudent.style.background = '#fff';
    }
    if (coordinatorFieldsArea) coordinatorFieldsArea.style.display = 'block';
    if (labelRollText) labelRollText.textContent = 'Coordinator ID / Roll Number';
    if (certTypeSelect) certTypeSelect.value = 'Appreciation';
  } else {
    if (cardStudent) {
      cardStudent.style.borderColor = 'var(--primary-light)';
      cardStudent.style.background = '#eff6ff';
    }
    if (cardCoordinator) {
      cardCoordinator.style.borderColor = 'var(--surface-border)';
      cardCoordinator.style.background = '#fff';
    }
    if (coordinatorFieldsArea) coordinatorFieldsArea.style.display = 'none';
    if (labelRollText) labelRollText.textContent = 'Roll Number';
    if (certTypeSelect) certTypeSelect.value = 'Participation';
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

  let designation = 'Participant';
  let certificate_type = 'Participation';

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
    certificate_type = typeSelect ? typeSelect.value : 'Appreciation';
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
        role: isCoord ? (designation || 'Coordinator') : 'Student',
        designation,
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
  const radioStudent = document.querySelector('input[name="eventCertRoleOption"][value="Student"]');
  if (radioStudent) radioStudent.checked = true;
  handleCertRoleChange('Student');
}

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
  } else {
    btnSingle.className = 'btn btn-primary btn-sm';
    btnBulk.className = 'btn btn-secondary btn-sm';
    areaSingle.style.display = 'block';
    areaBulk.style.display = 'none';
  }
}

// Fill sample bulk rows
function fillSampleBulkEventCerts() {
  const input = document.getElementById('eventCertBulkInput');
  if (!input) return;
  input.value = [
    '22A81A0501, Aarav Sharma, Student, CSE, IV Semester B.Tech, Participant',
    '22A81A0502, Bhavya Sri, Coordinator, AIML, IV Semester B.Tech, Student Coordinator',
    '22A81A0503, Chaitanya Varma, Student, ECE, IV Semester B.Tech, Participant',
    '22A81A0504, Divya Jyothi, Coordinator, CSE, IV Semester B.Tech, Technical Coordinator'
  ].join('\n');
}

// Process and submit batch/bulk certificate issuance
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

  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const recipients = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Split comma or tab
    const parts = line.split(/[,	]/).map(p => p.trim());
    if (parts.length < 2) continue;

    const roll_no = parts[0];
    const name = parts[1];
    const roleInput = (parts[2] || 'Student');
    const isCoord = roleInput.toLowerCase().includes('coordinator');
    const branch = parts[3] || 'CSE';
    const semester = parts[4] || 'IV Semester B.Tech';
    const designation = parts[5] || (isCoord ? 'Student Coordinator' : 'Participant');

    recipients.push({
      roll_no,
      name,
      role: isCoord ? (designation || 'Student Coordinator') : 'Student',
      branch,
      semester,
      designation,
      certificate_type: isCoord ? 'Appreciation' : 'Participation'
    });
  }

  if (recipients.length === 0) {
    showToast('Could not parse any valid recipient lines from input', 'error');
    return;
  }

  const submitBtn = document.getElementById('bulkCertSubmitBtn');
  submitBtn.disabled = true;
  submitBtn.textContent = `Processing ${recipients.length} recipients...`;

  try {
    const { res, data } = await safeFetch(`/api/events/${currentEventCertEventId}/bulk-issue`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${authToken}`
      },
      body: JSON.stringify({ recipients })
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

  const isCoord = cert.isCoordinator;
  title.textContent = isCoord ? 'Coordinator Certificate of Appreciation' : 'Student Certificate of Participation';
  badge.textContent = isCoord ? `⭐ ${cert.designation || 'Coordinator'}` : '🎓 Participant';
  badge.className = isCoord ? 'badge badge-warning' : 'badge badge-primary';
  subtitle.textContent = `${cert.student?.name} (${cert.student?.roll_no}) • Using Institutional Main Template`;

  modal.classList.add('active');
  await drawAdminCertificateCanvas(cert);
}

function closeAdminCertModal() {
  document.getElementById('adminCertPreviewModal').classList.remove('active');
}

// Core Canvas Drawing Engine using Main Template for Students & Coordinators
async function drawAdminCertificateCanvas(cert) {
  const canvas = document.getElementById('adminCertCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  // Find active event details
  const activeEvent = eventsCache.find(e => e._id === currentEventCertEventId) || {};
  const eventName = activeEvent.event_name || 'College Event';

  canvas.width = 1024;
  canvas.height = 682;

  // Always use official main template (svec_template.jpg)
  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => {
      const fallback = '/templates/svec_template.jpg';
      if (img.src && !img.src.includes(fallback)) {
        img.src = fallback;
      } else {
        reject(new Error('Failed to load main certificate template'));
      }
    };
    img.src = '/templates/svec_template.jpg';
  });

  // 1. Draw base main certificate template
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const isCoord = cert.isCoordinator || (cert.role || '').toLowerCase().includes('coordinator');
  const student = cert.student || {};

  // Config positions (Sri Vasavi Engineering College Template Specs)
  const nameX = 350, nameY = 355;
  const semX = 125, semY = 382;
  const branchX = 360, branchY = 382;
  const rollX = 690, rollY = 382;
  const eventX = 400, eventY = 409;

  ctx.textBaseline = 'middle';

  // 2. COORDINATOR SPECIAL ADAPTATIONS ON MAIN TEMPLATE
  if (isCoord) {
    // 2a. Gracefully overlay "OF PARTICIPATION" with "OF APPRECIATION"
    // "OF PARTICIPATION" is centered around x: 512, y: 298 with width ~360, height ~24
    ctx.fillStyle = '#faf8f5';
    ctx.beginPath();
    ctx.roundRect(320, 285, 384, 26, 4);
    ctx.fill();

    // Render "OF APPRECIATION" in bold crimson matching the template aesthetic
    ctx.font = '700 19px "Playfair Display", Georgia, serif';
    ctx.fillStyle = '#7b1113';
    ctx.textAlign = 'center';
    ctx.letterSpacing = '3px';
    ctx.fillText('OF  APPRECIATION', 512, 298);
    ctx.letterSpacing = '0px';

    // 2b. Add Prestigious Coordinator Insignia Banner at Top-Right
    const desigText = (cert.designation || 'EVENT COORDINATOR').toUpperCase();
    ctx.save();
    ctx.textAlign = 'center';
    
    // Ribbon pill badge
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

  // 3. Render Recipient Dynamic Data
  ctx.textAlign = 'left';

  // Name (Playfair serif)
  ctx.font = 'bold 20px "Playfair Display", Georgia, serif';
  ctx.fillStyle = '#1a1a2e';
  ctx.fillText(student.name || '-', nameX, nameY);

  // Semester
  ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#1a1a2e';
  ctx.fillText(student.semester || 'IV Semester', semX, semY);

  // Branch
  ctx.fillText(student.branch || 'CSE', branchX, branchY);

  // Roll Number / Coordinator ID
  ctx.fillText(student.roll_no || '-', rollX, rollY);

  // Event & Role display
  ctx.font = 'bold 16px "Plus Jakarta Sans", sans-serif';
  ctx.fillStyle = '#7b1113';

  if (isCoord) {
    ctx.fillText(`${eventName} (${cert.designation || 'Student Coordinator'})`, eventX, eventY);
  } else {
    ctx.fillText(eventName, eventX, eventY);
  }

  // 4. Security Verification ID & Issue Date at Bottom
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.5)';
  ctx.textAlign = 'left';
  const certIdDisplay = cert.certificateId || `SVEC-${isCoord ? 'COORD' : 'CERT'}-${(student.roll_no || 'REC')}`;
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
    const roleTag = activeAdminPreviewCert.isCoordinator ? 'Coordinator' : 'Participant';
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
  const roleTag = activeAdminPreviewCert.isCoordinator ? 'Coordinator' : 'Participant';
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


