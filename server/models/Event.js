const mongoose = require('mongoose');

const EventSchema = new mongoose.Schema({
  event_name: {
    type: String,
    required: [true, 'Event name is required'],
    unique: true,
    trim: true,
    index: true
  },
  event_date: {
    type: String,
    trim: true,
    default: ''
  },
  description: {
    type: String,
    trim: true,
    default: ''
  },
  category: {
    type: String,
    trim: true,
    default: 'Separate Event'
  },
  custom_occasion: {
    type: String,
    trim: true,
    default: ''
  },
  use_main_template: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

module.exports = mongoose.models.Event || mongoose.model('Event', EventSchema);
