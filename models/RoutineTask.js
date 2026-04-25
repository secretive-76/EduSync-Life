const mongoose = require('mongoose');

const routineTaskSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        title: { type: String, required: true, trim: true },
        scheduledDate: { type: Date, required: true, index: true },
        dayOfWeek: {
            type: String,
            required: true,
            lowercase: true,
            enum: ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'],
            index: true
        },
        time: { type: String, default: '' },
        reminder: { type: Boolean, default: false },
        alarmEnabled: { type: Boolean, default: false, index: true },
        isDismissed: { type: Boolean, default: false },
        isCompleted: { type: Boolean, default: false },
        completedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

module.exports = mongoose.model('RoutineTask', routineTaskSchema);
