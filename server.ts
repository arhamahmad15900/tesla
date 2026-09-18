import express from "express";
import path from "path";
import { liveTestStore } from "./server/liveTestManager.js";
import {
  generateQuestionsFromPdfNotes,
  generateCurriculumQuestions,
  getAIClient
} from "./server/aiModel.js";

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: "30mb" }));
  app.use(express.urlencoded({ limit: "30mb", extended: true }));

  // Health check
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Next-Gen Gemini 3 AI Model Endpoint:
  // Synthesizes questions SOLELY and SPECIFICALLY from user-uploaded PDF study notes
  app.post("/api/generate-pdf-reasoning-questions", async (req, res) => {
    const { pdfBase64, count = 50, timestamp = Date.now(), seed = Math.random().toString() } = req.body;
    const requestedTotal = Math.min(Math.max(Number(count) || 10, 5), 100);

    // Require valid uploaded PDF
    if (!pdfBase64 || typeof pdfBase64 !== "string" || pdfBase64.trim().length < 50) {
      return res.status(400).json({
        success: false,
        error: "Please upload your PDF study notes. Questions on this website must be generated solely from user-uploaded PDF notes and not from any other source."
      });
    }

    try {
      const result = await generateQuestionsFromPdfNotes(
        pdfBase64,
        requestedTotal,
        `SESSION_${timestamp}_VARIATION_${seed}`
      );

      return res.json({
        success: true,
        questions: result.questions,
        solelyFromPdf: true,
        modelUsed: result.modelUsed
      });
    } catch (error: any) {
      console.error("Critical error generating questions from PDF notes:", error);
      return res.status(500).json({
        success: false,
        error: error?.message || "Failed to process the uploaded PDF notes."
      });
    }
  });

  // AI-powered NIELIT O-Level question generation endpoint
  app.post("/api/generate-ai-questions", async (req, res) => {
    try {
      const { moduleCode, moduleTitle, chapterName, count = 5, topic } = req.body;
      const questions = await generateCurriculumQuestions({
        moduleCode,
        moduleTitle,
        chapterName,
        count: Number(count) || 5,
        topic
      });

      return res.json({ success: true, questions });
    } catch (error: any) {
      console.error("Error generating AI curriculum questions:", error);
      return res.json({
        success: true,
        questions: []
      });
    }
  });

  // ==========================================
  // HOST & JOIN LIVE TEST SESSION ENDPOINTS
  // ==========================================

  // 1. Host creates a live test server
  app.post("/api/live-tests/create", (req, res) => {
    try {
      const {
        hostName,
        title,
        subOptionTitle,
        mode,
        durationMinutes,
        questionCount,
        config,
        questions,
        passcode,
        allowLateJoiners,
        showImmediateResults,
        negativeMarking
      } = req.body;

      let validQuestions = questions;
      if (!validQuestions || !Array.isArray(validQuestions) || validQuestions.length === 0) {
        if (mode === "pdf_notes") {
          return res.status(400).json({
            success: false,
            error: "Questions must be synthesized from uploaded PDF notes. No questions from external sources are allowed."
          });
        }
        return res.status(400).json({
          success: false,
          error: "Questions are required to create a live test session."
        });
      }

      const { session, hostToken } = liveTestStore.createSession({
        hostName: hostName || "Examiner",
        title: title || "NIELIT O Level Live Examination",
        subOptionTitle,
        mode: mode === "pdf_notes" ? "pdf_notes" : "exam_generator",
        durationMinutes: Number(durationMinutes) || 90,
        questionCount: validQuestions.length,
        config: config || {},
        passcode,
        allowLateJoiners,
        showImmediateResults,
        negativeMarking,
        questions: validQuestions
      });

      return res.json({
        success: true,
        testId: session.testId,
        hostToken,
        session: {
          testId: session.testId,
          title: session.title,
          subOptionTitle: session.subOptionTitle,
          mode: session.mode,
          status: session.status,
          durationMinutes: session.durationMinutes,
          questionCount: session.questionCount,
          hostName: session.hostName,
          createdAt: session.createdAt,
          passcode: session.passcode,
          allowLateJoiners: session.allowLateJoiners,
          showImmediateResults: session.showImmediateResults,
          negativeMarking: session.negativeMarking,
          students: session.students
        }
      });
    } catch (err: any) {
      console.error("Failed to create live test session:", err);
      return res.status(500).json({ error: err.message || "Could not create live test server." });
    }
  });

  // 2. Student joins a live test session
  app.post("/api/live-tests/:testId/join", (req, res) => {
    try {
      const { testId } = req.params;
      const { studentName, rollNumber, passcode } = req.body;

      if (!studentName || !studentName.trim()) {
        return res.status(400).json({ error: "Please enter your full name." });
      }
      if (!rollNumber || !rollNumber.trim()) {
        return res.status(400).json({ error: "Please enter your roll number." });
      }

      const result = liveTestStore.joinStudent(testId, studentName, rollNumber, passcode);
      if ("error" in result) {
        return res.status(404).json({ error: result.error });
      }

      return res.json({
        success: true,
        student: result.student,
        session: {
          testId: result.session.testId,
          title: result.session.title,
          subOptionTitle: result.session.subOptionTitle,
          mode: result.session.mode,
          status: result.session.status,
          startedAt: result.session.startedAt,
          durationMinutes: result.session.durationMinutes,
          questionCount: result.session.questionCount,
          hostName: result.session.hostName,
          broadcastMessage: result.session.broadcastMessage,
          broadcastTime: result.session.broadcastTime,
          showImmediateResults: result.session.showImmediateResults,
          negativeMarking: result.session.negativeMarking,
          // Only send questions if test has started
          questions: result.session.status === "in_progress" ? result.session.questions : []
        }
      });
    } catch (err: any) {
      console.error("Error joining live test:", err);
      return res.status(500).json({ error: err.message || "Could not join test session." });
    }
  });

  // 3. Poll session status & student roster
  app.get("/api/live-tests/:testId/session", (req, res) => {
    try {
      const { testId } = req.params;
      const { hostToken, studentId } = req.query;

      const session = liveTestStore.getSession(testId);
      if (!session) {
        return res.status(404).json({ error: "Session not found." });
      }

      const isHost = hostToken && session.hostToken === hostToken;

      if (isHost) {
        return res.json({
          success: true,
          isHost: true,
          session: {
            testId: session.testId,
            title: session.title,
            subOptionTitle: session.subOptionTitle,
            mode: session.mode,
            status: session.status,
            createdAt: session.createdAt,
            startedAt: session.startedAt,
            durationMinutes: session.durationMinutes,
            questionCount: session.questionCount,
            hostName: session.hostName,
            passcode: session.passcode,
            allowLateJoiners: session.allowLateJoiners,
            showImmediateResults: session.showImmediateResults,
            negativeMarking: session.negativeMarking,
            broadcastMessage: session.broadcastMessage,
            broadcastTime: session.broadcastTime,
            proctoringAlerts: session.proctoringAlerts || [],
            students: Object.values(session.students),
            questionsCount: session.questions.length,
            questions: session.questions
          }
        });
      }

      // Safe view for students
      const student = studentId ? session.students[String(studentId)] : null;
      const studentSummaryList = Object.values(session.students).map(s => ({
        id: s.id,
        studentName: s.studentName,
        rollNumber: s.rollNumber,
        status: s.status,
        joinedAt: s.joinedAt
      }));

      return res.json({
        success: true,
        isHost: false,
        session: {
          testId: session.testId,
          title: session.title,
          subOptionTitle: session.subOptionTitle,
          mode: session.mode,
          status: session.status,
          startedAt: session.startedAt,
          durationMinutes: session.durationMinutes,
          questionCount: session.questionCount,
          hostName: session.hostName,
          broadcastMessage: session.broadcastMessage,
          broadcastTime: session.broadcastTime,
          showImmediateResults: session.showImmediateResults,
          negativeMarking: session.negativeMarking,
          students: studentSummaryList,
          myStudentStatus: student ? student.status : null,
          // Only send actual questions once the test has been officially started by the host!
          questions: session.status === "in_progress" || session.status === "ended" ? session.questions : []
        }
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to fetch session." });
    }
  });

  // 4. Host starts the test (students automatically begin)
  app.post("/api/live-tests/:testId/start", (req, res) => {
    try {
      const { testId } = req.params;
      const { hostToken } = req.body;

      const result = liveTestStore.startTest(testId, hostToken);
      if (!result.success) {
        return res.status(403).json({ error: result.error || "Cannot start test." });
      }

      return res.json({
        success: true,
        status: "in_progress",
        startedAt: result.session?.startedAt
      });
    } catch (err: any) {
      return res.status(500).json({ error: err.message || "Failed to start test." });
    }
  });

  // 5. Student sends live answering progress
  app.post("/api/live-tests/:testId/progress", (req, res) => {
    try {
      const { testId } = req.params;
      const { studentId, answersCount, userAnswers, tabSwitchesCount } = req.body;

      const ok = liveTestStore.updateStudentProgress(
        testId,
        studentId,
        Number(answersCount) || 0,
        userAnswers,
        typeof tabSwitchesCount === "number" ? tabSwitchesCount : undefined
      );
      return res.json({ success: ok });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 6. Student submits their test
  app.post("/api/live-tests/:testId/submit", (req, res) => {
    try {
      const { testId } = req.params;
      const { studentId, score, maxScore, percentage, userAnswers } = req.body;

      const ok = liveTestStore.submitStudentTest(
        testId,
        studentId,
        Number(score) || 0,
        Number(maxScore) || 100,
        Number(percentage) || 0,
        userAnswers || {}
      );
      return res.json({ success: ok });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 6b. Student logs proctoring infraction / event (tab switch, window blur, browser close, auto-submit)
  app.post("/api/live-tests/:testId/proctor-event", (req, res) => {
    try {
      const { testId } = req.params;
      const {
        studentId,
        eventType,
        tabSwitchesCount,
        isAutoSubmitted,
        score,
        maxScore,
        percentage,
        userAnswers
      } = req.body;

      const result = liveTestStore.recordProctoringEvent(
        testId,
        studentId,
        eventType,
        {
          tabSwitchesCount: typeof tabSwitchesCount === 'number' ? tabSwitchesCount : undefined,
          isAutoSubmitted: Boolean(isAutoSubmitted),
          score: typeof score === 'number' ? score : undefined,
          maxScore: typeof maxScore === 'number' ? maxScore : undefined,
          percentage: typeof percentage === 'number' ? percentage : undefined,
          userAnswers
        }
      );
      return res.json(result);
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 7. Host ends test for everyone
  app.post("/api/live-tests/:testId/end", (req, res) => {
    try {
      const { testId } = req.params;
      const { hostToken } = req.body;

      const result = liveTestStore.endTest(testId, hostToken);
      if (!result.success) {
        return res.status(403).json({ error: result.error || "Cannot end test." });
      }
      return res.json({ success: true, status: "ended" });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 8. Host kicks/removes a student
  app.post("/api/live-tests/:testId/kick", (req, res) => {
    try {
      const { testId } = req.params;
      const { hostToken, studentId } = req.body;

      const ok = liveTestStore.kickStudent(testId, hostToken, studentId);
      return res.json({ success: ok });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 9. Host broadcasts message to all students
  app.post("/api/live-tests/:testId/broadcast", (req, res) => {
    try {
      const { testId } = req.params;
      const { hostToken, message } = req.body;

      const ok = liveTestStore.setBroadcastMessage(testId, hostToken, String(message || ""));
      return res.json({ success: ok });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 10. Host updates session settings (e.g. toggle immediate candidate results, late joining)
  app.post("/api/live-tests/:testId/settings", (req, res) => {
    try {
      const { testId } = req.params;
      const { hostToken, showImmediateResults, allowLateJoiners } = req.body;

      const ok = liveTestStore.updateSessionSettings(testId, hostToken, {
        showImmediateResults: typeof showImmediateResults === "boolean" ? showImmediateResults : undefined,
        allowLateJoiners: typeof allowLateJoiners === "boolean" ? allowLateJoiners : undefined
      });
      return res.json({ success: ok });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // 10. Host deletes/closes a session
  app.delete("/api/live-tests/:testId", (req, res) => {
    try {
      const { testId } = req.params;
      const { hostToken } = req.body;

      const ok = liveTestStore.deleteSession(testId, hostToken);
      return res.json({ success: ok });
    } catch (err: any) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
