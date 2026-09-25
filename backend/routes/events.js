const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const multer = require('multer');
const xlsx = require('xlsx');
const Event = require('../models/Event');
const Student = require('../models/Student');
const Participation = require('../models/Participation');
const Template = require('../models/Template');
const authMiddleware = require('../utils/authMiddleware');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }
});

// GET /api/events (Public / Admin: List all events with participant & coordinator count & templates)
router.get('/', async (req, res) => {
  try {
    const events = await Event.find()
      .populate('template', 'template_name template_file template_type')
      .populate('coordinator_template', 'template_name template_file template_type')
      .populate('appreciation_template', 'template_name template_file template_type')
      .sort({ createdAt: -1 })
      .lean();

    // Attach participant & coordinator counts
    const eventIds = events.map(e => e._id);
    const counts = await Participation.aggregate([
      { $match: { event: { $in: eventIds }, participated: true } },
      {
        $group: {
          _id: { event: '$event', role: '$role', certType: '$certificate_type' },
          count: { $sum: 1 }
        }
      }
    ]);

    const statsMap = {};
    counts.forEach(c => {
      const eId = c._id.event.toString();
      if (!statsMap[eId]) {
        statsMap[eId] = { total: 0, students: 0, coordinators: 0, appreciation: 0 };
      }
      statsMap[eId].total += c.count;
      const role = (c._id.role || 'Student').toLowerCase();
      const certType = (c._id.certType || '').toLowerCase();
      if (role.includes('coordinator') || certType === 'coordination') {
        statsMap[eId].coordinators += c.count;
      } else if (certType === 'appreciation' || role.includes('winner') || role.includes('runner')) {
        statsMap[eId].appreciation += c.count;
        statsMap[eId].students += c.count;
      } else {
        statsMap[eId].students += c.count;
      }
    });

    const enrichedEvents = events.map(e => {
      const s = statsMap[e._id.toString()] || { total: 0, students: 0, coordinators: 0, appreciation: 0 };
      return {
        ...e,
        participantCount: s.total,
        studentsCount: s.students,
        coordinatorsCount: s.coordinators,
        appreciationCount: s.appreciation
      };
    });

    res.json({
      success: true,
      events: enrichedEvents
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve events: ' + err.message
    });
  }
});

// POST /api/events (Admin: Create Event with template assignments)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { event_name, event_date, description, template, coordinator_template, appreciation_template, use_main_template } = req.body;
    if (!event_name || !event_name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Event name is required.'
      });
    }

    const trimmedName = event_name.trim();
    const existing = await Event.findOne({ event_name: new RegExp(`^${trimmedName}$`, 'i') });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `An event with the name "${trimmedName}" already exists.`
      });
    }

    const useMain = use_main_template !== undefined 
      ? Boolean(use_main_template) 
      : (!template && !coordinator_template && !appreciation_template);

    const newEvent = await Event.create({
      event_name: trimmedName,
      event_date: (event_date || '').trim(),
      description: (description || '').trim(),
      use_main_template: useMain,
      template: template || null,
      coordinator_template: coordinator_template || null,
      appreciation_template: appreciation_template || null
    });

    const populatedEvent = await Event.findById(newEvent._id)
      .populate('template', 'template_name template_file template_type')
      .populate('coordinator_template', 'template_name template_file template_type')
      .populate('appreciation_template', 'template_name template_file template_type');

    res.status(201).json({
      success: true,
      message: 'Event created successfully.',
      event: populatedEvent
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to create event: ' + err.message
    });
  }
});

// PUT /api/events/:id (Admin: Update Event & template assignments)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { event_name, event_date, description, template, coordinator_template, appreciation_template, use_main_template } = req.body;
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    if (event_name && event_name.trim()) {
      event.event_name = event_name.trim();
    }
    if (event_date !== undefined) event.event_date = event_date.trim();
    if (description !== undefined) event.description = description.trim();

    if (use_main_template !== undefined) {
      event.use_main_template = Boolean(use_main_template);
    }
    if (template !== undefined) {
      event.template = template ? template : null;
    }
    if (coordinator_template !== undefined) {
      event.coordinator_template = coordinator_template ? coordinator_template : null;
    }
    if (appreciation_template !== undefined) {
      event.appreciation_template = appreciation_template ? appreciation_template : null;
    }

    await event.save();

    const populatedEvent = await Event.findById(event._id)
      .populate('template', 'template_name template_file template_type')
      .populate('coordinator_template', 'template_name template_file template_type')
      .populate('appreciation_template', 'template_name template_file template_type');

    res.json({
      success: true,
      message: 'Event updated successfully.',
      event: populatedEvent
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to update event: ' + err.message
    });
  }
});

// DELETE /api/events/:id (Admin: Delete Event)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const event = await Event.findByIdAndDelete(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    await Participation.deleteMany({ event: event._id });

    res.json({
      success: true,
      message: `Event "${event.event_name}" and its participation records deleted successfully.`
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete event: ' + err.message
    });
  }
});

// GET /api/events/:id/participants (Admin: List participants for an event)
router.get('/:id/participants', authMiddleware, async (req, res) => {
  try {
    const participations = await Participation.find({
      event: req.params.id,
      participated: true
    }).populate('student');

    res.json({
      success: true,
      participants: participations.map(p => p.student).filter(Boolean)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/events/:id/certificates (Admin: List all certificates for an event with role breakdown)
router.get('/:id/certificates', authMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('template', 'template_name template_file template_type')
      .populate('coordinator_template', 'template_name template_file template_type')
      .populate('appreciation_template', 'template_name template_file template_type');
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const participations = await Participation.find({
      event: event._id,
      participated: true
    }).populate('student').sort({ role: 1, createdAt: -1 }).lean();

    const validCerts = participations.filter(p => p.student != null);

    let studentsCount = 0;
    let coordinatorsCount = 0;
    let appreciationCount = 0;

    const formattedCerts = validCerts.map(p => {
      const role = p.role || 'Student';
      const isCoord = role.toLowerCase().includes('coordinator') || p.certificate_type === 'Coordination';
      const isApprec = p.certificate_type === 'Appreciation' || Boolean(p.position) || role.toLowerCase().includes('winner') || role.toLowerCase().includes('runner');

      if (isCoord) {
        coordinatorsCount++;
      } else if (isApprec) {
        appreciationCount++;
        studentsCount++;
      } else {
        studentsCount++;
      }

      // Generate or reuse certificate ID
      let certId = p.certificate_id;
      if (!certId) {
        const hash = crypto
          .createHash('sha256')
          .update(`${p.student.roll_no}-${event._id}-${p._id}`)
          .digest('hex')
          .substring(0, 10)
          .toUpperCase();
        const prefix = isApprec ? 'APPR' : (isCoord ? 'COORD' : 'PART');
        certId = `SVEC-${prefix}-${hash}`;
      }

      return {
        participationId: p._id,
        student: {
          id: p.student._id,
          roll_no: p.student.roll_no,
          name: p.student.name,
          email: p.student.email || '',
          semester: p.student.semester || 'IV Semester B.Tech',
          branch: p.student.branch || 'CSE'
        },
        role,
        isCoordinator: isCoord,
        isAppreciation: isApprec,
        position: isApprec
          ? (p.position && !['participant', 'student'].includes(p.position.toLowerCase())
              ? p.position
              : (p.designation && !['participant', 'student', 'student coordinator'].includes(p.designation.toLowerCase())
                  ? p.designation
                  : (role && !['participant', 'student', 'coordinator'].includes(role.toLowerCase())
                      ? role
                      : 'Winner')))
          : (p.position || ''),
        designation: isApprec
          ? (p.position && !['participant', 'student'].includes(p.position.toLowerCase())
              ? p.position
              : (p.designation && !['participant', 'student', 'student coordinator'].includes(p.designation.toLowerCase())
                  ? p.designation
                  : 'Winner'))
          : (p.designation || (isCoord ? 'Student Coordinator' : 'Participant')),
        certificateType: p.certificate_type || (isApprec ? 'Appreciation' : (isCoord ? 'Coordination' : 'Participation')),
        certificateId: certId,
        issueDate: p.issue_date || (p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A')
      };
    });

    res.json({
      success: true,
      event: {
        id: event._id,
        name: event.event_name,
        date: event.event_date || 'N/A',
        description: event.description || '',
        category: event.category || 'Separate Event',
        customOccasion: event.custom_occasion || '',
        useMainTemplate: event.use_main_template !== false,
        template: event.template ? {
          id: event.template._id,
          name: event.template.template_name,
          file: event.template.template_file,
          type: event.template.template_type
        } : null,
        coordinatorTemplate: event.coordinator_template ? {
          id: event.coordinator_template._id,
          name: event.coordinator_template.template_name,
          file: event.coordinator_template.template_file,
          type: event.coordinator_template.template_type
        } : null,
        appreciationTemplate: event.appreciation_template ? {
          id: event.appreciation_template._id,
          name: event.appreciation_template.template_name,
          file: event.appreciation_template.template_file,
          type: event.appreciation_template.template_type
        } : null
      },
      counts: {
        total: formattedCerts.length,
        students: studentsCount,
        coordinators: coordinatorsCount,
        appreciation: appreciationCount
      },
      certificates: formattedCerts
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve event certificates: ' + err.message
    });
  }
});

// POST /api/events/:id/issue-certificate (Admin: Issue certificate for student or coordinator)
router.post('/:id/issue-certificate', authMiddleware, async (req, res) => {
  try {
    const { roll_no, name, email, semester, branch, role, designation, position, certificate_type } = req.body;
    const event = await Event.findById(req.params.id);

    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    if (!roll_no || !roll_no.trim() || !name || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Roll Number / ID and Full Name are required.'
      });
    }

    const rollUpper = roll_no.trim().toUpperCase();
    const assignedRole = role || 'Student';
    const isCoord = assignedRole.toLowerCase().includes('coordinator') || certificate_type === 'Coordination';
    const isApprec = certificate_type === 'Appreciation' || Boolean(position) || assignedRole.toLowerCase().includes('winner') || assignedRole.toLowerCase().includes('runner');
    const assignedPosition = (position && position.trim()) ? position.trim() : (isApprec ? (designation && designation.trim() ? designation.trim() : 'Winner') : '');

    // 1. Find or create student
    let student = await Student.findOne({ roll_no: rollUpper });
    if (student) {
      student.name = name.trim();
      if (email !== undefined) student.email = (email || '').trim();
      if (semester !== undefined) student.semester = (semester || '').trim();
      if (branch !== undefined) student.branch = (branch || '').trim();
      await student.save();
    } else {
      student = await Student.create({
        roll_no: rollUpper,
        name: name.trim(),
        email: (email || '').trim(),
        semester: (semester || 'IV Semester B.Tech').trim(),
        branch: (branch || 'CSE').trim()
      });
    }

    // 2. Generate unique certificate ID
    const hash = crypto
      .createHash('sha256')
      .update(`${student.roll_no}-${event._id}-${Date.now()}`)
      .digest('hex')
      .substring(0, 10)
      .toUpperCase();

    const prefix = isApprec ? 'APPR' : (isCoord ? 'COORD' : 'PART');
    const certId = `SVEC-${prefix}-${hash}`;
    const defaultDesignation = isCoord
      ? (designation && designation.trim() ? designation.trim() : 'Student Coordinator')
      : (isApprec ? (assignedPosition || 'Winner') : 'Participant');
    const defaultCertType = certificate_type || (isApprec ? 'Appreciation' : (isCoord ? 'Coordination' : 'Participation'));
    const issueDateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    // 3. Create or update participation
    let participation = await Participation.findOne({
      student: student._id,
      event: event._id
    });

    if (participation) {
      participation.participated = true;
      participation.role = assignedRole;
      participation.designation = defaultDesignation;
      participation.position = assignedPosition;
      participation.certificate_type = defaultCertType;
      if (!participation.certificate_id) participation.certificate_id = certId;
      if (!participation.issue_date) participation.issue_date = issueDateStr;
      await participation.save();
    } else {
      participation = await Participation.create({
        student: student._id,
        event: event._id,
        participated: true,
        role: assignedRole,
        designation: defaultDesignation,
        position: assignedPosition,
        certificate_type: defaultCertType,
        certificate_id: certId,
        issue_date: issueDateStr
      });
    }

    res.status(201).json({
      success: true,
      message: `Certificate issued successfully for ${student.name} (${assignedRole}) in event "${event.event_name}".`,
      certificate: {
        participationId: participation._id,
        student: {
          id: student._id,
          roll_no: student.roll_no,
          name: student.name,
          email: student.email,
          semester: student.semester,
          branch: student.branch
        },
        role: assignedRole,
        isCoordinator: isCoord,
        isAppreciation: isApprec,
        position: participation.position || '',
        designation: defaultDesignation,
        certificateType: defaultCertType,
        certificateId: participation.certificate_id,
        issueDate: participation.issue_date
      }
    });
  } catch (err) {
    console.error('Certificate issuance error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to issue certificate: ' + err.message
    });
  }
});

// POST /api/events/:id/bulk-issue (Admin: Batch issue certificates for students and coordinators)
router.post('/:id/bulk-issue', authMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const recipients = req.body.recipients;
    if (!Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a list of recipients to issue certificates.'
      });
    }

    const defaultRole = req.body.default_role || 'Student';
    const defaultDesignation = req.body.default_designation || (defaultRole.toLowerCase().includes('coordinator') ? 'Student Coordinator' : 'Participant');

    let studentsIssued = 0;
    let coordinatorsIssued = 0;
    const errors = [];
    const issueDateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    for (let i = 0; i < recipients.length; i++) {
      const rec = recipients[i];
      if (!rec.roll_no || !rec.name) {
        errors.push(`Row ${i + 1}: Missing Roll Number or Name`);
        continue;
      }

      const rollUpper = rec.roll_no.trim().toUpperCase();
      const role = rec.role || defaultRole;
      const isCoord = role.toLowerCase().includes('coordinator');

      let student = await Student.findOne({ roll_no: rollUpper });
      if (student) {
        student.name = rec.name.trim();
        if (rec.email) student.email = rec.email.trim();
        if (rec.semester) student.semester = rec.semester.trim();
        if (rec.branch) student.branch = rec.branch.trim();
        await student.save();
      } else {
        student = await Student.create({
          roll_no: rollUpper,
          name: rec.name.trim(),
          email: (rec.email || '').trim(),
          semester: (rec.semester || 'IV Semester B.Tech').trim(),
          branch: (rec.branch || 'CSE').trim()
        });
      }

      const hash = crypto
        .createHash('sha256')
        .update(`${student.roll_no}-${event._id}-${Date.now()}-${i}`)
        .digest('hex')
        .substring(0, 10)
        .toUpperCase();

      const certId = `SVEC-${isCoord ? 'COORD' : 'PART'}-${hash}`;
      const designation = isCoord ? (rec.designation || defaultDesignation) : 'Participant';
      const certType = rec.certificate_type || (isCoord ? 'Coordination' : 'Participation');

      await Participation.findOneAndUpdate(
        { student: student._id, event: event._id },
        {
          participated: true,
          role,
          designation,
          certificate_type: certType,
          certificate_id: certId,
          issue_date: issueDateStr
        },
        { upsert: true, new: true }
      );

      if (isCoord) coordinatorsIssued++;
      else studentsIssued++;
    }

    res.json({
      success: true,
      message: `Batch issuance complete: ${studentsIssued} student certificates and ${coordinatorsIssued} coordinator certificates issued.`,
      summary: {
        totalProcessed: recipients.length,
        studentsIssued,
        coordinatorsIssued,
        errors
      }
    });
  } catch (err) {
    console.error('Bulk certificate issuance error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to complete batch issuance: ' + err.message
    });
  }
});

// POST /api/events/:id/upload-bulk (Admin: Direct Excel or CSV file upload for bulk coordinator / participant issuance)
router.post('/:id/upload-bulk', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload a valid Excel (.xlsx, .xls) or CSV file.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      return res.status(400).json({ success: false, message: 'The uploaded file has no sheets.' });
    }

    const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });
    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ success: false, message: 'The spreadsheet contains no data rows.' });
    }

    const defaultRole = req.body.default_role || 'Coordinator';
    const defaultDesignation = req.body.default_designation || (defaultRole.toLowerCase().includes('coordinator') ? 'Student Coordinator' : 'Participant');

    const recipients = [];
    for (const row of rawRows) {
      const keys = Object.keys(row);
      const findVal = (patterns) => {
        const k = keys.find(key => patterns.some(p => key.trim().toLowerCase().includes(p)));
        return k ? String(row[k]).trim() : '';
      };

      const roll_no = findVal(['roll', 'reg', 'ht', 'id', 'ticket']);
      const name = findVal(['name', 'student', 'coordinator']);
      const branch = findVal(['branch', 'dept', 'department']) || 'CSE';
      const semester = findVal(['sem', 'year']) || 'IV Semester B.Tech';
      const designation = findVal(['designation', 'title']) || defaultDesignation;
      const role = findVal(['role', 'category', 'type']) || defaultRole;
      const email = findVal(['email', 'mail']) || '';

      if (roll_no && name) {
        recipients.push({
          roll_no,
          name,
          branch,
          semester,
          designation,
          role,
          email,
          certificate_type: role.toLowerCase().includes('coordinator') ? 'Coordination' : 'Participation'
        });
      }
    }

    if (recipients.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'No valid rows found. Please ensure the file contains columns for Roll No and Name.'
      });
    }

    let studentsIssued = 0;
    let coordinatorsIssued = 0;
    const issueDateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    for (let i = 0; i < recipients.length; i++) {
      const rec = recipients[i];
      const rollUpper = rec.roll_no.trim().toUpperCase();
      const role = rec.role || defaultRole;
      const isCoord = role.toLowerCase().includes('coordinator');

      let student = await Student.findOne({ roll_no: rollUpper });
      if (student) {
        student.name = rec.name.trim();
        if (rec.email) student.email = rec.email.trim();
        if (rec.semester) student.semester = rec.semester.trim();
        if (rec.branch) student.branch = rec.branch.trim();
        await student.save();
      } else {
        student = await Student.create({
          roll_no: rollUpper,
          name: rec.name.trim(),
          email: rec.email || '',
          semester: rec.semester || 'IV Semester B.Tech',
          branch: rec.branch || 'CSE'
        });
      }

      const hash = crypto
        .createHash('sha256')
        .update(`${student.roll_no}-${event._id}-${Date.now()}-${i}`)
        .digest('hex')
        .substring(0, 10)
        .toUpperCase();

      const certId = `SVEC-${isCoord ? 'COORD' : 'PART'}-${hash}`;
      const designation = isCoord ? (rec.designation || defaultDesignation) : 'Participant';
      const certType = rec.certificate_type || (isCoord ? 'Coordination' : 'Participation');

      await Participation.findOneAndUpdate(
        { student: student._id, event: event._id },
        {
          participated: true,
          role,
          designation,
          certificate_type: certType,
          certificate_id: certId,
          issue_date: issueDateStr
        },
        { upsert: true, new: true }
      );

      if (isCoord) coordinatorsIssued++;
      else studentsIssued++;
    }

    res.json({
      success: true,
      message: `File processed: ${coordinatorsIssued} coordinator certificates and ${studentsIssued} student certificates issued.`,
      summary: {
        totalRows: rawRows.length,
        totalIssued: recipients.length,
        coordinatorsIssued,
        studentsIssued
      }
    });
  } catch (err) {
    console.error('File bulk issue error:', err);
    res.status(500).json({ success: false, message: 'Failed to process file: ' + err.message });
  }
});

// DELETE /api/events/:id/certificates/:participationId (Admin: Revoke/delete certificate)
router.delete('/:id/certificates/:participationId', authMiddleware, async (req, res) => {
  try {
    const deleted = await Participation.findOneAndDelete({
      _id: req.params.participationId,
      event: req.params.id
    });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Certificate record not found.'
      });
    }

    res.json({
      success: true,
      message: 'Certificate revoked and deleted successfully.'
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete certificate: ' + err.message
    });
  }
});

module.exports = router;

