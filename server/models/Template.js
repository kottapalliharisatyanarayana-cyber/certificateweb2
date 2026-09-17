const mongoose = require('mongoose');

const TemplateSchema = new mongoose.Schema({
  template_name: {
    type: String,
    required: true,
    trim: true
  },
  template_file: {
    type: String,
    required: true,
    trim: true
  },
  fields_config: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
    default: {}
  },
  is_active: {
    type: Boolean,
    default: false,
    index: true
  },
  template_type: {
    type: String,
    enum: ['participation', 'coordination', 'general'],
    default: 'participation',
    index: true
  },
  description: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

TemplateSchema.index({ template_type: 1, is_active: 1 });

module.exports = mongoose.models.Template || mongoose.model('Template', TemplateSchema);
