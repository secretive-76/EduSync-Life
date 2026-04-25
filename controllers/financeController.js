const mongoose = require('mongoose');
const FinanceMonth = require('../models/FinanceMonth');
const Expense = require('../models/Expense');
const AppError = require('../utils/AppError');

const buildWarning = (totalSpent, monthlyBudget) => {
    if (totalSpent > monthlyBudget) {
        return {
            isOverspent: true,
            warningMessage: 'Warning: spending has exceeded the monthly budget.'
        };
    }

    return {
        isOverspent: false,
        warningMessage: ''
    };
};

const setMonthlyBudget = async (req, res, next) => {
    try {
        const { year, month, monthlyBudget } = req.body;
        const userId = req.user;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new AppError('Valid userId is required', 400);
        }

        if (!year || !month || monthlyBudget === undefined) {
            throw new AppError('year, month, and monthlyBudget are required', 400);
        }

        const numericBudget = Number(monthlyBudget);
        if (Number.isNaN(numericBudget) || numericBudget < 0) {
            throw new AppError('monthlyBudget must be a non-negative number', 400);
        }

        let financeMonth = await FinanceMonth.findOne({ userId, year: Number(year), month: Number(month) });

        if (!financeMonth) {
            financeMonth = await FinanceMonth.create({
                userId,
                year: Number(year),
                month: Number(month),
                monthlyBudget: numericBudget,
                totalSpent: 0,
                remainingBalance: numericBudget,
                isOverspent: false,
                warningMessage: ''
            });
        } else {
            financeMonth.monthlyBudget = numericBudget;
            financeMonth.remainingBalance = Number((numericBudget - financeMonth.totalSpent).toFixed(2));
            const warning = buildWarning(financeMonth.totalSpent, numericBudget);
            financeMonth.isOverspent = warning.isOverspent;
            financeMonth.warningMessage = warning.warningMessage;
            await financeMonth.save();
        }

        res.status(200).json({ success: true, data: financeMonth });
    } catch (error) {
        next(error);
    }
};

const addExpense = async (req, res, next) => {
    try {
        const { amount, category, note, spentAt } = req.body;
        const userId = req.user;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new AppError('Valid userId is required', 400);
        }

        if (amount === undefined || Number(amount) <= 0) {
            throw new AppError('amount must be greater than 0', 400);
        }

        const expenseDate = spentAt ? new Date(spentAt) : new Date();
        if (Number.isNaN(expenseDate.getTime())) {
            throw new AppError('Invalid spentAt date format', 400);
        }

        const year = expenseDate.getFullYear();
        const month = expenseDate.getMonth() + 1;

        const financeMonth = await FinanceMonth.findOne({ userId, year, month });
        if (!financeMonth) {
            throw new AppError('Monthly budget not set for this period', 400);
        }

        const expense = await Expense.create({
            userId,
            financeMonthId: financeMonth._id,
            amount: Number(amount),
            category,
            note,
            spentAt: expenseDate
        });

        financeMonth.totalSpent = Number((financeMonth.totalSpent + Number(amount)).toFixed(2));
        financeMonth.remainingBalance = Number((financeMonth.monthlyBudget - financeMonth.totalSpent).toFixed(2));

        const warning = buildWarning(financeMonth.totalSpent, financeMonth.monthlyBudget);
        financeMonth.isOverspent = warning.isOverspent;
        financeMonth.warningMessage = warning.warningMessage;
        await financeMonth.save();

        res.status(201).json({
            success: true,
            data: {
                expense,
                summary: financeMonth
            }
        });
    } catch (error) {
        next(error);
    }
};

const getFinanceSummary = async (req, res, next) => {
    try {
        const { year, month } = req.query;
        const userId = req.user;

        // ... validation logic ...

        const financeMonth = await FinanceMonth.findOne({
            userId,
            year: Number(year),
            month: Number(month)
        });

        // Instead of throwing 404, return an empty state
        if (!financeMonth) {
            return res.status(200).json({
                success: true,
                data: {
                    summary: { monthlyBudget: 0, totalSpent: 0, remainingBalance: 0 },
                    expenses: []
                }
            });
        }

        const expenses = await Expense.find({ financeMonthId: financeMonth._id }).sort({ spentAt: -1 });

        res.status(200).json({
            success: true,
            data: { summary: financeMonth, expenses }
        });
    } catch (error) {
        next(error);
    }
};

const deleteExpense = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.user;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new AppError('Valid userId is required', 400);
        }

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            throw new AppError('Valid expense id is required', 400);
        }

        const expense = await Expense.findOne({ _id: id, userId });
        if (!expense) {
            throw new AppError('Expense not found', 404);
        }

        const financeMonth = await FinanceMonth.findOne({ _id: expense.financeMonthId, userId });

        await Expense.deleteOne({ _id: expense._id, userId });

        if (financeMonth) {
            financeMonth.totalSpent = Number((financeMonth.totalSpent - Number(expense.amount)).toFixed(2));
            if (financeMonth.totalSpent < 0) {
                financeMonth.totalSpent = 0;
            }

            financeMonth.remainingBalance = Number((financeMonth.monthlyBudget - financeMonth.totalSpent).toFixed(2));
            const warning = buildWarning(financeMonth.totalSpent, financeMonth.monthlyBudget);
            financeMonth.isOverspent = warning.isOverspent;
            financeMonth.warningMessage = warning.warningMessage;
            await financeMonth.save();
        }

        res.status(200).json({ success: true, message: 'Expense deleted successfully' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    setMonthlyBudget,
    addExpense,
    getFinanceSummary,
    deleteExpense
};
