const mongoose = require('mongoose');
const Event = require('../models/Event');
const AppError = require('../utils/AppError');

const REPEAT_TYPES = ['none', 'weekly', 'monthly', 'yearly'];

const parseDayRange = (dateStr) => {
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return null;

    const start = new Date(date);
    start.setHours(0, 0, 0, 0);

    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return { start, end };
};

const getUserId = (req) => req.user?.id || req.user;

const isValidRepeat = (repeat) => REPEAT_TYPES.includes(repeat);

const matchesRecurringEvent = (event, targetDate) => {
    const repeat = event.repeat || 'none';
    if (repeat === 'none') return false;

    const eventStartDate = new Date(event.date);
    eventStartDate.setHours(0, 0, 0, 0);
    const normalizedTargetDate = new Date(targetDate);
    normalizedTargetDate.setHours(0, 0, 0, 0);
    if (Number.isNaN(eventStartDate.getTime()) || normalizedTargetDate < eventStartDate) {
        return false;
    }

    const eventMonth = eventStartDate.getMonth();
    const eventDay = eventStartDate.getDate();
    const eventDayOfWeek = eventStartDate.getDay();

    if (repeat === 'weekly') {
        return normalizedTargetDate.getDay() === eventDayOfWeek;
    }

    if (repeat === 'monthly') {
        return normalizedTargetDate.getDate() === eventDay;
    }

    if (repeat === 'yearly') {
        return normalizedTargetDate.getMonth() === eventMonth && normalizedTargetDate.getDate() === eventDay;
    }

    return false;
};

const normalizeEventPayload = (body = {}) => {
    const payload = {};

    const normalizeTime = (value) => {
        if (!value || typeof value !== 'string') return null;
        const match = value.trim().match(/^([0-1]\d|2[0-3]):([0-5]\d)$/);
        return match ? match[0] : null;
    };

    const formatTimeFromDate = (dateValue) => {
        const normalized = new Date(dateValue);
        if (Number.isNaN(normalized.getTime())) return '00:00';
        const hours = String(normalized.getHours()).padStart(2, '0');
        const minutes = String(normalized.getMinutes()).padStart(2, '0');
        return `${hours}:${minutes}`;
    };

    if (Object.prototype.hasOwnProperty.call(body, 'title')) {
        payload.title = String(body.title || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'date')) {
        const parsedDate = new Date(body.date);
        if (Number.isNaN(parsedDate.getTime())) {
            throw new AppError('Invalid date format', 400);
        }
        payload.date = parsedDate;
        payload.time = formatTimeFromDate(parsedDate);
    }

    if (Object.prototype.hasOwnProperty.call(body, 'time')) {
        const normalizedTime = normalizeTime(body.time);
        if (!normalizedTime) {
            throw new AppError('Invalid time format', 400);
        }
        payload.time = normalizedTime;
    }

    if (Object.prototype.hasOwnProperty.call(body, 'category')) {
        payload.category = String(body.category || 'General').trim() || 'General';
    }

    if (Object.prototype.hasOwnProperty.call(body, 'description')) {
        payload.description = String(body.description || '').trim();
    }

    if (Object.prototype.hasOwnProperty.call(body, 'color')) {
        payload.color = String(body.color || '#bc4ca0').trim() || '#bc4ca0';
    }

    if (Object.prototype.hasOwnProperty.call(body, 'repeat')) {
        payload.repeat = isValidRepeat(body.repeat) ? body.repeat : 'none';
    }

    if (Object.prototype.hasOwnProperty.call(body, 'reminder')) {
        payload.reminder = body.reminder === true || body.reminder === 'true';
    }

    return payload;
};

const createEvent = async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const { title, date } = req.body;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new AppError('Valid userId is required', 400);
        }

        if (!title || !date) {
            throw new AppError('title and date are required', 400);
        }

        const payload = normalizeEventPayload(req.body);
        payload.userId = userId;
        if (!payload.repeat) payload.repeat = 'none';
        if (!payload.category) payload.category = 'General';
        if (!payload.color) payload.color = '#bc4ca0';
        if (!payload.time) payload.time = '00:00';
        if (!Object.prototype.hasOwnProperty.call(payload, 'description')) payload.description = '';
        if (!Object.prototype.hasOwnProperty.call(payload, 'reminder')) payload.reminder = false;

        if (payload.date && payload.time && !Object.prototype.hasOwnProperty.call(req.body, 'time')) {
            const [hours, minutes] = payload.time.split(':').map(Number);
            const derivedDate = new Date(payload.date);
            derivedDate.setHours(hours, minutes, 0, 0);
            payload.date = derivedDate;
        }

        const event = await Event.create(payload);
        res.status(201).json({ success: true, data: event });
    } catch (error) {
        next(error);
    }
};

const getEvents = async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const { date, limit } = req.query;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new AppError('Valid userId is required', 400);
        }

        const safeLimit = Math.max(1, Math.min(Number(limit) || 500, 500));
        const query = { userId };

        if (date) {
            const range = parseDayRange(date);
            if (!range) {
                throw new AppError('Invalid date format', 400);
            }

            const allUserEvents = await Event.find(query)
                .sort({ date: 1, createdAt: 1 })
                .limit(safeLimit);

            const targetDate = range.start;
            const matchingEvents = allUserEvents.filter((event) => {
                const eventDate = new Date(event.date);
                const exactMatch = eventDate >= range.start && eventDate <= range.end;
                return exactMatch || matchesRecurringEvent(event, targetDate);
            });

            return res.status(200).json({ success: true, data: matchingEvents });
        }

        const events = await Event.find(query)
            .sort({ date: 1, createdAt: 1 })
            .limit(safeLimit);

        res.status(200).json({ success: true, data: events });
    } catch (error) {
        next(error);
    }
};

const updateEvent = async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const { eventId } = req.params;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new AppError('Valid userId is required', 400);
        }

        if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
            throw new AppError('Valid event id is required', 400);
        }

        const existingEvent = await Event.findOne({ _id: eventId, userId });
        if (!existingEvent) {
            throw new AppError('Event not found', 404);
        }

        const updateSet = normalizeEventPayload(req.body);
        if (Object.keys(updateSet).length === 0) {
            throw new AppError('No update fields provided', 400);
        }

        if (updateSet.date && updateSet.time) {
            const [hours, minutes] = updateSet.time.split(':').map(Number);
            const derivedDate = new Date(updateSet.date);
            derivedDate.setHours(hours, minutes, 0, 0);
            updateSet.date = derivedDate;
        }

        const hasScheduleFields = Object.prototype.hasOwnProperty.call(req.body, 'date')
            || Object.prototype.hasOwnProperty.call(req.body, 'time');
        if (hasScheduleFields) {
            updateSet.isDismissed = false;
        }

        const updated = await Event.findOneAndUpdate(
            { _id: eventId, userId },
            { $set: updateSet },
            { new: true, runValidators: true }
        );

        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
};

const deleteEvent = async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const { eventId } = req.params;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new AppError('Valid userId is required', 400);
        }

        if (!eventId || !mongoose.Types.ObjectId.isValid(eventId)) {
            throw new AppError('Valid event id is required', 400);
        }

        const deleted = await Event.findOneAndDelete({ _id: eventId, userId });
        if (!deleted) {
            throw new AppError('Event not found', 404);
        }

        res.status(200).json({ success: true, data: deleted });
    } catch (error) {
        next(error);
    }
};

const dismissReminder = async (req, res, next) => {
    try {
        const userId = getUserId(req);
        const id = req.params.id || req.params.eventId;

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            throw new AppError('Valid userId is required', 400);
        }

        if (!id || !mongoose.Types.ObjectId.isValid(id)) {
            throw new AppError('Valid reminder id is required', 400);
        }

        const updated = await Event.findOneAndUpdate(
            { _id: id, userId },
            { $set: { isDismissed: true } },
            { new: true, runValidators: true }
        );

        if (!updated) {
            throw new AppError('Reminder not found', 404);
        }

        res.status(200).json({ success: true, data: updated });
    } catch (error) {
        next(error);
    }
};

const resetDismissedReminders = async () => {
    return Event.updateMany({ isDismissed: true }, { $set: { isDismissed: false } });
};

module.exports = {
    createEvent,
    getEvents,
    updateEvent,
    deleteEvent,
    dismissReminder,
    resetDismissedReminders,
};