const express = require('express');
const { createEvent, getEvents, updateEvent, deleteEvent, dismissReminder } = require('../controllers/calendarController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/', createEvent);
router.get('/', getEvents);
router.put('/:eventId', updateEvent);
router.patch('/:eventId', updateEvent);
router.patch('/:eventId/dismiss', dismissReminder);
router.delete('/:eventId', deleteEvent);

module.exports = router;
