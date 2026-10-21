'use client';

import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ProjectUI } from '@/store/dashboard';

interface ProjectCardProps {
  project: ProjectUI;
  className?: string;
}

export function ProjectCard({ project, className }: ProjectCardProps) {
  return (
    <div className={cn('glass glass-hover rounded-xl p-4 transition-all duration-150', className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="h-3 w-3 shrink-0 rounded-full"
            style={{ backgroundColor: project.color }}
            aria-hidden
          />
          <h3 className="truncate text-sm font-semibold text-slate-100">{project.name}</h3>
        </div>
        {project.urgentTaskCount > 0 && (
          <span className="flex shrink-0 items-center gap-1 text-xs text-red-400">
            <AlertCircle className="h-3 w-3" />
            {project.urgentTaskCount} urgent
          </span>
        )}
      </div>

      {/* Progress bar */}
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <span className="text-xs text-slate-500">
            {project.completedTaskCount}/{project.taskCount} tasks
          </span>
          <span className="text-xs font-medium text-slate-400">{project.progressPercent}%</span>
        </div>
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-white/10"
          role="progressbar"
          aria-valuenow={project.progressPercent}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={`${project.name} progress`}
        >
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${project.progressPercent}%`,
              backgroundColor: project.color,
            }}
          />
        </div>
      </div>
    </div>
  );
}
