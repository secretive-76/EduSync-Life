const express = require('express');
// 1. Fixed the import name here (removed 'otp' from the end to match the controller)
const { 
    signup, 
    verifyOtp, 
    resendVerificationEmail, 
    forgotPassword, 
    verifyResetOtp, 
    resetPassword, 
    login,
    verifyMailer
} = require('../controllers/authController');

const router = express.Router();

router.post('/signup', signup);
router.post('/verify-otp', verifyOtp);
router.post('/resend-verification', resendVerificationEmail);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-otp', verifyResetOtp);

// 2. Updated this path to match your HTML fetch call exactly
router.post('/reset-password', resetPassword);

// Debug route: verify SMTP connection (returns transporter.verify() result)
router.get('/debug/mail-verify', verifyMailer);

module.exports = router;