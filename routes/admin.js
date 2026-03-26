const express = require('express');
const router = express.Router();
const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const { protect, adminOnly } = require('../middleware/auth');
const {
  getDashboard, createExam, getAdminExams, getAdminExam, updateExam, deleteExam,
  importQuestions, getStudents, banStudent, unbanStudent, resetAttempts,
  exportExcel, exportPDF, getExamAnalytics,
} = require('../controllers/adminController');
const {
  uploadDocument, getAdminDocuments, updateDocument, deleteDocument, adminDownloadDocument,
} = require('../controllers/documentController');

router.use(protect, adminOnly);

router.get('/dashboard', getDashboard);

// Exam management
router.get('/exams', getAdminExams);
router.post('/exams', createExam);
router.get('/exams/:id', getAdminExam);
router.put('/exams/:id', updateExam);
router.delete('/exams/:id', deleteExam);
router.post('/exams/:id/import-questions', upload.single('file'), importQuestions);
router.get('/exams/:id/analytics', getExamAnalytics);
router.get('/exams/:id/export/excel', exportExcel);
router.get('/exams/:id/export/pdf', exportPDF);

// Student management
router.get('/students', getStudents);
router.put('/students/:id/ban', banStudent);
router.put('/students/:id/unban', unbanStudent);
router.delete('/students/:studentId/attempts/:examId', resetAttempts);

// Document management
router.get('/documents', getAdminDocuments);
router.post('/documents', upload.single('file'), uploadDocument);
router.put('/documents/:id', updateDocument);
router.delete('/documents/:id', deleteDocument);
router.get('/documents/:id/download', adminDownloadDocument);

module.exports = router;
