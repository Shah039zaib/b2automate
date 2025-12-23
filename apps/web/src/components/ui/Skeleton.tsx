interface SkeletonProps {
    className?: string;
}

export function Skeleton({ className = '' }: SkeletonProps) {
    return (
        <div
            className={`animate-pulse bg-slate-200 rounded ${className}`}
        />
    );
}

export function SkeletonCard() {
    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6">
            <div className="flex items-center justify-between">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-8 w-16" />
                </div>
                <Skeleton className="h-12 w-12 rounded-lg" />
            </div>
        </div>
    );
}

export function SkeletonTable({ rows = 3 }: { rows?: number }) {
    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-200">
                <Skeleton className="h-6 w-32" />
            </div>
            <div className="divide-y divide-slate-100">
                {Array.from({ length: rows }).map((_, i) => (
                    <div key={i} className="p-4 flex items-center gap-4">
                        <Skeleton className="h-10 w-10 rounded" />
                        <div className="flex-1 space-y-2">
                            <Skeleton className="h-4 w-1/3" />
                            <Skeleton className="h-3 w-1/2" />
                        </div>
                        <Skeleton className="h-8 w-20" />
                    </div>
                ))}
            </div>
        </div>
    );
}
