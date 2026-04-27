const express = require('express');
const { signup, verifyOtp, resendVerificationEmail, forgotPassword, verifyResetOtp, resetPasswordotp, login } = require('../controllers/authController');

const router = express.Router();

router.post('/signup', signup);
router.post('/verify-otp', verifyOtp);
router.post('/resend-verification', resendVerificationEmail);
router.post('/login', login);
router.post('/forgot-password', forgotPassword);
router.post('/verify-reset-otp', verifyResetOtp);
router.post('/reset-password-otp', resetPassword);

module.exports = router;
