const User = require('../models/User');
const AppError = require('../utils/AppError');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');
const dns = require('dns');

if (typeof dns.setDefaultResultOrder === 'function') {
    dns.setDefaultResultOrder('ipv4first');
}

const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: {
        family: 4,
        servername: 'smtp.gmail.com',
        rejectUnauthorized: false
    },
    connectionTimeout: 60000,
    greetingTimeout: 60000,
    socketTimeout: 60000
});

// Controller: run verify on-demand (HTTP) for remote debugging
const verifyMailer = async (req, res, next) => {
    try {
        await transporter.verify();
        res.status(200).json({ success: true, message: 'SMTP connection successful' });
    } catch (error) {
        next(error);
    }
};

const sendResetPasswordOtpEmail = async (user, otpCode) => {
    const info = await transporter.sendMail({
        from: `"EduSync Support" <${process.env.EMAIL_USER}>`,
        to: user.email,
        replyTo: process.env.EMAIL_USER,
        envelope: {
            from: process.env.EMAIL_USER,
            to: user.email
        },
        subject: 'Your EduSync Password Reset Code',
        text: [
            'EduSync Password Reset',
            '',
            `Your password reset code is: ${otpCode}`,
            '',
            'This code expires in 10 minutes.',
            'If you did not request this, you can safely ignore this email.'
        ].join('\n'),
        html: `
            <div style="font-family: Arial, sans-serif; background:#f7f7f7; padding:24px;">
                <div style="max-width:560px; margin:0 auto; background:#ffffff; border:1px solid #ececec; border-radius:12px; overflow:hidden;">
                    <div style="background:#800020; color:#ffffff; padding:18px 24px; font-size:20px; font-weight:700;">
                        EduSync Password Reset
                    </div>
                    <div style="padding:24px; color:#1f2937; line-height:1.6;">
                        <p style="margin:0 0 12px 0;">We received a request to reset your password.</p>
                        <p style="margin:0 0 20px 0;">Enter this 6-digit code in the app to continue:</p>
                        <div style="text-align:center; margin:20px 0 24px 0;">
                            <span style="display:inline-block; min-width:220px; padding:14px 18px; border-radius:10px; background:#800020; color:#ffffff; font-size:36px; font-weight:800; letter-spacing:0.3em;">${otpCode}</span>
                        </div>
                        <p style="margin:0; color:#4b5563; font-size:14px;">This code expires in 10 minutes.</p>
                        <p style="margin:10px 0 0 0; color:#6b7280; font-size:13px;">If you did not request this, you can safely ignore this email.</p>
                    </div>
                </div>
            </div>
        `
    });

    console.log('Reset password email sent:', {
        messageId: info.messageId,
        accepted: info.accepted,
        rejected: info.rejected
    });
};

const VERIFICATION_OTP_EXPIRY_MS = 10 * 60 * 1000;

const generateVerificationOtp = () => String(crypto.randomInt(0, 1000000)).padStart(6, '0');

const hashVerificationOtp = (otp) => crypto.createHash('sha256').update(String(otp)).digest('hex');

const sendVerificationOtpEmail = async (user, otpCode) => {
    const info = await transporter.sendMail({
        from: `"EduSync Support" <${process.env.EMAIL_USER}>`,
        to: user.email,
        replyTo: process.env.EMAIL_USER,
        // Using the envelope helps with SMTP routing on Render
        envelope: {
            from: process.env.EMAIL_USER,
            to: user.email
        },
        subject: 'Your EduSync Verification Code',
        // Plain text fallback improves spam scores
        text: `Verify your EduSync account. Your 6-digit code is: ${otpCode}. It expires in 10 minutes.`,
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

    // Logging this helps you confirm Render successfully handed the mail to Gmail
    console.log('Verification email sent:', {
        messageId: info.messageId,
        accepted: info.accepted
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

const forgotPassword = async (req, res, next) => {
    try {
        const { email } = req.body;

        if (!email) {
            throw new AppError('Email is required', 400);
        }

        const user = await User.findOne({ email });

        if (user) {
            const otpCode = generateVerificationOtp();
            user.resetPasswordOtpHash = hashVerificationOtp(otpCode);
            user.resetPasswordOtpExpires = new Date(Date.now() + VERIFICATION_OTP_EXPIRY_MS);
            await user.save();

            setImmediate(() => {
                sendResetPasswordOtpEmail(user, otpCode).catch(async (mailError) => {
                    console.error('Reset password email error:', mailError);
                    try {
                        const latestUser = await User.findById(user._id);

                        if (latestUser) {
                            latestUser.resetPasswordOtpHash = null;
                            latestUser.resetPasswordOtpExpires = null;
                            await latestUser.save();
                        }
                    } catch (cleanupError) {
                        console.error('Reset password cleanup error:', cleanupError);
                    }
                });
            });
        }

        res.status(200).json({
            success: true,
            message: 'If an account exists with this email, a password reset code has been sent to your email.'
        });
    } catch (error) {
        next(error);
    }
};


const verifyResetOtp = async (req, res, next) => {
    try {
        const { email, otpCode } = req.body;

        if (!email || !otpCode) {
            throw new AppError('Email and OTP code are required', 400);
        }

        const user = await User.findOne({ email });

        if (!user) {
            throw new AppError('User not found', 404);
        }

        if (!user.resetPasswordOtpHash || !user.resetPasswordOtpExpires) {
            throw new AppError('No password reset code found. Please request a new code.', 400);
        }

        if (user.resetPasswordOtpExpires.getTime() < Date.now()) {
            throw new AppError('Password reset code expired. Please request a new code.', 400);
        }

        const incomingOtpHash = hashVerificationOtp(otpCode.trim());
        if (incomingOtpHash !== user.resetPasswordOtpHash) {
            throw new AppError('Invalid password reset code.', 400);
        }

        res.status(200).json({
            success: true,
            message: 'OTP verified successfully. You can now reset your password.'
        });
    } catch (error) {
        next(error);
    }
};
const resetPassword = async (req, res, next) => {
    try {
        const { email, otpCode, password } = req.body;

        if (!email || !otpCode || !password) {
            throw new AppError('Email, OTP code, and new password are required', 400);
        }

        const user = await User.findOne({ email });

        if (!user) {
            throw new AppError('User not found', 404);
        }

        if (!user.resetPasswordOtpHash || !user.resetPasswordOtpExpires) {
            throw new AppError('No password reset code found. Please request a new code.', 400);
        }

        if (user.resetPasswordOtpExpires.getTime() < Date.now()) {
            throw new AppError('Password reset code expired. Please request a new code.', 400);
        }

        const incomingOtpHash = hashVerificationOtp(otpCode.trim());
        if (incomingOtpHash !== user.resetPasswordOtpHash) {
            throw new AppError('Invalid password reset code.', 400);
        }

        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordOtpHash = null;
        user.resetPasswordOtpExpires = null;
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
    verifyResetOtp,
    resetPassword,
    login,
    verifyMailer
};
