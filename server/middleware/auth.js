const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.session.user) {
      return res.redirect('/auth/login');
    }
    if (!roles.includes(req.session.user.role)) {
      return res.status(403).render('error', {
        message: 'Access Denied',
        error: 'You do not have permission to access this page'
      });
    }
    next();
  };
};

const setUserContext = (req, res, next) => {
  res.locals.user = req.session.user || null;
  next();
};

module.exports = { requireAuth, requireRole, setUserContext };
