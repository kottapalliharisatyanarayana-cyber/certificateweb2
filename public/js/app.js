/**
 * Student Portal & Certificate Rendering Engine
 * Sri Vasavi Engineering College
 */

let currentStudent = null;
let currentCertData = null;
let currentEventTitle = '';

// Safe fetch helper handling text/HTML error responses
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

// Quick fill helper
function fillRoll(roll) {
  const input = document.getElementById('rollInput');
  if (input) {
    input.value = roll;
    input.focus();
    handleSearch();
  }
}

// Search form handler
async function handleSearch(e) {
  if (e) e.preventDefault();

  const rollInput = document.getElementById('rollInput');
  const rollNo = (rollInput ? rollInput.value : '').trim().toUpperCase();

  if (!rollNo) {
    showToast('Please enter a valid Roll Number', 'error');
    return;
  }

  const welcomeState = document.getElementById('welcomeState');
  const loadingState = document.getElementById('loadingState');
  const resultsContainer = document.getElementById('resultsContainer');

  welcomeState.style.display = 'none';
  resultsContainer.style.display = 'none';
  loadingState.style.display = 'block';

  try {
    const { res, data } = await safeFetch(`/api/students/search/${encodeURIComponent(rollNo)}`);

    loadingState.style.display = 'none';

    if (!res.ok || !data.success) {
      showToast(data.message || 'Student record not found.', 'error');
      welcomeState.style.display = 'block';
      return;
    }

    currentStudent = data.student;
    displayStudentResults(data);
    showToast(`Found records for ${data.student.name}!`, 'success');
  } catch (err) {
    loadingState.style.display = 'none';
    welcomeState.style.display = 'block';
    showToast('Network error while searching records: ' + err.message, 'error');
  }
}

// Display results in DOM
function displayStudentResults(data) {
  const resultsContainer = document.getElementById('resultsContainer');
  const studentName = document.getElementById('studentName');
  const studentRoll = document.getElementById('studentRoll');
  const studentBranch = document.getElementById('studentBranch');
  const studentSem = document.getElementById('studentSem');
  const eventCountBadge = document.getElementById('eventCountBadge');
  const eventsGrid = document.getElementById('eventsGrid');
  const consolidatedBtn = document.getElementById('consolidatedBtn');

  studentName.textContent = data.student.name || 'N/A';
  studentRoll.textContent = data.student.roll_no || 'N/A';
  studentBranch.textContent = data.student.branch || 'CSE';
  studentSem.textContent = data.student.semester || 'IV Semester';

  const events = data.events || [];
  eventCountBadge.textContent = `${events.length} Event${events.length === 1 ? '' : 's'}`;

  // If student participated in multiple events, show consolidated button
  if (events.length > 1) {
    consolidatedBtn.style.display = 'inline-flex';
  } else {
    consolidatedBtn.style.display = 'none';
  }

  eventsGrid.innerHTML = '';

  if (events.length === 0) {
    eventsGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1; padding: 2rem;">
        <p>No active event participation records found for this student.</p>
      </div>
    `;
  } else {
    events.forEach(evt => {
      const card = document.createElement('div');
      card.className = 'event-card';
      card.innerHTML = `
        <div class="event-info">
          <h3>${escapeHtml(evt.eventName)}</h3>
          <div class="event-date">
            <span>📅</span>
            <span>${escapeHtml(evt.eventDate)}</span>
          </div>
          <div>
            <span class="badge badge-success">✓ Participated</span>
          </div>
        </div>
        <div class="event-actions">
          <button class="btn btn-secondary btn-sm" onclick="previewCertificate('${evt.eventId}', '${escapeHtml(evt.eventName)}')">
            👁️ View
          </button>
          <button class="btn btn-primary btn-sm" onclick="downloadCertificateDirect('${evt.eventId}', '${escapeHtml(evt.eventName)}')">
            ⬇️ Download PDF
          </button>
        </div>
      `;
      eventsGrid.appendChild(card);
    });
  }

  resultsContainer.style.display = 'block';
  resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Fetch single event certificate data and preview
async function previewCertificate(eventId, eventName) {
  if (!currentStudent) return;
  currentEventTitle = eventName;

  showToast('Rendering certificate...', 'info');

  try {
    const res = await fetch(`/api/certificates/data/${encodeURIComponent(currentStudent.roll_no)}/${eventId}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.message || 'Failed to load certificate data.', 'error');
      return;
    }

    currentCertData = data.certificate;
    await renderCertificateCanvas(data.certificate, eventName);
    openModal(`Certificate of Participation - ${eventName}`, `${data.certificate.student.name} (${data.certificate.student.roll_no})`);
  } catch (err) {
    showToast('Failed to load certificate: ' + err.message, 'error');
  }
}

// Fetch consolidated multi-event certificate and preview
async function previewConsolidatedCertificate() {
  if (!currentStudent) return;
  currentEventTitle = 'Multi-Event Participation';

  showToast('Rendering consolidated certificate...', 'info');

  try {
    const res = await fetch(`/api/certificates/all-data/${encodeURIComponent(currentStudent.roll_no)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.message || 'Failed to load multi-event certificate.', 'error');
      return;
    }

    currentCertData = data.certificate;
    await renderCertificateCanvas(data.certificate, data.certificate.combinedEventNames);
    openModal(`Consolidated Certificate - Multiple Events`, `${data.certificate.student.name} (${data.certificate.student.roll_no})`);
  } catch (err) {
    showToast('Failed to render multi-event certificate: ' + err.message, 'error');
  }
}

// Core Canvas Rendering Method
async function renderCertificateCanvas(cert, eventDisplayString) {
  const canvas = document.getElementById('certificateCanvas');
  const ctx = canvas.getContext('2d');

  const template = cert.template;
  const cfg = template.config || {};

  canvas.width = cfg.canvas_width || 1024;
  canvas.height = cfg.canvas_height || 682;

  // Load template image with fallback
  const img = new Image();
  img.crossOrigin = 'anonymous';

  await new Promise((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => {
      const fallbackSrc = '/templates/svec_template.jpg';
      if (img.src && !img.src.includes(fallbackSrc)) {
        console.warn('Template image failed to load, falling back to default:', template.file);
        img.onerror = () => reject(new Error('Failed to load certificate template image: ' + template.file));
        img.src = fallbackSrc;
      } else {
        reject(new Error('Failed to load certificate template image: ' + template.file));
      }
    };
    img.src = template.file || '/templates/svec_template.jpg';
  });

  // 1. Draw base certificate image
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  // Helper to render text with styling
  function drawFieldText(text, fieldCfg, defaultFont) {
    if (!text || !fieldCfg) return;
    const fontSize = fieldCfg.fontSize || 18;
    const fontFamily = fieldCfg.fontFamily || defaultFont || 'sans-serif';
    const fontWeight = fieldCfg.fontWeight || 'normal';
    const color = fieldCfg.color || '#1a1a2e';
    const align = fieldCfg.align || 'left';

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    ctx.fillText(text, fieldCfg.x, fieldCfg.y);
  }

  // 2. Render dynamic fields
  // Student Name
  drawFieldText(cert.student.name, cfg.name, 'Playfair Display, serif');

  // Semester
  drawFieldText(cert.student.semester, cfg.semester, 'Plus Jakarta Sans, sans-serif');

  // Branch
  drawFieldText(cert.student.branch, cfg.branch, 'Plus Jakarta Sans, sans-serif');

  // Roll Number
  drawFieldText(cert.student.roll_no, cfg.roll_no, 'Plus Jakarta Sans, sans-serif');

  // Event name(s)
  const eventText = eventDisplayString || (cert.event ? cert.event.name : '');
  drawFieldText(eventText, cfg.events, 'Plus Jakarta Sans, sans-serif');

  // 3. Optional small security hash at bottom-left
  if (cert.certificateId) {
    ctx.font = '10px monospace';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
    ctx.textAlign = 'left';
    ctx.fillText(`ID: ${cert.certificateId}`, 30, canvas.height - 18);
  }
}

// Download PDF directly from button
async function downloadCertificateDirect(eventId, eventName) {
  await previewCertificate(eventId, eventName);
  downloadCertificatePDF();
}

// Download current certificate as PDF using jsPDF
function downloadCertificatePDF() {
  const canvas = document.getElementById('certificateCanvas');
  if (!canvas || !currentCertData) {
    showToast('No active certificate to download', 'error');
    return;
  }

  try {
    const { jsPDF } = window.jspdf;
    // Landscape A4 or exact pixel dimensions in pt
    const doc = new jsPDF({
      orientation: 'landscape',
      unit: 'px',
      format: [canvas.width, canvas.height]
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    doc.addImage(imgData, 'JPEG', 0, 0, canvas.width, canvas.height);

    const safeName = (currentCertData.student.name || 'Student').replace(/[^a-zA-Z0-9]/g, '_');
    const safeRoll = (currentCertData.student.roll_no || 'Roll').replace(/[^a-zA-Z0-9]/g, '_');
    const safeEvent = (currentEventTitle || 'Event').replace(/[^a-zA-Z0-9]/g, '_');
    const filename = `${safeName}_${safeRoll}_${safeEvent}.pdf`;

    doc.save(filename);
    showToast(`Downloaded: ${filename}`, 'success');
  } catch (err) {
    console.error('PDF generation error:', err);
    showToast('PDF export failed: ' + err.message, 'error');
  }
}

// Download current certificate as high-res PNG image
function downloadCertificateImage() {
  const canvas = document.getElementById('certificateCanvas');
  if (!canvas || !currentCertData) return;

  const safeName = (currentCertData.student.name || 'Student').replace(/[^a-zA-Z0-9]/g, '_');
  const safeRoll = (currentCertData.student.roll_no || 'Roll').replace(/[^a-zA-Z0-9]/g, '_');
  const safeEvent = (currentEventTitle || 'Event').replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `${safeName}_${safeRoll}_${safeEvent}.png`;

  const link = document.createElement('a');
  link.download = filename;
  link.href = canvas.toDataURL('image/png');
  link.click();
  showToast(`Downloaded image: ${filename}`, 'success');
}

// Modal handling
function openModal(title, subtitle) {
  const modal = document.getElementById('certificateModal');
  const modalTitle = document.getElementById('modalCertTitle');
  const modalSubtitle = document.getElementById('modalCertSubtitle');

  if (modalTitle) modalTitle.textContent = title;
  if (modalSubtitle) modalSubtitle.textContent = subtitle;

  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  const modal = document.getElementById('certificateModal');
  modal.classList.remove('active');
  document.body.style.overflow = '';
}

// Close on backdrop click or Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
});

document.getElementById('certificateModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'certificateModal') closeModal();
});

// Toast notification helper
function showToast(message, type = 'info') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;

  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span><span>${escapeHtml(message)}</span>`;

  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);

  // Auto remove
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
