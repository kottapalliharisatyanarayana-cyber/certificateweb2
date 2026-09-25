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

    // Determine recipient certificate category
    const isCoord = (participation.role || '').toLowerCase().includes('coordinator')
      || participation.certificate_type === 'Coordination';

    const isApprec = participation.certificate_type === 'Appreciation'
      || Boolean(participation.position)
      || (participation.role || '').toLowerCase().includes('winner')
      || (participation.role || '').toLowerCase().includes('runner');

    // Resolve the appropriate template (Event-specific or Type-specific active)
    let template = null;

    if (isApprec) {
      // 1. If event has dedicated appreciation template and custom templates enabled
      if (!event.use_main_template && event.appreciation_template) {
        template = await Template.findById(event.appreciation_template);
      }
      // 2. Default active Appreciation template
      if (!template) {
        template = await Template.findOne({ template_type: 'appreciation', is_active: true });
      }
      // 3. Any Appreciation template
      if (!template) {
        template = await Template.findOne({ template_type: 'appreciation' });
      }
    } else if (isCoord) {
      // 1. If event has dedicated coordinator template and custom templates enabled
      if (!event.use_main_template && event.coordinator_template) {
        template = await Template.findById(event.coordinator_template);
      }
      // 2. Default active Coordination template
      if (!template) {
        template = await Template.findOne({ template_type: 'coordination', is_active: true });
      }
      // 3. Any Coordination template
      if (!template) {
        template = await Template.findOne({ template_type: 'coordination' });
      }
    } else {
      // 1. If event has dedicated participant template and custom templates enabled
      if (!event.use_main_template && event.template) {
        template = await Template.findById(event.template);
      }
      // 2. Default active Participation template
      if (!template) {
        template = await Template.findOne({ template_type: 'participation', is_active: true });
      }
      // 3. Any Participation template
      if (!template) {
        template = await Template.findOne({ template_type: 'participation' });
      }
    }

    // Fallbacks if not resolved
    if (!template) {
      template = await Template.findOne({ is_active: true });
    }
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
      .substring(0, 10)
      .toUpperCase();

    const certPrefix = isApprec ? 'APPR' : (isCoord ? 'COORD' : 'CERT');
    const certificateId = participation.certificate_id || `SVEC-${certPrefix}-${certHash}`;

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
        role: participation.role || 'Student',
        isCoordinator: isCoord,
        isAppreciation: isApprec,
        position: isApprec
          ? (participation.position && !['participant', 'student'].includes(participation.position.toLowerCase())
              ? participation.position
              : (participation.designation && !['participant', 'student', 'student coordinator'].includes(participation.designation.toLowerCase())
                  ? participation.designation
                  : (participation.role && !['participant', 'student', 'coordinator'].includes(participation.role.toLowerCase())
                      ? participation.role
                      : 'Winner')))
          : (participation.position || ''),
        designation: isApprec
          ? (participation.position && !['participant', 'student'].includes(participation.position.toLowerCase())
              ? participation.position
              : (participation.designation && !['participant', 'student', 'student coordinator'].includes(participation.designation.toLowerCase())
                  ? participation.designation
                  : 'Winner'))
          : (participation.designation || (isCoord ? 'Student Coordinator' : 'Participant')),
        certificateType: participation.certificate_type || (isApprec ? 'Appreciation' : (isCoord ? 'Coordination' : 'Participation')),
        event: {
          id: event._id,
          name: event.event_name,
          date: event.event_date || 'N/A',
          description: event.description || '',
          category: event.category || 'Separate Event',
          customOccasion: event.custom_occasion || '',
          useMainTemplate: event.use_main_template !== false
        },
        template: {
          id: template._id,
          name: template.template_name,
          type: template.template_type || (isApprec ? 'appreciation' : (isCoord ? 'coordination' : 'participation')),
          file: resolveTemplateFile(template.template_file),
          config: template.fields_config
        },
        issuedDate: participation.issue_date || new Date().toLocaleDateString('en-US', {
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

    const validParticipations = participations.filter(p => p.event != null);
    const validEvents = validParticipations.map(p => {
      const isCoord = (p.role || '').toLowerCase().includes('coordinator');
      const isApprec = p.certificate_type === 'Appreciation' || Boolean(p.position) || (p.role || '').toLowerCase().includes('winner');
      return {
        id: p.event._id,
        name: p.event.event_name,
        date: p.event.event_date || '',
        role: p.role || 'Student',
        isCoordinator: isCoord,
        isAppreciation: isApprec,
        position: p.position || '',
        designation: p.designation || (isApprec ? (p.position || 'Winner') : (isCoord ? 'Student Coordinator' : 'Participant')),
        certificateType: p.certificate_type || (isApprec ? 'Appreciation' : (isCoord ? 'Coordination' : 'Participation'))
      };
    });

    let template = await Template.findOne({ is_active: true });
    if (!template) template = await Template.findOne();

    const certHash = crypto
      .createHash('sha256')
      .update(`${student.roll_no}-ALL-${student._id}`)
      .digest('hex')
      .substring(0, 10)
      .toUpperCase();

    const combinedEventNames = validEvents.map(e => e.name).join(', ');

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
        events: validEvents,
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
