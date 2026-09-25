const express = require('express');
const router = express.Router();
const Student = require('../models/Student');
const Event = require('../models/Event');
const Participation = require('../models/Participation');
const Template = require('../models/Template');
const authMiddleware = require('../utils/authMiddleware');

// GET /api/students/search/:roll_no (Public Student Search)
router.get('/search/:roll_no', async (req, res) => {
  try {
    const rawRoll = req.params.roll_no;
    if (!rawRoll || !rawRoll.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a valid Roll Number.'
      });
    }

    const rollUpper = rawRoll.trim().toUpperCase();
    const student = await Student.findOne({ roll_no: rollUpper });

    if (!student) {
      return res.status(404).json({
        success: false,
        message: `No student record found with Roll Number: ${rollUpper}. Please verify and try again.`
      });
    }

    // Find all participations where participated is true
    const participations = await Participation.find({
      student: student._id,
      participated: true
    }).populate('event');

    // Filter out any orphaned participations if event was deleted
    const validParticipations = participations.filter(p => p.event != null);

    const activeTemplate = await Template.findOne({ is_active: true });

    res.json({
      success: true,
      student: {
        id: student._id,
        roll_no: student.roll_no,
        name: student.name,
        email: student.email,
        semester: student.semester,
        branch: student.branch
      },
      participationsCount: validParticipations.length,
      events: validParticipations.map(p => {
        const isCoord = (p.role || '').toLowerCase().includes('coordinator');
        const isApprec = p.certificate_type === 'Appreciation' || Boolean(p.position) || (p.role || '').toLowerCase().includes('winner');
        return {
          participationId: p._id,
          eventId: p.event._id,
          eventName: p.event.event_name,
          eventDate: p.event.event_date || 'N/A',
          description: p.event.description || '',
          category: p.event.category || 'Separate Event',
          role: p.role || 'Student',
          isCoordinator: isCoord,
          isAppreciation: isApprec,
          position: isApprec
            ? (p.position && !['participant', 'student'].includes(p.position.toLowerCase())
                ? p.position
                : (p.designation && !['participant', 'student', 'student coordinator'].includes(p.designation.toLowerCase())
                    ? p.designation
                    : (p.role && !['participant', 'student', 'coordinator'].includes(p.role.toLowerCase())
                        ? p.role
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
          certificateId: p.certificate_id || '',
          issueDate: p.issue_date || (p.createdAt ? new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'N/A')
        };
      }),
      hasActiveTemplate: !!activeTemplate,
      templateName: activeTemplate ? activeTemplate.template_name : 'Default Certificate'
    });
  } catch (err) {
    console.error('Search student error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to search student record: ' + err.message
    });
  }
});

// GET /api/students (Admin: List all students with search & pagination)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const search = (req.query.search || '').trim();

    let query = {};
    if (search) {
      query = {
        $or: [
          { roll_no: { $regex: search, $options: 'i' } },
          { name: { $regex: search, $options: 'i' } },
          { branch: { $regex: search, $options: 'i' } },
          { semester: { $regex: search, $options: 'i' } }
        ]
      };
    }

    const total = await Student.countDocuments(query);
    const students = await Student.find(query)
      .sort({ roll_no: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    // Attach participated events count and names for each student
    const studentIds = students.map(s => s._id);
    const participations = await Participation.find({
      student: { $in: studentIds },
      participated: true
    }).populate('event', 'event_name');

    const eventMap = {};
    participations.forEach(p => {
      const sId = p.student.toString();
      if (!eventMap[sId]) eventMap[sId] = [];
      if (p.event) {
        eventMap[sId].push(p.event.event_name);
      }
    });

    const enrichedStudents = students.map(s => ({
      ...s,
      events: eventMap[s._id.toString()] || [],
      eventsCount: (eventMap[s._id.toString()] || []).length
    }));

    res.json({
      success: true,
      students: enrichedStudents,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve students: ' + err.message
    });
  }
});

// GET /api/students/:id (Admin: Get single student)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const participations = await Participation.find({ student: student._id }).populate('event');
    res.json({
      success: true,
      student,
      participations
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/students (Admin: Manual Student Entry)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { roll_no, name, email, semester, branch, eventIds, role, position, certificate_type, designation } = req.body;

    if (!roll_no || !name) {
      return res.status(400).json({
        success: false,
        message: 'Roll Number and Student Name are required fields.'
      });
    }

    const rollUpper = roll_no.trim().toUpperCase();
    let student = await Student.findOne({ roll_no: rollUpper });

    if (student) {
      // Update existing student
      student.name = name.trim();
      if (email !== undefined) student.email = email.trim();
      if (semester !== undefined) student.semester = semester.trim();
      if (branch !== undefined) student.branch = branch.trim();
      await student.save();
    } else {
      // Create new student
      student = await Student.create({
        roll_no: rollUpper,
        name: name.trim(),
        email: (email || '').trim(),
        semester: (semester || '').trim(),
        branch: (branch || '').trim()
      });
    }

    // Update participations if eventIds are passed
    if (Array.isArray(eventIds)) {
      const partPayload = {
        participated: true,
        role: role || (position ? 'Winner' : 'Student'),
        position: position || '',
        certificate_type: certificate_type || (position ? 'Appreciation' : 'Participation'),
        designation: designation || position || ''
      };

      for (const evtId of eventIds) {
        await Participation.findOneAndUpdate(
          { student: student._id, event: evtId },
          partPayload,
          { upsert: true, new: true }
        );
      }
    }

    res.json({
      success: true,
      message: 'Student record saved successfully.',
      student
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to create/update student: ' + err.message
    });
  }
});

// PUT /api/students/:id (Admin: Edit Student)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { roll_no, name, email, semester, branch, eventIds } = req.body;
    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    if (roll_no) student.roll_no = roll_no.trim().toUpperCase();
    if (name) student.name = name.trim();
    if (email !== undefined) student.email = email.trim();
    if (semester !== undefined) student.semester = semester.trim();
    if (branch !== undefined) student.branch = branch.trim();
    await student.save();

    // If eventIds are updated
    if (Array.isArray(eventIds)) {
      // Remove events not in the list
      await Participation.deleteMany({
        student: student._id,
        event: { $nin: eventIds }
      });
      // Add or keep events in the list
      for (const evtId of eventIds) {
        await Participation.findOneAndUpdate(
          { student: student._id, event: evtId },
          { participated: true },
          { upsert: true }
        );
      }
    }

    res.json({
      success: true,
      message: 'Student updated successfully.',
      student
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to update student: ' + err.message
    });
  }
});

// DELETE /api/students/:id (Admin: Delete Student & participations)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const student = await Student.findByIdAndDelete(req.params.id);
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    await Participation.deleteMany({ student: student._id });

    res.json({
      success: true,
      message: `Student ${student.roll_no} and all associated participations deleted successfully.`
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to delete student: ' + err.message
    });
  }
});

module.exports = router;
