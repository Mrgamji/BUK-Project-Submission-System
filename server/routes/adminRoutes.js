const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const adminController = require('../controllers/adminController');

router.use(requireRole('general_admin'));

// Dashboard
router.get('/dashboard', adminController.getDashboard);

// Manage Users (View HODs, Coordinators, Students, Supervisors)
router.get('/manage-users', adminController.getManageUsers);

// Add User
router.post('/add-user', adminController.postAddUser);

// Delete User
router.post('/delete-user/:id', adminController.deleteUser);

// View Coordinators (optional: filtered by role)
router.get('/view-coordinators', adminController.getViewCoordinators);

// View HODs
router.get('/view-hods', adminController.getViewHods);

// View Students
router.get('/view-students', adminController.getViewStudents);

// View Supervisors
router.get('/view-supervisors', adminController.getViewSupervisors);

// Activity Logs
router.get('/activity-logs', adminController.getActivityLogs);

// Coordinator Management (from the second version)
router.get('/add-coordinator', adminController.getAddCoordinator);
router.post('/add-coordinator', adminController.postAddCoordinator);
router.get('/edit-coordinator/:id', adminController.getEditCoordinator);
router.post('/edit-coordinator/:id', adminController.postEditCoordinator);
router.post('/delete-coordinator/:id', adminController.deleteCoordinator);

module.exports = router;