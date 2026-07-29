import type { Metadata } from "next";
import { ProjectsList } from "@/components/ProjectsList";

export const metadata: Metadata = {
  title: "Projects",
  // Private screen — nothing here for a crawler (see app/robots.ts).
  robots: { index: false, follow: false },
};

export default function ProjectsPage() {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="mt-1 text-sm text-muted">
          Outcomes that take more than one action. Every active project keeps a next action.
        </p>
      </div>
      <ProjectsList />
    </div>
  );
}
