import { createRoot } from "react-dom/client";
import { WorkspaceAccess } from "../../src/features/settings/workspace";
import { WorkView, FullTaskView } from "../../src/features/work/view";
import { usePathname } from "./navigation";
import { installPreviewApi } from "./mock";
import "../../src/app/globals.css";
installPreviewApi();
function Preview() {
  const path = usePathname(); const parts = path.split("/");
  return <WorkspaceAccess ownerId="preview-owner" preferences={{ timezone: "Asia/Kolkata", theme: "system", defaultTaskView: "list", revision: 1 }}>{parts[1] === "tasks" ? <FullTaskView id={parts[2]} /> : <WorkView key={path} mode={parts[1] === "projects" ? parts[3] === "sections" ? "section" : parts[3] === "tasks" ? "tasks" : "overview" : "my-work"} projectId={parts[1] === "projects" ? parts[2] : undefined} sectionId={parts[4]} />}</WorkspaceAccess>;
}
createRoot(document.getElementById("root")!).render(<Preview />);
