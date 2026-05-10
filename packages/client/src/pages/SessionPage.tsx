import type { ProviderName } from "@yep-anywhere/shared";
import { useLocation, useParams } from "react-router-dom";
import { SessionSurface } from "../components/SessionSurface";
import { useI18n } from "../i18n";

export function SessionPage() {
  const { projectId, sessionId } = useParams<{
    projectId: string;
    sessionId: string;
  }>();
  const location = useLocation();

  if (!projectId || !sessionId) {
    return <SessionPageInvalidRoute />;
  }

  const navState = location.state as {
    initialStatus?: { owner: "self"; processId: string };
    initialTitle?: string;
    initialModel?: string;
    initialProvider?: ProviderName;
  } | null;

  return (
    <SessionSurface
      key={sessionId}
      projectId={projectId}
      sessionId={sessionId}
      initialStatus={navState?.initialStatus}
      initialTitle={navState?.initialTitle}
      initialModel={navState?.initialModel}
      initialProvider={navState?.initialProvider}
      variant="page"
    />
  );
}

function SessionPageInvalidRoute() {
  const { t } = useI18n();
  return <div className="error">{t("sessionInvalidUrl")}</div>;
}
