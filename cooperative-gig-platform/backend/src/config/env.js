require('dotenv').config();

module.exports = {
  port: process.env.PORT || 5001,
  mongoURI: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/cooperative_gig_platform',
  jwtSecret: process.env.JWT_SECRET || 'dev_secret_change_me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  clientURL: process.env.CLIENT_URL || 'http://localhost:5173',
  osrmBaseUrl: process.env.OSRM_BASE_URL || 'https://router.project-osrm.org',
};
