const mongoose = require('mongoose');

const ParticipationSchema = new mongoose.Schema({
  student: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Student',
    required: true,
    index: true
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true,
    index: true
  },
  participated: {
    type: Boolean,
    default: true
  },
  role: {
    type: String,
    enum: ['Student', 'Coordinator', 'Student Coordinator', 'Faculty Coordinator', 'Organizing Committee', 'Volunteer'],
    default: 'Student',
    index: true
  },
  certificate_type: {
    type: String,
    enum: ['Participation', 'Appreciation', 'Coordination', 'Merit'],
    default: 'Participation'
  },
  designation: {
    type: String,
    trim: true,
    default: ''
  },
  certificate_id: {
    type: String,
    trim: true,
    default: ''
  },
  issue_date: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

ParticipationSchema.index({ student: 1, event: 1 }, { unique: true });

module.exports = mongoose.models.Participation || mongoose.model('Participation', ParticipationSchema);
