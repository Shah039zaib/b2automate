import { ReactNode } from 'react';
import { motion, HTMLMotionProps } from 'framer-motion';

interface CardProps extends Omit<HTMLMotionProps<'div'>, 'ref'> {
    children: ReactNode;
}

export function Card({ className = '', children, ...props }: CardProps) {
    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            whileHover={{ y: -4, boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1)" }}
            className={`bg-white rounded-xl border border-slate-200 shadow-sm p-6 ${className}`}
            {...props}
        >
            {children}
        </motion.div>
    );
}

export function CardHeader({ title, description }: { title: string, description?: string }) {
    return (
        <div className="mb-4">
            <h3 className="text-lg font-semibold text-slate-800">{title}</h3>
            {description && <p className="text-sm text-slate-500 mt-1">{description}</p>}
        </div>
    );
}

export function CardStat({ label, value, icon: Icon, trend }: any) {
    return (
        <div className="flex items-center justify-between">
            <div>
                <p className="text-sm font-medium text-slate-500">{label}</p>
                <p className="text-2xl font-bold text-slate-900 mt-1">{value}</p>
                {trend && <p className="text-xs text-green-600 mt-1">{trend}</p>}
            </div>
            <div className="p-3 bg-primary-50 rounded-lg">
                <Icon className="h-6 w-6 text-primary-600" />
            </div>
        </div>
    );
}
