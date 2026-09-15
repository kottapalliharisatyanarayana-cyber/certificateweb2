const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const Template = require('../models/Template');
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

// GET /api/templates/active (Public / Student & Admin: Get the active template config)
router.get('/active', async (req, res) => {
  try {
    let template = await Template.findOne({ is_active: true });
    if (!template) {
      template = await Template.findOne();
    }

    if (!template) {
      return res.status(404).json({
        success: false,
        message: 'No certificate template found in the system.'
      });
    }

    const templateData = template.toObject ? template.toObject() : { ...template };
    templateData.template_file = resolveTemplateFile(templateData.template_file);

    res.json({
      success: true,
      template: templateData
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// GET /api/templates (Admin: List all templates)
router.get('/', authMiddleware, async (req, res) => {
  try {
    const templates = await Template.find().sort({ createdAt: -1 });
    res.json({
      success: true,
      templates
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

    const newTemplate = await Template.create({
      template_name: templateName,
      template_file: relativeFilePath,
      fields_config: defaultFieldsConfig,
      is_active: false
    });

    res.status(201).json({
      success: true,
      message: 'Certificate template uploaded successfully.',
      template: newTemplate
    });
  } catch (err) {
    console.error('Template upload error:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to upload template: ' + err.message
    });
  }
});

// PUT /api/templates/:id (Admin: Update template fields config / name)
router.put('/:id', authMiddleware, async (req, res) => {
  try {
    const { template_name, fields_config } = req.body;
    const template = await Template.findById(req.params.id);

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }

    if (template_name) template.template_name = template_name.trim();
    if (fields_config) template.fields_config = fields_config;

    await template.save();

    res.json({
      success: true,
      message: 'Template configuration updated successfully.',
      template
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT /api/templates/:id/activate (Admin: Set as active template)
router.put('/:id/activate', authMiddleware, async (req, res) => {
  try {
    await Template.updateMany({}, { is_active: false });
    const template = await Template.findByIdAndUpdate(
      req.params.id,
      { is_active: true },
      { new: true }
    );

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found.' });
    }

    res.json({
      success: true,
      message: `Template "${template.template_name}" is now the active certificate template.`,
      template
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

    // Prevent deleting the default seeded template or the only active template if it's the only one
    const count = await Template.countDocuments();
    if (count <= 1) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete the only certificate template in the system.'
      });
    }

    await Template.findByIdAndDelete(req.params.id);

    // If active was deleted, make another template active
    if (template.is_active) {
      await Template.findOneAndUpdate({}, { is_active: true });
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
