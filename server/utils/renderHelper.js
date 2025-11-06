// server/utils/renderHelper.js
module.exports = function renderPage(res, options = {}) {
  const {
    title = 'Project Submission Reporting System',
    view = '../error',
    user = null,
    stats = {},
    coordinators = [],
    recentUsers = [],
    logs = [],
    message = null,
    error = null,
    supervisor = null,   // ✅ FIX ADDED
    reports = [],        // ✅ If needed
    ...extra
  } = options;

  res.render('layouts/main', {
    title,
    view,
    user,
    stats,
    coordinators,
    recentUsers,
    logs,
    message,
    error,
    supervisor,  // ✅ PASS IT HERE
    reports,     // ✅ PASS IT ALSO
    ...extra
  });
};
