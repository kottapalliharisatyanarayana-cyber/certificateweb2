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
  const certificateSection = document.getElementById('certificateSection');

  studentName.textContent = data.student.name || 'N/A';
  studentRoll.textContent = data.student.roll_no || 'N/A';
  studentBranch.textContent = data.student.branch || 'CSE';
  studentSem.textContent = data.student.semester || 'IV Semester';

  const events = data.events || [];
  if (eventCountBadge) {
    eventCountBadge.textContent = `${events.length} Event${events.length === 1 ? '' : 's'}`;
  }

  certificateSection.innerHTML = '';

  if (events.length === 0) {
    certificateSection.innerHTML = `
      <div class="empty-state" style="padding: 2.5rem 1.5rem;">
        <div class="empty-icon">📭</div>
        <h3 style="margin: 0.5rem 0 0.25rem;">No Event Participations Found</h3>
        <p style="color: var(--text-muted);">No verified event participation records were found for roll number ${escapeHtml(data.student.roll_no)}.</p>
      </div>
    `;
  } else {
    certificateSection.innerHTML = `
      <div class="multi-cert-card">
        <div class="multi-cert-main">
          <div class="multi-cert-badge-row">
            <span class="badge badge-success">✓ Verified Participation</span>
            <span class="badge badge-primary">📜 Consolidated Certificate</span>
          </div>
          <h3 class="multi-cert-title">Institutional Multi-Event Certificate</h3>
          <p class="multi-cert-desc">
            Official certificate of participation issued by Sri Vasavi Engineering College covering all registered events for <strong>${escapeHtml(data.student.name)}</strong> (${escapeHtml(data.student.roll_no)}).
          </p>
          
          <div class="multi-cert-events">
            <span class="multi-cert-events-label">Included Participated Events (${events.length}):</span>
            <div class="events-tag-container">
              ${events.map(e => `<span class="event-tag">🏆 ${escapeHtml(e.eventName)}</span>`).join('')}
            </div>
          </div>
        </div>

        <div class="multi-cert-actions">
          <button type="button" class="btn btn-primary" onclick="previewConsolidatedCertificate()">
            👁️ View Certificate
          </button>
          <button type="button" class="btn btn-success" onclick="downloadConsolidatedPDF()">
            ⬇️ Download PDF
          </button>
          <button type="button" class="btn btn-secondary" onclick="downloadConsolidatedPNG()">
            🖼️ Download PNG
          </button>
        </div>
      </div>
    `;
  }

  resultsContainer.style.display = 'block';
  resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Fetch consolidated multi-event certificate and preview in modal
async function previewConsolidatedCertificate() {
  if (!currentStudent) return;
  currentEventTitle = 'Multi-Event Participation';

  showToast('Rendering multi-event certificate...', 'info');

  try {
    const res = await fetch(`/api/certificates/all-data/${encodeURIComponent(currentStudent.roll_no)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.message || 'Failed to load multi-event certificate.', 'error');
      return;
    }

    currentCertData = data.certificate;
    await renderCertificateCanvas(data.certificate, data.certificate.combinedEventNames);
    openModal(`Institutional Multi-Event Certificate`, `${data.certificate.student.name} (${data.certificate.student.roll_no})`);
  } catch (err) {
    showToast('Failed to render multi-event certificate: ' + err.message, 'error');
  }
}

// Directly download consolidated multi-event certificate as PDF
async function downloadConsolidatedPDF() {
  if (!currentStudent) return;
  showToast('Generating PDF certificate...', 'info');

  try {
    const res = await fetch(`/api/certificates/all-data/${encodeURIComponent(currentStudent.roll_no)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.message || 'Failed to load multi-event certificate.', 'error');
      return;
    }

    currentCertData = data.certificate;
    currentEventTitle = 'Multi-Event Participation';
    await renderCertificateCanvas(data.certificate, data.certificate.combinedEventNames);
    downloadCertificatePDF();
  } catch (err) {
    showToast('Failed to download PDF: ' + err.message, 'error');
  }
}

// Directly download consolidated multi-event certificate as PNG image
async function downloadConsolidatedPNG() {
  if (!currentStudent) return;
  showToast('Generating PNG certificate...', 'info');

  try {
    const res = await fetch(`/api/certificates/all-data/${encodeURIComponent(currentStudent.roll_no)}`);
    const data = await res.json();

    if (!res.ok || !data.success) {
      showToast(data.message || 'Failed to load multi-event certificate.', 'error');
      return;
    }

    currentCertData = data.certificate;
    currentEventTitle = 'Multi-Event Participation';
    await renderCertificateCanvas(data.certificate, data.certificate.combinedEventNames);
    downloadCertificateImage();
  } catch (err) {
    showToast('Failed to download PNG: ' + err.message, 'error');
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
