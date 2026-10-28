import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { requireOwnerPage } from "@/server/auth/page";

export default async function Home() {
  await requireOwnerPage();
  return <main className="p-4 sm:p-6"><h1 className="text-[22px] leading-[30px] font-semibold">My work</h1>
    <Empty className="min-h-72"><EmptyHeader><EmptyTitle>No tasks yet</EmptyTitle><EmptyDescription>Your tasks will appear here.</EmptyDescription></EmptyHeader></Empty>
  </main>;
}
