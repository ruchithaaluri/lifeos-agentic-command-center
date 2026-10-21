'use client';

import { useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Send, Mic, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DEMO_PROMPTS } from '@/lib/demo';
import { useAgentStore } from '@/store/agent';

interface AgentInputProps {
  onSubmit: (goal: string) => void;
  placeholder?: string;
  showPrompts?: boolean;
  className?: string;
}

export function AgentInput({
  onSubmit,
  placeholder = 'Ask LifeOS anything…',
  showPrompts = true,
  className,
}: AgentInputProps) {
  const [value, setValue] = useState('');
  const [isListening, setIsListening] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const isRunning = useAgentStore((s) => s.isRunning);

  function handleSubmit() {
    const trimmed = value.trim();
    if (!trimmed || isRunning) return;
    onSubmit(trimmed);
    setValue('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  function handleInput(e: React.ChangeEvent<HTMLTextAreaElement>) {
    setValue(e.target.value);
    // Auto-resize textarea
    const el = textareaRef.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
    }
  }

  function startVoice() {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) return;

    // Use type assertion — SpeechRecognition is a browser API not in strict lib.dom.d.ts
    type SpeechRecognitionCtor = new () => {
      continuous: boolean;
      interimResults: boolean;
      lang: string;
      onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
      onerror: (() => void) | null;
      onend: (() => void) | null;
      start(): void;
    };
    const w = window as unknown as Record<string, SpeechRecognitionCtor>;
    const SR = w['webkitSpeechRecognition'] ?? w['SpeechRecognition'];
    if (!SR) return;
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.lang = 'en-US';
    recognition.onresult = (event) => {
      const transcript = event.results[0]?.[0]?.transcript ?? '';
      setValue((prev) => (prev + ' ' + transcript).trim());
      setIsListening(false);
    };
    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);
    recognition.start();
    setIsListening(true);
  }

  return (
    <div className={cn('space-y-3', className)}>
      {/* Demo prompts */}
      {showPrompts && (
        <div className="flex flex-wrap gap-2">
          {DEMO_PROMPTS.map((prompt) => (
            <motion.button
              key={prompt}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setValue(prompt)}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-400 transition-colors hover:border-blue-500/30 hover:bg-blue-500/10 hover:text-blue-300"
            >
              {prompt}
            </motion.button>
          ))}
        </div>
      )}

      {/* Input area */}
      <div className="relative flex items-end gap-2">
        <div className="relative flex-1">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-blue-500/10 to-violet-500/10 blur-sm" />
          <div className="bg-navy-800/80 relative flex items-end rounded-xl border border-white/10 backdrop-blur-sm">
            <Sparkles
              className="absolute left-3 top-3 h-4 w-4 shrink-0 text-blue-400"
              aria-hidden
            />
            <textarea
              ref={textareaRef}
              value={value}
              onChange={handleInput}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={1}
              aria-label="Ask LifeOS"
              disabled={isRunning}
              className="w-full resize-none bg-transparent py-3 pl-9 pr-12 text-sm text-slate-100 placeholder-slate-500 outline-none disabled:opacity-50"
              style={{ minHeight: '44px', maxHeight: '160px' }}
            />
            {/* Voice button (progressive enhancement) */}
            <button
              type="button"
              onClick={startVoice}
              aria-label="Voice input"
              className={cn(
                'absolute bottom-2 right-10 rounded-lg p-1.5 text-slate-500 transition-colors hover:text-blue-400',
                isListening && 'animate-pulse text-red-400',
              )}
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Send button */}
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleSubmit}
          disabled={!value.trim() || isRunning}
          aria-label="Send to LifeOS"
          className={cn(
            'flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-all duration-200',
            value.trim() && !isRunning
              ? 'shadow-glow bg-blue-500 text-white hover:bg-blue-400'
              : 'cursor-not-allowed bg-white/5 text-slate-600',
          )}
        >
          <AnimatePresence mode="wait">
            {isRunning ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
                className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white"
              />
            ) : (
              <motion.div
                key="send"
                initial={{ opacity: 0, scale: 0.5 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.5 }}
              >
                <Send className="h-4 w-4" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>
    </div>
  );
}
