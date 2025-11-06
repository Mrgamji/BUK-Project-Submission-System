const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const hodController = require('../controllers/hodController');

router.use(requireRole('hod'));

router.get('/dashboard', hodController.getDashboard);
router.get('/students', hodController.getStudents);
router.get('/reports', hodController.getReports);
router.get('/report/:id', hodController.getReportDetails);
router.post('/feedback', hodController.postFeedback);

module.exports = router;
