const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Worker = require('../models/WorkerProfile');
const { jwtSecret } = require('../config/env');
const { suspensionStatus } = require('../utils/workerStatus');

// Protect routes - verify JWT token
exports.protect = async (req, res, next) => {
  try {
    let token;

    // Get token from Authorization header
    if (
      req.headers.authorization &&
      req.headers.authorization.startsWith('Bearer')
    ) {
      token = req.headers.authorization.split(' ')[1];
    }

    // Also allow token in body/query for socket or edge cases
    if (!token && req.query.token) {
      token = req.query.token;
    }

    if (!token) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, no token provided',
      });
    }

    // Verify token
    const decoded = jwt.verify(token, jwtSecret);

    // Get user from DB (exclude password)
    const user = await User.findById(decoded.id);
    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, invalid token',
      });
    }

    req.user = user;

    // Workers under administrative suspension are blocked from every API call
    // (with a descriptive message) so an already-open session cannot keep working.
    if (user.role === 'worker') {
      const workerProfile = await Worker.findOne({ user: user._id });
      const status = suspensionStatus(workerProfile);
      if (status) {
        return res.status(403).json({
          success: false,
          code: status.code,
          message: status.message,
          suspendedUntil: status.suspendedUntil || undefined,
        });
      }
    }

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Not authorized, token invalid or expired',
      });
    }
    return res.status(500).json({
      success: false,
      message: 'Server error during authentication',
    });
  }
};

// Role-based authorization
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'Not authorized',
      });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role ${req.user.role} is not authorized to access this resource`,
      });
    }
    next();
  };
};
