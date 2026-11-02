import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { adminWaNumber } from '@/lib/adminWa';

let cached: Promise<string> | null = null;

/** Nomor WhatsApp admin dari pengaturan (dibaca sekali per halaman). */
export function useAdminWa() {
  const [num, setNum] = useState(adminWaNumber(''));
  useEffect(() => {
    let alive = true;
    cached ??= Promise.resolve(
      supabase.from('site_settings').select('key,value').in('key', ['owner_wa_number', 'admin_wa_phone', 'whatsapp_number'])
    ).then(({ data }) => {
      const m = new Map((data || []).map((r: any) => [r.key, r.value]));
      return adminWaNumber(m.get('owner_wa_number') || m.get('admin_wa_phone') || m.get('whatsapp_number') || '');
    }).catch(() => adminWaNumber(''));
    cached.then((n) => { if (alive) setNum(n); });
    return () => { alive = false; };
  }, []);
  return num;
}
