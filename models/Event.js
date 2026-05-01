const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        title: { type: String, required: true, trim: true },
        date: { type: Date, required: true, index: true },
        time: { type: String, trim: true, default: '00:00' },
        category: { type: String, trim: true, default: 'General' },
        description: { type: String, trim: true, default: '' },
        color: { type: String, trim: true, default: '#bc4ca0' },
        repeat: { type: String, enum: ['none', 'weekly', 'monthly', 'yearly'], default: 'none' },
        reminder: { type: Boolean, default: false },
        isDismissed: { type: Boolean, default: false }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Event', eventSchema);
