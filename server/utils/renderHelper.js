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
    ...extra
  });
};
