const jwt = require('jsonwebtoken');

function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1]; // Bearer <token>

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded; // you can access req.user._id, req.user.email etc.
    next();
  } catch (err) {
    return res.status(403).json({ error: 'Invalid token.' });
  }
}

module.exports = authMiddleware;
