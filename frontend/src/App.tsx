import AppShell from "./components/AppShell";
import DemoGate from "./components/DemoGate";
import { ConfirmProvider } from "./components/Dialog";
import { ToastProvider } from "./components/Toast";
import { EmptyState } from "./components/Feedback";
import { WorkspaceProvider } from "./context";
import { useRoute } from "./router";
import Documents from "./pages/Documents";
import Expenses from "./pages/Expenses";
import Extraction from "./pages/Extraction";
import Help from "./pages/Help";
import Overview from "./pages/Overview";
import Reports from "./pages/Reports";
import ReviewQueue from "./pages/ReviewQueue";
import Settings from "./pages/Settings";
import Templates from "./pages/Templates";
import { FileQuestion } from "lucide-react";

function Pages() {
  const route = useRoute();
  let page;
  switch (route.name) {
    case "overview": page = <Overview />; break;
    case "documents": page = <Documents key={route.query.get("q") ?? ""} route={route} />; break;
    case "extraction": page = <Extraction route={route} />; break;
    case "review": page = <ReviewQueue route={route} />; break;
    case "expenses": page = <Expenses />; break;
    case "reports": page = <Reports />; break;
    case "templates": page = <Templates />; break;
    case "settings": page = <Settings />; break;
    case "help": page = <Help />; break;
    default: page = <EmptyState icon={FileQuestion} title="Page not found" action={<a className="btn-primary" href="#/">Go to Overview</a>}>That address doesn't exist in DocuMind AI.</EmptyState>;
  }
  return <AppShell route={route}>{page}</AppShell>;
}

export default function App() {
  return (
    <DemoGate>
      <ToastProvider>
        <ConfirmProvider>
          <WorkspaceProvider><Pages /></WorkspaceProvider>
        </ConfirmProvider>
      </ToastProvider>
    </DemoGate>
  );
}
