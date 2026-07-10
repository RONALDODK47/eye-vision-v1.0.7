import { useEffect, useState } from 'react';
import { dbClient } from '@/api/dbClient';

function isQuotaError(err) {
  const msg = String(err?.message || err || '').toLowerCase();
  return msg.includes('quota') || msg.includes('resource-exhausted');
}

/**
 * Chat interno: listeners Firestore (sem polling).
 * Reduz drasticamente leituras vs refetchInterval a cada 2–4 s.
 */
export function useDirectChatThreads(uid, enabled = true) {
  const [threads, setThreads] = useState([]);
  const [threadsLoading, setThreadsLoading] = useState(Boolean(uid && enabled));
  const [threadsError, setThreadsError] = useState(null);

  useEffect(() => {
    if (!uid || !enabled) {
      setThreads([]);
      setThreadsLoading(false);
      setThreadsError(null);
      return undefined;
    }

    setThreadsLoading(true);
    const unsub = dbClient.entities.DirectChatThread.subscribeForUser(
      uid,
      (rows) => {
        setThreads(rows);
        setThreadsLoading(false);
        setThreadsError(null);
      },
      (err) => {
        setThreadsError(isQuotaError(err) ? new Error('CHAT_QUOTA') : err);
        setThreadsLoading(false);
      },
    );

    return () => {
      unsub();
    };
  }, [uid, enabled]);

  return { threads, threadsLoading, threadsError };
}

export function useDirectChatMessages(threadId, enabled = true) {
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(Boolean(threadId && enabled));
  const [messagesError, setMessagesError] = useState(null);

  useEffect(() => {
    if (!threadId || !enabled) {
      setMessages([]);
      setMessagesLoading(false);
      setMessagesError(null);
      return undefined;
    }

    setMessagesLoading(true);
    const unsub = dbClient.entities.DirectChatMessage.subscribeByThread(
      threadId,
      (rows) => {
        setMessages(rows);
        setMessagesLoading(false);
        setMessagesError(null);
      },
      (err) => {
        setMessagesError(isQuotaError(err) ? new Error('CHAT_QUOTA') : err);
        setMessagesLoading(false);
      },
    );

    return () => {
      unsub();
    };
  }, [threadId, enabled]);

  return { messages, messagesLoading, messagesError };
}
