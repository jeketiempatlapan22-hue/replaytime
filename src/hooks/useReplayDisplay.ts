import { useEffect, useState } from 'react';
import { getSiteRouting, replayDisplayFlags } from '@/lib/siteRedirect';

let last = { compact: false, hideTitle: false, locked: false };

/** Mode Kartu Ringkas & sembunyikan judul (diatur admin, bisa dikembalikan). */
export function useReplayDisplay() {
  const [flags, setFlags] = useState(last);
  useEffect(() => {
    let alive = true;
    getSiteRouting().then((r) => { last = replayDisplayFlags(r); if (alive) setFlags(last); });
    return () => { alive = false; };
  }, []);
  return flags;
}
