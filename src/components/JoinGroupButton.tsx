import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { safeGroupLink } from '../../supabase/functions/_shared/group-link';

export default function JoinGroupButton({ link }: { link?: string }) {
  const url = safeGroupLink(link);
  if (!url) return null;
  return <Button asChild variant="outline" className="w-full gap-2 whitespace-normal h-auto min-h-9 py-2">
    <a href={url} target="_blank" rel="noopener noreferrer"><Users className="w-4 h-4 shrink-0" />Gabung Grup</a>
  </Button>;
}