import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource-variable/inter";
import "@fontsource-variable/jetbrains-mono";
import "./index.css";
import { useRoute } from "./lib/router";
import { AppShell } from "./components/app-shell";
import HomePage from "./pages/Home";
import { CreateView } from "./pages/Create";
import { ConditionsView } from "./pages/Conditions";
import { ConditionDetailView } from "./pages/ConditionDetail";
import { VerifyView } from "./pages/Verify";
import { DocsView } from "./pages/Docs";

function Root() {
  const route = useRoute();

  // landing page
  if (route === "/") return <HomePage />;

  // dashboard shell (sidebar) for everything else
  let inner: React.ReactNode;
  if (route.startsWith("/app/condition/")) {
    inner = <ConditionDetailView id={route.split("/").pop() ?? ""} />;
  } else if (route === "/app/conditions" || route.startsWith("/app/condition")) {
    inner = <ConditionsView />;
  } else if (route === "/app/verify") {
    inner = <VerifyView />;
  } else if (route === "/app/docs") {
    inner = <DocsView />;
  } else {
    inner = <CreateView />;
  }
  return <AppShell>{inner}</AppShell>;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
);
