const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const supervisorController = require('../controllers/supervisorController');
const fileController = require('../controllers/fileController');

// All routes require supervisor role
router.use(requireRole('supervisor'));

// ------------------------------
// Dashboard & Student Management
// ------------------------------

// Supervisor Dashboard
router.get('/dashboard', supervisorController.getDashboard);

// View all students assigned to the supervisor
router.get('/students', supervisorController.getAllStudents);

// View all reports assigned to the supervisor
router.get('/reports', supervisorController.getAllReports);

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
router.get('/files/view/:id', fileController.getFileView); // Changed from getFileContent
router.put('/files/:id', fileController.updateFileContent);
router.get('/files/download/:id', fileController.downloadFile);
router.get('/files/info/:id', fileController.getFileInfo);
module.exports = router;