const User = require('../models/User');
const AppError = require('../utils/AppError');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        rejectUnauthorized: false
    },
    connectionTimeout: 10000,
    debug: true,
    logger: true
});

const VERIFICATION_OTP_EXPIRY_MS = 10 * 60 * 1000;

const generateVerificationOtp = () => crypto.randomInt(100000, 1000000).toString();

const hashVerificationOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

const sendVerificationOtpEmail = async (user, otpCode) => {
    await transporter.sendMail({
        from: `"EduSync Support" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'Your EduSync verification code',
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                <h2 style="color: #2563eb;">Verify your EduSync account</h2>
                <p>Use this 6-digit code to activate your account. This email contains no verification link:</p>
                <div style="text-align: center; margin: 28px 0;">
                    <span style="display:inline-block; letter-spacing: 0.35em; font-size: 2rem; font-weight: 800; color: #111827; background: #f8fafc; padding: 16px 24px; border-radius: 12px; border: 1px solid #e2e8f0;">${otpCode}</span>
                </div>
                <p style="font-size: 0.875rem; color: #6b7280;">This code expires in 10 minutes.</p>
                <p style="font-size: 0.875rem; color: #6b7280;">If you did not create this account, you can ignore this email.</p>
            </div>
        `
    });
};

const buildUserPayload = (user) => ({
    id: user._id,
    username: user.username,
    email: user.email,
    isVerified: user.isVerified
});

const signup = async (req, res, next) => {
    try {
        console.log('Signup Request Body:', req.body);
        const { email, password, username } = req.body;

        if (!email || !password) {
            throw new AppError('Email and password are required', 400);
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const otpCode = generateVerificationOtp();
        const verificationOtpHash = hashVerificationOtp(otpCode);
        const verificationOtpExpires = new Date(Date.now() + VERIFICATION_OTP_EXPIRY_MS);

        const existingUser = await User.findOne({ email });
        let user;

        if (existingUser) {
            if (existingUser.isVerified) {
                throw new AppError('An account with this email already exists', 409);
            }

            existingUser.username = username || existingUser.username;
            existingUser.password = hashedPassword;
            existingUser.isVerified = false;
            existingUser.verificationOtpHash = verificationOtpHash;
            existingUser.verificationOtpExpires = verificationOtpExpires;
            user = existingUser;
            await user.save();
        } else {
            user = new User({
                username,
                email,
                password: hashedPassword,
                isVerified: false,
                verificationOtpHash,
                verificationOtpExpires
            });
            await user.save();
        }

        try {
            await sendVerificationOtpEmail(user, otpCode);
        } catch (mailError) {
            console.error('OTP email error:', mailError);
        }

        res.status(existingUser ? 200 : 201).json({
            success: true,
            message: 'Verification code sent to your email. Enter the OTP to activate your account.',
            requiresVerification: true,
            verificationEmailSent: true,
            user: buildUserPayload(user)
        });
    } catch (error) {
        console.error('SIGNUP CRASH:', error);
        next(error);
    }
};

const verifyOtp = async (req, res, next) => {
    try {
        const { email, otpCode } = req.body;

        if (!email || !otpCode) {
            throw new AppError('Email and OTP code are required', 400);
        }

        const user = await User.findOne({ email });

        if (!user) {
            throw new AppError('User not found', 404);
        }

        if (user.isVerified) {
            const token = process.env.JWT_SECRET
                ? jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' })
                : undefined;

            return res.status(200).json({
                success: true,
                message: 'Account is already verified.',
                user: buildUserPayload(user),
                ...(token && { token })
            });
        }

        if (!user.verificationOtpHash || !user.verificationOtpExpires) {
            throw new AppError('No verification code found. Please request a new code.', 400);
        }

        if (user.verificationOtpExpires.getTime() < Date.now()) {
            throw new AppError('Verification code expired. Please request a new code.', 400);
        }

        const incomingOtpHash = hashVerificationOtp(otpCode.trim());
        if (incomingOtpHash !== user.verificationOtpHash) {
            throw new AppError('Invalid verification code.', 400);
        }

        user.isVerified = true;
        user.verificationOtpHash = null;
        user.verificationOtpExpires = null;
        await user.save();

        const token = process.env.JWT_SECRET
            ? jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' })
            : undefined;

        res.status(200).json({
            success: true,
            message: 'Email verified successfully.',
            user: buildUserPayload(user),
            ...(token && { token })
        });
    } catch (error) {
        next(error);
    }
};

const resendVerificationEmail = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            throw new AppError('Email is required', 400);
        }

        const user = await User.findOne({ email });

        if (!user) {
            throw new AppError('User not found', 404);
        }

        if (user.isVerified) {
            throw new AppError('Account is already verified', 400);
        }

        const otpCode = generateVerificationOtp();
        user.verificationOtpHash = hashVerificationOtp(otpCode);
        user.verificationOtpExpires = new Date(Date.now() + VERIFICATION_OTP_EXPIRY_MS);
        await user.save();

        try {
            await sendVerificationOtpEmail(user, otpCode);
        } catch (mailError) {
            console.error('OTP resend error:', mailError);
        }

        res.status(200).json({
            success: true,
            message: 'A new verification code has been sent to your email.'
        });
    } catch (error) {
        next(error);
    }
};

const sendPasswordResetEmail = async (user, resetToken) => {
    const appUrl = process.env.APP_URL || 'http://localhost:5000';
    const resetUrl = `${appUrl}/reset-password.html?token=${resetToken}`;

    await transporter.sendMail({
        from: `"EduSync Support" <${process.env.EMAIL_USER}>`,
        to: user.email,
        subject: 'EduSync Password Reset Request',
        html: `
            <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #1f2937; max-width: 600px; margin: auto; padding: 20px; border: 1px solid #e5e7eb; border-radius: 8px;">
                <h2 style="color: #800020;">Reset Your EduSync Password</h2>
                <p>We received a request to reset your password. Click the button below to continue.</p>
                <div style="text-align: center; margin: 30px 0;">
                    <a href="${resetUrl}" style="display:inline-block;padding:14px 24px;background:#800020;color:#ffffff;text-decoration:none;border-radius:6px;font-weight: bold;">
                        Reset Password
                    </a>
                </div>
                <p style="font-size: 0.875rem; color: #6b7280;">This reset link expires in 1 hour.</p>
                <hr style="border: 0; border-top: 1px solid #e5e7eb; margin: 20px 0;">
                <p style="font-size: 0.75rem; color: #9ca3af;">If you did not request this, you can ignore this email.</p>
            </div>
        `
    });
};

const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            throw new AppError('Email is required', 400);
        }

        const user = await User.findOne({ email });

        if (user) {
            const resetToken = crypto.randomBytes(20).toString('hex');
            const resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000);

            user.resetPasswordToken = resetToken;
            user.resetPasswordExpires = resetPasswordExpires;
            await user.save();

            try {
                await sendPasswordResetEmail(user, resetToken);
            } catch (mailError) {
                user.resetPasswordToken = null;
                user.resetPasswordExpires = null;
                await user.save();
                throw mailError;
            }
        }

        res.status(200).json({
            success: true,
            message: 'If an account exists with this email, a reset link has been sent.'
        });
    } catch (error) {
        next(error);
    }
};

const resetPassword = async (req, res, next) => {
    try {
        const { token } = req.params;
        const { password } = req.body;

        if (!password) {
            throw new AppError('Password is required', 400);
        }

        const user = await User.findOne({
            resetPasswordToken: token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            throw new AppError('Invalid or expired password reset token', 400);
        }

        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;
        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password has been reset successfully.'
        });
    } catch (error) {
        next(error);
    }
};

const login = async (req, res, next) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            throw new AppError('Email and password are required', 400);
        }

        const user = await User.findOne({ email });

        if (!user) {
            throw new AppError('User not found', 404);
        }

        const isBcryptHash = typeof user.password === 'string' && user.password.startsWith('$2');
        const passwordMatches = isBcryptHash
            ? await bcrypt.compare(password, user.password)
            : user.password === password;

        if (!passwordMatches) {
            throw new AppError('Wrong password', 400);
        }

        if (!user.isVerified) {
            throw new AppError('Please verify your email with the OTP sent to your inbox before logging in.', 401);
        }

        const token = process.env.JWT_SECRET
            ? jwt.sign({ id: user._id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' })
            : undefined;

        res.json({
            success: true,
            message: 'Login successful! Welcome back.',
            user: {
                id: user._id,
                username: user.username,
                email: user.email
            },
            ...(token && { token })
        });
    } catch (error) {
        console.error('FULL EMAIL ERROR:', error);
        next(error);
    }
};

module.exports = {
    signup,
    verifyOtp,
    resendVerificationEmail,
    forgotPassword,
    resetPassword,
    login
};
