const express = require('express');
const { createTask, getTasks, updateTask, deleteTask, dismissRoutineAlarm } = require('../controllers/routineController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/', createTask);
router.get('/', getTasks);
router.patch('/:taskId', updateTask);
router.put('/:taskId', updateTask);
router.patch('/:taskId/dismiss', dismissRoutineAlarm);
router.delete('/:taskId', deleteTask);

module.exports = router;
