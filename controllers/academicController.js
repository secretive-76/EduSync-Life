const mongoose = require('mongoose');
const AcademicRecord = require('../models/AcademicRecord');
const AcademicSettings = require('../models/AcademicSettings');
const AppError = require('../utils/AppError');

const toNumber = (value) => Number(value || 0);
const round2 = (value) => Number(toNumber(value).toFixed(2));
let hasCheckedAcademicIndexes = false;

const normalizeAttendanceDataItem = (item = {}) => {
    const classAbsentStates = Array.isArray(item.classAbsentStates)
        ? item.classAbsentStates.map((value) => Boolean(value))
        : [];

    const classStatusesFromAbsentStates = classAbsentStates.map((isAbsent) => (isAbsent ? 'A' : 'P'));

    const classStatuses = classStatusesFromAbsentStates.length > 0
        ? classStatusesFromAbsentStates
        : (Array.isArray(item.classStatuses)
            ? item.classStatuses.map((status) => (status === 'P' || status === 'A' || status === 'N' ? status : 'N'))
            : []);

    const derivedPresent = classStatuses.filter((status) => status === 'P').length;
    const derivedTotal = classStatuses.filter((status) => status === 'P' || status === 'A').length;

    const classesPresent = classStatuses.length > 0 ? derivedPresent : toNumber(item.classesPresent);
    const totalClasses = classStatuses.length > 0 ? derivedTotal : toNumber(item.totalClasses);

    return {
        courseId: String(item.courseId || ''),
        courseName: String(item.courseName || '').trim(),
        credits: toNumber(item.credits),
        classesPresent,
        totalClasses,
        classAbsentStates: classStatuses.filter((status) => status === 'P' || status === 'A').map((status) => status === 'A'),
        classStatuses,
        lastUpdated: item.lastUpdated ? new Date(item.lastUpdated) : new Date()
    };
};

const validateUser = (userId) => {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        throw new AppError('Valid userId is required', 400);
    }
};

const sanitizeCourses = (courses = []) => {
    return courses
        .filter((course) => course && course.name)
        .map((course) => ({
            name: String(course.name).trim(),
            credits: toNumber(course.credits),
            grade: String(course.grade || 'F').trim(),
            gpa: toNumber(course.gpa)
        }))
        .filter((course) => course.credits > 0);
};

const calculateSemester = (courses = []) => {
    const totalCredits = courses.reduce((sum, c) => sum + toNumber(c.credits), 0);
    const totalPoints = courses.reduce((sum, c) => sum + toNumber(c.credits) * toNumber(c.gpa), 0);
    const semesterGPA = totalCredits > 0 ? totalPoints / totalCredits : 0;

    return {
        totalCredits: round2(totalCredits),
        semesterGPA: round2(semesterGPA)
    };
};

const calculateSummary = async (userId) => {
    const records = await AcademicRecord.find({ userId }).sort({ createdAt: 1, semesterName: 1 });

    const totalCredits = records.reduce((sum, record) => sum + toNumber(record.totalCredits), 0);
    const weightedPoints = records.reduce(
        (sum, record) => sum + toNumber(record.semesterGPA) * toNumber(record.totalCredits),
        0
    );

    const cgpa = totalCredits > 0 ? weightedPoints / totalCredits : 0;
    const settings = await AcademicSettings.findOne({ userId });
    const attendanceData = settings?.attendanceData || [];
    const totalCourses = attendanceData.length;
    const attendanceSum = attendanceData.reduce((sum, item) => {
        const present = toNumber(item.classesPresent);
        const total = toNumber(item.totalClasses);
        const percentage = total > 0 ? (present / total) * 100 : 0;
        return sum + percentage;
    }, 0);
    const globalAttendanceAvg = totalCourses > 0 ? attendanceSum / totalCourses : 0;

    return {
        semesters: records,
        summary: {
            currentCgpa: round2(cgpa),
            totalCreditsCompleted: round2(totalCredits),
            globalAttendanceAvg: round2(globalAttendanceAvg),
            statusMessage: cgpa > 3.5 ? 'Great job!' : 'Keep pushing, you are improving!',
            strategistSettings: settings
                ? {
                    targetCgpa: settings.targetCgpa,
                    nextSemesterCredits: settings.nextSemesterCredits,
                    requiredGpa: settings.requiredGpa,
                    isTargetAchievable: settings.isTargetAchievable,
                    targetGPA: settings.targetGPA,
                    desiredCGPA: settings.desiredCGPA,
                    strategicTotalGPA: settings.strategicTotalGPA,
                    attendanceData: settings.attendanceData || [],
                    strategistCourses: settings.strategistCourses || []
                }
                : {
                    targetCgpa: 0,
                    nextSemesterCredits: 0,
                    requiredGpa: 0,
                    isTargetAchievable: true,
                    targetGPA: 0,
                    desiredCGPA: 0,
                    strategicTotalGPA: 0,
                    attendanceData: [],
                    strategistCourses: []
                }
        }
    };
};

const ensureAcademicIndexes = async () => {
    if (hasCheckedAcademicIndexes) return;

    try {
        const indexes = await AcademicRecord.collection.indexes();
        const legacyUserUniqueIndex = indexes.find(
            (idx) => idx.unique && idx.key && idx.key.userId === 1 && Object.keys(idx.key).length === 1
        );

        if (legacyUserUniqueIndex && legacyUserUniqueIndex.name) {
            await AcademicRecord.collection.dropIndex(legacyUserUniqueIndex.name);
        }
    } catch (error) {
        // Ignore index-check failures so normal requests still proceed.
    }

    hasCheckedAcademicIndexes = true;
};

const saveOrUpdateSemester = async (req, res, next) => {
    try {
        const userId = req.user;
        validateUser(userId);
        await ensureAcademicIndexes();

        const { semesterName, courses = [] } = req.body;
        if (!semesterName) {
            throw new AppError('semesterName is required', 400);
        }

        const cleanedCourses = sanitizeCourses(courses);
        const { semesterGPA, totalCredits } = calculateSemester(cleanedCourses);

        const normalizedSemesterName = String(semesterName).trim();
        let record = await AcademicRecord.findOne({ userId, semesterName: normalizedSemesterName });

        if (!record) {
            record = await AcademicRecord.create({
                userId,
                semesterName: normalizedSemesterName,
                courses: cleanedCourses,
                semesterGPA,
                totalCredits
            });
        } else {
            record.courses = cleanedCourses;
            record.semesterGPA = semesterGPA;
            record.totalCredits = totalCredits;
            await record.save();
        }

        res.status(200).json({ success: true, data: [record] });
    } catch (error) {
        next(error);
    }
};

const getSemesters = async (req, res, next) => {
    try {
        const userId = req.user;
        validateUser(userId);

        const records = await AcademicRecord.find({ userId }).sort({ createdAt: 1, semesterName: 1 });
        res.status(200).json({ success: true, data: records });
    } catch (error) {
        next(error);
    }
};

const deleteSemester = async (req, res, next) => {
    try {
        const userId = req.user;
        validateUser(userId);

        const { semesterId } = req.params;
        if (!semesterId || !mongoose.Types.ObjectId.isValid(semesterId)) {
            throw new AppError('Valid semester id is required', 400);
        }

        const deleted = await AcademicRecord.findOneAndDelete({ _id: semesterId, userId });
        if (!deleted) {
            throw new AppError('Semester record not found', 404);
        }

        res.status(200).json({ success: true, data: [deleted] });
    } catch (error) {
        next(error);
    }
};

const getAcademicSummary = async (req, res, next) => {
    try {
        const userId = req.user;
        validateUser(userId);

        const result = await calculateSummary(userId);
        res.status(200).json({ success: true, data: [result.summary] });
    } catch (error) {
        next(error);
    }
};

const saveStrategistSettings = async (req, res, next) => {
    try {
        const userId = req.user?.id || req.user;
        validateUser(userId);

        const updateSet = { userId };
        let needsExistingAttendanceMerge = false;

        if (Object.prototype.hasOwnProperty.call(req.body, 'targetCgpa')) {
            updateSet.targetCgpa = toNumber(req.body.targetCgpa);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'nextSemesterCredits')) {
            updateSet.nextSemesterCredits = toNumber(req.body.nextSemesterCredits);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'requiredGpa')) {
            updateSet.requiredGpa = round2(req.body.requiredGpa);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'isTargetAchievable')) {
            updateSet.isTargetAchievable = Boolean(req.body.isTargetAchievable);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'targetGPA')) {
            updateSet.targetGPA = toNumber(req.body.targetGPA);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'desiredCGPA')) {
            updateSet.desiredCGPA = toNumber(req.body.desiredCGPA);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'strategicTotalGPA')) {
            updateSet.strategicTotalGPA = toNumber(req.body.strategicTotalGPA);
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'attendanceData')) {
            updateSet.attendanceData = Array.isArray(req.body.attendanceData)
                ? req.body.attendanceData
                    .map((item) => normalizeAttendanceDataItem(item))
                    .filter((item) => item.courseId && item.courseName)
                : [];
                } else if (Object.prototype.hasOwnProperty.call(req.body, 'attendanceDataItem')) {
                    needsExistingAttendanceMerge = true;
        }
        if (Object.prototype.hasOwnProperty.call(req.body, 'strategistCourses')) {
            updateSet.strategistCourses = Array.isArray(req.body.strategistCourses) ? req.body.strategistCourses : [];
        }

        if (needsExistingAttendanceMerge) {
            const currentSettings = await AcademicSettings.findOne({ userId });
            const currentAttendanceData = Array.isArray(currentSettings?.attendanceData)
                ? currentSettings.attendanceData
                    .map((item) => normalizeAttendanceDataItem(item))
                    .filter((item) => item.courseId && item.courseName)
                : [];

            const incoming = req.body.attendanceDataItem || {};
            const incomingItem = normalizeAttendanceDataItem(incoming);

            if (incomingItem.courseId && incomingItem.courseName) {
                const existingIndex = currentAttendanceData.findIndex((item) => item.courseId === incomingItem.courseId);
                if (existingIndex >= 0) {
                    currentAttendanceData[existingIndex] = incomingItem;
                } else {
                    currentAttendanceData.push(incomingItem);
                }
                updateSet.attendanceData = currentAttendanceData;
            }
        }

        const settings = await AcademicSettings.findOneAndUpdate(
            { userId },
            { $set: updateSet },
            { new: true, upsert: true, runValidators: true }
        );

        res.status(200).json({ success: true, data: [settings] });
    } catch (error) {
        next(error);
    }
};

const getStrategistSettings = async (req, res, next) => {
    try {
        const userId = req.user;
        validateUser(userId);

        const settings = await AcademicSettings.findOne({ userId });

        if (!settings) {
            return res.status(200).json({
                success: true,
                data: [
                    {
                        targetCgpa: 0,
                        nextSemesterCredits: 0,
                        requiredGpa: 0,
                        isTargetAchievable: true,
                        targetGPA: 0,
                        desiredCGPA: 0,
                        strategicTotalGPA: 0,
                        attendanceData: [],
                        strategistCourses: []
                    }
                ]
            });
        }

        res.status(200).json({ success: true, data: [settings] });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    saveOrUpdateSemester,
    getSemesters,
    deleteSemester,
    getAcademicSummary,
    saveStrategistSettings,
    getStrategistSettings
};
