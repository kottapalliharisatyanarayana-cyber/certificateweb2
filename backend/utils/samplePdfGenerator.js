const { jsPDF } = require('jspdf');

const generateSamplePdf = () => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'a4'
  });

  // Institution Header
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.setTextColor(15, 23, 42); // Navy
  doc.text('SRI VASAVI ENGINEERING COLLEGE', 297, 50, { align: 'center' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 116, 139);
  doc.text('Pedatadepalli, Tadepalligudem, Andhra Pradesh', 297, 68, { align: 'center' });

  doc.setLineWidth(1);
  doc.setDrawColor(226, 232, 240);
  doc.line(40, 85, 555, 85);

  // Event & Document Title
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.setTextColor(30, 58, 138); // Blue
  doc.text('OFFICIAL PARTICIPANT ATTENDANCE LIST', 297, 110, { align: 'center' });

  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text('Event: Robotics & AI Symposium', 40, 135);
  doc.setFont('helvetica', 'normal');
  doc.text('Date: Sep 20, 2026', 450, 135);

  // Table Header Background
  doc.setFillColor(241, 245, 249);
  doc.rect(40, 150, 515, 24, 'F');
  doc.setDrawColor(203, 213, 225);
  doc.rect(40, 150, 515, 24, 'S');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('ROLL NO', 50, 165);
  doc.text('STUDENT NAME', 140, 165);
  doc.text('BRANCH', 270, 165);
  doc.text('SEMESTER', 340, 165);
  doc.text('EMAIL ADDRESS', 430, 165);

  // Sample Students Table Rows
  const sampleParticipants = [
    { roll: '22A81A0510', name: 'Kavya Murthy', branch: 'CSE', sem: 'IV Semester B.Tech', email: 'kavya.m@example.com' },
    { roll: '22A81A0511', name: 'Sai Teja', branch: 'ECE', sem: 'IV Semester B.Tech', email: 'sai.teja@example.com' },
    { roll: '22A81A0512', name: 'Riya Sen', branch: 'IT', sem: 'IV Semester B.Tech', email: 'riya.sen@example.com' },
    { roll: '22A81A0513', name: 'Manoj Kumar', branch: 'Mechanical', sem: 'IV Semester B.Tech', email: 'manoj.k@example.com' },
    { roll: '22A81A0514', name: 'Sneha Varma', branch: 'CSE-AIML', sem: 'IV Semester B.Tech', email: 'sneha.v@example.com' }
  ];

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  let y = 188;

  sampleParticipants.forEach((p, idx) => {
    // Alternating row background
    if (idx % 2 === 1) {
      doc.setFillColor(248, 250, 252);
      doc.rect(40, y - 12, 515, 20, 'F');
    }

    doc.line(40, y + 8, 555, y + 8);
    doc.setTextColor(30, 58, 138);
    doc.text(p.roll, 50, y);
    doc.setTextColor(15, 23, 42);
    doc.text(p.name, 140, y);
    doc.text(p.branch, 270, y);
    doc.text(p.sem, 340, y);
    doc.setTextColor(100, 116, 139);
    doc.text(p.email, 430, y);

    y += 24;
  });

  // Footer notes
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text('Certified that all candidates listed above actively participated in the designated event.', 40, y + 30);
  doc.text('Authorized Signatory: Head of Department / Event Coordinator', 40, y + 70);

  const arrayBuffer = doc.output('arraybuffer');
  return Buffer.from(arrayBuffer);
};

module.exports = {
  generateSamplePdf
};
