const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const supervisorController = require('../controllers/supervisorController');
const fileController = require('../controllers/fileController'); // Import file controller

// All routes require supervisor role
router.use(requireRole('supervisor'));

// ------------------------------
// Dashboard & Student Management
// ------------------------------

// Supervisor Dashboard
router.get('/dashboard', supervisorController.getDashboard);

// View all reports of a specific student
router.get('/student/:studentId', supervisorController.getStudentReports);

// ------------------------------
// Report Management
// ------------------------------

// View a single report with feedback
router.get('/report/:id', supervisorController.getReportDetails);

// Submit feedback for a report
router.post('/feedback', supervisorController.postFeedback);

// Move a report to the next stage
router.put('/reports/:reportId/move-next-stage', supervisorController.moveToNextStage);

// ------------------------------
// File Operations
// ------------------------------

// Get file content for editing
router.get('/files/view/:id', fileController.getFileContent);

// Update file content
router.put('/files/:id', fileController.updateFileContent);

// Download file
router.get('/files/download/:id', fileController.downloadFile);

// Get file information
router.get('/files/info/:id', fileController.getFileInfo);

// Get file preview
router.get('/files/preview/:id', fileController.getFilePreview);

module.exports = router;