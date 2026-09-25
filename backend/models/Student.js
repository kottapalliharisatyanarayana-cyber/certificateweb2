const mongoose = require('mongoose');

const StudentSchema = new mongoose.Schema({
  roll_no: {
    type: String,
    required: [true, 'Roll number is required'],
    unique: true,
    trim: true,
    uppercase: true,
    index: true
  },
  name: {
    type: String,
    required: [true, 'Student name is required'],
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    default: ''
  },
  semester: {
    type: String,
    trim: true,
    default: ''
  },
  branch: {
    type: String,
    trim: true,
    default: ''
  }
}, {
  timestamps: true
});

module.exports = mongoose.models.Student || mongoose.model('Student', StudentSchema);
