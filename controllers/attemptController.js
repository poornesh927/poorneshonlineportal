const Attempt = require('../models/Attempt');
const Exam = require('../models/Exam');
const { generateExamToken, verifyExamToken } = require('../utils/jwt');

// Shuffle array utility
const shuffleArray = (arr) => {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

// @desc Start exam attempt
// @route POST /api/attempts/start/:examId
const startAttempt = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId);
    if (!exam || !exam.isPublished || !exam.isActive) {
      return res.status(404).json({ success: false, message: 'Exam not found or not available.' });
    }

    const now = new Date();
    if (now < exam.startTime) {
      return res.status(400).json({ success: false, message: 'Exam has not started yet.' });
    }
    if (now > exam.endTime) {
      return res.status(400).json({ success: false, message: 'Exam has ended.' });
    }

    // Check attempt limit
    const attemptCount = await Attempt.countDocuments({ exam: exam._id, student: req.userId });
    if (attemptCount >= exam.maxAttempts) {
      return res.status(400).json({ success: false, message: 'Maximum attempts reached.' });
    }

    // Check if in-progress attempt exists
    const existingAttempt = await Attempt.findOne({ 
      exam: exam._id, student: req.userId, status: 'in-progress' 
    });
    
    if (existingAttempt) {
      // Resume existing attempt - regenerate token
      const examToken = generateExamToken({ 
        attemptId: existingAttempt._id, 
        userId: req.userId,
        examId: exam._id 
      });
      existingAttempt.examToken = examToken;
      await existingAttempt.save();

      // Get questions in the stored order
      const questionOrder = existingAttempt.questionOrder;
      const questionsMap = {};
      exam.questions.forEach(q => { questionsMap[q._id.toString()] = q; });

      const orderedQuestions = questionOrder
        .map(id => questionsMap[id.toString()])
        .filter(Boolean)
        .map(q => {
          const optOrder = existingAttempt.optionOrder?.get(q._id.toString()) || q.options.map(o => o._id);
          const orderedOptions = optOrder.map(optId => {
            const opt = q.options.find(o => o._id.toString() === optId.toString());
            return opt ? { _id: opt._id, text: opt.text } : null;
          }).filter(Boolean);
          return {
            _id: q._id, text: q.text, type: q.type, marks: q.marks,
            difficulty: q.difficulty, section: q.section, timeLimit: q.timeLimit,
            options: orderedOptions,
          };
        });

      const timeLeft = Math.max(0, Math.floor((existingAttempt.serverEndTime - now) / 1000));
      
      return res.json({
        success: true,
        message: 'Resuming attempt.',
        data: {
          attemptId: existingAttempt._id,
          examToken,
          questions: orderedQuestions,
          savedAnswers: existingAttempt.answers,
          timeLeft,
          serverEndTime: existingAttempt.serverEndTime,
        },
      });
    }

    // Create new attempt
    const serverEndTime = new Date(Math.min(
      now.getTime() + exam.duration * 60 * 1000,
      exam.endTime.getTime()
    ));

    // Shuffle questions
    let questionOrder = exam.questions.map(q => q._id);
    if (exam.shuffleQuestions) {
      questionOrder = shuffleArray(questionOrder);
    }

    // Shuffle options per question
    const optionOrder = new Map();
    exam.questions.forEach(q => {
      let optIds = q.options.map(o => o._id);
      if (exam.shuffleOptions) {
        optIds = shuffleArray(optIds);
      }
      optionOrder.set(q._id.toString(), optIds);
    });

    const examToken = generateExamToken({ 
      userId: req.userId.toString(),
      examId: exam._id.toString(),
      temp: true // will be updated after attempt creation
    });

    const attempt = await Attempt.create({
      exam: exam._id,
      student: req.userId,
      questionOrder,
      optionOrder,
      serverEndTime,
      ipAddress: req.ip,
      deviceInfo: req.headers['user-agent'],
      examToken,
    });

    // Update token with attemptId
    const finalToken = generateExamToken({ 
      attemptId: attempt._id.toString(),
      userId: req.userId.toString(),
      examId: exam._id.toString(),
    });
    attempt.examToken = finalToken;
    await attempt.save();

    // Build ordered questions without correct answers
    const questionsMap = {};
    exam.questions.forEach(q => { questionsMap[q._id.toString()] = q; });

    const orderedQuestions = questionOrder
      .map(id => questionsMap[id.toString()])
      .filter(Boolean)
      .map(q => {
        const optIds = optionOrder.get(q._id.toString()) || q.options.map(o => o._id);
        const orderedOptions = optIds.map(optId => {
          const opt = q.options.find(o => o._id.toString() === optId.toString());
          return opt ? { _id: opt._id, text: opt.text } : null;
        }).filter(Boolean);
        return {
          _id: q._id, text: q.text, type: q.type, marks: q.marks,
          difficulty: q.difficulty, section: q.section, timeLimit: q.timeLimit,
          options: orderedOptions,
        };
      });

    res.status(201).json({
      success: true,
      message: 'Exam started.',
      data: {
        attemptId: attempt._id,
        examToken: finalToken,
        questions: orderedQuestions,
        savedAnswers: [],
        timeLeft: exam.duration * 60,
        serverEndTime,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Save answers (auto-save)
// @route PUT /api/attempts/:id/save
const saveAnswers = async (req, res) => {
  try {
    const { answers, examToken } = req.body;

    // Verify exam token
    let decoded;
    try {
      decoded = verifyExamToken(examToken);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid exam session.' });
    }

    const attempt = await Attempt.findOne({ 
      _id: req.params.id, 
      student: req.userId,
      status: 'in-progress'
    }).select('+examToken');

    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Attempt not found or already submitted.' });
    }

    if (decoded.attemptId !== attempt._id.toString()) {
      return res.status(401).json({ success: false, message: 'Invalid exam session.' });
    }

    // Check time
    if (new Date() > attempt.serverEndTime) {
      return await autoSubmit(attempt, res);
    }

    // Update answers
    if (answers && Array.isArray(answers)) {
      attempt.answers = answers.map(a => ({
        questionId: a.questionId,
        selectedOptions: a.selectedOptions || [],
        timeSpent: a.timeSpent || 0,
        answeredAt: a.answeredAt ? new Date(a.answeredAt) : new Date(),
      }));
    }

    const timeLeft = Math.max(0, Math.floor((attempt.serverEndTime - new Date()) / 1000));
    attempt.timeLeft = timeLeft;
    await attempt.save();

    res.json({ 
      success: true, 
      message: 'Answers saved.', 
      data: { timeLeft, serverEndTime: attempt.serverEndTime }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Submit exam
// @route POST /api/attempts/:id/submit
const submitAttempt = async (req, res) => {
  try {
    const { answers, examToken, tabSwitchCount, fullscreenExitCount } = req.body;

    let decoded;
    try {
      decoded = verifyExamToken(examToken);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid exam session.' });
    }

    const attempt = await Attempt.findOne({ 
      _id: req.params.id, 
      student: req.userId 
    }).select('+examToken');

    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Attempt not found.' });
    }

    if (attempt.status !== 'in-progress') {
      return res.status(400).json({ success: false, message: 'Attempt already submitted.' });
    }

    if (decoded.attemptId !== attempt._id.toString()) {
      return res.status(401).json({ success: false, message: 'Invalid exam session.' });
    }

    // Update answers if provided
    if (answers && Array.isArray(answers)) {
      attempt.answers = answers.map(a => ({
        questionId: a.questionId,
        selectedOptions: a.selectedOptions || [],
        timeSpent: a.timeSpent || 0,
        answeredAt: a.answeredAt ? new Date(a.answeredAt) : new Date(),
      }));
    }

    // Anti-cheat flags
    attempt.tabSwitchCount = tabSwitchCount || 0;
    attempt.fullscreenExitCount = fullscreenExitCount || 0;
    if (attempt.tabSwitchCount > 5 || attempt.fullscreenExitCount > 3) {
      attempt.flagged = true;
      attempt.flagReason = `Tab switches: ${attempt.tabSwitchCount}, Fullscreen exits: ${attempt.fullscreenExitCount}`;
    }

    await gradeAttempt(attempt);
    
    const exam = await Exam.findById(attempt.exam);
    
    res.json({
      success: true,
      message: 'Exam submitted successfully.',
      data: { 
        attemptId: attempt._id,
        showResult: exam.showResultImmediately,
        result: exam.showResultImmediately ? {
          marksObtained: attempt.marksObtained,
          totalMarks: attempt.totalMarks,
          percentage: attempt.percentage,
          isPassed: attempt.isPassed,
          correctCount: attempt.correctCount,
          incorrectCount: attempt.incorrectCount,
          skippedCount: attempt.skippedCount,
        } : null
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Grade attempt
const gradeAttempt = async (attempt) => {
  const exam = await Exam.findById(attempt.exam);
  let marksObtained = 0;
  let correctCount = 0;
  let incorrectCount = 0;
  let skippedCount = 0;

  const gradedAnswers = attempt.answers.map(answer => {
    const question = exam.questions.id(answer.questionId);
    if (!question) return answer;

    if (!answer.selectedOptions || answer.selectedOptions.length === 0) {
      skippedCount++;
      return { ...answer.toObject(), isCorrect: false, marksObtained: 0 };
    }

    const correctOptionIds = question.options
      .filter(o => o.isCorrect)
      .map(o => o._id.toString());
    
    const selectedIds = answer.selectedOptions.map(id => id.toString());
    
    let isCorrect = false;
    if (question.type === 'single' || question.type === 'truefalse') {
      isCorrect = selectedIds.length === 1 && correctOptionIds.includes(selectedIds[0]);
    } else { // multiple
      isCorrect = selectedIds.length === correctOptionIds.length &&
        selectedIds.every(id => correctOptionIds.includes(id));
    }

    let questionMarks = 0;
    if (isCorrect) {
      questionMarks = question.marks;
      correctCount++;
    } else {
      incorrectCount++;
      if (exam.negativeMarking) {
        questionMarks = -(question.negativeMark || exam.negativeMarkValue || 0);
      }
    }

    marksObtained += questionMarks;
    return { ...answer.toObject(), isCorrect, marksObtained: questionMarks };
  });

  attempt.answers = gradedAnswers;
  attempt.totalMarks = exam.totalMarks;
  attempt.marksObtained = Math.max(0, marksObtained);
  attempt.percentage = exam.totalMarks > 0 ? Math.round((attempt.marksObtained / exam.totalMarks) * 100) : 0;
  attempt.isPassed = attempt.marksObtained >= exam.passingMarks;
  attempt.correctCount = correctCount;
  attempt.incorrectCount = incorrectCount;
  attempt.skippedCount = skippedCount;
  attempt.status = 'submitted';
  attempt.submittedAt = new Date();
  
  await attempt.save();
  await updateRanks(exam._id);
};

// Update ranks for all attempts on an exam
const updateRanks = async (examId) => {
  const attempts = await Attempt.find({ exam: examId, status: { $in: ['submitted', 'auto-submitted'] } })
    .sort({ marksObtained: -1, submittedAt: 1 });
  
  const updates = attempts.map((attempt, index) =>
    Attempt.updateOne({ _id: attempt._id }, { rank: index + 1 })
  );
  await Promise.all(updates);
};

// Auto submit when time expires
const autoSubmit = async (attempt, res) => {
  await gradeAttempt(attempt);
  attempt.status = 'auto-submitted';
  await attempt.save();
  
  return res.json({
    success: true,
    message: 'Time expired. Exam auto-submitted.',
    data: { attemptId: attempt._id, autoSubmitted: true }
  });
};

// @desc Get attempt result
// @route GET /api/attempts/:id/result
const getResult = async (req, res) => {
  try {
    const attempt = await Attempt.findOne({ _id: req.params.id, student: req.userId })
      .populate('exam', 'title questions totalMarks passingMarks showResultImmediately negativeMarking sections category');

    if (!attempt) {
      return res.status(404).json({ success: false, message: 'Attempt not found.' });
    }

    if (attempt.status === 'in-progress') {
      return res.status(400).json({ success: false, message: 'Exam not yet submitted.' });
    }

    // Always build detailed result with correct answers visible to student
    const detailedAnswers = attempt.answers.map(answer => {
      const question = attempt.exam.questions.id(answer.questionId);
      if (!question) return null;
      return {
        questionId: answer.questionId,
        questionText: question.text,
        type: question.type,
        options: question.options, // includes isCorrect so student sees correct answers
        selectedOptions: answer.selectedOptions,
        isCorrect: answer.isCorrect,
        marksObtained: answer.marksObtained,
        totalMarks: question.marks,
        explanation: question.explanation,
        difficulty: question.difficulty,
        section: question.section,
        timeSpent: answer.timeSpent,
      };
    }).filter(Boolean);

    res.json({
      success: true,
      data: {
        attempt: {
          _id: attempt._id,
          exam: { title: attempt.exam.title, category: attempt.exam.category },
          marksObtained: attempt.marksObtained,
          totalMarks: attempt.totalMarks,
          percentage: attempt.percentage,
          isPassed: attempt.isPassed,
          correctCount: attempt.correctCount,
          incorrectCount: attempt.incorrectCount,
          skippedCount: attempt.skippedCount,
          rank: attempt.rank,
          startedAt: attempt.startedAt,
          submittedAt: attempt.submittedAt,
          status: attempt.status,
          tabSwitchCount: attempt.tabSwitchCount,
          flagged: attempt.flagged,
          showResultImmediately: attempt.exam.showResultImmediately,
          answers: detailedAnswers,
        }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Get user's attempt history
// @route GET /api/attempts/history
const getHistory = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const skip = (page - 1) * limit;

    const total = await Attempt.countDocuments({ student: req.userId });
    const attempts = await Attempt.find({ student: req.userId })
      .populate('exam', 'title category duration totalMarks')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({
      success: true,
      data: { 
        attempts,
        pagination: { page, limit, total, pages: Math.ceil(total / limit) }
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc Report anti-cheat event
// @route POST /api/attempts/:id/report
const reportEvent = async (req, res) => {
  try {
    const { type } = req.body; // 'tabswitch', 'fullscreen'
    const attempt = await Attempt.findOne({ _id: req.params.id, student: req.userId });
    if (!attempt || attempt.status !== 'in-progress') {
      return res.status(404).json({ success: false, message: 'Attempt not found.' });
    }
    if (type === 'tabswitch') attempt.tabSwitchCount += 1;
    if (type === 'fullscreen') attempt.fullscreenExitCount += 1;
    await attempt.save();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { startAttempt, saveAnswers, submitAttempt, getResult, getHistory, reportEvent };
