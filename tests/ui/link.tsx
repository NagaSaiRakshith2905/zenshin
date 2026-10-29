import { forwardRef, type ComponentProps } from "react";
import { useRouter } from "./navigation";
export default forwardRef<HTMLAnchorElement, ComponentProps<"a"> & { scroll?: boolean }>(function PreviewLink({ href = "", onClick, scroll, ...props }, ref) {
  void scroll;
  const router = useRouter();
  return <a {...props} ref={ref} href={href} onClick={(e) => { onClick?.(e); if (!e.defaultPrevented && !e.metaKey && !e.ctrlKey) { e.preventDefault(); router.push(href); } }} />;
});
