const mongoose = require('mongoose');

const financeMonthSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        year: { type: Number, required: true },
        month: { type: Number, required: true, min: 1, max: 12 },
        monthlyBudget: { type: Number, required: true, min: 0 },
        totalSpent: { type: Number, default: 0, min: 0 },
        remainingBalance: { type: Number, default: 0 },
        isOverspent: { type: Boolean, default: false },
        warningMessage: { type: String, default: '' }
    },
    { timestamps: true }
);

financeMonthSchema.index({ userId: 1, year: 1, month: 1 }, { unique: true });

module.exports = mongoose.model('FinanceMonth', financeMonthSchema);
