const mongoose = require('mongoose');

const expenseSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        financeMonthId: { type: mongoose.Schema.Types.ObjectId, ref: 'FinanceMonth', required: true, index: true },
        amount: { type: Number, required: true, min: 0 },
        category: { type: String, trim: true, default: 'General' },
        note: { type: String, trim: true, default: '' },
        spentAt: { type: Date, default: Date.now }
    },
    { timestamps: true }
);

module.exports = mongoose.model('Expense', expenseSchema);
