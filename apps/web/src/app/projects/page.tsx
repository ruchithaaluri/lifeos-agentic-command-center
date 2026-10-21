'use client';

import { useState } from 'react';
import { Plus, Folder } from 'lucide-react';
import { AppShell } from '@/components/layout/AppShell';
import { ProjectCard } from '@/components/dashboard/ProjectCard';
import { AddProjectModal } from '@/components/dashboard/AddProjectModal';
import { useDashboardData } from '@/hooks/useDashboardData';

export default function ProjectsPage() {
  const [showAddProject, setShowAddProject] = useState(false);
  const { projects, isLoading, refresh } = useDashboardData();

  const activeCount = projects.filter((p) => p.status === 'active').length;

  return (
    <AppShell>
      <div className="p-6">
        <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Folder className="h-5 w-5 text-emerald-400" aria-hidden />
              <h1 className="text-2xl font-bold text-white">Projects</h1>
            </div>
            <p className="mt-1 text-sm text-slate-400">
              {activeCount} active {activeCount === 1 ? 'project' : 'projects'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddProject(true)}
            className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-semibold text-white shadow-glow hover:bg-emerald-500 transition-all self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            <span>New Project</span>
          </button>
        </header>

        {isLoading ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-white/5" />
            ))}
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <ProjectCard key={project.id} project={project} />
            ))}

            {projects.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-white/10 p-12 text-center text-slate-500">
                <p className="text-base font-medium text-slate-400">No projects yet.</p>
                <p className="mt-1 text-xs text-slate-500">
                  Organize your goals, tasks, and calendar events into structured projects.
                </p>
                <button
                  type="button"
                  onClick={() => setShowAddProject(true)}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-4 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/30 transition-colors"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Create First Project
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <AddProjectModal
        isOpen={showAddProject}
        onClose={() => setShowAddProject(false)}
        onSuccess={() => {
          void refresh();
        }}
      />
    </AppShell>
  );
}
