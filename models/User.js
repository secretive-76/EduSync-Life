const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    username: String,
    email: { type: String, unique: true, required: true },
    password: { type: String, required: true },
    isVerified: { type: Boolean, default: false },
    verificationOtpHash: { type: String, default: null },
    verificationOtpExpires: { type: Date, default: null },
    resetPasswordOtpHash: { type: String, default: null },
    resetPasswordOtpExpires: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
