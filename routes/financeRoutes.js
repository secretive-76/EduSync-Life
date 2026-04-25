const express = require('express');
const {
    setMonthlyBudget,
    addExpense,
    getFinanceSummary,
    deleteExpense
} = require('../controllers/financeController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

// Apply protection to all finance routes
router.use(protect);

// Match these to your frontend fetch calls
router.post('/set-budget', setMonthlyBudget); 
router.post('/add-expense', addExpense);
router.get('/summary', getFinanceSummary);
router.delete('/expense/:id', deleteExpense);

module.exports = router;
