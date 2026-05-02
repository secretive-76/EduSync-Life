const User = require('../models/User');
const AppError = require('../utils/AppError');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const dns = require('dns');

// Force IPv4 for DNS resolution to bypass Railway IPv6 issues
if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

// 1. Transporter Configuration
const transporter = nodemailer.createTransport({
    service: 'gmail',
    host: "smtp.gmail.com",
    port: 587,
    secure: false, // Must be false for 587
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
    },
    family: 4, // Forces IPv4 to avoid Railway ENETUNREACH errors
    connectionTimeout: 15000, // 15 seconds
    greetingTimeout: 15000,
    tls: {
        rejectUnauthorized: false // Bypasses potential certificate issues
    }
});

// 2. Helper Functions
const VERIFICATION_OTP_EXPIRY_MS = 10 * 60 * 1000;

const generateVerificationOtp = () => String(crypto.randomInt(100000, 999999));

const hashVerificationOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

const buildUserPayload = (user) => ({
    id: user._id,
    username: user.username,
    email: user.email,
    isVerified: user.isVerified
});

const sendVerificationOtpEmail = async (email, otpCode) => {
    return await transporter.sendMail({
        from: `"EduSync Support" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your EduSync Verification Code',
        text: `Verify your EduSync account. Your 6-digit code is: ${otpCode}. It expires in 10 minutes.`,
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                <h2 style="color: #800020;">Verify your EduSync account</h2>
                <p>Use this 6-digit code to activate your account. This email contains no verification link:</p>
                <div style="text-align: center; margin: 28px 0;">
                    <span style="display:inline-block; letter-spacing: 0.35em; font-size: 2rem; font-weight: 800; color: #ffffff; background: #800020; padding: 16px 24px; border-radius: 12px;">${otpCode}</span>
                </div>
                <p style="font-size: 0.875rem; color: #6b7280;">This code expires in 10 minutes.</p>
                <p style="font-size: 0.875rem; color: #6b7280;">If you did not create this account, you can ignore this email.</p>
            </div>
        `
    });
};

const sendResetPasswordOtpEmail = async (email, otpCode) => {
    return await transporter.sendMail({
        from: `"EduSync Support" <${process.env.EMAIL_USER}>`,
        to: email,
        subject: 'Your EduSync Password Reset Code',
        html: `
            <div style="font-family: Arial, sans-serif; background:#f7f7f7; padding:24px;">
                <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #ececec; border-radius:12px; overflow:hidden;">
                    <div style="background:#800020; color:#ffffff; padding:18px 24px; font-size:20px; font-weight:700;">
                        EduSync Password Reset
                    </div>
                    <div style="padding:24px; color:#1f2937; line-height:1.6;">
                        <p>Your password reset code is:</p>
                        <div style="text-align:center; margin:20px 0;">
                            <span style="display:inline-block; padding:14px 18px; border-radius:10px; background:#800020; color:#ffffff; font-size:36px; font-weight:800;">${otpCode}</span>
                        </div>
                        <p style="font-size:14px; color:#6b7280;">Expires in 10 minutes.</p>
                    </div>
                </div>
            </div>
        `
    });
};

// 3. Main Controller Functions

const signup = async (req, res, next) => {
    try {
        console.log('--- SIGNUP START ---');
        console.log('Body:', req.body);
        const { email, password, username } = req.body;

        if (!email || !password) {
            throw new AppError('Email and password are required', 400);
        }

        const existingUser = await User.findOne({ email });
        if (existingUser && existingUser.isVerified) {
            throw new AppError('An account with this email already exists', 409);
        }

        const otpCode = generateVerificationOtp();
        const verificationOtpHash = hashVerificationOtp(otpCode);
        const verificationOtpExpires = new Date(Date.now() + VERIFICATION_OTP_EXPIRY_MS);
        const hashedPassword = await bcrypt.hash(password, 10);

        // SEQUENCE FIX: Send email BEFORE database save to catch connection errors
        console.log(`Attempting to send email to ${email}...`);
        try {
            await sendVerificationOtpEmail(email, otpCode);
            console.log('Email sent successfully! Now updating database.');
        } catch (mailError) {
            console.error('MAILER FAILED:', mailError.message);
            throw new AppError(`Email delivery failed: ${mailError.message}. Please check if the email address is valid or try again later.`, 503);
        }

        let user;
        if (existingUser) {
            existingUser.username = username || existingUser.username;
            existingUser.password = hashedPassword;
            existingUser.isVerified = false;
            existingUser.verificationOtpHash = verificationOtpHash;
            existingUser.verificationOtpExpires = verificationOtpExpires;
            user = existingUser;
        } else {
            user = new User({
                username,
                email,
                password: hashedPassword,
                isVerified: false,
                verificationOtpHash,
                verificationOtpExpires
            });
        }
        await user.save();

        res.status(201).json({
            success: true,
            message: 'Verification code sent to your email.',
            requiresVerification: true,
            user: buildUserPayload(user)
        });
    } catch (error) {
        console.error('SIGNUP ERROR:', error);
        next(error);
    }
};

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) throw new AppError('Email and password required', 400);

        const user = await User.findOne({ email });
        if (!user) throw new AppError('User not found', 404);

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) throw new AppError('Wrong password', 400);

        if (!user.isVerified) {
            throw new AppError('Please verify your email before logging in.', 401);
        }

        const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.json({
            success: true,
            message: 'Login successful!',
            user: buildUserPayload(user),
            token
        });
    } catch (error) {
        next(error);
    }
};

const verifyOtp = async (req, res, next) => {
    try {
        const { email, otpCode } = req.body;
        const user = await User.findOne({ email });

        if (!user) throw new AppError('User not found', 404);
        if (user.verificationOtpExpires < Date.now()) throw new AppError('OTP expired', 400);

        const incomingHash = hashVerificationOtp(otpCode.trim());
        if (incomingHash !== user.verificationOtpHash) throw new AppError('Invalid code', 400);

        user.isVerified = true;
        user.verificationOtpHash = null;
        user.verificationOtpExpires = null;
        await user.save();

        const token = jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

        res.status(200).json({ success: true, message: 'Email verified!', token, user: buildUserPayload(user) });
    } catch (error) {
        next(error);
    }
};

const resendVerificationEmail = async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });
        if (!user) throw new AppError('User not found', 404);

        const otpCode = generateVerificationOtp();
        user.verificationOtpHash = hashVerificationOtp(otpCode);
        user.verificationOtpExpires = new Date(Date.now() + VERIFICATION_OTP_EXPIRY_MS);
        
        await sendVerificationOtpEmail(email, otpCode);
        await user.save();

        res.status(200).json({ success: true, message: 'New code sent!' });
    } catch (error) {
        next(error);
    }
};

const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (user) {
            const otpCode = generateVerificationOtp();
            user.resetPasswordOtpHash = hashVerificationOtp(otpCode);
            user.resetPasswordOtpExpires = new Date(Date.now() + VERIFICATION_OTP_EXPIRY_MS);
            await user.save();
            await sendResetPasswordOtpEmail(email, otpCode);
        }

        res.status(200).json({ success: true, message: 'If an account exists, a code was sent.' });
    } catch (error) {
        next(error);
    }
};

const resetPassword = async (req, res, next) => {
    try {
        const { email, otpCode, password } = req.body;
        const user = await User.findOne({ email });

        if (!user || user.resetPasswordOtpExpires < Date.now()) throw new AppError('Invalid or expired reset session', 400);

        const incomingHash = hashVerificationOtp(otpCode.trim());
        if (incomingHash !== user.resetPasswordOtpHash) throw new AppError('Invalid code', 400);

        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordOtpHash = null;
        user.resetPasswordOtpExpires = null;
        await user.save();

        res.status(200).json({ success: true, message: 'Password reset successful.' });
    } catch (error) {
        next(error);
    }
};

const verifyMailer = async (req, res, next) => {
    try {
        await transporter.verify();
        res.status(200).json({ success: true, message: 'SMTP connection successful' });
    } catch (error) {
        next(error);
    }
};

module.exports = {
    signup,
    verifyOtp,
    resendVerificationEmail,
    forgotPassword,
    resetPassword,
    login,
    verifyMailer
};