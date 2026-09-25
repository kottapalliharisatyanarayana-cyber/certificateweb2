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
    eventCountBadge.textContent = `${events.length} Certificate${events.length === 1 ? '' : 's'}`;
  }

  certificateSection.innerHTML = '';

  if (events.length === 0) {
    certificateSection.innerHTML = `
      <div class="empty-state" style="padding: 2.5rem 1.5rem;">
        <div class="empty-icon">📭</div>
        <h3 style="margin: 0.5rem 0 0.25rem;">No Certificates Found</h3>
        <p style="color: var(--text-muted);">No verified event participation or coordinator records were found for roll number ${escapeHtml(data.student.roll_no)}.</p>
      </div>
    `;
  } else {
    // 1. Render individual certificates for each event (distinguishing Students, Coordinators, and Appreciation / Winners)
    const cardsHtml = events.map(e => {
      const isCoord = e.isCoordinator || (e.role || '').toLowerCase().includes('coordinator') || e.certificateType === 'Coordination';
      const isApprec = e.isAppreciation || e.certificateType === 'Appreciation' || Boolean(e.position) || (e.role || '').toLowerCase().includes('winner');

      let cardBorder = '';
      let badgeHtml = '';
      let titlePrefix = '';
      let descText = '';
      let titleColor = 'var(--primary)';

      if (isApprec) {
        cardBorder = 'border: 1px solid #fcd34d; background: linear-gradient(180deg, #ffffff 0%, #fffdf5 100%);';
        titleColor = '#7b1113';
        badgeHtml = `
          <span class="badge badge-warning" style="background: #fef3c7; color: #92400e; border: 1px solid #fde68a;">🏆 ${escapeHtml(e.position || 'Position Winner')}</span>
          <span class="badge badge-primary" style="background: #7b1113; color: #fff;">🏅 Certificate of Appreciation</span>
        `;
        titlePrefix = '🏅 Certificate of Appreciation';
        descText = `Official institutional certificate honoring excellence for winning <strong>${escapeHtml(e.position || 'Position')}</strong> in <strong>${escapeHtml(e.eventName)}</strong>.`;
      } else if (isCoord) {
        cardBorder = 'border: 1px solid #fed7aa; background: linear-gradient(180deg, #ffffff 0%, #fffaf0 100%);';
        titleColor = '#92400e';
        badgeHtml = `
          <span class="badge badge-warning" style="background: #fef3c7; color: #92400e; border: 1px solid #fde68a;">⭐ ${escapeHtml(e.designation || 'Coordinator')}</span>
          <span class="badge badge-primary">📜 Coordinator Certificate</span>
        `;
        titlePrefix = '⭐ Event Coordinator Certificate';
        descText = `Official institutional certificate honoring active contribution as <strong>${escapeHtml(e.designation || 'Student Coordinator')}</strong> for <strong>${escapeHtml(e.eventName)}</strong>.`;
      } else {
        badgeHtml = `
          <span class="badge badge-success">✓ Verified Participation</span>
          <span class="badge badge-primary">📜 Certificate of Participation</span>
        `;
        titlePrefix = '🎓 Certificate of Participation';
        descText = `Official institutional certificate certifying active participation in <strong>${escapeHtml(e.eventName)}</strong>.`;
      }

      const eventDateText = e.eventDate && e.eventDate !== 'N/A' ? ` • Event Date: ${escapeHtml(e.eventDate)}` : '';

      return `
        <div class="multi-cert-card" style="margin-bottom: 1.25rem; ${cardBorder}">
          <div class="multi-cert-main">
            <div class="multi-cert-badge-row">
              ${badgeHtml}
            </div>
            <h3 class="multi-cert-title" style="color: ${titleColor};">
              ${titlePrefix}: ${escapeHtml(e.eventName)}
            </h3>
            <p class="multi-cert-desc">
              ${descText}${eventDateText}
            </p>
          </div>

          <div class="multi-cert-actions">
            <button type="button" class="btn btn-primary" onclick="previewSingleCertificate('${e.eventId}', '${escapeHtml(e.eventName)}')">
              👁️ View Certificate
            </button>
            <button type="button" class="btn btn-success" onclick="downloadSingleCertificate('${e.eventId}', '${escapeHtml(e.eventName)}', 'pdf')">
              ⬇️ Download PDF
            </button>
            <button type="button" class="btn btn-secondary" onclick="downloadSingleCertificate('${e.eventId}', '${escapeHtml(e.eventName)}', 'png')">
              🖼️ PNG
            </button>
          </div>
        </div>
      `;
    }).join('');

    // 2. If multiple events, also offer Consolidated Certificate option
    let consolidatedHtml = '';
    if (events.length > 1) {
      consolidatedHtml = `
        <div class="multi-cert-card" style="margin-top: 1.5rem; border: 1px dashed var(--primary-light);">
          <div class="multi-cert-main">
            <div class="multi-cert-badge-row">
              <span class="badge badge-primary">📜 Consolidated Certificate</span>
              <span class="badge badge-success">${events.length} Events Combined</span>
            </div>
            <h3 class="multi-cert-title">Consolidated Multi-Event Certificate</h3>
            <p class="multi-cert-desc">
              Single certificate combining all registered participations and roles for <strong>${escapeHtml(data.student.name)}</strong>.
            </p>
            <div class="multi-cert-events">
              <div class="events-tag-container">
                ${events.map(e => `<span class="event-tag">${e.isCoordinator ? '⭐' : '🏆'} ${escapeHtml(e.eventName)}${e.isCoordinator ? ' (' + escapeHtml(e.designation || 'Coordinator') + ')' : ''}</span>`).join('')}
              </div>
            </div>
          </div>

          <div class="multi-cert-actions">
            <button type="button" class="btn btn-secondary" onclick="previewConsolidatedCertificate()">
              👁️ View Combined
            </button>
            <button type="button" class="btn btn-success" onclick="downloadConsolidatedPDF()">
              ⬇️ Combined PDF
            </button>
          </div>
        </div>
      `;
    }

    certificateSection.innerHTML = cardsHtml + consolidatedHtml;
  }

  resultsContainer.style.display = 'block';
  resultsContainer.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Preview single event certificate (Student or Coordinator)
async function previewSingleCertificate(eventId, eventName) {
  if (!currentStudent) return;
  currentEventTitle = eventName || 'Event Certificate';

  showToast(`Rendering certificate for ${eventName}...`, 'info');

  try {
    const { res, data } = await safeFetch(`/api/certificates/data/${encodeURIComponent(currentStudent.roll_no)}/${eventId}`);

    if (!res.ok || !data.success) {
      showToast(data.message || 'Failed to load certificate data.', 'error');
      return;
    }

    currentCertData = data.certificate;
    await renderCertificateCanvas(data.certificate, eventName);

    const isCoord = data.certificate.isCoordinator;
    const isApprec = data.certificate.isAppreciation;
    let modalTitle = `Participation Certificate: ${eventName}`;
    if (isApprec) {
      modalTitle = `Certificate of Appreciation: ${eventName} (${data.certificate.position || 'Winner'})`;
    } else if (isCoord) {
      modalTitle = `Coordinator Certificate: ${eventName}`;
    }
    openModal(modalTitle, `${data.certificate.student.name} (${data.certificate.student.roll_no}) • Official Institutional Certificate`);
  } catch (err) {
    showToast('Failed to render certificate: ' + err.message, 'error');
  }
}

// Download single event certificate directly
async function downloadSingleCertificate(eventId, eventName, format = 'pdf') {
  if (!currentStudent) return;
  currentEventTitle = eventName || 'Certificate';
  showToast(`Generating ${format.toUpperCase()} certificate...`, 'info');

  try {
    const { res, data } = await safeFetch(`/api/certificates/data/${encodeURIComponent(currentStudent.roll_no)}/${eventId}`);

    if (!res.ok || !data.success) {
      showToast(data.message || 'Failed to generate certificate.', 'error');
      return;
    }

    currentCertData = data.certificate;
    await renderCertificateCanvas(data.certificate, eventName);

    if (format === 'pdf') {
      downloadCertificatePDF();
    } else {
      downloadCertificateImage();
    }
  } catch (err) {
    showToast('Download failed: ' + err.message, 'error');
  }
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

  const template = cert.template || {};
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
        img.onerror = () => reject(new Error('Failed to load certificate template image'));
        img.src = fallbackSrc;
      } else {
        reject(new Error('Failed to load certificate template image'));
      }
    };
    img.src = template.file || '/templates/svec_template.jpg';
  });

  // 1. Draw base certificate image
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

  const isCoord = cert.isCoordinator || (cert.role || '').toLowerCase().includes('coordinator') || cert.certificateType === 'Coordination';
  const isApprec = cert.isAppreciation || cert.certificateType === 'Appreciation' || Boolean(cert.position) || (cert.role || '').toLowerCase().includes('winner');
  const isDedicatedCoordTemplate = (template.type === 'coordination');
  const isDedicatedApprecTemplate = (template.type === 'appreciation');

  // Helper to render text with styling and dynamic font scaling
  function drawFieldText(text, fieldCfg, defaultFont, maxPixelWidth = 0) {
    if (!text || !fieldCfg) return;
    let fontSize = fieldCfg.fontSize || 18;
    const fontFamily = fieldCfg.fontFamily || defaultFont || 'sans-serif';
    const fontWeight = fieldCfg.fontWeight || 'normal';
    const color = fieldCfg.color || '#1a1a2e';
    const align = fieldCfg.align || 'left';

    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;

    // Auto-fit if string exceeds max width
    if (maxPixelWidth > 0) {
      let measured = ctx.measureText(text).width;
      while (measured > maxPixelWidth && fontSize > 10) {
        fontSize -= 1;
        ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
        measured = ctx.measureText(text).width;
      }
    }

    ctx.fillStyle = color;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';

    ctx.fillText(text, fieldCfg.x, fieldCfg.y);
  }

  // 2. COORDINATOR ADAPTATIONS (Legacy participation template fallback only)
  // If template is dedicated coordination or appreciation template, the background already has proper wording.
  if (isCoord && !isDedicatedCoordTemplate && !isDedicatedApprecTemplate) {
    // 2a. Gracefully overlay "OF PARTICIPATION" with "OF APPRECIATION"
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

    // 2b. Add Prestigious Coordinator Insignia Banner at Top-Right
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

  // 3. Render dynamic fields
  // Student / Winner / Coordinator Name
  drawFieldText(cert.student.name, cfg.name, 'Playfair Display, serif', 580);

  // Semester
  drawFieldText(cert.student.semester, cfg.semester, 'Plus Jakarta Sans, sans-serif', 120);

  // Branch (auto-scales if long branch name like Artificial Intelligence & Machine Learning)
  drawFieldText(cert.student.branch, cfg.branch, 'Plus Jakarta Sans, sans-serif', 160);

  // Roll Number
  drawFieldText(cert.student.roll_no, cfg.roll_no, 'Plus Jakarta Sans, sans-serif', 230);

  // Appreciation Position Field
  if (isDedicatedApprecTemplate || isApprec) {
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
    if (cfg.position) {
      drawFieldText(positionText, cfg.position, 'Plus Jakarta Sans, sans-serif', 150);
    }
  }

  // Event name(s) - on participation and appreciation templates (omitted for dedicated coordinator templates)
  if (!isDedicatedCoordTemplate) {
    let eventText = eventDisplayString || (cert.event ? cert.event.name : '');
    if (isCoord && !eventText.includes('Coordinator')) {
      eventText = `${eventText} (${cert.designation || 'Student Coordinator'})`;
    }
    const maxEvtW = isDedicatedApprecTemplate ? 450 : 540;
    drawFieldText(eventText, cfg.events, 'Plus Jakarta Sans, sans-serif', maxEvtW);
  }

  // Coordinator Designation field if template provides designated coordinates
  if (isCoord && !isDedicatedCoordTemplate && !isDedicatedApprecTemplate && cfg.designation) {
    const desigDisplay = cert.designation || 'Student Coordinator';
    drawFieldText(desigDisplay, cfg.designation, 'Plus Jakarta Sans, sans-serif');
  }

  // 4. Security hash verification at bottom
  ctx.font = '10px monospace';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
  ctx.textAlign = 'left';
  const certIdDisplay = cert.certificateId || `SVEC-${isCoord ? 'COORD' : 'CERT'}-${cert.student.roll_no}`;
  ctx.fillText(`ID: ${certIdDisplay} | Issued: ${cert.issuedDate || 'Verified'} | Sri Vasavi Engg College`, 30, canvas.height - 18);
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
