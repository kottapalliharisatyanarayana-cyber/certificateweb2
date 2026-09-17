const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Template = require('../models/Template');
const Event = require('../models/Event');
const authMiddleware = require('../utils/authMiddleware');

const os = require('os');

// Ensure upload directory exists (serverless safe)
const isVercel = !!process.env.VERCEL;
const uploadDir = isVercel 
  ? path.join(os.tmpdir(), 'uploads_templates') 
  : path.join(__dirname, '../../uploads/templates');

try {
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }
} catch (e) {
  console.warn('Could not create upload directory:', e.message);
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = 'template_' + Date.now() + ext;
    cb(null, uniqueName);
  }
});

const fileFilter = (req, file, cb) => {
  const allowedExts = ['.jpg', '.jpeg', '.png'];
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only JPG and PNG image templates are supported.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB
});

function resolveTemplateFile(file) {
  if (!file) return '/templates/svec_template.jpg';
  if (file.startsWith('/uploads/')) {
    const localPath = path.join(__dirname, '../../', file);
    if (!fs.existsSync(localPath)) {
      return '/templates/svec_template.jpg';
    }
  }
  return file;
}

function formatTemplateData(template) {
  if (!template) return null;
  const tpl = template.toObject ? template.toObject() : { ...template };
  tpl.template_file = resolveTemplateFile(tpl.template_file);
  tpl.template_type = tpl.template_type || 'participation';
  return tpl;
}

// GET /api/templates/active (Public / Student & Admin: Get active template(s))
// Supports ?type=participation or ?type=coordination
router.get('/active', async (req, res) => {
  try {
    const requestedType = req.query.type; // 'participation' or 'coordination'

    let template = null;
    if (requestedType) {
      template = await Template.findOne({ template_type: requestedType, is_active: true });
      if (!template) {
        template = await Template.findOne({ template_type: requestedType });
      }
    }

    if (!template) {
      template = await Template.findOne({ is_active: true });
    }
    if (!template) {
      template = await Template.findOne();
    }

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'No certificate template found in the system.'
      });
    }

    // Also fetch both active templates for dual-mode studio
    const partTpl = await Template.findOne({ template_type: 'participation', is_active: true })
      || await Template.findOne({ template_type: 'participation' });
    const coordTpl = await Template.findOne({ template_type: 'coordination', is_active: true })
      || await Template.findOne({ template_type: 'coordination' });

    res.json({
      success: true,
      template: formatTemplateData(template),
      participationTemplate: formatTemplateData(partTpl),
      coordinationTemplate: formatTemplateData(coordTpl)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/templates (Admin: List all templates with event usage)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const templates = await Template.find().sort({ createdAt: -1 }).lean();

    // Map how many events use each template
    const events = await Event.find().lean();
    const usageMap = {};

    events.forEach(e => {
      if (e.template) {
        const id = e.template.toString();
        usageMap[id] = (usageMap[id] || 0) + 1;
      }
      if (e.coordinator_template) {
        const id = e.coordinator_template.toString();
        usageMap[id] = (usageMap[id] || 0) + 1;
      }
    });

    const enrichedTemplates = templates.map(t => ({
      ...formatTemplateData(t),
      eventUsageCount: usageMap[t._id.toString()] || 0
    }));

    res.json({
      success: true,
      templates: enrichedTemplates
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/templates/:id (Admin: Get specific template by ID)
router.get('/:id', authMiddleware, async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }

    res.json({
      success: true,
      template: formatTemplateData(template)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// POST /api/templates/upload (Admin: Upload new certificate template)
router.post('/upload', authMiddleware, upload.single('template_image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'No certificate image file provided.'
      });
    }

    const templateName = req.body.template_name || req.file.originalname.replace(/\.[^/.]+$/, '');
    const templateType = (req.body.template_type || 'participation').toLowerCase();
    const validTypes = ['participation', 'coordination', 'general'];
    const assignedType = validTypes.includes(templateType) ? templateType : 'participation';
    const relativeFilePath = `/uploads/templates/${req.file.filename}`;

    // Default configuration for text placement
    const defaultFieldsConfig = {
      canvas_width: 1024,
      canvas_height: 682,
      name: {
        x: 350,
        y: 355,
        fontSize: 20,
        fontFamily: 'Playfair Display, serif',
        fontWeight: 'bold',
        color: '#1a1a2e',
        align: 'left'
      },
      semester: {
        x: 125,
        y: 382,
        fontSize: 16,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        color: '#1a1a2e',
        align: 'left'
      },
      branch: {
        x: 360,
        y: 382,
        fontSize: 16,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        color: '#1a1a2e',
        align: 'left'
      },
      roll_no: {
        x: 690,
        y: 382,
        fontSize: 16,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        color: '#1a1a2e',
        align: 'left'
      },
      events: {
        x: 400,
        y: 409,
        fontSize: 16,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        color: '#7b1113',
        align: 'left'
      }
    };

    if (assignedType === 'coordination') {
      defaultFieldsConfig.designation = {
        x: 512,
        y: 440,
        fontSize: 15,
        fontFamily: 'Inter, sans-serif',
        fontWeight: 'bold',
        color: '#7b1113',
        align: 'center'
      };
    }

    const newTemplate = await Template.create({
      template_name: templateName,
      template_file: relativeFilePath,
      template_type: assignedType,
      fields_config: defaultFieldsConfig,
      is_active: false
    });

    // If an event_id was passed, optionally link this template directly to the event
    let linkedEvent = null;
    if (req.body.event_id) {
      const event = await Event.findById(req.body.event_id);
      if (event) {
        const targetRole = req.body.event_role_target || (assignedType === 'coordination' ? 'coordination' : 'participation');
        if (targetRole === 'coordination') {
          event.coordinator_template = newTemplate._id;
        } else {
          event.template = newTemplate._id;
        }
        event.use_main_template = false;
        await event.save();
        linkedEvent = event;
      }
    }

    res.status(201).json({
      success: true,
      message: `Certificate template uploaded successfully as "${assignedType}" template.`,
      template: formatTemplateData(newTemplate),
      linkedEvent: linkedEvent ? { id: linkedEvent._id, name: linkedEvent.event_name } : null
    });
  } catch (err) {
    console.error('Template upload error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to upload template: ' + err.message
    });
  }
});

// PUT /api/templates/:id (Admin: Update template fields config / name / type)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { template_name, fields_config, template_type, description } = req.body;
    const template = await Template.findById(req.params.id);

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }

    if (template_name) template.template_name = template_name.trim();
    if (template_type) template.template_type = template_type;
    if (description !== undefined) template.description = description.trim();
    if (fields_config) template.fields_config = fields_config;

    await template.save();

    res.json({
      success: true,
      message: 'Template configuration updated successfully.',
      template: formatTemplateData(template)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/templates/:id/activate (Admin: Set as active template for its type)
router.put('/:id/activate', authMiddleware, async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }

    const type = template.template_type || 'participation';

    // Deactivate existing templates of the same type
    await Template.updateMany({ template_type: type }, { is_active: false });

    template.is_active = true;
    await template.save();

    res.json({
      success: true,
      message: `Template "${template.template_name}" is now the active ${type} template.`,
      template: formatTemplateData(template)
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// DELETE /api/templates/:id (Admin: Delete template)
router.delete('/:id', authMiddleware, async (req, res) => {
  try {
    const template = await Template.findById(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }

    const type = template.template_type || 'participation';
    const count = await Template.countDocuments({ template_type: type });
    if (count <= 1) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete the only "${type}" certificate template in the system.`
      });
    }

    // Unbind from any events that reference it
    await Event.updateMany({ template: template._id }, { $set: { template: null } });
    await Event.updateMany({ coordinator_template: template._id }, { $set: { coordinator_template: null } });

    await Template.findByIdAndDelete(req.params.id);

    // If active was deleted, make another template of same type active
    if (template.is_active) {
      await Template.findOneAndUpdate({ template_type: type }, { is_active: true });
    }

    res.json({
      success: true,
      message: 'Template deleted successfully.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
