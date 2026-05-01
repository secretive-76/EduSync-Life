const mongoose = require('mongoose');
const RoutineTask = require('../models/RoutineTask');
const AppError = require('../utils/AppError');

const getDayRange = (dateInput) => {
    const date = dateInput ? new Date(dateInput) : new Date();
    if (Number.isNaN(date.getTime())) {
        return null;
    }

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return { start, end };
};

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const createTask = async (req, res, next) => {
    try {
        const { title, scheduledDate } = req.body;
        const userId = req.user;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new AppError('Valid userId is required', 400);
        }

        if (!title || !scheduledDate) {
            throw new AppError('title and scheduledDate are required', 400);
        }

        const parsedDate = new Date(scheduledDate);
        if (Number.isNaN(parsedDate.getTime())) {
            throw new AppError('Invalid scheduledDate format', 400);
        }

        const task = await RoutineTask.create({
            userId,
            title,
            scheduledDate: parsedDate,
            dayOfWeek: DAYS[parsedDate.getDay()],
            time: '',
            reminder: false
        });

        res.status(201).json({ success: true, data: task });
    } catch (error) {
        next(error);
    }
};

const getTasksByDate = async (req, res, next) => {
    try {
        const { date } = req.query;
        const userId = req.user;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new AppError('Valid userId is required', 400);
        }

        const range = getDayRange(date);
        if (!range) {
            throw new AppError('Invalid date format', 400);
        }

        const tasks = await RoutineTask.find({
            userId,
            scheduledDate: {
                $gte: range.start,
                $lte: range.end
            }
        }).sort({ scheduledDate: 1, createdAt: 1 });

        res.status(200).json({ success: true, count: tasks.length, data: tasks });
    } catch (error) {
        next(error);
    }
};

const updateTaskStatus = async (req, res, next) => {
    try {
        const { taskId } = req.params;
        const { isCompleted } = req.body;
        const userId = req.user;

        const task = await RoutineTask.findOne({ _id: taskId, userId });
        if (!task) {
            throw new AppError('Task not found', 404);
        }

        task.isCompleted = Boolean(isCompleted);
        task.completedAt = task.isCompleted ? new Date() : null;
        await task.save();

        res.status(200).json({ success: true, data: task });
    } catch (error) {
        next(error);
    }
};

const deleteTask = async (req, res, next) => {
    try {
        const { taskId } = req.params;
        const userId = req.user;

        const task = await RoutineTask.findOneAndDelete({ _id: taskId, userId });
        if (!task) {
            throw new AppError('Task not found', 404);
        }

        res.status(200).json({ success: true, message: 'Task deleted successfully' });
    } catch (error) {
        next(error);
    }
};

const getDailySuccessRate = async (req, res, next) => {
    try {
        const { date } = req.query;
        const userId = req.user;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new AppError('Valid userId is required', 400);
        }

        const range = getDayRange(date);
        if (!range) {
            throw new AppError('Invalid date format', 400);
        }

        const tasks = await RoutineTask.find({
            userId,
            scheduledDate: {
                $gte: range.start,
                $lte: range.end
            }
        });

        const totalScheduledTasks = tasks.length;
        const completedTasks = tasks.filter((task) => task.isCompleted).length;
        const dailySuccessRate = totalScheduledTasks === 0
            ? 0
            : Number(((completedTasks / totalScheduledTasks) * 100).toFixed(2));

        res.status(200).json({
            success: true,
            data: {
                date: range.start.toISOString().slice(0, 10),
                totalScheduledTasks,
                completedTasks,
                dailySuccessRate
            }
        });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    createTask,
    getTasksByDate,
    updateTaskStatus,
    deleteTask,
    getDailySuccessRate
};
