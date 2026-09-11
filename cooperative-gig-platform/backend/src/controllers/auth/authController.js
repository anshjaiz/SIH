const User = require('../../models/User');
const Worker = require('../../models/WorkerProfile');
const Customer = require('../../models/CustomerProfile');
const Notification = require('../../models/Notification');
const EmailVerification = require('../../models/EmailVerification');
const { generateToken, sanitizeUser, generateOTP } = require('../../utils/authHelper');
const { generateSecureOtp, hashOtp, safeEqual, maskEmail, OTP_TTL_MS } = require('../../utils/otpUtils');
const { sendOtpEmail } = require('../../services/emailService');
const { restoreIfExpired } = require('../../services/worker/workerSuspensionService');
const { suspensionStatus } = require('../../utils/workerStatus');
const { asyncHandler, ApiError } = require('../../middleware/errorMiddleware');

const OTP_RESEND_COOLDOWN_MS = 30 * 1000; // 30 seconds between OTP mails
const MAX_ATTEMPTS = 5;
const EMAIL_RE = /^\S+@\S+\.\S+$/;

const validateEmail = (email) => {
  const normalized = String(email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(normalized)) throw new ApiError('Please provide a valid email', 400);
  // Guard against masked display emails (never valid for API calls).
  if (normalized.includes('*')) throw new ApiError('Please provide a valid email', 400);
  return normalized;
};

// Enforces the OTP resend cooldown so the SMTP relay cannot be spammed.
const enforceOtpResendCooldown = async (email) => {
  const last = await EmailVerification.findOne({ email }).sort({ createdAt: -1 }).select('createdAt');
  if (last && Date.now() - last.createdAt.getTime() < OTP_RESEND_COOLDOWN_MS) {
    throw new ApiError('Please wait a moment before requesting a new code.', 429);
  }
};

// Generate a secure OTP, store only its hash, and email the plaintext code.
// Returns { devOtp } when the OTP_CONSOLE_FALLBACK dev mode swallowed a
// delivery failure so the local demo can still complete registration.
const createVerificationFor = async (user) => {
  await enforceOtpResendCooldown(user.email);
  const otp = generateSecureOtp();
  await EmailVerification.deleteMany({ email: user.email });
  await EmailVerification.create({
    email: user.email,
    otpHash: hashOtp(otp, user.email),
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });
  const result = await sendOtpEmail({ toEmail: user.email, otp, name: user.name });
  return { devOtp: result && result.delivered === false ? otp : null };
};

// Attaches the role-specific profile shape used by login/me responses.
const attachProfile = async (user) => {
  if (user.role === 'worker') {
    const workerProfile = await Worker.findOne({ user: user._id });
    return {
      verificationStatus: workerProfile ? workerProfile.verificationStatus : 'PENDING',
      workerId: workerProfile ? workerProfile._id : null,
    };
  }
  if (user.role === 'customer') {
    const customerProfile = await Customer.findOne({ user: user._id });
    return { customerId: customerProfile ? customerProfile._id : null };
  }
  return null;
};

// Cleans up stray unverified accounts left by failed sign-ups (dev helper).
const cleanupUnverified = async (email) => {
  const user = await User.findOne({ email });
  if (user && user.isEmailVerified === false) {
    await User.deleteMany({ _id: user._id });
    await Worker.deleteMany({ user: user._id });
    await Customer.deleteMany({ user: user._id });
    await Notification.deleteMany({ data: { userId: user._id } });
    await EmailVerification.deleteMany({ email });
    return true;
  }
  return false;
};

// Returns a suspension/termination status for a worker, or null if the worker is active.
const getWorkerSuspension = async (user) => {
  if (user.role !== 'worker') return null;
  const workerProfile = await restoreIfExpired(await Worker.findOne({ user: user._id }));
  return suspensionStatus(workerProfile);
};

// @desc    Register a new user
// @route   POST /api/auth/register
const register = asyncHandler(async (req, res) => {
  const { name, email, phone, password, role, languages } = req.body;

  // Validate role
  if (!['customer', 'worker'].includes(role)) {
    throw new ApiError('Role must be customer or worker', 400);
  }

  const normalizedEmail = validateEmail(email);

  // Check if user exists
  const existingUser = await User.findOne({
    $or: [{ email: normalizedEmail }, { phone: phone ? String(phone).trim() : phone }],
  });
  if (existingUser) {
    // Verified account → block duplicate registration.
    if (existingUser.isEmailVerified) {
      throw new ApiError('Email already registered.', 400);
    }
    // Unverified account → allow reverification instead of duplicating.
    const re = await createVerificationFor(existingUser);
    return res.status(200).json({
      success: true,
      requiresVerification: true,
      message: 'We sent a 6-digit verification code to your email. Please verify to activate your account.',
      data: { email: maskEmail(existingUser.email), devOtp: (re && re.devOtp) || null },
    });
  }

  // Create user (unverified until the OTP is confirmed)
  const user = await User.create({
    name,
    email: normalizedEmail,
    phone,
    password,
    role,
    languages: languages || ['English', 'Hindi'],
    isEmailVerified: false,
  });

  // Create role-specific profile
  if (role === 'worker') {
    await Worker.create({
      user: user._id,
      languages: languages || ['English', 'Hindi'],
      joinedDate: new Date(),
    });
  } else if (role === 'customer') {
    await Customer.create({
      user: user._id,
      preferredLanguages: languages || ['English', 'Hindi'],
    });
  }

  // Notify admin of new registration
  const admins = await User.find({ role: 'admin' });
  if (admins.length) {
    await Notification.create(
      admins.map((admin) => ({
        user: admin._id,
        type: role === 'worker' ? 'NEW_WORKER' : 'CUSTOM_REQUEST',
        title: role === 'worker' ? 'New worker registered' : 'New customer registered',
        message: `${name} (${normalizedEmail}) registered as ${role}`,
        data: { userId: user._id, role },
      }))
    );
  }

  // Generate + send the OTP. If the email never goes out, roll the account
  // back so a retry is clean instead of leaving a stuck unverified user.
  // (OTP_CONSOLE_FALLBACK dev mode swallows delivery failures and returns
  // the code instead of rolling back.)
  let devOtp = null;
  try {
    const sent = await createVerificationFor(user);
    devOtp = (sent && sent.devOtp) || null;
  } catch (err) {
    await User.deleteMany({ _id: user._id });
    if (role === 'worker') await Worker.deleteMany({ user: user._id });
    if (role === 'customer') await Customer.deleteMany({ user: user._id });
    await Notification.deleteMany({ data: { userId: user._id } });
    await EmailVerification.deleteMany({ email: user.email });
    throw err;
  }

  res.status(201).json({
    success: true,
    requiresVerification: true,
    message: 'We sent a 6-digit verification code to your email. Please verify to activate your account.',
    data: { email: maskEmail(user.email), devOtp },
  });
});

// @desc    Login user
// @route   POST /api/auth/login
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError('Please provide email and password', 400);
  }

  // Get user with password field
  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    throw new ApiError('Invalid email or password', 401);
  }

  const status = await getWorkerSuspension(user);
  if (status) throw new ApiError(status.message, 403);

  if (!user.isActive) {
    throw new ApiError('Your account has been deactivated. Contact support.', 403);
  }

  if (user.isEmailVerified === false) {
    throw new ApiError('Please verify your email before logging in.', 403);
  }

  // Update last login
  user.lastLoginAt = new Date();
  await user.save({ validateBeforeSave: false });

  // If worker, attach verification status
  let profile = null;
  if (user.role === 'worker') {
    const workerProfile = await Worker.findOne({ user: user._id });
    profile = {
      verificationStatus: workerProfile ? workerProfile.verificationStatus : 'PENDING',
      workerId: workerProfile ? workerProfile._id : null,
    };
  } else if (user.role === 'customer') {
    const customerProfile = await Customer.findOne({ user: user._id });
    profile = {
      customerId: customerProfile ? customerProfile._id : null,
    };
  }

  const token = generateToken(user);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user: sanitizeUser(user),
      profile,
      token,
    },
  });
});

// @desc    Verify email with the sent OTP
// @route   POST /api/auth/verify-otp
const verifyOtp = asyncHandler(async (req, res) => {
  const { email, otp } = req.body;
  const normalizedEmail = validateEmail(email);

  const code = String(otp || '').trim();
  if (!/^\d{6}$/.test(code)) {
    throw new ApiError('Invalid verification code.', 400);
  }

  const user = await User.findOne({ email: normalizedEmail });
  const record = await EmailVerification.findOne({ email: normalizedEmail });
  if (!user || !record) {
    throw new ApiError('Verification code expired. Please request a new code.', 400);
  }

  if (record.expiresAt.getTime() < Date.now()) {
    await EmailVerification.deleteMany({ email: normalizedEmail });
    throw new ApiError('Verification code expired. Please request a new code.', 400);
  }

  if (record.attempts >= MAX_ATTEMPTS) {
    await EmailVerification.deleteMany({ email: normalizedEmail });
    throw new ApiError('Too many incorrect attempts. Please request a new code.', 400);
  }

  if (!safeEqual(hashOtp(code, normalizedEmail), record.otpHash)) {
    record.attempts += 1;
    await record.save({ validateBeforeSave: false });
    throw new ApiError('Invalid verification code.', 400);
  }

  // Success: mark verified, invalidate the OTP, continue the existing auth flow.
  user.isEmailVerified = true;
  await user.save({ validateBeforeSave: false });
  await EmailVerification.deleteMany({ email: normalizedEmail });

  const profile = await attachProfile(user);
  const token = generateToken(user);

  res.json({
    success: true,
    message: 'Email verified successfully.',
    data: {
      user: sanitizeUser(user),
      profile,
      token,
    },
  });
});

// @desc    Resend the OTP / send it again for an unverified account
// @route   POST /api/auth/resend-otp
const resendOtp = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const normalizedEmail = validateEmail(email);

  const user = await User.findOne({ email: normalizedEmail });
  if (!user) {
    throw new ApiError('No account found with this email.', 404);
  }
  if (user.isEmailVerified) {
    throw new ApiError('This email is already verified. Please login.', 400);
  }

  // Cooldown + fresh code, invalidates the previous OTP.
  const sent = await createVerificationFor(user);

  res.json({
    success: true,
    requiresVerification: true,
    message: 'A new verification code has been sent to your email.',
    data: { email: maskEmail(user.email), devOtp: (sent && sent.devOtp) || null },
  });
});

// @desc    Get current logged-in user
// @route   GET /api/auth/me
const getMe = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user._id);
  let profile = null;

  if (user.role === 'worker') {
    const workerProfile = await Worker.findOne({ user: user._id });
    profile = {
      verificationStatus: workerProfile ? workerProfile.verificationStatus : 'PENDING',
      workerId: workerProfile ? workerProfile._id : null,
      rating: workerProfile ? workerProfile.rating : 0,
      completedJobs: workerProfile ? workerProfile.completedJobs : 0,
    };
  } else if (user.role === 'customer') {
    const customerProfile = await Customer.findOne({ user: user._id });
    profile = {
      customerId: customerProfile ? customerProfile._id : null,
    };
  }

  res.json({
    success: true,
    data: {
      user: sanitizeUser(user),
      profile,
    },
  });
});

// @desc    Forgot password (mock, generates reset token)
// @route   POST /api/auth/forgot-password
const forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal whether user exists
    return res.json({
      success: true,
      message: 'If an account with that email exists, a reset link will be sent.',
    });
  }

  // Generate reset token (mock - in real use send email)
  const resetToken = generateOTP();
  user.resetPasswordToken = resetToken;
  user.resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000); // 10 min
  await user.save({ validateBeforeSave: false });

  // In a real system, email this token. For demo, return it in response (dev only).
  res.json({
    success: true,
    message: 'Password reset token generated. Check your email.',
    data: process.env.NODE_ENV !== 'production' ? { resetToken } : undefined,
  });
});

// @desc    Reset password
// @route   POST /api/auth/reset-password
const resetPassword = asyncHandler(async (req, res) => {
  const { email, resetToken, newPassword } = req.body;

  if (!email || !resetToken || !newPassword) {
    throw new ApiError('Please provide email, reset token and new password', 400);
  }

  const user = await User.findOne({ email }).select('+password');

  if (!user || user.resetPasswordToken !== resetToken) {
    throw new ApiError('Invalid reset token', 400);
  }

  if (user.resetPasswordExpire < new Date()) {
    throw new ApiError('Reset token expired', 400);
  }

  user.password = newPassword;
  user.resetPasswordToken = undefined;
  user.resetPasswordExpire = undefined;
  await user.save();

  res.json({
    success: true,
    message: 'Password reset successful. Please login with your new password.',
  });
});

// @desc    Logout user (stateless JWT, just client-side token removal)
// @route   POST /api/auth/logout
const logout = asyncHandler(async (req, res) => {
  // JWT is stateless; the client just removes the token
  res.json({
    success: true,
    message: 'Logged out successfully',
  });
});

module.exports = {
  register,
  login,
  verifyOtp,
  resendOtp,
  getMe,
  forgotPassword,
  resetPassword,
  logout,
};
