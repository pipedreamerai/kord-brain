'use client';

import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';
import type { UIMessage } from 'ai';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useAppStore } from '@/lib/appStore';

type AnyPart = UIMessage['parts'][number];

const SLUG_RE = /^[a-z0-9][a-z0-9_/-]*$/;
const CHAT_BAR_KEY = 'kord:chatBarCollapsed';

export function ChatPanel() {
  const setCitedTags = useAppStore((s) => s.setCitedTags);
  const chatResetEpoch = useAppStore((s) => s.chatResetEpoch);
  const [input, setInput] = useState('');
  const [collapsed, setCollapsed] = useState<boolean>(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef<boolean>(true);

  useEffect(() => {
    try {
      if (window.localStorage.getItem(CHAT_BAR_KEY) === '1') setCollapsed(true);
    } catch {}
  }, []);

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try { window.localStorage.setItem(CHAT_BAR_KEY, next ? '1' : '0'); } catch {}
      return next;
    });
  }

  const transport = useMemo(
    () => new DefaultChatTransport({ api: '/api/chat' }),
    [],
  );

  const { messages, sendMessage, status, error, clearError, setMessages } = useChat({
    transport,
    onFinish: ({ message }) => {
      const cited = extractCitations(message);
      setCitedTags(cited);
    },
    onError: (err) => {
      console.error('chat error', err);
    },
  });

  const busy = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    if (chatResetEpoch === 0) return;
    setMessages([]);
    clearError();
    setInput('');
  }, [chatResetEpoch, setMessages, clearError]);

  useEffect(() => {
    if (collapsed || !stickRef.current) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, status, collapsed]);

  function onScroll(e: React.UIEvent<HTMLDivElement>) {
    const el = e.currentTarget;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickRef.current = distance < 24;
  }

  function submit() {
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    stickRef.current = true;
    void sendMessage({ text });
    taRef.current?.focus();
  }

  function clearChat() {
    setMessages([]);
    setCitedTags(new Set());
    clearError();
  }

  return (
    <section
      className={`${collapsed ? 'h-9' : 'h-72'} shrink-0 border-t border-zinc-800 flex flex-col overflow-hidden transition-[height] duration-200 bg-zinc-950 text-zinc-100`}
    >
      <div className="shrink-0 border-b border-zinc-800 flex items-center gap-2 px-3 py-1.5 min-w-0">
        <button
          onClick={toggleCollapsed}
          aria-label={collapsed ? 'Expand chat panel' : 'Collapse chat panel'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Show chat' : 'Hide chat'}
          className="text-zinc-500 hover:text-zinc-200 p-0.5 shrink-0"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {collapsed ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
          </svg>
        </button>
        <span className="text-[11px] uppercase tracking-wide text-zinc-500 font-mono whitespace-nowrap">
          Ask the brain
        </span>
        {collapsed && messages.length > 0 && (
          <span className="text-[10px] text-zinc-600 font-mono">
            {messages.length} message{messages.length === 1 ? '' : 's'}
          </span>
        )}
        {!collapsed && messages.length > 0 && (
          <button
            onClick={clearChat}
            className="ml-auto text-[10px] text-zinc-500 hover:text-zinc-300 font-mono"
          >
            clear
          </button>
        )}
      </div>

      {!collapsed && (
        <div className="flex-1 min-h-0 flex">
          <div
            ref={scrollRef}
            onScroll={onScroll}
            className="flex-1 overflow-y-auto px-3 py-3 space-y-3 min-h-0 min-w-0"
          >
            {messages.length === 0 && <EmptyHint />}
            {messages.map((m) => (
              <MessageView key={m.id} message={m} />
            ))}
            {error && (
              <div className="text-[11px] text-red-300 bg-red-950/40 border border-red-900/60 rounded p-2 font-mono">
                {error.message}
              </div>
            )}
          </div>

          <div className="shrink-0 w-96 border-l border-zinc-800 p-2 flex flex-col">
            <textarea
              ref={taRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  submit();
                }
              }}
              placeholder={busy ? 'thinking…' : 'Ask anything about the brain…'}
              disabled={busy}
              className="flex-1 min-h-0 w-full resize-none bg-zinc-900 border border-zinc-800 rounded px-2.5 py-2 text-[12px] text-zinc-100 placeholder-zinc-600 focus:outline-none focus:border-blue-700 disabled:opacity-50"
            />
            <div className="mt-1 flex items-center gap-2">
              <span className="text-[10px] text-zinc-600 font-mono">⏎ send · ⇧⏎ newline</span>
              <button
                onClick={submit}
                disabled={busy || input.trim().length === 0}
                className="ml-auto bg-blue-600 hover:bg-blue-500 disabled:bg-zinc-800 disabled:text-zinc-500 text-white text-[11px] font-semibold px-2.5 py-1 rounded"
              >
                {busy ? '…' : 'Send'}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function EmptyHint() {
  return (
    <div className="text-[11px] text-zinc-500 leading-relaxed font-mono space-y-1">
      <div className="text-zinc-400">try asking:</div>
      <div className="text-zinc-600">› What is P-101?</div>
      <div className="text-zinc-600">› Which docs mention CB-101?</div>
      <div className="text-zinc-600">› What is connected to M-101?</div>
    </div>
  );
}

function MessageView({ message }: { message: UIMessage }) {
  if (message.role === 'user') {
    const text = message.parts
      .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
      .map((p) => p.text)
      .join('');
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-blue-900/60 border border-blue-800 rounded-lg px-3 py-2 text-[12px] text-blue-50 whitespace-pre-wrap">
          {text}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {message.parts.map((part, i) => (
        <PartView key={i} part={part} />
      ))}
    </div>
  );
}

function PartView({ part }: { part: AnyPart }) {
  if (part.type === 'text') {
    return (
      <div className="text-[12px] text-zinc-100 whitespace-pre-wrap leading-relaxed">
        {(part as { text: string }).text}
      </div>
    );
  }
  if (part.type === 'step-start') {
    return null;
  }
  if (typeof part.type === 'string' && (part.type.startsWith('tool-') || part.type === 'dynamic-tool')) {
    return <ToolChip part={part as ToolPartLike} />;
  }
  return null;
}

type ToolPartLike = {
  type: string;
  toolCallId?: string;
  toolName?: string;
  state: string;
  input?: unknown;
  output?: unknown;
  errorText?: string;
};

function ToolChip({ part }: { part: ToolPartLike }) {
  const [open, setOpen] = useState(false);
  const name =
    part.toolName ??
    (part.type.startsWith('tool-') ? part.type.slice('tool-'.length) : part.type);

  const isError = part.state === 'output-error';
  const isDone = part.state === 'output-available' || isError;
  const icon = isError ? '⚠' : isDone ? '✓' : '⏳';

  const argPreview = formatArgs(part.input);

  return (
    <div
      className={`rounded border text-[11px] font-mono ${
        isError
          ? 'border-red-900/60 bg-red-950/30 text-red-200'
          : isDone
            ? 'border-emerald-900/60 bg-emerald-950/30 text-emerald-200'
            : 'border-zinc-800 bg-zinc-900/60 text-zinc-400'
      }`}
    >
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-2 py-1 flex items-center gap-2 hover:bg-zinc-800/40"
      >
        <span>{icon}</span>
        <span className="font-semibold">{name}</span>
        <span className="text-zinc-500 truncate">{argPreview}</span>
      </button>
      {open && (
        <pre className="px-2 pb-2 pt-1 text-[10px] text-zinc-300 whitespace-pre-wrap break-all border-t border-zinc-800/60 max-h-48 overflow-y-auto">
          {isError
            ? part.errorText
            : JSON.stringify(part.output ?? part.input ?? null, null, 2)}
        </pre>
      )}
    </div>
  );
}

function formatArgs(input: unknown): string {
  if (input == null) return '';
  if (typeof input === 'string') return `("${input}")`;
  if (typeof input === 'object') {
    const entries = Object.entries(input as Record<string, unknown>);
    if (entries.length === 0) return '()';
    const head = entries
      .slice(0, 2)
      .map(([k, v]) => `${k}=${typeof v === 'string' ? `"${v}"` : JSON.stringify(v)}`)
      .join(', ');
    return entries.length > 2 ? `(${head}, …)` : `(${head})`;
  }
  return '';
}

function extractCitations(message: UIMessage): Set<string> {
  const universe = new Set<string>();
  let finalText = '';

  for (const part of message.parts) {
    if (part.type === 'text') {
      finalText = (part as { text: string }).text;
    } else if (
      typeof (part as { type?: string }).type === 'string' &&
      ((part as { type: string }).type.startsWith('tool-') ||
        (part as { type: string }).type === 'dynamic-tool')
    ) {
      const tp = part as ToolPartLike;
      if (tp.state === 'output-available') {
        collectSlugs(tp.output, universe);
        collectSlugs(tp.input, universe);
      }
    }
  }

  const match = finalText.match(/(?:^|\n)\s*Cite[sd]?:\s*(.+?)(?:\n|$)/i);
  if (!match) return new Set();

  const raw = match[1].split(/[,\s\[\]()]+/).filter(Boolean);
  const cited = new Set<string>();
  for (const r of raw) {
    const s = r.toLowerCase();
    if (universe.has(s)) cited.add(s);
  }
  return cited;
}

function collectSlugs(value: unknown, out: Set<string>): void {
  if (value == null) return;
  if (typeof value === 'string') {
    if (SLUG_RE.test(value)) out.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectSlugs(v, out);
    return;
  }
  if (typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (k === 'slug' || k === 'to_slug' || k === 'from_slug') {
        if (typeof v === 'string' && SLUG_RE.test(v)) out.add(v);
      } else if (Array.isArray(v) || (v !== null && typeof v === 'object')) {
        collectSlugs(v, out);
      } else if (typeof v === 'string' && (k === 'slugs' || k === 'pages')) {
        if (SLUG_RE.test(v)) out.add(v);
      }
    }
  }
}
