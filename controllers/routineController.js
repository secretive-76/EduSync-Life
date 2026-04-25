const mongoose = require('mongoose');
const RoutineTask = require('../models/RoutineTask');
const AppError = require('../utils/AppError');

const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const normalizeDay = (value) => {
    if (!value || typeof value !== 'string') return null;
    const normalized = value.toLowerCase();
    return DAYS.includes(normalized) ? normalized : null;
};

const getDayFromDate = (dateStr) => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return null;
    return DAYS[date.getDay()];
};

const createTask = async (req, res, next) => {
    try {
        const userId = req.user;
        const { title, scheduledDate, dayOfWeek, time, reminder, alarmEnabled } = req.body;

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

        const normalizedDay = normalizeDay(dayOfWeek) || getDayFromDate(scheduledDate);
        if (!normalizedDay) {
            throw new AppError('dayOfWeek must be a valid weekday', 400);
        }

        const task = await RoutineTask.create({
            userId,
            title,
            scheduledDate: parsedDate,
            dayOfWeek: normalizedDay,
            time: time || '',
            reminder: Boolean(reminder),
            alarmEnabled: alarmEnabled !== undefined ? Boolean(alarmEnabled) : Boolean(reminder),
            isDismissed: false,
            isCompleted: false,
            completedAt: null
        });

        res.status(201).json({ success: true, data: task });
    } catch (error) {
        next(error);
    }
};

const getTasks = async (req, res, next) => {
    try {
        const userId = req.user;
        const { dayOfWeek, date, alarmEnabled } = req.query;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new AppError('Valid userId is required', 400);
        }

        const query = { userId };

        const normalizedDay = normalizeDay(dayOfWeek);
        if (normalizedDay) {
            query.dayOfWeek = normalizedDay;
        } else if (date) {
            const fromDateDay = getDayFromDate(date);
            if (!fromDateDay) {
                throw new AppError('Invalid date format', 400);
            }
            query.dayOfWeek = fromDateDay;
        }

        if (alarmEnabled !== undefined) {
            query.alarmEnabled = alarmEnabled === 'true';
        }

        const tasks = await RoutineTask.find(query).sort({ time: 1, createdAt: 1 });
        res.status(200).json({ success: true, data: tasks });
    } catch (error) {
        next(error);
    }
};

const updateTask = async (req, res, next) => {
    try {
        const userId = req.user;
        const { taskId } = req.params;
        const { title, scheduledDate, dayOfWeek, time, reminder, alarmEnabled, isCompleted } = req.body;

        if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
            throw new AppError('Valid task id is required', 400);
        }

        const task = await RoutineTask.findOne({ _id: taskId, userId });
        if (!task) {
            throw new AppError('Task not found', 404);
        }

        if (title !== undefined) task.title = title;

        if (time !== undefined) {
            task.time = time;
            task.isDismissed = false;
        }

        if (reminder !== undefined) {
            task.reminder = Boolean(reminder);
            task.alarmEnabled = Boolean(reminder);
            if (task.alarmEnabled) {
                task.isDismissed = false;
            }
        }

        if (alarmEnabled !== undefined) {
            task.alarmEnabled = Boolean(alarmEnabled);
            task.reminder = Boolean(alarmEnabled);
            if (task.alarmEnabled) {
                task.isDismissed = false;
            }
        }

        if (scheduledDate !== undefined) {
            const parsedDate = new Date(scheduledDate);
            if (Number.isNaN(parsedDate.getTime())) {
                throw new AppError('Invalid scheduledDate format', 400);
            }
            task.scheduledDate = parsedDate;
            task.dayOfWeek = normalizeDay(dayOfWeek) || getDayFromDate(scheduledDate);
            task.isDismissed = false;
        } else if (dayOfWeek !== undefined) {
            const normalizedDay = normalizeDay(dayOfWeek);
            if (!normalizedDay) {
                throw new AppError('dayOfWeek must be a valid weekday', 400);
            }
            task.dayOfWeek = normalizedDay;
        }

        if (isCompleted !== undefined) {
            task.isCompleted = Boolean(isCompleted);
            task.completedAt = task.isCompleted ? new Date() : null;
        }

        await task.save();
        res.status(200).json({ success: true, data: task });
    } catch (error) {
        next(error);
    }
};

const deleteTask = async (req, res, next) => {
    try {
        const userId = req.user;
        const { taskId } = req.params;

        if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
            throw new AppError('Valid task id is required', 400);
        }

        const deleted = await RoutineTask.findOneAndDelete({ _id: taskId, userId });
        if (!deleted) {
            throw new AppError('Task not found', 404);
        }

        res.status(200).json({ success: true, data: deleted });
    } catch (error) {
        next(error);
    }
};

const dismissRoutineAlarm = async (req, res, next) => {
    try {
        const userId = req.user;
        const { taskId } = req.params;

        if (!taskId || !mongoose.Types.ObjectId.isValid(taskId)) {
            throw new AppError('Valid task id is required', 400);
        }

        const updated = await RoutineTask.findOneAndUpdate(
            { _id: taskId, userId },
            { $set: { isDismissed: true } },
            { new: true, runValidators: true }
        );

        if (!updated) {
            throw new AppError('Task not found', 404);
        }

        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
};

const resetDismissedRoutineTasks = async () => {
    return RoutineTask.updateMany({ isDismissed: true }, { $set: { isDismissed: false } });
};

module.exports = {
    createTask,
    getTasks,
    updateTask,
    deleteTask,
    dismissRoutineAlarm,
    resetDismissedRoutineTasks
};
