const mongoose = require('mongoose');

const documentSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  fileName: { type: String, required: true },
  originalName: { type: String, required: true },
  mimeType: { type: String, required: true },
  size: { type: Number, required: true }, // bytes
  data: { type: Buffer, required: true }, // stored in DB (GridFS alternative)
  uploadedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  // null = available to ALL students; array of IDs = specific students only
  assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  isAllStudents: { type: Boolean, default: true }, // if true, visible to all
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

documentSchema.index({ assignedTo: 1 });
documentSchema.index({ isAllStudents: 1 });

module.exports = mongoose.model('Document', documentSchema);
