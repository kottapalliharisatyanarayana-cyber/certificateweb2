const jwt = require('jsonwebtoken');
const Admin = require('../models/Admin');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access denied. No authentication token provided.'
      });
    }

    const token = authHeader.split(' ')[1];
    const secret = process.env.JWT_SECRET || 'super_secret_certificate_jwt_key_2026';
    const decoded = jwt.verify(token, secret);

    const admin = await Admin.findById(decoded.id).select('-password_hash');
    if (!admin) {
      return res.status(401).json({
        success: false,
        message: 'Invalid token: Admin account not found.'
      });
    }

    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token.'
    });
  }
};

module.exports = authMiddleware;
