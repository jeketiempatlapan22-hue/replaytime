import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Send, Pin, PinOff, Trash2, MessageCircle, ShieldCheck, Shield, UserCog, Reply, X, Ban, CheckCircle2, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { getBrowserId } from '@/lib/browserId';
import { readMembershipCredentials } from '@/lib/membershipAccess';

interface Msg {
  id: string;
  name: string;
  message: string;
  is_admin: boolean;
  pinned: boolean;
  created_at: string;
  browser_id?: string;
  reply_to_id?: string | null;
  show_id?: string | null;
  sender_role?: string;
}

interface SenderInfo {
  name: string;
  sender_role: string;
  user_id: string | null;
  phone: string;
  token_tail: string;
  token_kind: string;
  created_by: string;
  browser_id: string;
  is_blocked: boolean;
  is_moderator: boolean;
}

// Kredensial akses yang sedang dipakai penonton (dari URL / penyimpanan HP),
// dikirim ke server agar identitas pengirim chat tercatat privat.
function gatherAccessCreds() {
  const sp = new URLSearchParams(window.location.search);
  const mem = readMembershipCredentials();
  return {
    token: sp.get('t') || sp.get('token') || '',
    mtoken: sp.get('mtoken') || mem?.token || '',
    btoken: sp.get('btoken') || '',
    pw: sp.get('pw') || sp.get('mp') || mem?.password || '',
  };
}

interface LiveChatProps {
  lite?: boolean;
  /** Chat dipisah per show; tanpa id = chat umum (legacy). */
  showId?: string;
}


export default function LiveChat({ lite = false, showId = '' }: LiveChatProps) {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [pinned, setPinned] = useState<Msg[]>([]);
  const [name, setName] = useState(() => localStorage.getItem('replaytime-name') || '');
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isModerator, setIsModerator] = useState(false);
  const [adminUsername, setAdminUsername] = useState('Admin');
  const [senderInfo, setSenderInfo] = useState<{ msg: Msg; info: SenderInfo } | null>(null);
  const [senderLoading, setSenderLoading] = useState(false);
  const [nameModalOpen, setNameModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [nameError, setNameError] = useState('');
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [blockedSet, setBlockedSet] = useState<Set<string>>(new Set());
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const sentTimestampsRef = useRef<number[]>([]);

  const myBrowserId = getBrowserId();
  const iAmBlocked = blockedSet.has(myBrowserId) && !isAdmin;
  const messageLimit = lite ? 25 : 50;

  const saveName = () => {
    const v = nameInput.trim();
    if (v.length < 2) { setNameError('Nama minimal 2 karakter.'); return; }
    if (v.length > 40) { setNameError('Nama maksimal 40 karakter.'); return; }
    setName(v);
    try { localStorage.setItem('replaytime-name', v); } catch { /* ignore */ }
    setNameError('');
    setNameModalOpen(false);
  };
  const openChangeName = () => { setNameInput(name); setNameError(''); setNameModalOpen(true); };

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (!session) return;
      const [{ data: adm }, { data: mod }] = await Promise.all([
        supabase.rpc('has_role', { _user_id: session.user.id, _role: 'admin' }),
        supabase.rpc('has_role', { _user_id: session.user.id, _role: 'moderator' }),
      ]);
      setIsAdmin(adm === true);
      setIsModerator(mod === true);
    });
    supabase.from('site_settings').select('value').eq('key', 'admin_username').maybeSingle()
      .then(({ data }) => { if (data?.value) setAdminUsername(data.value); });
  }, []);

  // Chat dipisah per show: hanya pesan milik show ini yang tampil.
  const inScope = useCallback((m: Msg) => (showId ? m.show_id === showId : !m.show_id), [showId]);

  const refresh = useCallback(async () => {
    const scoped = (pinnedVal: boolean) => {
      let q = supabase.from('live_messages').select('*').eq('pinned', pinnedVal).order('created_at', { ascending: false });
      q = showId ? q.eq('show_id', showId) : q.is('show_id', null);
      return pinnedVal ? q : q.limit(messageLimit);
    };
    const [{ data: pins }, { data: list }, { data: blocks }] = await Promise.all([
      scoped(true),
      scoped(false),
      // Admin perlu daftar lengkap block untuk badge moderasi; viewer biasa cukup cek dirinya sendiri.
      isAdmin
        ? supabase.from('chat_blocks').select('browser_id')
        : supabase.from('chat_blocks').select('browser_id').eq('browser_id', myBrowserId),
    ]);
    setPinned((pins || []) as Msg[]);
    setMessages(((list || []) as Msg[]).slice().reverse());
    setBlockedSet(new Set(((blocks || []) as { browser_id: string }[]).map(b => b.browser_id)));
    stickToBottomRef.current = true;
  }, [isAdmin, messageLimit, myBrowserId, showId]);

  useEffect(() => {
    refresh();
    let liveOk = false;
    const ch = supabase.channel(`live-chat-${showId || 'global'}-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'live_messages' }, (payload) => {
        const m = payload.new as Msg;
        if (!inScope(m)) return;
        if (m.pinned) setPinned(prev => [m, ...prev.filter(x => x.id !== m.id)]);
        else setMessages(prev => {
          const next = [...prev.filter(x => x.id !== m.id), m];
          return next.length > messageLimit ? next.slice(next.length - messageLimit) : next;
        });
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'live_messages' }, (payload) => {
        const m = payload.new as Msg;
        if (!inScope(m)) return;
        setPinned(prev => m.pinned ? [m, ...prev.filter(x => x.id !== m.id)] : prev.filter(x => x.id !== m.id));
        setMessages(prev => {
          if (m.pinned) return prev.filter(x => x.id !== m.id);
          const exists = prev.some(x => x.id === m.id);
          if (exists) return prev.map(x => x.id === m.id ? m : x);
          const next = [...prev, m];
          return next.length > messageLimit ? next.slice(next.length - messageLimit) : next;
        });
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'live_messages' }, (payload) => {
        const id = (payload.old as { id?: string })?.id;
        if (!id) return;
        setMessages(prev => prev.filter(x => x.id !== id));
        setPinned(prev => prev.filter(x => x.id !== id));
      })
      .on(
        'postgres_changes',
        isAdmin
          ? { event: '*', schema: 'public', table: 'chat_blocks' }
          : { event: '*', schema: 'public', table: 'chat_blocks', filter: `browser_id=eq.${myBrowserId}` },
        async () => {
          const q = isAdmin
            ? supabase.from('chat_blocks').select('browser_id')
            : supabase.from('chat_blocks').select('browser_id').eq('browser_id', myBrowserId);
          const { data } = await q;
          setBlockedSet(new Set(((data || []) as { browser_id: string }[]).map(b => b.browser_id)));
        }
      )
      .subscribe((status) => {
        liveOk = status === 'SUBSCRIBED';
        if (liveOk) refresh();
      });
    // Cadangan: kalau koneksi realtime putus, tetap sinkron tiap 5 detik.
    const poll = window.setInterval(() => { if (!liveOk && !document.hidden) refresh(); }, 5000);
    const onVis = () => { if (!document.hidden) refresh(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('online', onVis);
    return () => {
      window.clearInterval(poll);
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('online', onVis);
      supabase.removeChannel(ch);
    };
  }, [isAdmin, messageLimit, myBrowserId, refresh, showId, inScope]);

  const handleScroll = () => {
    const el = listRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    stickToBottomRef.current = distFromBottom < 60;
  };

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickToBottomRef.current) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [messages.length]);

  // Lookup pesan asli untuk reply preview
  const messageMap = useMemo(() => {
    const map = new Map<string, Msg>();
    [...messages, ...pinned].forEach(m => map.set(m.id, m));
    return map;
  }, [messages, pinned]);

  const scrollToMessage = (id: string) => {
    const el = document.getElementById(`chatmsg-${id}`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setHighlightId(id);
    setTimeout(() => setHighlightId(null), 1500);
  };

  // Rate limit
  const RL_MIN_GAP_MS = 2000;
  const RL_WINDOW_MS = 60_000;
  const RL_MAX_IN_WINDOW = 8;
  const RL_KEY = `replaytime-chat-ts-${myBrowserId}`;
  const RL_LAST_MSGS_KEY = `replaytime-chat-last-${myBrowserId}`;

  const checkRate = (msg: string): { ok: true } | { ok: false; reason: string; waitSec?: number } => {
    if (isAdmin) return { ok: true };
    let ts: number[] = sentTimestampsRef.current;
    if (ts.length === 0) {
      try { ts = JSON.parse(localStorage.getItem(RL_KEY) || '[]'); } catch { ts = []; }
    }
    const now = Date.now();
    ts = ts.filter(t => now - t < RL_WINDOW_MS);
    if (ts.length > 0 && now - ts[ts.length - 1] < RL_MIN_GAP_MS) {
      return { ok: false, reason: 'Tunggu sebentar sebelum kirim pesan lagi.', waitSec: Math.ceil((RL_MIN_GAP_MS - (now - ts[ts.length - 1])) / 1000) };
    }
    if (ts.length >= RL_MAX_IN_WINDOW) {
      const wait = Math.ceil((RL_WINDOW_MS - (now - ts[0])) / 1000);
      return { ok: false, reason: `Terlalu banyak pesan. Coba lagi dalam ${wait} detik.`, waitSec: wait };
    }
    let lastMsgs: string[] = [];
    try { lastMsgs = JSON.parse(localStorage.getItem(RL_LAST_MSGS_KEY) || '[]'); } catch { lastMsgs = []; }
    if (lastMsgs.length >= 3 && lastMsgs.slice(-3).every(m => m === msg)) {
      return { ok: false, reason: 'Hindari kirim pesan yang sama berulang kali.' };
    }
    return { ok: true };
  };

  const recordSent = (msg: string) => {
    const now = Date.now();
    const ts = [...sentTimestampsRef.current.filter(t => now - t < RL_WINDOW_MS), now];
    sentTimestampsRef.current = ts;
    try { localStorage.setItem(RL_KEY, JSON.stringify(ts)); } catch { /* ignore */ }
    let lastMsgs: string[] = [];
    try { lastMsgs = JSON.parse(localStorage.getItem(RL_LAST_MSGS_KEY) || '[]'); } catch { lastMsgs = []; }
    lastMsgs = [...lastMsgs, msg].slice(-5);
    try { localStorage.setItem(RL_LAST_MSGS_KEY, JSON.stringify(lastMsgs)); } catch { /* ignore */ }
  };

  const startCooldown = (sec: number) => {
    setCooldownLeft(sec);
    const tick = () => setCooldownLeft(prev => {
      if (prev <= 1) return 0;
      setTimeout(tick, 1000);
      return prev - 1;
    });
    if (sec > 0) setTimeout(tick, 1000);
  };

  const send = async () => {
    const msg = text.trim().slice(0, 500);
    if (!msg || sending) return;
    if (iAmBlocked) return;
    if (!isAdmin && !name.trim()) { openChangeName(); return; }
    const rl = checkRate(msg);
    if (rl.ok === false) {
      const waitSec = rl.waitSec;
      const reason = rl.reason;
      if (waitSec) startCooldown(waitSec);
      try {
        const { toast } = await import('@/hooks/use-toast');
        toast({ title: 'Pesan ditolak', description: reason, variant: 'destructive' });
      } catch { /* ignore */ }
      return;
    }
    setSending(true);
    const display = (name.trim() || 'Anonim').slice(0, 40);
    stickToBottomRef.current = true;
    // Kirim lewat server agar peran (admin/moderator) dan identitas pengirim tercatat aman.
    const { data, error } = await supabase.functions.invoke('live-chat-send', {
      body: {
        show_id: showId || null,
        name: isAdmin ? (adminUsername || 'Admin') : display,
        message: msg,
        reply_to_id: replyTo?.id ?? null,
        browser_id: myBrowserId,
        ...gatherAccessCreds(),
      },
    });
    const inserted = (data as { message?: Msg } | null)?.message;
    if (error || !inserted) {
      try {
        const { toast } = await import('@/hooks/use-toast');
        toast({ title: 'Pesan gagal terkirim', description: (data as { error?: string } | null)?.error || 'Coba lagi sebentar.', variant: 'destructive' });
      } catch { /* ignore */ }
    } else {
      setMessages(prev => prev.some(x => x.id === inserted.id) ? prev : [...prev, inserted].slice(-messageLimit));
      recordSent(msg);
      setText('');
      setReplyTo(null);
    }
    setSending(false);
  };

  const togglePin = async (m: Msg) => { if (isAdmin) await supabase.from('live_messages').update({ pinned: !m.pinned }).eq('id', m.id); };
  const canModerate = isAdmin || isModerator;
  const remove = async (m: Msg) => {
    if (!canModerate) return;
    if (isAdmin) await supabase.from('live_messages').delete().eq('id', m.id);
    else await supabase.rpc('mod_delete_message', { _message_id: m.id });
  };

  const blockUser = async (m: Msg) => {
    if (!canModerate || !m.browser_id) return;
    if (isAdmin) await supabase.from('chat_blocks').insert({ browser_id: m.browser_id, last_name: m.name });
    else await supabase.rpc('mod_block_chat', { _browser_id: m.browser_id, _name: m.name, _reason: '' });
  };
  const unblockUser = async (m: Msg) => {
    if (!canModerate || !m.browser_id) return;
    if (isAdmin) await supabase.from('chat_blocks').delete().eq('browser_id', m.browser_id);
    else await supabase.rpc('mod_unblock_chat', { _browser_id: m.browser_id });
  };

  const openSenderInfo = async (m: Msg) => {
    if (!canModerate) return;
    setSenderLoading(true);
    setSenderInfo(null);
    const { data, error } = await supabase.rpc('admin_get_chat_sender', { _message_id: m.id });
    setSenderLoading(false);
    if (error || !data) {
      try {
        const { toast } = await import('@/hooks/use-toast');
        toast({ title: 'Gagal memuat info pengirim', variant: 'destructive' });
      } catch { /* ignore */ }
      return;
    }
    setSenderInfo({ msg: m, info: data as unknown as SenderInfo });
  };

  const toggleModerator = async () => {
    if (!senderInfo?.info.user_id || !isAdmin) return;
    const target = senderInfo.info;
    await supabase.rpc('admin_set_moderator', { _user_id: target.user_id, _on: !target.is_moderator });
    setSenderInfo(prev => prev ? { ...prev, info: { ...prev.info, is_moderator: !target.is_moderator } } : prev);
  };

  const time = (s: string) => {
    const d = new Date(s);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const canChat = (isAdmin || !!name.trim()) && !iAmBlocked;

  return (
    <div className="rounded-2xl bg-card/80 border border-border overflow-hidden flex flex-col h-[70vh] min-h-[460px] max-h-[760px]">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-secondary/40">
        <MessageCircle className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Live Chat</span>
        {!isAdmin && name && (
          <button onClick={openChangeName} className="ml-auto inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground">
            <UserCog className="w-3 h-3" /> {name}
          </button>
        )}
      </div>

      {/* Pinned banner */}
      {pinned.length > 0 && (
        <div className="px-3 py-2.5 bg-primary/15 border-b-2 border-primary/50 space-y-2 max-h-36 overflow-y-auto shadow-sm">
          {pinned.map(m => (
            <div key={m.id} className="flex items-start gap-2 text-sm leading-snug">
              <Pin className="w-4 h-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <span className="font-semibold text-primary">{m.name}</span>
                {m.is_admin && <span className="ml-1 text-[9px] uppercase bg-primary text-primary-foreground px-1 rounded">Admin</span>}
                {m.sender_role === 'moderator' && !m.is_admin && <span className="ml-1 text-[9px] uppercase bg-emerald-600 text-white px-1 rounded">Moderator</span>}
                <span className="ml-1 font-medium text-foreground break-words">{m.message}</span>
              </div>
              {isAdmin && (
                <div className="flex gap-1 shrink-0">
                  <button onClick={() => togglePin(m)} className="text-muted-foreground hover:text-foreground"><PinOff className="w-3 h-3" /></button>
                  <button onClick={() => remove(m)} className="text-destructive"><Trash2 className="w-3 h-3" /></button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Messages — gaya YouTube/TikTok/IG, tanpa avatar, terbaru di bawah */}
      <div ref={listRef} onScroll={handleScroll} className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {messages.length === 0 && <p className="text-xs text-muted-foreground text-center py-6">Belum ada pesan.</p>}
        {messages.map(m => {
          const isUserBlocked = !!m.browser_id && blockedSet.has(m.browser_id);
          const replied = m.reply_to_id ? messageMap.get(m.reply_to_id) : null;
          const isModMsg = m.sender_role === 'moderator';
          const nameColor = m.is_admin ? 'text-yellow-400' : isModMsg ? 'text-emerald-400' : 'chat-user-name';
          return (
            <div
              id={`chatmsg-${m.id}`}
              key={m.id}
              className={`group px-3 py-1 transition-colors ${highlightId === m.id ? 'bg-primary/20' : 'hover:bg-secondary/40'} rounded-md mx-1`}
            >
              {replied && (
                <button
                  onClick={() => scrollToMessage(replied.id)}
                  className="block w-full text-left mb-0.5 pl-2 border-l-2 border-primary/60 text-[10px] text-muted-foreground truncate hover:text-foreground"
                >
                  ↪ <span className="font-medium">@{replied.name}</span>: {replied.message}
                </button>
              )}
              {m.reply_to_id && !replied && (
                <div className="mb-0.5 pl-2 border-l-2 border-muted text-[10px] text-muted-foreground/70 italic">↪ Pesan tidak tersedia</div>
              )}
              <div className="flex items-baseline gap-1.5 flex-wrap text-sm leading-snug">
                {canModerate ? (
                  <button onClick={() => openSenderInfo(m)} title="Info pengirim" className={`font-semibold ${nameColor} hover:underline`}>{m.name}</button>
                ) : (
                  <span className={`font-semibold ${nameColor}`}>{m.name}</span>
                )}
                {m.is_admin && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] uppercase bg-red-500/80 text-white px-1 py-0.5 rounded">
                    <ShieldCheck className="w-2.5 h-2.5" />Admin
                  </span>
                )}
                {isModMsg && !m.is_admin && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] uppercase bg-emerald-600/80 text-white px-1 py-0.5 rounded">
                    <Shield className="w-2.5 h-2.5" />Moderator
                  </span>
                )}
                {isUserBlocked && !m.is_admin && (
                  <span className="text-[9px] uppercase bg-destructive/80 text-destructive-foreground px-1 py-0.5 rounded">Diblokir</span>
                )}
                <span className={m.is_admin ? 'text-foreground/95 break-words' : 'text-muted-foreground break-words'}>{m.message}</span>
                <span className="text-[10px] text-muted-foreground/60 ml-1">{time(m.created_at)}</span>
                <span className="ml-auto opacity-0 group-hover:opacity-100 flex gap-1.5 items-center">
                  {!m.is_admin && !iAmBlocked && (
                    <button title="Balas" onClick={() => { setReplyTo(m); }} className="text-muted-foreground hover:text-primary">
                      <Reply className="w-3.5 h-3.5" />
                    </button>
                  )}
                  {canModerate && (
                    <>
                      {isAdmin && (
                        <button title="Pin" onClick={() => togglePin(m)} className="text-muted-foreground hover:text-primary"><Pin className="w-3.5 h-3.5" /></button>
                      )}
                      {!m.is_admin && m.browser_id && (
                        isUserBlocked ? (
                          <button title="Buka blokir" onClick={() => unblockUser(m)} className="text-emerald-500 hover:text-emerald-400"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                        ) : (
                          <button title="Blokir user" onClick={() => blockUser(m)} className="text-orange-500 hover:text-orange-400"><Ban className="w-3.5 h-3.5" /></button>
                        )
                      )}
                      <button title="Hapus" onClick={() => remove(m)} className="text-destructive hover:opacity-80"><Trash2 className="w-3.5 h-3.5" /></button>
                    </>
                  )}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input */}
      <div className="border-t border-border p-2 space-y-1.5 bg-secondary/30">
        {iAmBlocked && (
          <div className="text-[11px] bg-destructive/15 text-destructive border border-destructive/40 rounded px-2 py-1.5">
            Kamu diblokir oleh admin dari live chat.
          </div>
        )}
        {!iAmBlocked && !canChat && (
          <button
            onClick={openChangeName}
            className="w-full text-[11px] text-primary underline-offset-2 hover:underline text-left"
          >
            Masukkan nama dulu untuk mengirim pesan →
          </button>
        )}
        {replyTo && (
          <div className="flex items-center gap-2 pl-2 pr-1 py-1 bg-primary/10 border-l-2 border-primary rounded text-[11px]">
            <Reply className="w-3 h-3 text-primary shrink-0" />
            <div className="flex-1 min-w-0 truncate">
              Membalas <span className="font-semibold text-primary">@{replyTo.name}</span>: <span className="text-muted-foreground">{replyTo.message.slice(0, 60)}</span>
            </div>
            <button onClick={() => setReplyTo(null)} className="text-muted-foreground hover:text-foreground shrink-0"><X className="w-3 h-3" /></button>
          </div>
        )}
        <div className="flex gap-1.5">
          <Input
            value={text}
            onChange={e => setText(e.target.value.slice(0, 500))}
            onKeyDown={e => e.key === 'Enter' && canChat && cooldownLeft === 0 && send()}
            onFocus={() => { if (!iAmBlocked && !canChat) openChangeName(); }}
            placeholder={iAmBlocked ? 'Diblokir admin' : (cooldownLeft > 0 ? `Tunggu ${cooldownLeft} detik…` : (canChat ? (replyTo ? `Balas @${replyTo.name}…` : 'Ketik pesan...') : 'Masukkan nama untuk berinteraksi'))}
            className="h-9 text-sm bg-background"
            disabled={!canChat || cooldownLeft > 0}
          />
          <Button size="icon" onClick={send} disabled={sending || !text.trim() || !canChat || cooldownLeft > 0} className="h-9 w-9 shrink-0">
            {cooldownLeft > 0 ? <span className="text-[10px] font-bold">{cooldownLeft}</span> : <Send className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Name modal */}
      <Dialog open={nameModalOpen} onOpenChange={(o) => { if (o || name.trim()) setNameModalOpen(o); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Masukkan Nama</DialogTitle>
            <DialogDescription>Nama akan ditampilkan saat kamu berinteraksi di live chat. Wajib diisi tiap perangkat.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Input
              autoFocus
              value={nameInput}
              onChange={(e) => { setNameInput(e.target.value.slice(0, 40)); setNameError(''); }}
              onKeyDown={(e) => e.key === 'Enter' && saveName()}
              placeholder="Nama kamu (2-40 karakter)"
              maxLength={40}
            />
            {nameError && <p className="text-xs text-destructive">{nameError}</p>}
            <Button className="w-full" onClick={saveName} disabled={nameInput.trim().length < 2}>Simpan Nama</Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Info pengirim (admin & moderator) */}
      <Dialog open={!!senderInfo || senderLoading} onOpenChange={(o) => { if (!o) setSenderInfo(null); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Info className="w-4 h-4" /> Info Pengirim</DialogTitle>
            <DialogDescription>Identitas akses yang dipakai pengirim pesan ini.</DialogDescription>
          </DialogHeader>
          {senderLoading && <p className="text-sm text-muted-foreground">Memuat…</p>}
          {senderInfo && (
            <div className="space-y-3 text-sm">
              <div className="space-y-1.5">
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Nama</span><span className="font-medium text-right">{senderInfo.info.name}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Peran</span><span className="font-medium">{senderInfo.info.sender_role === 'admin' ? '🛡️ Admin' : senderInfo.info.sender_role === 'moderator' ? '🔰 Moderator' : 'User'}</span></div>
                {isAdmin && (
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Nomor HP</span><span className="font-medium">{senderInfo.info.phone || '—'}</span></div>
                )}
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Token</span><span className="font-medium">{senderInfo.info.token_tail ? `••••${senderInfo.info.token_tail}` : '—'}</span></div>
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Jenis akses</span><span className="font-medium">{{ membership: 'Membership', show: 'Show', bundle: 'Bundel', order: 'Pembelian', password: 'Sandi', guest: 'Tamu' }[senderInfo.info.token_kind] || 'Tamu'}</span></div>
                {senderInfo.info.created_by && (
                  <div className="flex justify-between gap-2"><span className="text-muted-foreground">Dibuat oleh</span><span className="font-medium text-right">{senderInfo.info.created_by === 'pembelian' ? 'Pembelian' : senderInfo.info.created_by.startsWith('reseller') ? `Reseller ${senderInfo.info.created_by.replace(/^reseller:?/, '')}` : senderInfo.info.created_by === 'admin' ? 'Dibuat Admin' : senderInfo.info.created_by}</span></div>
                )}
                <div className="flex justify-between gap-2"><span className="text-muted-foreground">Status</span><span className="font-medium">{senderInfo.info.is_blocked ? 'Diblokir' : 'Aktif'}</span></div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1">
                {isAdmin && senderInfo.info.user_id && (
                  <Button size="sm" variant="outline" onClick={toggleModerator}>
                    {senderInfo.info.is_moderator ? 'Cabut Moderator' : 'Jadikan Moderator'}
                  </Button>
                )}
                {senderInfo.info.is_blocked ? (
                  <Button size="sm" variant="outline" onClick={() => { unblockUser(senderInfo.msg); setSenderInfo(prev => prev ? { ...prev, info: { ...prev.info, is_blocked: false } } : prev); }}>Buka Blokir</Button>
                ) : (
                  <Button size="sm" variant="outline" onClick={() => { blockUser(senderInfo.msg); setSenderInfo(prev => prev ? { ...prev, info: { ...prev.info, is_blocked: true } } : prev); }}>Blokir</Button>
                )}
                <Button size="sm" variant="destructive" onClick={() => { remove(senderInfo.msg); setSenderInfo(null); }}>Hapus Pesan</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
