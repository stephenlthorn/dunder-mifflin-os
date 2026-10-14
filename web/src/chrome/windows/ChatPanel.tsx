// Chat with a bot or a room. Live: GET history + POST /api/chat (slow; shows typing…). Demo: echoes locally.
// Read-only servers (the default) show the history and a hint instead of the composer.
import { type FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import type { ChatMessage, Person, Room } from '@shared/contract';
import { demoEcho, fetchMessages, sendChat } from '../../data/api';
import { authorName, mergeMessages } from './chatModel';
import { shortName } from '../../office/names';
import { canChat } from '../../office/capabilities';
import { ReadOnlyHint } from './sections';
import { useDelight } from '../../delight/DelightContext';

type Props = { room: Room; lead?: Person; people: readonly Person[]; demo: boolean; writable: boolean };

const POLL_MS = 8000;
const MAX_LEN = 2000;

export function ChatPanel({ room, lead, people, demo, writable }: Props) {
  const [server, setServer] = useState<ChatMessage[]>([]);
  const [local, setLocal] = useState<ChatMessage[]>([]);
  const [reason, setReason] = useState<string | undefined>();
  const [error, setError] = useState<string | null>(null);
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const list = useRef<HTMLOListElement>(null);
  const leadName = lead ? shortName(lead.name) : room.name;

  const load = useCallback(async () => {
    if (demo) return;
    try {
      const res = await fetchMessages(room.id);
      setServer(res.messages);
      setReason(res.reason);
    } catch (err) {
      setError(`Could not load messages: ${(err as Error).message}`);
    }
  }, [demo, room.id]);

  useEffect(() => {
    void load();
    if (demo) return undefined;
    const t = setInterval(() => void load(), POLL_MS);
    return () => clearInterval(t);
  }, [demo, load]);

  const messages = mergeMessages(server, local);
  const { heard } = useDelight(); // "that's what she said": in this browser only, never sent to a bot
  const hear = (ms: readonly ChatMessage[]) => { for (const m of ms) heard(m, authorName(m.authorId, people)); };
  useEffect(() => {
    list.current?.scrollTo({ top: list.current.scrollHeight });
  }, [messages.length, typing]);

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = draft.trim().slice(0, MAX_LEN);
    if (!text || typing) return;
    setDraft('');
    setError(null);
    if (demo) {
      const echo = demoEcho(room.id, text, lead ?? { id: room.id, name: room.name });
      setLocal((l) => [...l, ...echo]);
      hear(echo);
      return;
    }
    const mine: ChatMessage = { id: `local-${Date.now()}`, roomId: room.id, authorId: 'you', text, at: new Date().toISOString() };
    setLocal((l) => [...l, mine]);
    hear([mine]);
    setTyping(true);
    const res = await sendChat(room.id, text);
    setTyping(false);
    if (res.ok) {
      setLocal((l) => [...l, ...res.messages]);
      hear(res.messages);
      void load();
    } else {
      setError(res.busy ? `${leadName} is busy with another message. Try again in a moment.` : res.error);
    }
  };

  return (
    <section className="chat" aria-label={`Chat: ${room.name}`}>
      <ol className="chat-log" ref={list} aria-live="polite">
        {messages.length === 0 && <li className="chat-empty">{reason ?? (demo ? `Say hi to ${leadName}. In demo mode replies are local echoes.` : 'No messages yet.')}</li>}
        {messages.map((m) => (
          <li key={m.id} className={m.authorId === 'you' ? 'msg mine' : 'msg'}>
            <span className="msg-author">{authorName(m.authorId, people)}</span>
            <span className="msg-text">{m.text}</span>
          </li>
        ))}
        {typing && <li className="msg typing" aria-label={`${leadName} is typing`}><span className="msg-author">{leadName}</span><span className="dots"><i /><i /><i /></span></li>}
      </ol>
      {error && <p className="chat-error" role="alert">{error}</p>}
      {!writable ? <ReadOnlyHint what="chat" /> : !canChat(room) ? (
        <p className="muted chat-readonly">This chat is read-only: {leadName}’s adapter can’t receive messages.</p>
      ) : (
      <form className="chat-form" onSubmit={send}>
        <label className="sr-only" htmlFor={`chat-${room.id}`}>Message {room.name}</label>
        <input
          id={`chat-${room.id}`}
          value={draft}
          maxLength={MAX_LEN}
          placeholder={typing ? `${leadName} is typing…` : `Message ${room.kind === 'dm' ? leadName : `the ${room.name} room`}`}
          onChange={(e) => setDraft(e.target.value)}
          disabled={typing}
        />
        <button type="submit" disabled={typing || !draft.trim()}>Send</button>
      </form>
      )}
    </section>
  );
}
