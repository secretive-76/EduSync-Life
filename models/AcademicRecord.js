const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true },
        credits: { type: Number, required: true, min: 0.5 },
        grade: { type: String, required: true, trim: true },
        gpa: { type: Number, required: true, min: 0, max: 4 }
    },
    { _id: false }
);

const academicRecordSchema = new mongoose.Schema(
    {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
        semesterName: { type: String, required: true, trim: true },
        courses: { type: [courseSchema], default: [] },
        semesterGPA: { type: Number, default: 0, min: 0, max: 4 },
        totalCredits: { type: Number, default: 0, min: 0 }
    },
    { timestamps: true }
);

academicRecordSchema.index({ userId: 1, semesterName: 1 }, { unique: true });

module.exports = mongoose.model('AcademicRecord', academicRecordSchema);
