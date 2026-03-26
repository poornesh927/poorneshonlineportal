const express = require('express');
const router = express.Router();
const { getDashboard, getProfile, updateProfile } = require('../controllers/studentController');
const { protect } = require('../middleware/auth');
const { getStudentDocuments, studentDownloadDocument } = require('../controllers/documentController');

router.use(protect);
router.get('/dashboard', getDashboard);
router.get('/profile', getProfile);
router.put('/profile', updateProfile);

// Documents
router.get('/documents', getStudentDocuments);
router.get('/documents/:id/download', studentDownloadDocument);

module.exports = router;
