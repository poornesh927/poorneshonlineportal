// const Document = require('../models/Document');
// const User = require('../models/User');

// // @desc Upload document (admin)
// // @route POST /api/admin/documents
// const uploadDocument = async (req, res) => {
//   try {
//     if (!req.file) {
//       return res.status(400).json({ success: false, message: 'No file uploaded.' });
//     }

//     const { title, description, assignedTo, isAllStudents } = req.body;

//     if (!title || !title.trim()) {
//       return res.status(400).json({ success: false, message: 'Title is required.' });
//     }

//     // Parse assigned students
//     let assignedStudents = [];
//     let allStudents = true;

//     if (isAllStudents === 'false' || isAllStudents === false) {
//       allStudents = false;
//       if (assignedTo) {
//         try {
//           assignedStudents = JSON.parse(assignedTo);
//         } catch {
//           assignedStudents = Array.isArray(assignedTo) ? assignedTo : [assignedTo];
//         }
//       }
//     }

//     const doc = await Document.create({
//       title: title.trim(),
//       description: description || '',
//       fileName: `${Date.now()}-${req.file.originalname}`,
//       originalName: req.file.originalname,
//       mimeType: req.file.mimetype,
//       size: req.file.size,
//       data: req.file.buffer,
//       uploadedBy: req.userId,
//       assignedTo: assignedStudents,
//       isAllStudents: allStudents,
//     });

//     res.status(201).json({
//       success: true,
//       message: 'Document uploaded successfully.',
//       data: {
//         _id: doc._id,
//         title: doc.title,
//         description: doc.description,
//         originalName: doc.originalName,
//         mimeType: doc.mimeType,
//         size: doc.size,
//         isAllStudents: doc.isAllStudents,
//         assignedTo: doc.assignedTo,
//         createdAt: doc.createdAt,
//       },
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

// // @desc Get all documents (admin)
// // @route GET /api/admin/documents
// const getAdminDocuments = async (req, res) => {
//   try {
//     const page = parseInt(req.query.page) || 1;
//     const limit = parseInt(req.query.limit) || 20;
//     const skip = (page - 1) * limit;

//     const total = await Document.countDocuments({ isActive: true });
//     const docs = await Document.find({ isActive: true })
//       .select('-data') // don't send file data in list
//       .populate('uploadedBy', 'name email')
//       .populate('assignedTo', 'name email')
//       .sort({ createdAt: -1 })
//       .skip(skip)
//       .limit(limit);

//     res.json({
//       success: true,
//       data: {
//         documents: docs,
//         pagination: { page, limit, total, pages: Math.ceil(total / limit) },
//       },
//     });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

// // @desc Update document assignment (admin)
// // @route PUT /api/admin/documents/:id
// const updateDocument = async (req, res) => {
//   try {
//     const { title, description, assignedTo, isAllStudents } = req.body;
//     const doc = await Document.findById(req.params.id);

//     if (!doc || !doc.isActive) {
//       return res.status(404).json({ success: false, message: 'Document not found.' });
//     }

//     if (title) doc.title = title.trim();
//     if (description !== undefined) doc.description = description;
//     if (isAllStudents !== undefined) {
//       doc.isAllStudents = isAllStudents === true || isAllStudents === 'true';
//     }
//     if (assignedTo !== undefined) {
//       try {
//         doc.assignedTo = JSON.parse(assignedTo);
//       } catch {
//         doc.assignedTo = Array.isArray(assignedTo) ? assignedTo : [assignedTo];
//       }
//     }

//     await doc.save();

//     const updated = await Document.findById(doc._id)
//       .select('-data')
//       .populate('assignedTo', 'name email');

//     res.json({ success: true, message: 'Document updated.', data: updated });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

// // @desc Delete document (admin)
// // @route DELETE /api/admin/documents/:id
// const deleteDocument = async (req, res) => {
//   try {
//     const doc = await Document.findById(req.params.id);
//     if (!doc) return res.status(404).json({ success: false, message: 'Document not found.' });
//     doc.isActive = false;
//     await doc.save();
//     res.json({ success: true, message: 'Document deleted.' });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

// // @desc Download/view a document (admin)
// // @route GET /api/admin/documents/:id/download
// const adminDownloadDocument = async (req, res) => {
//   try {
//     const doc = await Document.findById(req.params.id);
//     if (!doc || !doc.isActive) {
//       return res.status(404).json({ success: false, message: 'Document not found.' });
//     }
//     res.set('Content-Type', doc.mimeType);
//     res.set('Content-Disposition', `inline; filename="${doc.originalName}"`);
//     res.send(doc.data);
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

// // ============ STUDENT ROUTES ============

// // @desc Get documents visible to this student
// // @route GET /api/student/documents
// const getStudentDocuments = async (req, res) => {
//   try {
//     const studentId = req.userId;
//     const docs = await Document.find({
//       isActive: true,
//       $or: [
//         { isAllStudents: true },
//         { assignedTo: studentId },
//       ],
//     })
//       .select('-data')
//       .sort({ createdAt: -1 });

//     res.json({ success: true, data: { documents: docs } });
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

// // @desc Download/view a document (student)
// // @route GET /api/student/documents/:id/download
// const studentDownloadDocument = async (req, res) => {
//   try {
//     const studentId = req.userId;
//     const doc = await Document.findOne({
//       _id: req.params.id,
//       isActive: true,
//       $or: [
//         { isAllStudents: true },
//         { assignedTo: studentId },
//       ],
//     });

//     if (!doc) {
//       return res.status(404).json({ success: false, message: 'Document not found or not accessible.' });
//     }

//     res.set('Content-Type', doc.mimeType);
//     res.set('Content-Disposition', `inline; filename="${doc.originalName}"`);
//     res.send(doc.data);
//   } catch (error) {
//     res.status(500).json({ success: false, message: error.message });
//   }
// };

// module.exports = {
//   uploadDocument,
//   getAdminDocuments,
//   updateDocument,
//   deleteDocument,
//   adminDownloadDocument,
//   getStudentDocuments,
//   studentDownloadDocument,
// };



const Document = require('../models/Document');
const User = require('../models/User');

// @desc Upload document (admin)
// @route POST /api/admin/documents
const uploadDocument = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded.' });
    }

    const { title, description, assignedTo, isAllStudents, allowDownload } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: 'Title is required.' });
    }

    // Parse assigned students
    let assignedStudents = [];
    let allStudents = true;

    if (isAllStudents === 'false' || isAllStudents === false) {
      allStudents = false;
      if (assignedTo) {
        try {
          assignedStudents = JSON.parse(assignedTo);
        } catch {
          assignedStudents = Array.isArray(assignedTo) ? assignedTo : [assignedTo];
        }
      }
    }

    const doc = await Document.create({
      title: title.trim(),
      description: description || '',
      fileName: `${Date.now()}-${req.file.originalname}`,
      originalName: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      data: req.file.buffer,
      uploadedBy: req.userId,
      assignedTo: assignedStudents,
      isAllStudents: allStudents,
      allowDownload: allowDownload === 'false' || allowDownload === false ? false : true,
    });

    res.status(201).json({
      success: true,
      message: 'Document uploaded successfully.',
      data: {
        _id: doc._id,
        title: doc.title,
        description: doc.description,
        originalName: doc.originalName,
        mimeType: doc.mimeType,
        size: doc.size,
        isAllStudents: doc.isAllStudents,
        allowDownload: doc.allowDownload,
        assignedTo: doc.assignedTo,
        createdAt: doc.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Get all documents (admin)
// @route GET /api/admin/documents
const getAdminDocuments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const total = await Document.countDocuments({ isActive: true });
    const docs = await Document.find({ isActive: true })
      .select('-data') // don't send file data in list
      .populate('uploadedBy', 'name email')
      .populate('assignedTo', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      data: {
        documents: docs,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Update document assignment (admin)
// @route PUT /api/admin/documents/:id
const updateDocument = async (req, res) => {
  try {
    const { title, description, assignedTo, isAllStudents, allowDownload } = req.body;
    const doc = await Document.findById(req.params.id);

    if (!doc || !doc.isActive) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }

    if (title) doc.title = title.trim();
    if (description !== undefined) doc.description = description;
    if (isAllStudents !== undefined) {
      doc.isAllStudents = isAllStudents === true || isAllStudents === 'true';
    }
    if (allowDownload !== undefined) {
      doc.allowDownload = allowDownload === true || allowDownload === 'true';
    }
    if (assignedTo !== undefined) {
      try {
        doc.assignedTo = JSON.parse(assignedTo);
      } catch {
        doc.assignedTo = Array.isArray(assignedTo) ? assignedTo : [assignedTo];
      }
    }

    await doc.save();

    const updated = await Document.findById(doc._id)
      .select('-data')
      .populate('assignedTo', 'name email');

    res.json({ success: true, message: 'Document updated.', data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Delete document (admin)
// @route DELETE /api/admin/documents/:id
const deleteDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc) return res.status(404).json({ success: false, message: 'Document not found.' });
    doc.isActive = false;
    await doc.save();
    res.json({ success: true, message: 'Document deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Download/view a document (admin)
// @route GET /api/admin/documents/:id/download
const adminDownloadDocument = async (req, res) => {
  try {
    const doc = await Document.findById(req.params.id);
    if (!doc || !doc.isActive) {
      return res.status(404).json({ success: false, message: 'Document not found.' });
    }
    res.set('Content-Type', doc.mimeType);
    res.set('Content-Disposition', `inline; filename="${doc.originalName}"`);
    res.send(doc.data);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ============ STUDENT ROUTES ============

// @desc Get documents visible to this student
// @route GET /api/student/documents
const getStudentDocuments = async (req, res) => {
  try {
    const studentId = req.userId;
    const docs = await Document.find({
      isActive: true,
      $or: [
        { isAllStudents: true },
        { assignedTo: studentId },
      ],
    })
      .select('-data')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: { documents: docs } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Download/view a document (student)
// @route GET /api/student/documents/:id/download
const studentDownloadDocument = async (req, res) => {
  try {
    const studentId = req.userId;
    const doc = await Document.findOne({
      _id: req.params.id,
      isActive: true,
      $or: [
        { isAllStudents: true },
        { assignedTo: studentId },
      ],
    });

    if (!doc) {
      return res.status(404).json({ success: false, message: 'Document not found or not accessible.' });
    }

    // Check if this is a forced download and student is allowed
    const isDownload = req.query.dl === '1';
    if (isDownload && !doc.allowDownload) {
      return res.status(403).json({ success: false, message: 'Download not permitted for this document.' });
    }

    res.set('Content-Type', doc.mimeType);
    res.set('Content-Disposition', `inline; filename="${doc.originalName}"`);
    res.send(doc.data);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  uploadDocument,
  getAdminDocuments,
  updateDocument,
  deleteDocument,
  adminDownloadDocument,
  getStudentDocuments,
  studentDownloadDocument,
};