const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const coordinatorController = require('../controllers/coordinatorController');

router.use(requireRole('level_coordinator'));

router.get('/dashboard', coordinatorController.getDashboard);
// In your routes file
router.get('/supervisors', coordinatorController.getSupervisors);
router.get('/profile', coordinatorController.getProfile);
router.get('/assignments', coordinatorController.getAssignments);
router.get('/students', coordinatorController.getStudents);
router.post('/assign-student', coordinatorController.assignStudent);
router.post('/unassign-student/:assignmentId', coordinatorController.unassignStudent);
router.get('/progress-overview', coordinatorController.getProgressOverview);

module.exports = router;
