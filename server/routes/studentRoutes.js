const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireRole } = require('../middleware/auth');
const studentController = require('../controllers/studentController');

// Ensure upload folder exists
const uploadDir = path.join(__dirname, '..', 'public', 'uploads', 'reports');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

// File filter and limits
const upload = multer({ 
  storage, 
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = /pdf|doc|docx|jpg|jpeg|png/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('Only PDF, DOC, DOCX, and images are allowed'));
  }
});

// Protect all routes — only students
router.use(requireRole('student'));

// Routes
router.get('/dashboard', studentController.getDashboard);
router.get('/upload-report', studentController.getUploadReport);
router.post('/upload-report', upload.single('report'), studentController.postUploadReport);

router.get('/report/:id', studentController.getReportDetails);
router.get('/reupload/:id', studentController.getReuploadReport);
router.post('/reupload/:id', upload.single('report'), studentController.postReuploadReport);

module.exports = router;