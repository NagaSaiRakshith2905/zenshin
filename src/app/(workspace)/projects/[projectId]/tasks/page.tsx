import { WorkView } from "@/features/work/view";
export default async function ProjectTasksPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <WorkView mode="tasks" projectId={projectId} />;
}
