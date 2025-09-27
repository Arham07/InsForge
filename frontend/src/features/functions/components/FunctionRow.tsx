import { CopyButton } from '@/components/CopyButton';
import { useToast } from '@/lib/hooks/useToast';
import { type EdgeFunction } from '../services/functions.service';
import { cn } from '@/lib/utils/utils';
import { format, formatDistance } from 'date-fns';
interface FunctionRowProps {
  function: EdgeFunction;
  onClick: () => void;
  className?: string;
}

export function FunctionRow({ function: func, onClick, className }: FunctionRowProps) {
  const { showToast } = useToast();

  const handleCopyUrl = () => {
    showToast('URL copied to clipboard', 'success');
  };

  const functionUrl = `${window.location.origin}/functions/${func.slug}`;

  return (
    <div
      className={cn(
        'group h-14 px-3 bg-white hover:bg-neutral-100 dark:bg-[#333333] dark:hover:bg-neutral-700 rounded-[8px] transition-all cursor-pointer',
        className
      )}
      onClick={onClick}
    >
      <div className="grid grid-cols-12 h-full items-center">
        {/* Name Column */}
        <div className="col-span-2 min-w-0 px-3 py-1.5">
          <p className="text-sm text-zinc-950 dark:text-white truncate" title={func.name}>
            {func.name}
          </p>
        </div>

        {/* URL Column */}
        <div className="col-span-6 min-w-0 px-3 py-1.5">
          <div className="flex items-center gap-3">
            <span
              className="text-sm text-muted-foreground dark:text-white truncate"
              title={functionUrl}
            >
              {functionUrl}
            </span>
            <CopyButton
              showText={false}
              text={functionUrl}
              onCopy={handleCopyUrl}
              className="h-7 w-7 dark:hover:bg-neutral-500 dark:data-[copied=true]:group-hover:bg-neutral-700 dark:data-[copied=true]:hover:bg-neutral-700"
            />
          </div>
        </div>

        {/* Created Column */}
        <div className="col-span-2 px-3 py-1.5">
          <span
            className="text-sm text-muted-foreground dark:text-white truncate"
            title={func.created_at}
          >
            {format(new Date(func.created_at), 'MMM dd, yyyy HH:mm')}
          </span>
        </div>

        {/* Last Update Column */}
        <div className="col-span-2 px-3 py-1.5">
          <span
            className="text-sm text-muted-foreground dark:text-white truncate"
            title={func.deployed_at}
          >
            {func.deployed_at
              ? formatDistance(new Date(func.deployed_at), new Date(), { addSuffix: true })
              : 'Never'}
          </span>
        </div>
      </div>
    </div>
  );
}
