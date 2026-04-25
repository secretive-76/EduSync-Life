const express = require('express');
const { dismissReminder } = require('../controllers/calendarController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.patch('/:id/dismiss', dismissReminder);

module.exports = router;
