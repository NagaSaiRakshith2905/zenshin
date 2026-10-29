import { WorkView } from "@/features/work/view";
export default async function SectionPage({ params }: { params: Promise<{ projectId: string; sectionId: string }> }) {
  const { projectId, sectionId } = await params;
  return <WorkView mode="section" projectId={projectId} sectionId={sectionId} />;
}
