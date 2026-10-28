import { Logo } from "@/components/brand/logo";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export default function Home() {
  return (
    <main className="flex min-h-svh items-center justify-center p-6">
      <Empty>
        <EmptyHeader>
          <EmptyMedia><Logo className="size-12" /></EmptyMedia>
          <EmptyTitle><h1>Zenshin</h1></EmptyTitle>
          <EmptyDescription>A private workspace for planning and tracking development.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    </main>
  );
}
