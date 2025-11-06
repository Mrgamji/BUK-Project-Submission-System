// server/routes/fileRoutes.js
const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');

router.get('/view/:reportId', (req, res) => {
  const reportId = req.params.reportId;
  const report = db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
  if (!report) return res.status(404).send('File not found.');

  const filePath = path.join(__dirname, '../../uploads/reports', report.file_name);
  const fileExt = path.extname(report.file_name).toLowerCase();

  if (fileExt === '.pdf') {
    res.contentType('application/pdf');
    fs.createReadStream(filePath).pipe(res);
  } else {
    res.sendFile(filePath);
  }
});

module.exports = router;
