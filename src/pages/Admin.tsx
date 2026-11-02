import { abbreviateTitle } from '@/lib/abbrev';
import LiveMonitorAdmin from '@/components/admin/LiveMonitorAdmin';
import GameAdmin from '@/components/admin/GameAdmin';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, Edit2, Key, Save, Palette, MessageCircle, LogOut, Eye, Send, List, Settings, ShieldCheck, Unlock as UnlockIcon, Link2, Copy, X, Radio, RefreshCw, Users, Upload, Search, ArrowUpDown, Sparkles, Calendar, Bot, History, Menu, Lock, ClipboardList } from 'lucide-react';
import BotAdmin from '@/components/admin/BotAdmin';
import TokenHistoryAdmin from '@/components/admin/TokenHistoryAdmin';
import ResellerAuditAdmin from '@/components/admin/ResellerAuditAdmin';
import ResellerBillingAdmin from '@/components/admin/ResellerBillingAdmin';
import ResellerPricingAdmin from '@/components/admin/ResellerPricingAdmin';
import MembershipAdmin from '@/components/admin/MembershipAdmin';
import MembershipPackagesAdmin from '@/components/admin/MembershipPackagesAdmin';
import MembershipUsersAdmin from '@/components/admin/MembershipUsersAdmin';
import ShowBundleAdmin from '@/components/admin/ShowBundleAdmin';
import TokenFactoryAdmin from '@/components/admin/TokenFactoryAdmin';
import MembershipProofsAdmin from '@/components/admin/MembershipProofsAdmin';
import ReplayOffAdmin from '@/components/admin/ReplayOffAdmin';
import PakasirAdmin from '@/components/admin/PakasirAdmin';
import CoinAdmin from '@/components/admin/CoinAdmin';
import UserManagement from '@/components/admin/UserManagement';
import ReplayPersonalTokensDialog from '@/components/admin/ReplayPersonalTokensDialog';
import ShowLiveControl from '@/components/admin/ShowLiveControl';
import BulkShowImport from '@/components/admin/BulkShowImport';
import IpManager from '@/components/admin/IpManager';
import DataExportAdmin from '@/components/admin/DataExportAdmin';
import { getMembers, upsertMember, deleteMember, uploadMemberPhoto, type Member } from '@/lib/members';
import { getActiveShows, upsertActiveShow, deleteActiveShow, type ActiveShow } from '@/lib/activeShows';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { addReplay, deleteReplay, updateReplay, getReplaysAdmin, getAllMasterPasswords, setMasterPassword, setMasterPasswordPaused, deleteMasterPassword, getSettings, setSetting, setReplayAccessToken, type ReplayRow, type MasterPasswordRow, type PlaylistSource } from '@/lib/store';
import { THEME_OPTIONS, type ThemeType } from '@/components/ThemedBackground';
import ImagePicker from '@/components/ImagePicker';
import YouTubeIdInput from '@/components/admin/YouTubeIdInput';
import { parseYouTubeId } from '@/lib/youtube';
import { toast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { adminWaNumber } from '@/lib/adminWa';

const CRITERIA_OPTIONS = [
  { value: 'reguler', label: 'Reguler' },
  { value: 'sts', label: 'STS (Seitansai)' },
  { value: 'last_show', label: 'Last Show' },
  { value: 'aniv', label: 'Anniversary' },
  { value: 'special', label: 'Show Spesial' },
];

const MONTH_OPTIONS = Array.from({ length: 12 }, (_, i) => {
  const m = String(i + 1).padStart(2, '0');
  const names = ['Januari','Februari','Maret','April','Mei','Juni','Juli','Agustus','September','Oktober','November','Desember'];
  return { value: m, label: names[i] };
});

interface Comment {
  id: string;
  name: string;
  message: string;
  replay_id: string;
  created_at: string;
}

export default function Admin() {
  const navigate = useNavigate();
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  const [replays, setReplays] = useState<ReplayRow[]>([]);
  const [masterPasswords, setMasterPasswords] = useState<MasterPasswordRow[]>([]);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingReplay, setEditingReplay] = useState<ReplayRow | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ReplayRow | null>(null);

  const [form, setForm] = useState({ title: '', showName: '', date: '', showTime: '19:00', criteria: 'reguler', featuredMember: '', lineup: '', password: '', adminAlias: '', youtubeId: '', youtubeAltId: '', imageUrl: '', sourceType: 'youtube', m3u8Url: '', sources: [] as PlaylistSource[], priceCoins: 1, priceIdr: 2000, imageFit: 'contain', shortTitle: '' });
  const [liveChatEnabled, setLiveChatEnabled] = useState(true);

  const [mpYear, setMpYear] = useState(String(new Date().getFullYear()));
  const [mpMonth, setMpMonth] = useState(String(new Date().getMonth() + 1).padStart(2, '0'));
  const [mpPassword, setMpPassword] = useState('');

  const [currentTheme, setCurrentTheme] = useState<ThemeType>('ramadhan');
  const [waNumber, setWaNumber] = useState('');
  const [waLink, setWaLink] = useState('');
  const [ownerWaNumber, setOwnerWaNumber] = useState('');
  const [staticQrisUrl, setStaticQrisUrl] = useState('');
  const [useStaticQris, setUseStaticQris] = useState(false);
  const [adminUsername, setAdminUsername] = useState('');
  const [canEditAdminUsername, setCanEditAdminUsername] = useState(false);
  const [acctEmail, setAcctEmail] = useState('');
  const [acctCurrentPw, setAcctCurrentPw] = useState('');
  const [acctNewPw, setAcctNewPw] = useState('');
  const [acctNewPw2, setAcctNewPw2] = useState('');
  const [acctSaving, setAcctSaving] = useState(false);


  // Comments state
  const [allComments, setAllComments] = useState<Comment[]>([]);
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Preview state
  const [previewReplay, setPreviewReplay] = useState<ReplayRow | null>(null);

  // Personal-token dialog
  const [personalTokenReplay, setPersonalTokenReplay] = useState<ReplayRow | null>(null);

  // Hamburger drawer
  const [activeTab, setActiveTab] = useState<string>('replays');
  const [menuOpen, setMenuOpen] = useState(false);
  // Blocked browsers
  const [blockedBrowsers, setBlockedBrowsers] = useState<Array<{ id: string; browser_id: string; reason: string; unblocked: boolean; created_at: string }>>([]);

  // Live state
  type LiveSrc = { label: string; type: 'm3u8' | 'youtube' | 'cloudflare'; url: string };
  const [liveCfg, setLiveCfg] = useState<{ enabled: boolean; title: string; type: string; url: string; password: string; require_password: boolean; sources: LiveSrc[]; lineup: string }>({
    enabled: false, title: 'Live', type: 'm3u8', url: '', password: '', require_password: true, sources: [], lineup: '',
  });
  const [members, setMembers] = useState<Member[]>([]);
  const [memberForm, setMemberForm] = useState<{ id?: string; name: string; photo_url: string }>({ name: '', photo_url: '' });
  const [memberUploading, setMemberUploading] = useState(false);
  const [memberSearch, setMemberSearch] = useState('');
  const [memberSort, setMemberSort] = useState<'az' | 'za' | 'newest' | 'oldest'>('az');
  const [liveTokens, setLiveTokens] = useState<Array<{ id: string; token: string; label: string; max_devices: number; revoked: boolean; devices_used: number }>>([]);
  
  const [newTokenMaxDevices, setNewTokenMaxDevices] = useState(1);
  const [liveSaving, setLiveSaving] = useState(false);

  // Active shows state
  const [activeShows, setActiveShows] = useState<ActiveShow[]>([]);
  const [showForm, setShowForm] = useState<{ id?: string; title: string; show_date: string; show_time: string; lineup: string; category: string; featured_member: string; description: string; image_url: string; sort_order: number; is_active: boolean; is_special: boolean; price_show: number; price_replay: number; price_show_coins: number; price_replay_coins: number; pakasir_amount: number; replay_id: string; replay_enabled: boolean; admin_alias: string }>({
    title: '', show_date: '', show_time: '19:00', lineup: '', category: 'reguler', featured_member: '', description: '', image_url: '', sort_order: 0, is_active: true, is_special: false,
    price_show: 0, price_replay: 0, price_show_coins: 0, price_replay_coins: 0, pakasir_amount: 0, replay_id: '', replay_enabled: false, admin_alias: '',
  });
  const [showEditing, setShowEditing] = useState(false);

  const refreshActiveShows = () => getActiveShows(true).then(setActiveShows);

  const resetShowForm = () => {
    setShowForm({ title: '', show_date: '', show_time: '19:00', lineup: '', category: 'reguler', featured_member: '', description: '', image_url: '', sort_order: 0, is_active: true, is_special: false, price_show: 0, price_replay: 0, price_show_coins: 0, price_replay_coins: 0, pakasir_amount: 0, replay_id: '', replay_enabled: false, admin_alias: '' });
    setShowEditing(false);
  };

  const handleSaveShow = async () => {
    if (!showForm.title.trim() || !showForm.show_date) {
      toast({ title: 'Lengkapi data', description: 'Judul dan tanggal wajib diisi.', variant: 'destructive' });
      return;
    }
    try {
      await upsertActiveShow({
        id: showForm.id,
        title: showForm.title.trim(),
        show_date: showForm.show_date,
        show_time: showForm.show_time || '19:00',
        lineup: showForm.lineup.split(',').map(s => s.trim()).filter(Boolean),
        category: showForm.category,
        featured_member: showForm.featured_member.trim(),
        description: showForm.description.trim(),
        image_url: showForm.image_url.trim(),
        sort_order: Number(showForm.sort_order) || 0,
        is_active: showForm.is_active,
        is_special: showForm.is_special,
        price_show: Number(showForm.price_show) || 0,
        price_replay: Number(showForm.price_replay) || 0,
        price_show_coins: Number(showForm.price_show_coins) || 0,
        price_replay_coins: Number(showForm.price_replay_coins) || 0,
        pakasir_amount: Number(showForm.pakasir_amount) || 0,
        replay_id: showForm.replay_id || null,
        replay_enabled: showForm.replay_enabled,
        admin_alias: showForm.admin_alias.trim().toLowerCase() || null,
      } as any);
      toast({ title: showForm.id ? 'Show diperbarui' : 'Show ditambahkan' });
      resetShowForm();
      refreshActiveShows();
    } catch (e: any) {
      toast({ title: 'Gagal menyimpan', description: e.message, variant: 'destructive' });
    }
  };

  const handleEditShow = (s: ActiveShow) => {
    setShowForm({
      id: s.id, title: s.title, show_date: s.show_date, show_time: s.show_time,
      lineup: s.lineup.join(', '), category: s.category, description: s.description,
      featured_member: s.featured_member || '',
      image_url: s.image_url, sort_order: s.sort_order, is_active: s.is_active, is_special: !!(s as any).is_special,
      price_show: s.price_show ?? 0, price_replay: s.price_replay ?? 0,
      price_show_coins: (s as any).price_show_coins ?? 0, price_replay_coins: (s as any).price_replay_coins ?? 0,
      pakasir_amount: s.pakasir_amount ?? 0, replay_id: s.replay_id ?? '',
      replay_enabled: s.replay_enabled ?? false,
      admin_alias: (s as any).admin_alias ?? '',
    });
    setShowEditing(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteShow = async (id: string) => {
    if (!confirm('Hapus show ini?')) return;
    try { await deleteActiveShow(id); toast({ title: 'Show dihapus' }); refreshActiveShows(); }
    catch (e: any) { toast({ title: 'Gagal', description: e.message, variant: 'destructive' }); }
  };


  const showFeaturedMember = form.criteria === 'sts' || form.criteria === 'last_show';

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setAcctEmail(session.user.email || '');

        supabase.from('user_roles').select('role').eq('user_id', session.user.id).eq('role', 'admin').maybeSingle().then(({ data }) => {
          if (data) setIsLoggedIn(true);
        });
        supabase.from('profiles').select('username,email').eq('user_id', session.user.id).maybeSingle().then(({ data }) => {
          const uname = (data?.username || '').trim().toLowerCase();
          const mail = (data?.email || '').trim().toLowerCase();
          setCanEditAdminUsername(uname === 'mod' || uname === 'dhy' || mail === 'dhy@01.com');
        });
      }
    });
  }, []);

  useEffect(() => {
    if (!isLoggedIn) return;
    refreshData();
    const channel = supabase
      .channel('admin-blocked-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocked_browsers' }, () => {
        supabase.from('blocked_browsers').select('*').order('created_at', { ascending: false }).then(({ data }) => {
          if (data) setBlockedBrowsers(data as any);
        });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [isLoggedIn]);

  const refreshData = async () => {
    try {
      const [r, m, settings] = await Promise.all([getReplaysAdmin(), getAllMasterPasswords(), getSettings()]);
      setReplays(r);
      setMasterPasswords(m);
      setCurrentTheme((settings.theme as ThemeType) || 'ramadhan');
      setWaNumber(settings.whatsapp_number || '');
      setWaLink(settings.whatsapp_link || '');
      setLiveChatEnabled((settings.live_chat_enabled ?? 'true') !== 'false');
      setAdminUsername(settings.admin_username || 'Admin');
      setOwnerWaNumber(settings.owner_wa_number || '6283899087711');
      setStaticQrisUrl(settings.static_qris_url || '');
      setUseStaticQris((settings.use_static_qris || 'false') === 'true');
      const { data: comments } = await supabase.from('comments').select('*').order('created_at', { ascending: false });
      if (comments) setAllComments(comments);
      const { data: blocks } = await supabase.from('blocked_browsers').select('*').order('created_at', { ascending: false });
      if (blocks) setBlockedBrowsers(blocks as any);
      void refreshLive();
      void refreshActiveShows();
    } catch {
      toast({ title: 'Error', description: 'Gagal memuat data.', variant: 'destructive' });
    }
  };

  const refreshLive = async () => {
    try {
      const [cfgRes, tokRes] = await Promise.all([
        supabase.functions.invoke('manage-live', { body: { action: 'get_config' } }),
        supabase.functions.invoke('manage-live', { body: { action: 'list_tokens' } }),
      ]);
      if (cfgRes.data?.config) {
        const c = cfgRes.data.config;
        setLiveCfg({ enabled: !!c.enabled, title: c.title || 'Live', type: c.type || 'm3u8', url: c.url || '', password: c.password || '', require_password: c.require_password !== false, sources: Array.isArray(c.sources) ? c.sources : [], lineup: Array.isArray(c.lineup) ? c.lineup.join(', ') : '' });
      }
      if (tokRes.data?.tokens) setLiveTokens(tokRes.data.tokens);
    } catch { /* ignore */ }
    try { setMembers(await getMembers()); } catch { /* ignore */ }
  };

  const handleSaveMember = async () => {
    const name = memberForm.name.trim();
    if (!name) { toast({ title: 'Error', description: 'Nama wajib diisi.', variant: 'destructive' }); return; }
    try {
      await upsertMember(name, memberForm.photo_url, memberForm.id);
      setMemberForm({ name: '', photo_url: '' });
      setMembers(await getMembers());
      toast({ title: 'Berhasil', description: 'Member tersimpan.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Gagal menyimpan member.', variant: 'destructive' });
    }
  };
  const handleDeleteMember = async (id: string) => {
    await deleteMember(id);
    setMembers(await getMembers());
    toast({ title: 'Dihapus' });
  };
  const handleMemberPhotoUpload = async (file: File) => {
    setMemberUploading(true);
    try {
      const url = await uploadMemberPhoto(file);
      setMemberForm(f => ({ ...f, photo_url: url }));
    } catch {
      toast({ title: 'Error', description: 'Gagal upload foto.', variant: 'destructive' });
    }
    setMemberUploading(false);
  };

  const handleSaveLive = async () => {
    setLiveSaving(true);
    try {
      const lineupArr = liveCfg.lineup.split(',').map(s => s.trim()).filter(Boolean);
      await supabase.functions.invoke('manage-live', { body: { action: 'set_config', ...liveCfg, lineup: lineupArr } });
      toast({ title: 'Berhasil', description: `Live ${liveCfg.enabled ? 'diaktifkan' : 'dinonaktifkan'}.` });
      await refreshLive();
    } catch {
      toast({ title: 'Error', description: 'Gagal menyimpan konfigurasi live.', variant: 'destructive' });
    }
    setLiveSaving(false);
  };

  const handleCreateLiveToken = async () => {
    try {
      await supabase.functions.invoke('manage-live', { body: { action: 'create_token', max_devices: newTokenMaxDevices } });
      setNewTokenMaxDevices(1);
      toast({ title: 'Berhasil', description: 'Token live dibuat.' });
      await refreshLive();
    } catch {
      toast({ title: 'Error', description: 'Gagal membuat token.', variant: 'destructive' });
    }
  };

  const handleDeleteLiveToken = async (id: string) => {
    await supabase.functions.invoke('manage-live', { body: { action: 'delete_token', id } });
    await refreshLive();
  };
  const handleRevokeLiveToken = async (id: string, revoked: boolean) => {
    await supabase.functions.invoke('manage-live', { body: { action: 'revoke_token', id, revoked } });
    toast({ title: 'Berhasil', description: revoked ? 'Token dicabut.' : 'Token diaktifkan kembali.' });
    await refreshLive();
  };
  const handleResetLiveDevices = async (id: string) => {
    await supabase.functions.invoke('manage-live', { body: { action: 'reset_devices', id } });
    toast({ title: 'Berhasil', description: 'Daftar perangkat token direset.' });
    await refreshLive();
  };
  const copyLiveTokenLink = async (token: string) => {
    const url = `${window.location.origin}/live?t=${token}`;
    try { await navigator.clipboard.writeText(url); toast({ title: 'Tersalin', description: 'Link live disalin.' }); } catch { /* ignore */ }
  };

  const handleUnblockBrowser = async (id: string) => {
    const { error } = await supabase.from('blocked_browsers').update({ unblocked: true }).eq('id', id);
    if (error) {
      toast({ title: 'Error', description: 'Gagal membuka blokir.', variant: 'destructive' });
    } else {
      toast({ title: 'Berhasil', description: 'Akses user dibuka kembali.' });
      await refreshData();
    }
  };

  const handleDeleteBlock = async (id: string) => {
    const { error } = await supabase.from('blocked_browsers').delete().eq('id', id);
    if (error) {
      toast({ title: 'Error', description: 'Gagal menghapus.', variant: 'destructive' });
    } else {
      await refreshData();
    }
  };

  const handleLogin = async () => {
    setLoginLoading(true);
    setLoginError('');
    const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPassword });
    if (error) { setLoginError('Email atau sandi salah!'); setLoginLoading(false); return; }
    const { data: roleData } = await supabase.from('user_roles').select('role').eq('user_id', data.user.id).eq('role', 'admin').maybeSingle();
    if (!roleData) { setLoginError('Akun ini bukan admin.'); await supabase.auth.signOut(); setLoginLoading(false); return; }
    setIsLoggedIn(true);
    setLoginLoading(false);
  };

  const handleLogout = async () => { await supabase.auth.signOut(); setIsLoggedIn(false); };

  const resetForm = () => {
    setForm({ title: '', showName: '', date: '', showTime: '19:00', criteria: 'reguler', featuredMember: '', lineup: '', password: '', adminAlias: '', youtubeId: '', youtubeAltId: '', imageUrl: '', sourceType: 'youtube', m3u8Url: '', sources: [], priceCoins: 1, priceIdr: 2000, imageFit: 'contain', shortTitle: '' });
    setEditingReplay(null);
  };

  const handleSaveReplay = async () => {
    const isYoutube = form.sourceType === 'youtube';
    // Normalisasi URL/ID YouTube ke ID 11 karakter
    const normalizedYoutubeId = isYoutube ? (parseYouTubeId(form.youtubeId) || '') : '';
    if (isYoutube && form.youtubeId.trim() && !normalizedYoutubeId) {
      toast({ title: 'YouTube tidak valid', description: 'Format YouTube fallback tidak dikenali. Periksa link/ID.', variant: 'destructive' });
      return;
    }
    // Normalisasi setiap source playlist bertipe youtube
    const normalizedSources = form.sources.map(s => {
      if (s.type !== 'youtube') return s;
      const id = parseYouTubeId(s.url) || '';
      return { ...s, url: id };
    });
    const invalidYt = form.sources.find(s => s.type === 'youtube' && s.url.trim() && !parseYouTubeId(s.url));
    if (invalidYt) {
      toast({ title: 'YouTube tidak valid', description: `Playlist "${invalidYt.label || 'tanpa label'}" memiliki format YouTube yang tidak dikenali.`, variant: 'destructive' });
      return;
    }
    const hasSources = normalizedSources.length > 0;
    const fallbackOk = isYoutube ? !!normalizedYoutubeId : !!form.m3u8Url;
    if (!form.title || !form.date || !form.password || (!hasSources && !fallbackOk)) {
      toast({ title: 'Error', description: 'Judul, tanggal, sandi, dan minimal 1 sumber video wajib diisi!', variant: 'destructive' });
      return;
    }
    const lineupArr = form.lineup.split(',').map(s => s.trim()).filter(Boolean);
    try {
      const payload = {
        title: form.title, show_name: form.showName, date: form.date, show_time: form.showTime + ':00', criteria: form.criteria,
        featured_member: showFeaturedMember ? form.featuredMember : '',
        short_title: form.shortTitle.trim().toUpperCase(),
        lineup: lineupArr, password: form.password,
        admin_alias: form.adminAlias.trim(),
        youtube_id: normalizedYoutubeId,
        youtube_alt_id: form.youtubeAltId.trim() ? (parseYouTubeId(form.youtubeAltId) || form.youtubeAltId.trim()) : '',
        image_url: form.imageUrl,
        source_type: form.sourceType,
        m3u8_url: isYoutube ? '' : form.m3u8Url,
        sources: normalizedSources as any,
        price_coins: Number.isFinite(Number(form.priceCoins)) ? Math.max(0, Number(form.priceCoins)) : 1,
        price_idr: Number.isFinite(Number(form.priceIdr)) ? Math.max(0, Number(form.priceIdr)) : 2000,
        image_fit: form.imageFit || 'contain',
      };
      if (editingReplay) {
        await updateReplay(editingReplay.id, payload);
        toast({ title: 'Berhasil', description: 'Replay berhasil diperbarui!' });
      } else {
        await addReplay(payload);
        toast({ title: 'Berhasil', description: 'Replay baru berhasil ditambahkan!' });
      }
      resetForm();
      setShowAddDialog(false);
      await refreshData();
    } catch {
      toast({ title: 'Error', description: 'Gagal menyimpan replay.', variant: 'destructive' });
    }
  };

  const handleEditReplay = (r: ReplayRow) => {
    setEditingReplay(r);
    setForm({
      title: r.title, showName: r.show_name, date: r.date, showTime: (r.show_time || '19:00:00').slice(0, 5), criteria: r.criteria,
      featuredMember: r.featured_member, lineup: r.lineup.join(', '), password: r.password,
      adminAlias: ((r as any).admin_alias as string) || '',
      youtubeId: r.youtube_id, youtubeAltId: ((r as any).youtube_alt_id as string) || '', imageUrl: r.image_url,
      sourceType: (r as any).source_type || 'youtube', m3u8Url: (r as any).m3u8_url || '',
      sources: Array.isArray((r as any).sources) ? (r as any).sources : [],
      priceCoins: ((r as any).price_coins ?? 1),
      priceIdr: ((r as any).price_idr ?? 2000),
      imageFit: ((r as any).image_fit as string) || 'contain',
      shortTitle: ((r as any).short_title as string) || '',
    });
    setShowAddDialog(true);
  };

  const confirmDeleteReplay = async () => {
    if (!deleteTarget) return;
    try {
      await deleteReplay(deleteTarget.id);
      toast({ title: 'Dihapus', description: 'Replay berhasil dihapus.' });
      setDeleteTarget(null);
      await refreshData();
    } catch {
      toast({ title: 'Error', description: 'Gagal menghapus replay.', variant: 'destructive' });
    }
  };

  const handleSaveMasterPassword = async () => {
    if (!mpPassword) return;
    const key = `${mpYear}-${mpMonth}`;
    try {
      await setMasterPassword(key, mpPassword);
      toast({ title: 'Berhasil', description: `Sandi master untuk ${mpMonth}/${mpYear} berhasil disimpan!` });
      setMpPassword('');
      await refreshData();
    } catch {
      toast({ title: 'Error', description: 'Gagal menyimpan sandi master.', variant: 'destructive' });
    }
  };

  const handleToggleMasterPaused = async (id: string, month: string, paused: boolean) => {
    try {
      await setMasterPasswordPaused(id, paused);
      toast({ title: 'Berhasil', description: paused ? `Sandi master ${month} dijeda.` : `Sandi master ${month} diaktifkan kembali.` });
      await refreshData();
    } catch {
      toast({ title: 'Error', description: 'Gagal mengubah status sandi master.', variant: 'destructive' });
    }
  };

  const handleDeleteMasterPassword = async (id: string, month: string) => {
    try {
      await deleteMasterPassword(id);
      toast({ title: 'Berhasil', description: `Sandi master ${month} dihapus.` });
      await refreshData();
    } catch {
      toast({ title: 'Error', description: 'Gagal menghapus sandi master.', variant: 'destructive' });
    }
  };

  const handleSaveTheme = async (theme: ThemeType) => {
    setCurrentTheme(theme);
    await setSetting('theme', theme);
    toast({ title: 'Berhasil', description: 'Tema berhasil diubah!' });
  };

  const handleSaveWhatsApp = async () => {
    try {
      await Promise.all([setSetting('whatsapp_number', waNumber), setSetting('whatsapp_link', waLink)]);
      toast({ title: 'Berhasil', description: 'Info WhatsApp berhasil disimpan!' });
    } catch {
      toast({ title: 'Error', description: 'Gagal menyimpan info WhatsApp.', variant: 'destructive' });
    }
  };

  const handleSavePakasirFallback = async () => {
    try {
      const num = adminWaNumber(ownerWaNumber);
      await Promise.all([
        setSetting('owner_wa_number', num),
        // Keep the legacy key in sync so every "Hubungi Admin" surface uses the new number.
        setSetting('admin_wa_phone', num),
        setSetting('static_qris_url', staticQrisUrl),
        setSetting('use_static_qris', useStaticQris ? 'true' : 'false'),
      ]);
      toast({ title: 'Berhasil', description: 'Pengaturan QRIS statis & nomor admin tersimpan.' });
    } catch (e: any) {
      toast({ title: 'Error', description: e?.message || 'Gagal menyimpan pengaturan.', variant: 'destructive' });
    }
  };


  const handleToggleLiveChat = async (enabled: boolean) => {
    setLiveChatEnabled(enabled);
    try {
      await setSetting('live_chat_enabled', enabled ? 'true' : 'false');
      toast({ title: 'Berhasil', description: `Live chat ${enabled ? 'diaktifkan' : 'dinonaktifkan'}.` });
    } catch {
      toast({ title: 'Error', description: 'Gagal menyimpan setelan.', variant: 'destructive' });
    }
  };

  const handleSaveAdminUsername = async () => {
    const name = (adminUsername || '').trim();
    if (!name) {
      toast({ title: 'Error', description: 'Username admin tidak boleh kosong.', variant: 'destructive' });
      return;
    }
    try {
      await setSetting('admin_username', name);
      toast({ title: 'Berhasil', description: `Username admin disimpan: ${name}` });
    } catch {
      toast({ title: 'Error', description: 'Gagal menyimpan username admin.', variant: 'destructive' });
    }
  };

  const handleSaveAdminAccount = async () => {
    const email = (acctEmail || '').trim().toLowerCase();
    if (!acctCurrentPw) {
      toast({ title: 'Error', description: 'Masukkan sandi saat ini untuk konfirmasi.', variant: 'destructive' });
      return;
    }
    if (acctNewPw && acctNewPw.length < 8) {
      toast({ title: 'Error', description: 'Sandi baru minimal 8 karakter.', variant: 'destructive' });
      return;
    }
    if (acctNewPw && acctNewPw !== acctNewPw2) {
      toast({ title: 'Error', description: 'Konfirmasi sandi baru tidak cocok.', variant: 'destructive' });
      return;
    }
    setAcctSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-self-credentials', {
        body: { current_password: acctCurrentPw, email, password: acctNewPw || undefined },
      });
      const d = data as any;
      if (error || d?.error) {
        toast({ title: 'Gagal', description: d?.message || d?.error || error?.message || 'Gagal memperbarui akun.', variant: 'destructive' });
        return;
      }
      setAcctCurrentPw(''); setAcctNewPw(''); setAcctNewPw2('');
      toast({ title: 'Berhasil', description: 'Akun admin diperbarui. Silakan login ulang dengan data baru.' });
      await supabase.auth.signOut();
      setIsLoggedIn(false);
      setLoginEmail(email);
      setLoginPassword('');
    } finally {
      setAcctSaving(false);
    }
  };



  const handleGenerateToken = async (r: ReplayRow) => {
    const token = (crypto as any).randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36);
    try {
      await setReplayAccessToken(r.id, token);
      const url = `${window.location.origin}/?token=${token}&replay=${r.id}`;
      try { await navigator.clipboard.writeText(url); } catch { /* ignore */ }
      toast({ title: 'Token dibuat', description: 'Link akses telah disalin ke clipboard.' });
      await refreshData();
    } catch {
      toast({ title: 'Error', description: 'Gagal membuat token.', variant: 'destructive' });
    }
  };

  const handleRevokeToken = async (r: ReplayRow) => {
    try {
      await setReplayAccessToken(r.id, null);
      toast({ title: 'Dihapus', description: 'Token akses telah dicabut.' });
      await refreshData();
    } catch {
      toast({ title: 'Error', description: 'Gagal mencabut token.', variant: 'destructive' });
    }
  };

  const copyTokenUrl = async (r: ReplayRow) => {
    const tk = (r as any).access_token;
    if (!tk) return;
    const url = `${window.location.origin}/?token=${tk}&replay=${r.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({ title: 'Tersalin', description: 'Link akses disalin ke clipboard.' });
    } catch {
      toast({ title: 'Error', description: 'Gagal menyalin.', variant: 'destructive' });
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    const { error } = await supabase.from('comments').delete().eq('id', commentId);
    if (error) {
      toast({ title: 'Error', description: 'Gagal menghapus komentar.', variant: 'destructive' });
    } else {
      setAllComments(prev => prev.filter(c => c.id !== commentId));
      toast({ title: 'Dihapus', description: 'Komentar berhasil dihapus.' });
    }
  };

  const handleReplyComment = async () => {
    if (!replyingTo || !replyText.trim()) return;
    setSendingReply(true);
    const { error } = await supabase.from('comments').insert({
      replay_id: replyingTo.replay_id,
      name: `🛡️ ${(adminUsername || 'Admin').trim()}`,
      message: replyText.trim(),
    });
    if (error) {
      toast({ title: 'Error', description: 'Gagal membalas komentar.', variant: 'destructive' });
    } else {
      toast({ title: 'Terkirim', description: 'Balasan berhasil dikirim.' });
      setReplyingTo(null);
      setReplyText('');
      await refreshData();
    }
    setSendingReply(false);
  };

  const getCriteriaLabel = (val: string) => CRITERIA_OPTIONS.find(c => c.value === val)?.label || val;

  const getReplayTitle = (replayId: string) => replays.find(r => r.id === replayId)?.title || 'Replay tidak ditemukan';

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Baru saja';
    if (mins < 60) return `${mins}m lalu`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}j lalu`;
    const days = Math.floor(hours / 24);
    return `${days}h lalu`;
  };

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-sm">
          <CardHeader><CardTitle className="text-center font-sans">Admin Panel</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div><Label>Email Admin</Label><Input type="email" placeholder="admin@email.com" value={loginEmail} onChange={e => { setLoginEmail(e.target.value); setLoginError(''); }} /></div>
            <div><Label>Sandi</Label><Input type="password" placeholder="Masukkan sandi..." value={loginPassword} onChange={e => { setLoginPassword(e.target.value); setLoginError(''); }} onKeyDown={e => e.key === 'Enter' && handleLogin()} /></div>
            {loginError && <p className="text-sm text-destructive">{loginError}</p>}
            <Button className="w-full" onClick={handleLogin} disabled={loginLoading}>{loginLoading ? 'Memproses...' : 'Masuk'}</Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate('/')}><ArrowLeft className="w-4 h-4 mr-2" /> Kembali</Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      {/* Header with hamburger */}
      <div className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border px-3 sm:px-6 py-3 flex items-center gap-2 sm:gap-3">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0" title="Menu"><Menu className="w-5 h-5" /></Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[82vw] max-w-xs p-0 flex flex-col">
            <SheetHeader className="p-4 border-b border-border shrink-0">
              <SheetTitle>Admin Panel</SheetTitle>
            </SheetHeader>
            <nav className="flex-1 overflow-y-auto overscroll-contain p-2 pb-6">
              {[
                { v: 'replays', label: 'Replay', Icon: List },
                { v: 'shows', label: 'Streaming Show', Icon: Radio },
                { v: 'members', label: 'Member', Icon: Users },
                { v: 'bot', label: 'Bot WhatsApp', Icon: Bot },
                { v: 'history', label: 'Riwayat Token', Icon: History },
                { v: 'reseller_audit', label: 'Reseller', Icon: ClipboardList },
                { v: 'membership', label: 'Membership', Icon: Users },
                { v: 'live_monitor', label: 'Live & Buat Link', Icon: Radio },
                { v: 'token_factory', label: 'Token Factory', Icon: Key },
                { v: 'bundle', label: 'Bundel Show', Icon: Key },
                { v: 'mb_proofs', label: 'Bukti Transaksi', Icon: Upload },
                { v: 'replay_off', label: 'Replay Off', Icon: Eye },
                { v: 'pakasir', label: 'Pakasir Webhook', Icon: Settings },
                { v: 'coins', label: 'Koin', Icon: Sparkles },
                { v: 'game', label: 'Game & Hadiah', Icon: Sparkles },
                { v: 'users', label: 'Manajemen User', Icon: Users },
                { v: 'preview', label: 'Preview', Icon: Eye },
                { v: 'comments', label: 'Komentar', Icon: MessageCircle },
                { v: 'security', label: 'Keamanan', Icon: ShieldCheck },
                { v: 'settings', label: 'Setelan', Icon: Settings },
              ].map(({ v, label, Icon }) => (
                <button
                  key={v}
                  onClick={() => { setActiveTab(v); setMenuOpen(false); }}
                  className={`flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm transition-colors ${(
                    activeTab === v ||
                    (v === 'reseller_audit' && ['reseller_billing', 'reseller_pricing'].includes(activeTab)) ||
                    (v === 'membership' && ['mb_users', 'mb_packages'].includes(activeTab)) ||
                    (v === 'security' && activeTab === 'ip_manager')
                  ) ? 'bg-primary/15 text-primary font-medium' : 'text-foreground hover:bg-secondary'}`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="min-w-0 truncate">{label}</span>
                </button>
              ))}
            </nav>
          </SheetContent>
        </Sheet>
        <Button variant="ghost" size="icon" onClick={() => navigate('/')} className="shrink-0" title="Beranda"><ArrowLeft className="w-5 h-5" /></Button>
        <h1 className="text-base sm:text-xl font-bold font-sans text-foreground flex-1 min-w-0 truncate">Admin · {(['reseller_audit', 'reseller_billing', 'reseller_pricing'].includes(activeTab) ? 'Reseller' : ['membership', 'mb_users', 'mb_packages'].includes(activeTab) ? 'Membership' : ['security', 'ip_manager'].includes(activeTab) ? 'Keamanan' : ({ replays: 'Replay', shows: 'Streaming Show', members: 'Member', bot: 'Bot WA', history: 'Riwayat', live_monitor: 'Live & Buat Link', token_factory: 'Token Factory', bundle: 'Bundel Show', mb_proofs: 'Bukti Transaksi', replay_off: 'Replay Off', pakasir: 'Pakasir Webhook', coins: 'Koin', game: 'Game & Hadiah', users: 'Manajemen User', preview: 'Preview', comments: 'Komentar', settings: 'Setelan' } as Record<string, string>)[activeTab])}</h1>
        <div className="flex items-center gap-1 sm:gap-2 shrink-0">
          <Button size="sm" onClick={() => { resetForm(); setShowAddDialog(true); }} className="text-xs sm:text-sm">
            <Plus className="w-4 h-4 sm:mr-1" /> <span className="hidden sm:inline">Tambah</span>
          </Button>
          <Button variant="ghost" size="icon" onClick={handleLogout} title="Logout"><LogOut className="w-5 h-5" /></Button>
        </div>
      </div>

      <div className="w-full max-w-6xl mx-auto px-2 sm:px-4 py-4 overflow-x-hidden">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="hidden">
            <TabsTrigger value="replays" /><TabsTrigger value="shows" /><TabsTrigger value="members" /><TabsTrigger value="bot" /><TabsTrigger value="history" /><TabsTrigger value="reseller_audit" /><TabsTrigger value="reseller_billing" /><TabsTrigger value="reseller_pricing" /><TabsTrigger value="membership" /><TabsTrigger value="mb_users" /><TabsTrigger value="token_factory" /><TabsTrigger value="live_monitor" /><TabsTrigger value="mb_packages" /><TabsTrigger value="mb_proofs" /><TabsTrigger value="replay_off" /><TabsTrigger value="pakasir" /><TabsTrigger value="coins" /><TabsTrigger value="game" /><TabsTrigger value="users" /><TabsTrigger value="preview" /><TabsTrigger value="comments" /><TabsTrigger value="security" /><TabsTrigger value="ip_manager" /><TabsTrigger value="settings" />
          </TabsList>

          {(['reseller_audit', 'reseller_billing', 'reseller_pricing'].includes(activeTab) || ['membership', 'mb_users', 'mb_packages'].includes(activeTab) || ['security', 'ip_manager'].includes(activeTab)) && (
            <div className="mb-4 flex gap-1 overflow-x-auto rounded-md border border-border bg-card p-1">
              {(
                ['reseller_audit', 'reseller_billing', 'reseller_pricing'].includes(activeTab)
                  ? [{ v: 'reseller_audit', l: 'Audit' }, { v: 'reseller_billing', l: 'Tagihan' }, { v: 'reseller_pricing', l: 'Harga' }]
                  : ['membership', 'mb_users', 'mb_packages'].includes(activeTab)
                    ? [{ v: 'membership', l: 'Token' }, { v: 'mb_users', l: 'User' }, { v: 'mb_packages', l: 'Paket' }]
                    : [{ v: 'security', l: 'Blokir' }, { v: 'ip_manager', l: 'IP & Rate Limit' }]
              ).map((item) => (
                <Button key={item.v} type="button" size="sm" variant={activeTab === item.v ? 'default' : 'ghost'} className="shrink-0" onClick={() => setActiveTab(item.v)}>{item.l}</Button>
              ))}
            </div>
          )}

          <TabsContent value="bot"><BotAdmin /></TabsContent>
          <TabsContent value="history"><TokenHistoryAdmin /></TabsContent>
          <TabsContent value="reseller_audit"><ResellerAuditAdmin /></TabsContent>
          <TabsContent value="reseller_billing"><ResellerBillingAdmin /></TabsContent>
          <TabsContent value="reseller_pricing"><ResellerPricingAdmin /></TabsContent>
          <TabsContent value="membership"><MembershipAdmin /></TabsContent>
          <TabsContent value="mb_users"><MembershipUsersAdmin /></TabsContent>
          <TabsContent value="token_factory"><TokenFactoryAdmin /></TabsContent>
          <TabsContent value="live_monitor"><LiveMonitorAdmin /></TabsContent>
          <TabsContent value="bundle"><ShowBundleAdmin /></TabsContent>
          <TabsContent value="mb_packages"><MembershipPackagesAdmin /></TabsContent>
          <TabsContent value="mb_proofs"><MembershipProofsAdmin /></TabsContent>
          <TabsContent value="replay_off"><ReplayOffAdmin /></TabsContent>
          <TabsContent value="pakasir"><PakasirAdmin /></TabsContent>
          <TabsContent value="coins"><CoinAdmin /></TabsContent>
          <TabsContent value="game"><GameAdmin /></TabsContent>
          <TabsContent value="users"><UserManagement /></TabsContent>
          <TabsContent value="ip_manager"><IpManager /></TabsContent>

          {/* ===== REPLAYS TAB ===== */}
          <TabsContent value="replays">
            <Card>
              <CardHeader><CardTitle className="font-sans text-base sm:text-lg">Daftar Replay ({replays.length})</CardTitle></CardHeader>
              <CardContent>
                {replays.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Belum ada replay.</p>
                ) : (
                  <div className="space-y-2">
                    {replays.map(r => {
                      const tk = (r as any).access_token as string | null;
                      return (
                        <div key={r.id} className="p-2 sm:p-3 rounded-lg bg-secondary/50 border border-border space-y-2">
                          <div className="flex items-center gap-2 sm:gap-4">
                            {r.image_url && <img src={r.image_url} alt="" className="w-12 h-8 sm:w-16 sm:h-10 rounded object-cover shrink-0" />}
                            <div className="flex-1 min-w-0">
                              <p className="font-medium text-sm sm:text-base truncate">{r.title}</p>
                              <p className="text-xs text-muted-foreground truncate">
                                {new Date(r.date).toLocaleDateString('id-ID')} · {getCriteriaLabel(r.criteria)}
                                {r.featured_member && ` · ⭐ ${r.featured_member}`}
                                {' · 👁 '}{r.view_count || 0}
                              </p>
                            </div>
                            <div className="flex gap-1 shrink-0">
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setPreviewReplay(r)}><Eye className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditReplay(r)}><Edit2 className="w-4 h-4" /></Button>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(r)}><Trash2 className="w-4 h-4" /></Button>
                            </div>
                          </div>
                          <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-border/50">
                            <Link2 className="w-3.5 h-3.5 text-primary" />
                            <span className="text-[11px] text-muted-foreground">Token akses:</span>
                            {tk ? (
                              <>
                                <code className="text-[10px] px-1.5 py-0.5 rounded bg-background border border-border break-all max-w-[200px] truncate">{tk}</code>
                                <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => copyTokenUrl(r)}>
                                  <Copy className="w-3 h-3 mr-1" />Salin link
                                </Button>
                                <Button variant="ghost" size="sm" className="h-6 text-[10px] px-2 text-destructive" onClick={() => handleRevokeToken(r)}>
                                  <X className="w-3 h-3 mr-1" />Cabut
                                </Button>
                              </>
                            ) : (
                              <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => handleGenerateToken(r)}>
                                <Plus className="w-3 h-3 mr-1" />Buat token
                              </Button>
                            )}
                            <Button variant="outline" size="sm" className="h-6 text-[10px] px-2" onClick={() => setPersonalTokenReplay(r)}>
                              <Lock className="w-3 h-3 mr-1" />Token satuan
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== ACTIVE SHOWS TAB ===== */}
          <TabsContent value="shows" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2">
                  <Sparkles className="w-5 h-5" /> {showEditing ? 'Edit Show Aktif' : 'Tambah Show Aktif'}
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Judul Show *</Label>
                  <Input value={showForm.title} onChange={e => setShowForm({ ...showForm, title: e.target.value })} placeholder="Misal: Aturan Anti Cinta" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Tanggal Show *</Label>
                    <Input type="date" value={showForm.show_date} onChange={e => setShowForm({ ...showForm, show_date: e.target.value })} />
                  </div>
                  <div>
                    <Label>Jam Show</Label>
                    <Input type="time" value={showForm.show_time} onChange={e => setShowForm({ ...showForm, show_time: e.target.value })} />
                  </div>
                </div>
                <div>
                  <Label>Kategori</Label>
                  <select value={showForm.category} onChange={e => setShowForm({ ...showForm, category: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    {CRITERIA_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                {(showForm.category === 'sts' || showForm.category === 'last_show') && (
                  <div>
                    <Label htmlFor="show-featured-member">{showForm.category === 'sts' ? 'Member yang Ulang Tahun' : 'Member yang Graduate'}</Label>
                    <Input id="show-featured-member" list="member-names" value={showForm.featured_member} onChange={e => setShowForm({ ...showForm, featured_member: e.target.value })} placeholder="Nama member" />
                  </div>
                )}
                <div>
                  <Label>Lineup Member (pisahkan dengan koma)</Label>
                  <Input value={showForm.lineup} onChange={e => setShowForm({ ...showForm, lineup: e.target.value })} placeholder="Freya, Christy, Gracia" />
                </div>
                <div>
                  <Label>Deskripsi</Label>
                  <Input value={showForm.description} onChange={e => setShowForm({ ...showForm, description: e.target.value })} placeholder="Deskripsi singkat show" />
                </div>
                <div>
                  <Label>Alias Admin (untuk command bot)</Label>
                  <Input value={showForm.admin_alias} onChange={e => setShowForm({ ...showForm, admin_alias: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })} placeholder="contoh: aac1" />
                  <p className="text-[11px] text-muted-foreground mt-1">Pakai di bot: <code>/createlink {showForm.admin_alias || 'alias'}</code> atau <code>/createpub {showForm.admin_alias || 'alias'}</code></p>
                </div>
                <div>
                  <Label>Gambar Show</Label>
                  <ImagePicker value={showForm.image_url} autoMatchTitle={showForm.title} onChange={url => setShowForm({ ...showForm, image_url: url })} />
                </div>
                <div className="grid grid-cols-2 gap-3 items-end">
                  <div>
                    <Label>Urutan Tampil</Label>
                    <Input type="number" value={showForm.sort_order} onChange={e => setShowForm({ ...showForm, sort_order: Number(e.target.value) })} />
                  </div>
                  <div className="flex items-center gap-2 h-10">
                    <Switch checked={showForm.is_active} onCheckedChange={v => setShowForm({ ...showForm, is_active: v })} />
                    <span className="text-sm">Tampilkan di landing</span>
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
                  <Switch checked={showForm.is_special} onCheckedChange={v => setShowForm({ ...showForm, is_special: v })} />
                  <div className="flex-1">
                    <p className="text-sm font-medium">Show Spesial (pin paling atas)</p>
                    <p className="text-[11px] text-muted-foreground">Show ini akan ditampilkan di urutan paling atas halaman Shows.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/40">
                  <div>
                    <Label>Harga Show (Rp)</Label>
                    <Input type="number" min={0} value={showForm.price_show} onChange={e => setShowForm({ ...showForm, price_show: Number(e.target.value) })} placeholder="0" />
                    <p className="text-[11px] text-muted-foreground mt-1">Nominal QRIS Pakasir saat user beli show.</p>
                  </div>
                  <div>
                    <Label>Harga Replay (Rp)</Label>
                    <Input type="number" min={0} value={showForm.price_replay} onChange={e => setShowForm({ ...showForm, price_replay: Number(e.target.value) })} placeholder="0" />
                    <p className="text-[11px] text-muted-foreground mt-1">Default Rp 2.000 jika kosong.</p>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3 pt-2 border-t border-border/40">
                  <div>
                    <Label>Harga Show (Koin)</Label>
                    <Input type="number" min={0} value={showForm.price_show_coins} onChange={e => setShowForm({ ...showForm, price_show_coins: Number(e.target.value) })} placeholder="0" />
                    <p className="text-[11px] text-muted-foreground mt-1">0 = nonaktif (tab Koin disembunyikan).</p>
                  </div>
                  <div>
                    <Label>Harga Replay (Koin)</Label>
                    <Input type="number" min={0} value={showForm.price_replay_coins} onChange={e => setShowForm({ ...showForm, price_replay_coins: Number(e.target.value) })} placeholder="0" />
                    <p className="text-[11px] text-muted-foreground mt-1">0 = nonaktif.</p>
                  </div>
                </div>
                <div>
                  <Label>Pakasir Amount (Rp) — fallback opsional</Label>
                  <Input type="number" min={0} value={showForm.pakasir_amount} onChange={e => setShowForm({ ...showForm, pakasir_amount: Number(e.target.value) })} placeholder="Kosongkan jika tidak perlu" />
                  <p className="text-[11px] text-muted-foreground mt-1">Hanya dipakai bila Harga Show / Harga Replay di atas kosong.</p>
                </div>
                <div>
                  <Label>Replay Terkait</Label>
                  <select value={showForm.replay_id} onChange={e => setShowForm({ ...showForm, replay_id: e.target.value })}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
                    <option value="">— Belum ada replay —</option>
                    {replays.map(r => <option key={r.id} value={r.id}>{r.title} ({r.date})</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/40 border border-border">
                  <div>
                    <Label className="text-sm">Aktifkan Mode Replay</Label>
                    <p className="text-[11px] text-muted-foreground">Saat ON, kartu show otomatis arahkan ke halaman replay terkait.</p>
                  </div>
                  <Switch checked={showForm.replay_enabled} onCheckedChange={v => setShowForm({ ...showForm, replay_enabled: v })} disabled={!showForm.replay_id} />
                </div>
                {showEditing && showForm.id && (
                  <ShowLiveControl showId={showForm.id} showTitle={showForm.title} />
                )}
                <div className="flex gap-2 pt-2">
                  <Button onClick={handleSaveShow} className="flex-1"><Save className="w-4 h-4 mr-2" />{showEditing ? 'Update' : 'Tambah'}</Button>
                  {showEditing && <Button variant="outline" onClick={resetShowForm}>Batal</Button>}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 flex-wrap">
                <CardTitle className="font-sans text-base sm:text-lg">Daftar Show ({activeShows.length})</CardTitle>
                <BulkShowImport onImported={refreshActiveShows} />
              </CardHeader>
              <CardContent>
                {activeShows.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Belum ada show aktif.</p>
                ) : (
                  <div className="space-y-2">
                    {activeShows.map(s => (
                      <div key={s.id} className={`p-2 sm:p-3 rounded-lg border space-y-2 ${s.is_live ? 'bg-red-500/10 border-red-500/40' : 'bg-secondary/50 border-border'}`}>
                        <div className="flex items-center gap-3">
                          {s.image_url && <img src={s.image_url} alt="" className="w-12 h-8 sm:w-16 sm:h-10 rounded object-cover shrink-0" />}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <p className="font-medium text-sm sm:text-base truncate">{s.title}</p>
                              {s.is_live && <Badge className="text-[10px] bg-red-600 text-white animate-pulse"><Radio className="w-2.5 h-2.5 mr-0.5 inline" />ON AIR</Badge>}
                              {!s.is_active && <Badge variant="outline" className="text-[10px]">Off</Badge>}
                            </div>
                            <p className="text-xs text-muted-foreground truncate">
                              <Calendar className="w-3 h-3 inline mr-1" />
                              {new Date(`${s.show_date}T${s.show_time}`).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                              {' · '}{getCriteriaLabel(s.category)}
                              {s.lineup.length > 0 && ` · ${s.lineup.length} member`}
                            </p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditShow(s)} title="Edit"><Edit2 className="w-4 h-4" /></Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteShow(s.id)} title="Hapus"><Trash2 className="w-4 h-4" /></Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-border/40">
                          <div className="flex items-center gap-2 px-2 py-1 rounded bg-card border border-border">
                            <Radio className={`w-3.5 h-3.5 ${s.is_live ? 'text-red-500' : 'text-muted-foreground'}`} />
                            <span className="text-xs font-medium">LIVE</span>
                            <Switch
                              checked={!!s.is_live}
                              onCheckedChange={async (v) => {
                                try {
                                  await upsertActiveShow({ id: s.id, is_live: v } as any);
                                  toast({ title: v ? `🔴 ${s.title} sedang LIVE` : 'Live dinonaktifkan' });
                                  refreshActiveShows();
                                } catch (e: any) {
                                  toast({ title: 'Gagal', description: e.message, variant: 'destructive' });
                                }
                              }}
                            />
                          </div>
                          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => window.open(`/live?show=${s.id}`, '_blank')}>
                            <Eye className="w-3 h-3 mr-1" />Buka Player
                          </Button>
                          <Button variant="outline" size="sm" className="h-7 text-[11px]" onClick={() => { handleEditShow(s); }}>
                            <Settings className="w-3 h-3 mr-1" />Detail Live & Token
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== LIVE TAB removed — merged into Streaming Show ===== */}
          {/* ===== PREVIEW TAB ===== */}
          {/* ===== MEMBERS TAB ===== */}
          <TabsContent value="members">
            <Card>
              <CardHeader><CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2"><Users className="w-5 h-5 text-primary" />Daftar Member ({members.length})</CardTitle></CardHeader>
              <CardContent className="space-y-4">
                <div className="p-3 rounded-lg border border-border bg-secondary/40 space-y-2">
                  <div className="flex items-start gap-3">
                    <div className="w-16 h-16 rounded-full overflow-hidden border border-border bg-card shrink-0 flex items-center justify-center">
                      {memberForm.photo_url ? (
                        <img src={memberForm.photo_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <Users className="w-6 h-6 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 space-y-2">
                      <Input placeholder="Nama member (cth: Alya)" value={memberForm.name} onChange={e => setMemberForm(f => ({ ...f, name: e.target.value }))} />
                      <div className="flex gap-2">
                        <input type="file" accept="image/*" id="mph" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) handleMemberPhotoUpload(f); }} />
                        <Button variant="outline" size="sm" onClick={() => document.getElementById('mph')?.click()} disabled={memberUploading}>
                          <Upload className="w-3.5 h-3.5 mr-1" />{memberUploading ? 'Upload...' : 'Foto'}
                        </Button>
                        <Button size="sm" onClick={handleSaveMember}><Save className="w-3.5 h-3.5 mr-1" />{memberForm.id ? 'Update' : 'Tambah'}</Button>
                        {memberForm.id && <Button variant="ghost" size="sm" onClick={() => setMemberForm({ name: '', photo_url: '' })}>Batal</Button>}
                      </div>
                    </div>
                  </div>
                </div>
                {(() => {
                  const q = memberSearch.trim().toLowerCase();
                  const filtered = members.filter(m => !q || m.name.toLowerCase().includes(q));
                  const sorted = [...filtered].sort((a, b) => {
                    if (memberSort === 'az') return a.name.localeCompare(b.name);
                    if (memberSort === 'za') return b.name.localeCompare(a.name);
                    const ad = a.created_at || '', bd = b.created_at || '';
                    return memberSort === 'newest' ? bd.localeCompare(ad) : ad.localeCompare(bd);
                  });
                  return (
                    <>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                          <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            value={memberSearch}
                            onChange={e => setMemberSearch(e.target.value)}
                            placeholder="Cari member..."
                            className="pl-8"
                          />
                        </div>
                        <select
                          value={memberSort}
                          onChange={e => setMemberSort(e.target.value as typeof memberSort)}
                          className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                        >
                          <option value="az">Nama A-Z</option>
                          <option value="za">Nama Z-A</option>
                          <option value="newest">Terbaru</option>
                          <option value="oldest">Terlama</option>
                        </select>
                      </div>
                      {sorted.length === 0 ? (
                        <p className="text-muted-foreground text-center py-6 text-sm">
                          {q ? `Tidak ada member cocok "${memberSearch}".` : 'Belum ada member.'}
                        </p>
                      ) : (
                        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                          {sorted.map(m => (
                            <div key={m.id} className="text-center space-y-1 group relative">
                              <div className="w-full aspect-square rounded-full overflow-hidden border-2 border-border bg-secondary mx-auto">
                                {m.photo_url ? <img src={m.photo_url} alt={m.name} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-xs">{m.name.slice(0,2)}</div>}
                              </div>
                              <p className="text-xs font-medium truncate">{m.name}</p>
                              <div className="flex justify-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setMemberForm({ id: m.id, name: m.name, photo_url: m.photo_url })}><Edit2 className="w-3 h-3" /></Button>
                                <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={() => handleDeleteMember(m.id)}><Trash2 className="w-3 h-3" /></Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="preview">
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Pilih replay untuk melihat tampilan kartu:</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {replays.map(r => {
                  const thumbnailUrl = `https://img.youtube.com/vi/${r.youtube_id}/mqdefault.jpg`;
                  return (
                    <div key={r.id} className="rounded-xl overflow-hidden border border-border bg-card/80">
                      <div className="relative aspect-video overflow-hidden">
                        {r.image_url ? (
                          <img src={r.image_url} alt={r.title} className="w-full h-full object-cover" />
                        ) : (
                          <img src={thumbnailUrl} alt={r.title} className="w-full h-full object-cover" />
                        )}
                        <div className="absolute top-2 left-2">
                          <Badge variant="secondary" className="text-xs">{getCriteriaLabel(r.criteria)}</Badge>
                        </div>
                      </div>
                      <div className="p-3 space-y-2">
                        <h3 className="font-semibold text-sm truncate">{r.title}</h3>
                        {r.show_name && <p className="text-xs text-muted-foreground">{r.show_name}</p>}
                        <p className="text-xs text-muted-foreground">
                          {new Date(r.date).toLocaleDateString('id-ID', { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' })}
                        </p>
                        {r.featured_member && <p className="text-xs text-muted-foreground">⭐ {r.featured_member}</p>}
                        <div className="flex flex-wrap gap-1">
                          {(r.lineup || []).slice(0, 6).map((m, i) => (
                            <Badge key={i} variant="secondary" className="text-[10px]">{m}</Badge>
                          ))}
                          {(r.lineup || []).length > 6 && <Badge variant="secondary" className="text-[10px]">+{r.lineup.length - 6}</Badge>}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
                          <Eye className="w-3 h-3" /> {r.view_count || 0} views
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </TabsContent>

          {/* ===== COMMENTS TAB ===== */}
          <TabsContent value="comments">
            <Card>
              <CardHeader><CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2"><MessageCircle className="w-5 h-5 text-primary" />Semua Komentar ({allComments.length})</CardTitle></CardHeader>
              <CardContent>
                {allComments.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Belum ada komentar.</p>
                ) : (
                  <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                    {allComments.map(c => (
                      <div key={c.id} className="p-3 rounded-lg bg-secondary/50 border border-border group">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{c.name}</span>
                              <span className="text-[10px] text-muted-foreground">{timeAgo(c.created_at)}</span>
                            </div>
                            <p className="text-xs text-primary/70 truncate mt-0.5">📺 {getReplayTitle(c.replay_id)}</p>
                            <p className="text-sm text-muted-foreground mt-1">{c.message}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setReplyingTo(c); setReplyText(''); }} title="Balas">
                              <Send className="w-3.5 h-3.5" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteComment(c.id)} title="Hapus">
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== SECURITY / BLOCKED BROWSERS TAB ===== */}
          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />
                  Browser Diblokir ({blockedBrowsers.filter(b => !b.unblocked).length} aktif / {blockedBrowsers.length} total)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-xs text-muted-foreground mb-3">
                  User yang terdeteksi membuka DevTools/Inspect Element akan masuk ke daftar ini dan kehilangan akses. Klik "Buka Akses" untuk memulihkan, atau "Hapus" untuk menghapus catatan.
                </p>
                {blockedBrowsers.length === 0 ? (
                  <p className="text-muted-foreground text-center py-8">Belum ada browser yang diblokir.</p>
                ) : (
                  <div className="space-y-2 max-h-[70vh] overflow-y-auto">
                    {blockedBrowsers.map(b => (
                      <div key={b.id} className="p-3 rounded-lg bg-secondary/50 border border-border">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <Badge variant={b.unblocked ? 'secondary' : 'destructive'} className="text-[10px]">
                                {b.unblocked ? '✓ Dibuka' : '🚫 Diblokir'}
                              </Badge>
                              <span className="text-[10px] text-muted-foreground">{timeAgo(b.created_at)}</span>
                            </div>
                            <code className="block text-[11px] font-mono text-foreground mt-1 break-all">{b.browser_id}</code>
                            <p className="text-[11px] text-muted-foreground mt-0.5">Alasan: {b.reason}</p>
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {!b.unblocked && (
                              <Button variant="default" size="sm" className="h-7 text-xs" onClick={() => handleUnblockBrowser(b.id)}>
                                <UnlockIcon className="w-3 h-3 mr-1" />Buka
                              </Button>
                            )}
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDeleteBlock(b.id)}>
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-4">
            <DataExportAdmin />
            {/* Theme */}
            <Card>
              <CardHeader><CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2"><Palette className="w-5 h-5 text-primary" />Tema</CardTitle></CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                  {THEME_OPTIONS.map(t => (
                    <button key={t.value}
                      className={`p-3 sm:p-4 rounded-lg border-2 text-center transition-all ${currentTheme === t.value ? 'border-primary bg-primary/10' : 'border-border hover:border-primary/50'}`}
                      onClick={() => handleSaveTheme(t.value)}>
                      <span className="text-xl sm:text-2xl block mb-1">{t.emoji}</span>
                      <span className="text-xs sm:text-sm font-medium">{t.label}</span>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Live Chat Toggle */}
            <Card>
              <CardHeader>
                <CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2">
                  <MessageCircle className="w-5 h-5 text-primary" />Live Chat
                </CardTitle>
              </CardHeader>
              <CardContent className="flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <Label className="text-sm">Aktifkan Live Chat</Label>
                  <p className="text-xs text-muted-foreground">Saat dimatikan, user tidak bisa mengirim pesan baru. Hanya 30 pesan terakhir per replay yang disimpan.</p>
                </div>
                <Switch checked={liveChatEnabled} onCheckedChange={handleToggleLiveChat} />
              </CardContent>
              <CardContent className="pt-0 space-y-2">
                <p className="text-xs text-muted-foreground">Live chat akan otomatis direset setiap hari pukul 00:00 WIB. Anda juga dapat mereset manual sekarang.</p>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={async () => {
                    if (!confirm('Hapus seluruh pesan live chat sekarang?')) return;
                    const { data, error } = await supabase.rpc('admin_clear_live_messages' as never);
                    if (error) {
                      toast({ title: 'Error', description: error.message, variant: 'destructive' });
                    } else {
                      toast({ title: 'Berhasil', description: `Live chat direset (${data ?? 0} pesan dihapus).` });
                    }
                  }}
                >
                  Reset Live Chat Sekarang
                </Button>
              </CardContent>
            </Card>

            {/* Admin Username */}
            <Card>
              <CardHeader>
                <CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-primary" />Username Admin
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-xs text-muted-foreground">Nama ini akan ditampilkan sebagai penanda saat admin berkomentar di kartu replay (otomatis diawali ikon 🛡️). Username admin terkunci pada <b>admin wota</b> dan hanya akun <b>MOD</b> atau <b>dhy</b> yang dapat mengubahnya.</p>
                <div className="flex gap-2">
                  <Input placeholder="admin wota" value={adminUsername} onChange={e => setAdminUsername(e.target.value.slice(0, 30))} disabled={!canEditAdminUsername} />
                  <Button onClick={handleSaveAdminUsername} size="sm" className="h-10 shrink-0" disabled={!canEditAdminUsername}><Save className="w-4 h-4 mr-1" />Simpan</Button>
                </div>
                <p className="text-[11px] text-muted-foreground">Pratinjau: <span className="font-medium text-foreground">🛡️ {(adminUsername || 'admin wota').trim()}</span></p>
                {!canEditAdminUsername && (
                  <p className="text-[11px] text-amber-500">🔒 Akun ini tidak diizinkan mengubah username admin.</p>
                )}
              </CardContent>
            </Card>

            {/* Akun Login Admin */}
            <Card>
              <CardHeader><CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2"><Key className="w-5 h-5 text-primary" />Akun Login Admin</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Email login</Label>
                  <Input type="email" placeholder="admin@email.com" value={acctEmail} onChange={e => setAcctEmail(e.target.value)} />
                </div>
                <div>
                  <Label>Sandi saat ini *</Label>
                  <Input type="password" placeholder="Sandi saat ini" value={acctCurrentPw} onChange={e => setAcctCurrentPw(e.target.value)} autoComplete="current-password" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <Label>Sandi baru (opsional)</Label>
                    <Input type="password" placeholder="Min. 8 karakter" value={acctNewPw} onChange={e => setAcctNewPw(e.target.value)} autoComplete="new-password" />
                  </div>
                  <div>
                    <Label>Ulangi sandi baru</Label>
                    <Input type="password" placeholder="Ulangi sandi baru" value={acctNewPw2} onChange={e => setAcctNewPw2(e.target.value)} autoComplete="new-password" />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground">Setelah disimpan, Anda otomatis keluar dan harus login ulang dengan email/sandi baru.</p>
                <Button onClick={handleSaveAdminAccount} size="sm" disabled={acctSaving}>
                  <Save className="w-4 h-4 mr-2" />{acctSaving ? 'Menyimpan…' : 'Simpan Akun'}
                </Button>
              </CardContent>
            </Card>


            {/* WhatsApp */}
            <Card>
              <CardHeader><CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2"><MessageCircle className="w-5 h-5 text-primary" />WhatsApp</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div><Label>Nomor HP</Label><Input placeholder="628123456789" value={waNumber} onChange={e => setWaNumber(e.target.value)} /></div>
                <div><Label>Link Saluran</Label><Input placeholder="https://whatsapp.com/channel/..." value={waLink} onChange={e => setWaLink(e.target.value)} /></div>
                <Button onClick={handleSaveWhatsApp} size="sm"><Save className="w-4 h-4 mr-2" />Simpan</Button>
              </CardContent>
            </Card>

            {/* QRIS Statis Fallback + Nomor Admin */}
            <Card>
              <CardHeader><CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2"><MessageCircle className="w-5 h-5 text-primary" />QRIS Statis & Nomor Admin</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <Label>Nomor WhatsApp Admin (untuk konfirmasi pembayaran)</Label>
                  <Input placeholder="6283899087711" value={ownerWaNumber} onChange={e => setOwnerWaNumber(e.target.value)} />
                  <p className="text-[11px] text-muted-foreground mt-1">Tombol "Hubungi Admin" pada dialog pembayaran akan membuka chat ke nomor ini.</p>
                </div>
                <div>
                  <Label>QRIS Statis (alternatif jika QRIS dinamis gagal)</Label>
                  <ImagePicker value={staticQrisUrl} onChange={url => setStaticQrisUrl(url)} />
                  <p className="text-[11px] text-muted-foreground mt-1">Upload gambar QRIS statis. Akan ditampilkan otomatis jika QRIS dinamis gagal dibuat.</p>
                </div>
                <div className="flex items-center justify-between rounded-md border border-border p-3">
                  <div className="pr-3">
                    <Label className="block">Paksa pakai QRIS Statis</Label>
                    <p className="text-[11px] text-muted-foreground mt-1">Jika aktif, semua pembelian show langsung menampilkan QRIS statis + tombol Hubungi Admin (tanpa membuat QRIS dinamis Pakasir).</p>
                  </div>
                  <Switch checked={useStaticQris} onCheckedChange={setUseStaticQris} />
                </div>
                <Button onClick={handleSavePakasirFallback} size="sm"><Save className="w-4 h-4 mr-2" />Simpan</Button>
              </CardContent>
            </Card>

            {/* Master Passwords */}
            <Card>
              <CardHeader><CardTitle className="font-sans text-base sm:text-lg flex items-center gap-2"><Key className="w-5 h-5 text-primary" />Sandi Master</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 items-end">
                  <div><Label>Tahun</Label><Input className="text-sm" value={mpYear} onChange={e => setMpYear(e.target.value)} /></div>
                  <div>
                    <Label>Bulan</Label>
                    <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={mpMonth} onChange={e => setMpMonth(e.target.value)}>
                      {MONTH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div><Label>Sandi</Label><Input type="text" placeholder="Sandi master..." value={mpPassword} onChange={e => setMpPassword(e.target.value)} /></div>
                  <Button onClick={handleSaveMasterPassword} size="sm" className="h-10"><Save className="w-4 h-4 mr-1" />Simpan</Button>
                </div>
                {masterPasswords.length > 0 && (
                  <div className="flex flex-col gap-2 mt-3">
                    {masterPasswords.map(mp => (
                      <div key={mp.id} className="flex items-center justify-between gap-2 p-2 rounded-md border border-border bg-secondary/40">
                        <div className="flex items-center gap-2 min-w-0">
                          <Badge variant={mp.paused ? 'outline' : 'secondary'} className="text-xs py-1 px-2 truncate">
                            {mp.month}: {mp.password}
                          </Badge>
                          {mp.paused && <span className="text-[10px] uppercase tracking-wide text-destructive font-semibold">Dijeda</span>}
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] text-muted-foreground">Aktif</span>
                            <Switch checked={!mp.paused} onCheckedChange={(v) => handleToggleMasterPaused(mp.id, mp.month, !v)} />
                          </div>
                          <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => handleDeleteMasterPassword(mp.id, mp.month)}>
                            <Trash2 className="w-3.5 h-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        <datalist id="member-names">
          {members.map(m => <option key={m.id} value={m.name} />)}
        </datalist>
      </div>

      {/* Reply Dialog */}
      <Dialog open={!!replyingTo} onOpenChange={open => { if (!open) setReplyingTo(null); }}>
        <DialogContent className="bg-card border-border">
          <DialogHeader>
            <DialogTitle className="font-sans">Balas Komentar</DialogTitle>
            <DialogDescription>Balas sebagai Admin</DialogDescription>
          </DialogHeader>
          {replyingTo && (
            <div className="space-y-4">
              <div className="p-3 rounded-lg bg-secondary/50 border border-border">
                <p className="text-xs font-medium">{replyingTo.name}</p>
                <p className="text-sm text-muted-foreground mt-1">{replyingTo.message}</p>
              </div>
              <Input placeholder="Tulis balasan..." value={replyText} onChange={e => setReplyText(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleReplyComment()} />
              <Button className="w-full" onClick={handleReplyComment} disabled={sendingReply || !replyText.trim()}>
                <Send className="w-4 h-4 mr-2" /> {sendingReply ? 'Mengirim...' : 'Kirim Balasan'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Preview Dialog */}
      <Dialog open={!!previewReplay} onOpenChange={open => { if (!open) setPreviewReplay(null); }}>
        <DialogContent className="bg-card border-border max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-sans">Preview: {previewReplay?.title}</DialogTitle>
          </DialogHeader>
          {previewReplay && (
            <div className="space-y-4">
              <div className="relative w-full overflow-hidden rounded-xl bg-black" style={{ paddingBottom: '56.25%' }}>
                <iframe
                  className="absolute inset-0 w-full h-full"
                  src={`https://www.youtube.com/embed/${previewReplay.youtube_id}?rel=0`}
                  title={previewReplay.title}
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
                  allowFullScreen
                  style={{ border: 0 }}
                />
              </div>
              <div className="space-y-2 text-sm">
                <p><strong>Tanggal:</strong> {new Date(previewReplay.date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                <p><strong>Kriteria:</strong> {getCriteriaLabel(previewReplay.criteria)}</p>
                {previewReplay.show_name && <p><strong>Show:</strong> {previewReplay.show_name}</p>}
                {previewReplay.featured_member && <p><strong>Member:</strong> ⭐ {previewReplay.featured_member}</p>}
                <p><strong>Views:</strong> {previewReplay.view_count || 0}</p>
                <div className="flex flex-wrap gap-1">
                  {(previewReplay.lineup || []).map((m, i) => (
                    <Badge key={i} variant="secondary" className="text-xs">{m}</Badge>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus Replay?</AlertDialogTitle>
            <AlertDialogDescription>Apakah kamu yakin ingin menghapus "<strong>{deleteTarget?.title}</strong>"?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDeleteReplay} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Hapus</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add/Edit Dialog */}
      <Dialog open={showAddDialog} onOpenChange={v => { if (!v) resetForm(); setShowAddDialog(v); }}>
        <DialogContent className="bg-card border-border max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-sans">{editingReplay ? 'Edit Replay' : 'Tambah Replay Baru'}</DialogTitle>
            <DialogDescription>Isi detail replay di bawah ini.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div><Label>Judul *</Label><Input placeholder="Judul replay" value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><Label>Singkatan Judul (kartu ringkas)</Label><Input placeholder={`Otomatis: ${abbreviateTitle(form.title || form.showName) || 'PJMD'}`} value={form.shortTitle} onChange={e => setForm(f => ({ ...f, shortTitle: e.target.value }))} /><p className="text-xs text-muted-foreground mt-1">Kosongkan untuk singkatan otomatis.</p></div>
            <div><Label>Nama Show</Label><Input placeholder="Contoh: Pajama Drive" value={form.showName} onChange={e => setForm(f => ({ ...f, showName: e.target.value }))} /></div>
            <div>
              <Label>Kriteria</Label>
              <select className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={form.criteria} onChange={e => setForm(f => ({ ...f, criteria: e.target.value }))}>
                {CRITERIA_OPTIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            </div>
            {showFeaturedMember && (
              <div><Label>Member Bersangkutan</Label><Input placeholder="Nama member..." value={form.featuredMember} onChange={e => setForm(f => ({ ...f, featuredMember: e.target.value }))} /></div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tanggal *</Label><Input type="date" value={form.date} onChange={e => setForm(f => ({ ...f, date: e.target.value }))} /></div>
              <div><Label>Jam Show</Label><Input type="time" value={form.showTime} onChange={e => setForm(f => ({ ...f, showTime: e.target.value }))} /></div>
            </div>
            <div><Label>Lineup (koma)</Label><Input list="member-names" placeholder="Member 1, Member 2, ..." value={form.lineup} onChange={e => setForm(f => ({ ...f, lineup: e.target.value }))} /></div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Playlist Sumber Video</Label>
                <Button type="button" variant="outline" size="sm" className="h-7 text-xs"
                  disabled={form.sources.length >= 6}
                  onClick={() => setForm(f => ({
                    ...f,
                    sources: [...f.sources, {
                      id: (crypto as any).randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
                      label: `Sumber ${f.sources.length + 1}`,
                      type: 'm3u8',
                      url: '',
                      is_default: f.sources.length === 0,
                    }],
                  }))}>
                  <Plus className="w-3 h-3 mr-1" />Tambah
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">User dapat memilih playlist via tombol di bawah player. Maks 6.</p>
              {form.sources.length === 0 && (
                <p className="text-xs text-muted-foreground italic">Tidak ada playlist. Akan menggunakan field tunggal di bawah sebagai fallback.</p>
              )}
              {form.sources.map((s, idx) => (
                <div key={s.id} className="p-2 rounded-md border border-border bg-secondary/30 space-y-1.5">
                  <div className="grid grid-cols-12 gap-1.5 items-center">
                    <Input className="col-span-4 h-8 text-xs" placeholder="Label" value={s.label}
                      onChange={e => setForm(f => ({ ...f, sources: f.sources.map((x, i) => i === idx ? { ...x, label: e.target.value } : x) }))} />
                    <select className="col-span-4 h-8 rounded-md border border-input bg-background px-2 text-xs"
                      value={s.type}
                      onChange={e => setForm(f => ({ ...f, sources: f.sources.map((x, i) => i === idx ? { ...x, type: e.target.value as any } : x) }))}>
                      <option value="youtube">YouTube</option>
                      <option value="m3u8">M3U8 (HLS)</option>
                      <option value="cloudflare">Cloudflare Stream</option>
                    </select>
                    <label className="col-span-3 text-[10px] flex items-center gap-1">
                      <input type="radio" name="default-source" checked={!!s.is_default}
                        onChange={() => setForm(f => ({ ...f, sources: f.sources.map((x, i) => ({ ...x, is_default: i === idx })) }))} />
                      Default
                    </label>
                    <Button type="button" variant="ghost" size="icon" className="col-span-1 h-7 w-7 text-destructive"
                      onClick={() => setForm(f => ({ ...f, sources: f.sources.filter((_, i) => i !== idx) }))}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {s.type === 'youtube' ? (
                    <YouTubeIdInput
                      value={s.url}
                      onChange={(v) => setForm(f => ({ ...f, sources: f.sources.map((x, i) => i === idx ? { ...x, url: v } : x) }))}
                      placeholder="URL YouTube (live/watch/youtu.be) atau ID 11 karakter"
                    />
                  ) : (
                    <Input className="h-8 text-xs" placeholder={s.type === 'cloudflare' ? 'Cloudflare UID atau URL' : 'Link .m3u8 (boleh .live)'}
                      value={s.url}
                      onChange={e => setForm(f => ({ ...f, sources: f.sources.map((x, i) => i === idx ? { ...x, url: e.target.value } : x) }))} />
                  )}
                </div>
              ))}
            </div>

            <div className="pt-2 border-t border-border/50 space-y-2">
              <Label className="text-xs text-muted-foreground">Fallback (kompatibel lama, dipakai jika playlist kosong)</Label>
              <div className="grid grid-cols-2 gap-2">
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, sourceType: 'youtube' }))}
                  className={`p-2 rounded-md border-2 text-xs font-medium transition-all ${form.sourceType === 'youtube' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                  📺 YouTube
                </button>
                <button type="button"
                  onClick={() => setForm(f => ({ ...f, sourceType: 'm3u8' }))}
                  className={`p-2 rounded-md border-2 text-xs font-medium transition-all ${form.sourceType === 'm3u8' ? 'border-primary bg-primary/10 text-primary' : 'border-border text-muted-foreground'}`}>
                  🎬 M3U8 (HLS)
                </button>
              </div>
              {form.sourceType === 'youtube' ? (
                <div className="space-y-2">
                  <YouTubeIdInput value={form.youtubeId} onChange={(v) => setForm(f => ({ ...f, youtubeId: v }))} placeholder="URL YouTube atau ID 11 karakter (utama)" />
                  <div>
                    <Label className="text-xs text-muted-foreground">Link YouTube alternatif (opsional)</Label>
                    <YouTubeIdInput value={form.youtubeAltId} onChange={(v) => setForm(f => ({ ...f, youtubeAltId: v }))} placeholder="URL/ID YouTube cadangan untuk tombol 'Tonton di YouTube'" />
                  </div>
                </div>
              ) : (
                <Input placeholder="Link M3U8 (fallback)" value={form.m3u8Url} onChange={e => setForm(f => ({ ...f, m3u8Url: e.target.value }))} />
              )}
            </div>
            <div><Label>Foto Kartu</Label><ImagePicker value={form.imageUrl} onChange={url => setForm(f => ({ ...f, imageUrl: url }))} /></div>
            <div>
              <Label>Mode Tampilan Gambar</Label>
              <Select value={form.imageFit} onValueChange={v => setForm(f => ({ ...f, imageFit: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="contain">Contain — seluruh poster terlihat (tanpa zoom)</SelectItem>
                  <SelectItem value="scale-down">Scale down — pas bingkai, tidak pernah diperbesar</SelectItem>
                  <SelectItem value="cover">Cover — penuhi bingkai (bisa terpotong)</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground mt-1">Gunakan Contain/Scale down agar wajah member dan poster tidak ter-zoom.</p>
            </div>
            <div><Label>Sandi *</Label><Input placeholder="Sandi untuk replay ini" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} /></div>
            <div>
              <Label>Harga Replay (Rp)</Label>
              <Input type="number" min={0} value={form.priceIdr} onChange={e => setForm(f => ({ ...f, priceIdr: Number(e.target.value) }))} placeholder="cth: 2000" />
              <p className="text-[11px] text-muted-foreground mt-1">Harga QRIS yang tampil di kartu replay. Default Rp 2.000.</p>
            </div>
            <div>
              <Label>Harga Koin (untuk tukar)</Label>
              <Input type="number" min={0} value={form.priceCoins} onChange={e => setForm(f => ({ ...f, priceCoins: Number(e.target.value) }))} placeholder="default 1 koin" />
              <p className="text-[11px] text-muted-foreground mt-1">Default 1 koin. Ubah ke nominal lain jika perlu, atau set 0 untuk menyembunyikan tab Koin.</p>
            </div>
            <div>
              <Label>Alias Admin <span className="text-xs text-muted-foreground">(rahasia, hanya admin)</span></Label>
              <Input
                placeholder="cth: aniv2024 — kode pendek untuk panggil di bot WhatsApp"
                value={form.adminAlias}
                onChange={e => setForm(f => ({ ...f, adminAlias: e.target.value.replace(/\s+/g, '') }))}
              />
              <p className="text-xs text-muted-foreground mt-1">
                Tidak ditampilkan ke pengguna. Bisa dipakai di bot: <code>/buattoken &lt;alias&gt;</code> atau <code>/createtoken &lt;alias&gt;</code>.
              </p>
            </div>
            <Button className="w-full" onClick={handleSaveReplay}>
              <Save className="w-4 h-4 mr-2" /> {editingReplay ? 'Simpan Perubahan' : 'Tambah Replay'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {personalTokenReplay && (
        <ReplayPersonalTokensDialog
          open={!!personalTokenReplay}
          onOpenChange={(v) => { if (!v) setPersonalTokenReplay(null); }}
          replayId={personalTokenReplay.id}
          replayTitle={personalTokenReplay.title}
        />
      )}
    </div>
  );
}
