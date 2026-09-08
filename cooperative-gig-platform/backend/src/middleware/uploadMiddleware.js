const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Ensure uploads directory exists
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname).toLowerCase();
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9-_]/g, '_');
    cb(null, `${base}-${uniqueSuffix}${ext}`);
  },
});

// File filter - only allow images/PDF
const fileFilter = (req, file, cb) => {
  const allowedMime = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'application/pdf',
  ];
  if (allowedMime.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (jpg, png, gif, webp) and PDFs are allowed'), false);
  }
};

// Max file size: 5 MB
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 5,
  },
});

// Serve static files from uploads
const getUploadBaseUrl = (req) =>
  `${req.protocol}://${req.get('host')}/uploads`;

// Evidence upload — images, documents, short videos (complaints & disputes)
const evidenceFileFilter = (req, file, cb) => {
  const allowedMime = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/heic',
    'application/pdf',
    'video/mp4',
    'video/webm',
    'video/quicktime',
  ];
  if (allowedMime.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files, PDFs and short videos are allowed as evidence'), false);
  }
};

const uploadEvidence = multer({
  storage,
  fileFilter: evidenceFileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024,
    files: 10,
  },
});

module.exports = { upload, uploadEvidence, uploadDir, getUploadBaseUrl };
