import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertTriangle, Lock, LogOut, ArrowLeft, ShieldAlert } from 'lucide-react';
import { soundFx } from '../utils/audio';

export type ActiveTestType = 'cbt' | 'host_join';

interface ExamGuardContextType {
  isTestActive: boolean;
  testType: ActiveTestType | null;
  testTitle: string;
  setTestActive: (
    active: boolean, 
    type?: ActiveTestType, 
    title?: string, 
    onLeaveCallback?: () => void
  ) => void;
  requestNavigation: (action: () => void, targetName?: string) => boolean;
  confirmLeave: () => void;
  cancelLeave: () => void;
}

const ExamGuardContext = createContext<ExamGuardContextType | undefined>(undefined);

export const ExamGuardProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isTestActive, setIsTestActiveState] = useState<boolean>(false);
  const [testType, setTestType] = useState<ActiveTestType | null>(null);
  const [testTitle, setTestTitle] = useState<string>('');
  const [onLeaveHandler, setOnLeaveHandler] = useState<(() => void) | null>(null);

  // Modal State
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const [targetMenuName, setTargetMenuName] = useState<string>('');

  const setTestActive = useCallback((
    active: boolean,
    type: ActiveTestType = 'cbt',
    title: string = 'NIELIT Examination',
    onLeaveCallback?: () => void
  ) => {
    setIsTestActiveState(active);
    if (active) {
      setTestType(type);
      setTestTitle(title);
      setOnLeaveHandler(onLeaveCallback ? () => onLeaveCallback : null);
    } else {
      setTestType(null);
      setTestTitle('');
      setOnLeaveHandler(null);
      setIsConfirmModalOpen(false);
      setPendingAction(null);
    }
  }, []);

  // Intercept navigation if test is active
  const requestNavigation = useCallback((action: () => void, targetName: string = 'Menu'): boolean => {
    if (isTestActive) {
      soundFx.playWarning();
      setPendingAction(() => action);
      setTargetMenuName(targetName);
      setIsConfirmModalOpen(true);
      return false; // Navigation blocked
    }
    // No test active, allow navigation directly
    action();
    return true;
  }, [isTestActive]);

  const confirmLeave = useCallback(() => {
    soundFx.playClick(440, 0.06);
    const actionToRun = pendingAction;
    const leaveCallback = onLeaveHandler;

    // Reset test state
    setIsTestActiveState(false);
    setTestType(null);
    setTestTitle('');
    setOnLeaveHandler(null);
    setIsConfirmModalOpen(false);
    setPendingAction(null);

    // Run test cleanup if registered
    if (leaveCallback) {
      try {
        leaveCallback();
      } catch (e) {
        console.error('Error during test leave callback:', e);
      }
    }

    // Run requested menu navigation
    if (actionToRun) {
      actionToRun();
    }
  }, [pendingAction, onLeaveHandler]);

  const cancelLeave = useCallback(() => {
    soundFx.playClick(600, 0.03);
    setIsConfirmModalOpen(false);
    setPendingAction(null);
  }, []);

  // Native browser beforeunload warning during active test
  useEffect(() => {
    if (!isTestActive) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = 'An examination is currently in progress. If you leave, your test session and answers will be lost.';
      return e.returnValue;
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isTestActive]);

  return (
    <ExamGuardContext.Provider
      value={{
        isTestActive,
        testType,
        testTitle,
        setTestActive,
        requestNavigation,
        confirmLeave,
        cancelLeave
      }}
    >
      {children}

      {/* Global Leave Test Confirmation Notification Modal */}
      <AnimatePresence>
        {isConfirmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 15 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 15 }}
              transition={{ type: "spring", stiffness: 400, damping: 28 }}
              className="bg-slate-900 border-2 border-amber-500/70 rounded-3xl max-w-md w-full p-6 sm:p-7 shadow-2xl shadow-amber-950/50 text-white relative overflow-hidden ring-4 ring-amber-500/20"
              role="alertdialog"
              aria-labelledby="leave-test-title"
              aria-describedby="leave-test-desc"
            >
              {/* Ambient Glow */}
              <div className="absolute top-0 right-0 w-48 h-48 bg-amber-500/15 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute -bottom-10 -left-10 w-48 h-48 bg-rose-500/10 rounded-full blur-3xl pointer-events-none" />

              {/* Warning Header */}
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 text-amber-400 flex items-center justify-center shrink-0 shadow-lg shadow-amber-500/20">
                  <ShieldAlert className="w-6 h-6 animate-pulse" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40">
                      Menu Access Restricted
                    </span>
                  </div>
                  <h3 id="leave-test-title" className="text-xl font-display font-black text-white tracking-tight">
                    Do you wish to leave the test?
                  </h3>
                </div>
              </div>

              {/* Description & Impact Notice */}
              <div className="mt-4 p-4 rounded-2xl bg-slate-950/80 border border-slate-800 space-y-2.5 text-xs text-slate-300 leading-relaxed">
                <p id="leave-test-desc">
                  An examination is currently in progress{testTitle ? ` (${testTitle})` : ''}. Menu access has been restricted to prevent accidental exam interruptions.
                </p>
                <div className="p-2.5 rounded-xl bg-rose-950/40 border border-rose-500/30 text-rose-200 text-[11px] font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                  <span>
                    If you leave now, your ongoing test answers and time remaining will not be saved.
                  </span>
                </div>
                {targetMenuName && (
                  <p className="text-[11px] text-slate-400">
                    Requested destination: <strong className="text-cyan-300 font-semibold">{targetMenuName}</strong>
                  </p>
                )}
              </div>

              {/* Action Buttons: Yes and No */}
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  id="exam-guard-btn-no"
                  onClick={cancelLeave}
                  className="min-h-[46px] py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 active:bg-slate-600 border border-slate-700 text-white font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 shadow-sm"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>No</span>
                </button>

                <button
                  type="button"
                  id="exam-guard-btn-yes"
                  onClick={confirmLeave}
                  className="min-h-[46px] py-2.5 px-4 rounded-xl bg-gradient-to-r from-rose-600 via-red-600 to-rose-700 hover:from-rose-500 hover:to-red-600 active:from-red-700 text-white font-bold text-sm transition-all cursor-pointer flex items-center justify-center gap-2 shadow-lg shadow-rose-950/60 border border-rose-400/40"
                >
                  <LogOut className="w-4 h-4" />
                  <span>Yes</span>
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </ExamGuardContext.Provider>
  );
};

export const useExamGuard = () => {
  const context = useContext(ExamGuardContext);
  if (!context) {
    throw new Error('useExamGuard must be used within an ExamGuardProvider');
  }
  return context;
};
