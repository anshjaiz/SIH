const mongoose = require('mongoose');

// Persists trained ML artifacts + pipeline status so the module survives restarts.
const aiModelSchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true }, // forecast|matching|collaboration
    model: { type: mongoose.Schema.Types.Mixed, default: null }, // serialized weights/scaler
    features: { type: [String], default: [] },
    trainedAt: { type: Date, default: null },
    samples: { type: Number, default: 0 },
    metrics: { type: mongoose.Schema.Types.Mixed, default: {} },
    metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AiModel', aiModelSchema);