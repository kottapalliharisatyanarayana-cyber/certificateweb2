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
const { formatPosition } = require('../utils/excelParser');

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
    let appreciationIssued = 0;
    const errors = [];
    const issueDateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    for (let i = 0; i < recipients.length; i++) {
      const rec = recipients[i];
      if (!rec.roll_no || !rec.name) {
        errors.push(`Row ${i + 1}: Missing Roll Number or Name`);
        continue;
      }

      const rollUpper = rec.roll_no.trim().toUpperCase();
      const rawPos = rec.position || '';
      const formattedPos = formatPosition(rawPos);
      const isApprec = (rec.certificate_type === 'Appreciation') ||
                       Boolean(formattedPos) ||
                       (rec.role && (rec.role.toLowerCase().includes('winner') || rec.role.toLowerCase().includes('runner') || rec.role.toLowerCase().includes('prize') || rec.role.toLowerCase().includes('appreciation'))) ||
                       (req.body.default_certificate_type === 'Appreciation') ||
                       (defaultRole && (defaultRole.toLowerCase().includes('winner') || defaultRole.toLowerCase().includes('appreciation')));
      const isCoord = !isApprec && ((rec.role && rec.role.toLowerCase().includes('coordinator')) || defaultRole.toLowerCase().includes('coordinator') || rec.certificate_type === 'Coordination');

      const role = rec.role || (isApprec ? 'Winner' : isCoord ? 'Coordinator' : defaultRole);

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

      const prefix = isApprec ? 'APPR' : (isCoord ? 'COORD' : 'PART');
      const certId = `SVEC-${prefix}-${hash}`;
      const finalPosition = isApprec ? (formattedPos || rec.designation || 'Winner') : '';
      const designation = isApprec ? (formattedPos || rec.designation || 'Winner') : (isCoord ? (rec.designation || defaultDesignation) : 'Participant');
      const certType = isApprec ? 'Appreciation' : (isCoord ? 'Coordination' : (rec.certificate_type || 'Participation'));

      await Participation.findOneAndUpdate(
        { student: student._id, event: event._id },
        {
          participated: true,
          role,
          designation,
          position: finalPosition,
          certificate_type: certType,
          certificate_id: certId,
          issue_date: issueDateStr
        },
        { upsert: true, new: true }
      );

      if (isApprec) appreciationIssued++;
      else if (isCoord) coordinatorsIssued++;
      else studentsIssued++;
    }

    res.json({
      success: true,
      message: `Batch issuance complete: ${studentsIssued} student, ${appreciationIssued} appreciation, and ${coordinatorsIssued} coordinator certificates issued.`,
      summary: {
        totalProcessed: recipients.length,
        studentsIssued,
        appreciationIssued,
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
      const rawPos = findVal(['position', 'pos', 'rank', 'prize', 'place', 'won', 'award', 'merit', 'standing', 'secured', 'achievement', 'result']);
      const formattedPos = formatPosition(rawPos);
      const isApprec = defaultRole.toLowerCase().includes('winner') || defaultRole.toLowerCase().includes('appreciation') || Boolean(formattedPos) || (req.body.default_certificate_type === 'Appreciation');
      const isCoord = !isApprec && (defaultRole.toLowerCase().includes('coordinator') || (findVal(['role', 'category', 'type']) || '').toLowerCase().includes('coordinator'));

      const role = findVal(['role', 'category', 'type']) || (isApprec ? 'Winner' : isCoord ? 'Coordinator' : defaultRole);
      const designation = isCoord
        ? (findVal(['designation', 'title']) || defaultDesignation)
        : (isApprec ? (formattedPos || 'Winner') : 'Participant');
      const certType = isApprec ? 'Appreciation' : (isCoord ? 'Coordination' : 'Participation');
      const email = findVal(['email', 'mail']) || '';

      if (roll_no && name) {
        recipients.push({
          roll_no,
          name,
          branch,
          semester,
          designation,
          position: isApprec ? (formattedPos || 'Winner') : '',
          role,
          email,
          certificate_type: certType
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
    let appreciationIssued = 0;
    const issueDateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    for (let i = 0; i < recipients.length; i++) {
      const rec = recipients[i];
      const rollUpper = rec.roll_no.trim().toUpperCase();
      const isApprec = rec.certificate_type === 'Appreciation' || Boolean(rec.position);
      const isCoord = !isApprec && (rec.role.toLowerCase().includes('coordinator') || rec.certificate_type === 'Coordination');

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

      const prefix = isApprec ? 'APPR' : (isCoord ? 'COORD' : 'PART');
      const certId = `SVEC-${prefix}-${hash}`;

      await Participation.findOneAndUpdate(
        { student: student._id, event: event._id },
        {
          participated: true,
          role: rec.role,
          designation: rec.designation,
          position: rec.position || '',
          certificate_type: rec.certificate_type,
          certificate_id: certId,
          issue_date: issueDateStr
        },
        { upsert: true, new: true }
      );

      if (isApprec) appreciationIssued++;
      else if (isCoord) coordinatorsIssued++;
      else studentsIssued++;
    }

    res.json({
      success: true,
      message: `File processed: ${appreciationIssued} appreciation, ${coordinatorsIssued} coordinator, and ${studentsIssued} student certificates issued.`,
      summary: {
        totalRows: rawRows.length,
        totalIssued: recipients.length,
        appreciationIssued,
        coordinatorsIssued,
        studentsIssued
      }
    });
  } catch (err) {
    console.error('File bulk issue error:', err);
    res.status(500).json({ success: false, message: 'Failed to process file: ' + err.message });
  }
});

// PUT /api/events/:id/certificates/:participationId/position (Admin: Update position / rank of a certificate)
router.put('/:id/certificates/:participationId/position', authMiddleware, async (req, res) => {
  try {
    const { position, designation, role, certificate_type } = req.body;
    const participation = await Participation.findOne({
      _id: req.params.participationId,
      event: req.params.id
    }).populate('student', 'name roll_no');

    if (!participation) {
      return res.status(404).json({ success: false, message: 'Certificate record not found.' });
    }

    const posFormatted = formatPosition(position !== undefined ? position : participation.position);
    participation.position = posFormatted;
    participation.designation = posFormatted || designation || participation.designation || 'Winner';
    if (role) participation.role = role;
    if (certificate_type) participation.certificate_type = certificate_type;

    await participation.save();

    res.json({
      success: true,
      message: `Position updated to "${posFormatted}" for ${participation.student?.name || 'student'}.`,
      participation: {
        id: participation._id,
        position: participation.position,
        designation: participation.designation,
        role: participation.role,
        certificateType: participation.certificate_type
      }
    });
  } catch (err) {
    console.error('Update position error:', err);
    res.status(500).json({ success: false, message: 'Failed to update position: ' + err.message });
  }
});

// POST /api/events/:id/update-positions-excel (Admin: Batch update positions/ranks from Excel spreadsheet)
router.post('/:id/update-positions-excel', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please upload an Excel file.' });
    }

    const workbook = xlsx.read(req.file.buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const rawRows = xlsx.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: '' });

    if (!rawRows || rawRows.length === 0) {
      return res.status(400).json({ success: false, message: 'Excel file has no data rows.' });
    }

    let updatedCount = 0;
    const notFoundRolls = [];

    for (const row of rawRows) {
      const keys = Object.keys(row);
      const findVal = (patterns) => {
        const k = keys.find(key => patterns.some(p => key.trim().toLowerCase().includes(p)));
        return k ? String(row[k]).trim() : '';
      };

      const roll_no = findVal(['roll', 'reg', 'ht', 'id', 'ticket']);
      const posRaw = findVal(['position', 'pos', 'rank', 'prize', 'place', 'won', 'award', 'merit', 'standing', 'secured']);
      const formattedPos = formatPosition(posRaw);

      if (roll_no && formattedPos) {
        const rollUpper = roll_no.toUpperCase();
        const student = await Student.findOne({ roll_no: rollUpper });
        if (student) {
          const part = await Participation.findOne({ student: student._id, event: event._id });
          if (part) {
            part.position = formattedPos;
            part.designation = formattedPos;
            part.role = 'Winner';
            part.certificate_type = 'Appreciation';
            await part.save();
            updatedCount++;
          } else {
            notFoundRolls.push(`${rollUpper} (not in event)`);
          }
        } else {
          notFoundRolls.push(`${rollUpper} (student not found)`);
        }
      }
    }

    res.json({
      success: true,
      message: `Successfully updated positions for ${updatedCount} students!`,
      updatedCount,
      notFoundCount: notFoundRolls.length,
      notFoundRolls: notFoundRolls.slice(0, 10)
    });
  } catch (err) {
    console.error('Update positions excel error:', err);
    res.status(500).json({ success: false, message: 'Failed to update positions: ' + err.message });
  }
});

// GET /api/events/:id/export-excel (Admin: Export all certificates and positions for an event to Excel)
router.get('/:id/export-excel', authMiddleware, async (req, res) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    const participations = await Participation.find({
      event: event._id,
      participated: true
    }).populate('student').sort({ role: 1, createdAt: -1 }).lean();

    const validCerts = participations.filter(p => p.student != null);

    const rows = validCerts.map((p, idx) => {
      const role = p.role || 'Student';
      const isCoord = role.toLowerCase().includes('coordinator') || p.certificate_type === 'Coordination';
      const isApprec = p.certificate_type === 'Appreciation' || Boolean(p.position) || role.toLowerCase().includes('winner') || role.toLowerCase().includes('runner');

      let category = 'Participation';
      let positionVal = '';
      if (isApprec) {
        category = 'Appreciation';
        positionVal = p.position || p.designation || 'Winner';
      } else if (isCoord) {
        category = 'Coordination';
        positionVal = '';
      }

      return {
        'S.No': idx + 1,
        'Roll Number': p.student.roll_no || '',
        'Full Name': p.student.name || '',
        'Branch': p.student.branch || 'CSE',
        'Semester': p.student.semester || 'IV Semester B.Tech',
        'Category': category,
        'Role': role,
        'Position / Rank': positionVal,
        'Designation': p.designation || (isApprec ? positionVal : isCoord ? 'Student Coordinator' : 'Participant'),
        'Certificate ID': p.certificate_id || '',
        'Issue Date': p.issue_date || '',
        'Email': p.student.email || ''
      };
    });

    const ws = xlsx.utils.json_to_sheet(rows);
    ws['!cols'] = [
      { wch: 6 },  // S.No
      { wch: 16 }, // Roll Number
      { wch: 26 }, // Full Name
      { wch: 14 }, // Branch
      { wch: 22 }, // Semester
      { wch: 16 }, // Category
      { wch: 16 }, // Role
      { wch: 18 }, // Position / Rank
      { wch: 24 }, // Designation
      { wch: 28 }, // Certificate ID
      { wch: 16 }, // Issue Date
      { wch: 26 }  // Email
    ];

    const wb = xlsx.utils.book_new();
    const safeSheetName = (event.event_name || 'Certificates').substring(0, 31).replace(/[\\/?*[\]]/g, '');
    xlsx.utils.book_append_sheet(wb, ws, safeSheetName || 'Certificates');

    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });
    const safeFilename = `${(event.event_name || 'event').replace(/[^a-zA-Z0-9_-]/g, '_')}_certificates.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.send(buffer);
  } catch (err) {
    console.error('Export event excel error:', err);
    res.status(500).json({ success: false, message: 'Failed to export excel: ' + err.message });
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

