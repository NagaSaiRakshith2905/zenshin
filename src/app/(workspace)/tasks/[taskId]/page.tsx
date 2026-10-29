import { FullTaskView } from "@/features/work/view";
export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  return <FullTaskView id={taskId} />;
}
