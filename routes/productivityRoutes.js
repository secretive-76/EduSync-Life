const express = require('express');
const {
    createTask,
    getTasksByDate,
    updateTaskStatus,
    deleteTask,
    getDailySuccessRate
} = require('../controllers/productivityController');
const { protect } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(protect);

router.post('/tasks', createTask);
router.get('/tasks', getTasksByDate);
router.patch('/tasks/:taskId', updateTaskStatus);
router.delete('/tasks/:taskId', deleteTask);
router.get('/daily-success', getDailySuccessRate);

module.exports = router;
