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
    img.onerror = () => reject(new Error('Failed to load template'));
    img.src = currentTemplate.template_file;
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

