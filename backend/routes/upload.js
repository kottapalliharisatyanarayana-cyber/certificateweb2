const express = require('express');
const router = express.Router();
const multer = require('multer');
const { parseExcelBuffer } = require('../utils/excelParser');
const { generateSampleExcel, generateSampleCoordinatorsExcel, generateSampleAppreciationExcel } = require('../utils/sampleGenerator');
const { parsePdfBuffer } = require('../utils/pdfParser');
const { generateSamplePdf } = require('../utils/samplePdfGenerator');
const Student = require('../models/Student');
const Event = require('../models/Event');
const Participation = require('../models/Participation');
const authMiddleware = require('../utils/authMiddleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB max
});

// GET /api/upload/sample-excel (Download sample Excel file for participants)
router.get('/sample-excel', (req, res) => {
  try {
    const buffer = generateSampleExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sample_participants_template.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error('Error generating sample Excel:', err);
    res.status(500).json({ success: false, message: 'Failed to generate sample Excel file: ' + err.message });
  }
});

// GET /api/upload/sample-appreciation-excel (Download sample Excel file for winners / appreciation)
router.get(['/sample-appreciation-excel', '/sample/appreciation-excel'], (req, res) => {
  try {
    const buffer = generateSampleAppreciationExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sample_appreciation_template.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error('Error generating sample Appreciation Excel:', err);
    res.status(500).json({ success: false, message: 'Failed to generate sample Appreciation Excel file: ' + err.message });
  }
});

// GET /api/upload/sample-coordinators-excel (Download sample Excel file for coordinators)
router.get('/sample-coordinators-excel', (req, res) => {
  try {
    const buffer = generateSampleCoordinatorsExcel();
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename="sample_coordinators_template.xlsx"');
    res.send(buffer);
  } catch (err) {
    console.error('Error generating sample Coordinators Excel:', err);
    res.status(500).json({ success: false, message: 'Failed to generate sample Coordinators Excel file: ' + err.message });
  }
});

// GET /api/upload/sample-pdf (Download sample PDF file)
router.get('/sample-pdf', (req, res) => {
  try {
    const buffer = generateSamplePdf();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="sample_participants_list.pdf"');
    res.send(buffer);
  } catch (err) {
    console.error('Error generating sample PDF:', err);
    res.status(500).json({ success: false, message: 'Failed to generate sample PDF file: ' + err.message });
  }
});

// POST /api/upload/excel (Admin: Upload and process participant Excel file)
router.post('/excel', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No file uploaded. Please upload a valid .xlsx or .xls file.'
      });
    }

    // Parse Excel data
    let parseResult;
    try {
      parseResult = parseExcelBuffer(req.file.buffer);
    } catch (parseErr) {
      return res.status(400).json({
        success: false,
        message: parseErr.message
      });
    }

    const { validRecords, invalidRecords, detectedEvents, totalRows } = parseResult;

    // Pre-cache or create events
    const eventMap = {};
    for (const evtName of detectedEvents) {
      let evt = await Event.findOne({ event_name: new RegExp(`^${evtName}$`, 'i') });
      if (!evt) {
        evt = await Event.create({
          event_name: evtName,
          event_date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
          description: `Auto-created from Excel import: ${evtName}`
        });
      }
      eventMap[evtName] = evt._id;
    }

    let studentsCreated = 0;
    let studentsUpdated = 0;
    let participationsCreated = 0;

    // Process valid student rows
    for (const record of validRecords) {
      let student = await Student.findOne({ roll_no: record.roll_no });

      if (student) {
        // Update details if present
        student.name = record.name;
        if (record.email) student.email = record.email;
        if (record.semester) student.semester = record.semester;
        if (record.branch) student.branch = record.branch;
        await student.save();
        studentsUpdated++;
      } else {
        student = await Student.create({
          roll_no: record.roll_no,
          name: record.name,
          email: record.email || '',
          semester: record.semester || 'IV Semester',
          branch: record.branch || 'CSE'
        });
        studentsCreated++;
      }

      // Link participations
      const importRole = (req.body.import_role || '').toLowerCase();
      const isCoordinatorImport = importRole.includes('coordinator');
      const isAppreciationImport = importRole.includes('appreciation') || importRole.includes('winner');

      for (const evtName of record.events) {
        const eventId = eventMap[evtName];
        if (eventId) {
          const detectedPos = (record.eventPositions && record.eventPositions[evtName]) || record.position || '';
          const isWinner = isAppreciationImport || Boolean(detectedPos);

          let role = 'Participant';
          let certType = 'Participation';
          let designation = 'Participant';
          let positionVal = '';

          if (isWinner) {
            role = 'Winner';
            certType = 'Appreciation';
            positionVal = detectedPos || 'Winner';
            designation = positionVal;
          } else if (isCoordinatorImport) {
            role = 'Coordinator';
            certType = 'Coordination';
            designation = 'Student Coordinator';
          }

          const updatePayload = {
            participated: true,
            role,
            designation,
            certificate_type: certType,
            position: positionVal
          };

          const resPart = await Participation.findOneAndUpdate(
            { student: student._id, event: eventId },
            updatePayload,
            { upsert: true, new: true }
          );
          if (resPart) participationsCreated++;
        }
      }
    }

    res.json({
      success: true,
      message: `Successfully processed ${validRecords.length} records. (${studentsCreated} new, ${studentsUpdated} updated)`,
      summary: {
        totalRows,
        validCount: validRecords.length,
        invalidCount: invalidRecords.length,
        studentsCreated,
        studentsUpdated,
        participationsCreated,
        eventsDetected: detectedEvents
      },
      invalidRecords
    });
  } catch (err) {
    console.error('Excel processing error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to process Excel file: ' + err.message
    });
  }
});

// POST /api/upload/pdf (Admin: Upload and process participant PDF file)
router.post('/pdf', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No PDF file uploaded. Please upload a valid .pdf file.'
      });
    }

    let pdfResult;
    try {
      pdfResult = await parsePdfBuffer(req.file.buffer);
    } catch (parseErr) {
      return res.status(400).json({
        success: false,
        message: 'Failed to parse PDF document: ' + parseErr.message
      });
    }

    const { numPages, detectedEvent, participants, totalExtracted } = pdfResult;

    if (totalExtracted === 0) {
      return res.status(400).json({
        success: false,
        message: 'No participant records with valid Roll Numbers could be extracted from this PDF. Please check the document format.'
      });
    }

    // Determine event to associate with these participants:
    // If admin explicitly specified an event_name or event_id in the form, use that; otherwise use detectedEvent
    const targetEventName = (req.body.event_name && req.body.event_name.trim()) 
      ? req.body.event_name.trim() 
      : detectedEvent;

    let event = await Event.findOne({ event_name: new RegExp(`^${targetEventName}$`, 'i') });
    if (!event) {
      event = await Event.create({
        event_name: targetEventName,
        event_date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        description: `Imported from PDF participant list (${req.file.originalname})`
      });
    }

    let studentsCreated = 0;
    let studentsUpdated = 0;
    let participationsCreated = 0;

    for (const p of participants) {
      let student = await Student.findOne({ roll_no: p.roll_no });

      if (student) {
        student.name = p.name;
        if (p.email) student.email = p.email;
        if (p.semester) student.semester = p.semester;
        if (p.branch) student.branch = p.branch;
        await student.save();
        studentsUpdated++;
      } else {
        student = await Student.create({
          roll_no: p.roll_no,
          name: p.name,
          email: p.email || '',
          semester: p.semester || 'IV Semester B.Tech',
          branch: p.branch || 'CSE'
        });
        studentsCreated++;
      }

      // Link participation with this event
      const resPart = await Participation.findOneAndUpdate(
        { student: student._id, event: event._id },
        { participated: true },
        { upsert: true, new: true }
      );
      if (resPart) participationsCreated++;
    }

    res.json({
      success: true,
      message: `Successfully extracted and imported ${participants.length} participants from PDF into event "${event.event_name}".`,
      summary: {
        numPages,
        totalExtracted,
        studentsCreated,
        studentsUpdated,
        participationsCreated,
        eventName: event.event_name,
        eventId: event._id
      },
      participants
    });
  } catch (err) {
    console.error('PDF upload processing error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to process PDF file: ' + err.message
    });
  }
});

module.exports = router;
