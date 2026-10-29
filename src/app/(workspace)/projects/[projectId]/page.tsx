import { WorkView } from "@/features/work/view";
export default async function ProjectPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <WorkView mode="overview" projectId={projectId} />;
}
