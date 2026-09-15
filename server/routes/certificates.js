const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const Student = require('../models/Student');
const Event = require('../models/Event');
const Participation = require('../models/Participation');
const Template = require('../models/Template');

function resolveTemplateFile(file) {
  if (!file) return '/templates/svec_template.jpg';
  if (file.startsWith('/uploads/')) {
    const localPath = path.join(__dirname, '../..', file);
    if (!fs.existsSync(localPath)) {
      return '/templates/svec_template.jpg';
    }
  }
  return file;
}

// GET /api/certificates/data/:roll_no/:eventId
// Returns everything needed by the client Canvas / PDF engine to render the certificate
router.get('/data/:roll_no/:eventId', async (req, res) => {
  try {
    const { roll_no, eventId } = req.params;
    const rollUpper = roll_no.trim().toUpperCase();

    const student = await Student.findOne({ roll_no: rollUpper });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const event = await Event.findById(eventId);
    if (!event) {
      return res.status(404).json({ success: false, message: 'Event not found.' });
    }

    // Verify participation
    const participation = await Participation.findOne({
      student: student._id,
      event: event._id,
      participated: true
    });

    if (!participation) {
      return res.status(403).json({
        success: false,
        message: `Student ${rollUpper} is not recorded as a participant in ${event.event_name}.`
      });
    }

    // Get active template
    let template = await Template.findOne({ is_active: true });
    if (!template) {
      template = await Template.findOne();
    }

    if (!template) {
      return res.status(500).json({
        success: false,
        message: 'No active certificate template found in the system.'
      });
    }

    // Generate unique verifiable certificate ID & hash
    const certHash = crypto
      .createHash('sha256')
      .update(`${student.roll_no}-${event._id}-${participation._id}`)
      .digest('hex')
      .substring(0, 12)
      .toUpperCase();

    const certificateId = `SVEC-CERT-${certHash}`;

    res.json({
      success: true,
      certificate: {
        certificateId,
        student: {
          id: student._id,
          roll_no: student.roll_no,
          name: student.name,
          email: student.email,
          semester: student.semester,
          branch: student.branch
        },
        event: {
          id: event._id,
          name: event.event_name,
          date: event.event_date || 'N/A',
          description: event.description || ''
        },
        template: {
          id: template._id,
          name: template.template_name,
          file: resolveTemplateFile(template.template_file),
          config: template.fields_config
        },
        issuedDate: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      }
    });
  } catch (err) {
    console.error('Certificate data retrieval error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve certificate data: ' + err.message
    });
  }
});

// GET /api/certificates/all-data/:roll_no
// Returns all participated events for a student with template config for consolidated certificate
router.get('/all-data/:roll_no', async (req, res) => {
  try {
    const rollUpper = req.params.roll_no.trim().toUpperCase();
    const student = await Student.findOne({ roll_no: rollUpper });
    if (!student) {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const participations = await Participation.find({
      student: student._id,
      participated: true
    }).populate('event');

    const validEvents = participations.map(p => p.event).filter(Boolean);

    let template = await Template.findOne({ is_active: true });
    if (!template) template = await Template.findOne();

    const certHash = crypto
      .createHash('sha256')
      .update(`${student.roll_no}-ALL-${student._id}`)
      .digest('hex')
      .substring(0, 12)
      .toUpperCase();

    const combinedEventNames = validEvents.map(e => e.event_name).join(', ');

    res.json({
      success: true,
      certificate: {
        certificateId: `SVEC-COMB-${certHash}`,
        student: {
          id: student._id,
          roll_no: student.roll_no,
          name: student.name,
          email: student.email,
          semester: student.semester,
          branch: student.branch
        },
        events: validEvents.map(e => ({
          id: e._id,
          name: e.event_name,
          date: e.event_date || ''
        })),
        combinedEventNames,
        template: template ? {
          id: template._id,
          name: template.template_name,
          file: resolveTemplateFile(template.template_file),
          config: template.fields_config
        } : null,
        issuedDate: new Date().toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        })
      }
    });
  } catch (err) {
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve multi-event certificate data: ' + err.message
    });
  }
});

module.exports = router;
