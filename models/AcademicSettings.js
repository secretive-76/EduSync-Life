const mongoose = require('mongoose');

const academicSettingsSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true, unique: true },
        targetCgpa: { type: Number, min: 0, max: 4, default: 0 },
        nextSemesterCredits: { type: Number, min: 0, default: 0 },
        requiredGpa: { type: Number, min: 0, default: 0 },
        isTargetAchievable: { type: Boolean, default: true },
        targetGPA: { type: Number, min: 0, max: 4, default: 0 },
        desiredCGPA: { type: Number, min: 0, max: 4, default: 0 },
        strategicTotalGPA: { type: Number, min: 0, max: 4, default: 0 },
        attendanceData: {
            type: [
                {
                    courseId: { type: String, required: true },
                    courseName: { type: String, required: true },
                    credits: { type: Number, min: 0, default: 0 },
                    classesPresent: { type: Number, min: 0, default: 0 },
                    totalClasses: { type: Number, min: 0, default: 0 },
                    classAbsentStates: [{ type: Boolean, default: false }],
                    classStatuses: [{ type: String, enum: ['P', 'A', 'N'], default: 'N' }],
                    lastUpdated: { type: Date, default: Date.now }
                }
            ],
            default: []
        },
        strategistCourses: {
            type: [
                {
                    id: { type: Number },
                    courseName: { type: String },
                    credits: { type: Number },
                    attendance: { type: Number, default: 0 },
                    name: { type: String },
                    credit: { type: Number },
                    targetGrade: { type: String, default: 'A+' },
                    ctMarks: [{ type: Number, default: 0 }],
                    attendanceMark: { type: Number, default: 0 },
                    labQuizMark: { type: Number, default: 0 },
                    isLab: { type: Boolean, default: false }
                }
            ],
            default: []
        }
    },
    { timestamps: true }
);

module.exports = mongoose.model('AcademicSettings', academicSettingsSchema);
