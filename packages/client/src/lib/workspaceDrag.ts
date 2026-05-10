import type { DragEvent } from "react";

export interface SessionDragPayload {
  sessionId: string;
  projectId: string;
  title: string;
}

const SESSION_DRAG_MIME = "application/x-yep-anywhere-session";
const SESSION_DRAG_TEXT_MIME = "text/x-yep-anywhere-session";

function parseSessionDragPayload(raw: string): SessionDragPayload | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<SessionDragPayload>;
    if (
      typeof parsed.sessionId === "string" &&
      typeof parsed.projectId === "string" &&
      typeof parsed.title === "string"
    ) {
      return parsed as SessionDragPayload;
    }
  } catch {
    return null;
  }

  return null;
}

export function setSessionDragData(
  event: DragEvent<HTMLElement>,
  payload: SessionDragPayload,
): void {
  const serialized = JSON.stringify(payload);
  event.dataTransfer.effectAllowed = "move";
  event.dataTransfer.setData(SESSION_DRAG_MIME, serialized);
  event.dataTransfer.setData(SESSION_DRAG_TEXT_MIME, serialized);
  event.dataTransfer.setData("text/plain", payload.title);
}

export function hasSessionDragData(event: DragEvent<HTMLElement>): boolean {
  const types = Array.from(event.dataTransfer.types);
  return (
    types.includes(SESSION_DRAG_MIME) || types.includes(SESSION_DRAG_TEXT_MIME)
  );
}

export function getSessionDragData(
  event: DragEvent<HTMLElement>,
): SessionDragPayload | null {
  return (
    parseSessionDragPayload(event.dataTransfer.getData(SESSION_DRAG_MIME)) ??
    parseSessionDragPayload(event.dataTransfer.getData(SESSION_DRAG_TEXT_MIME))
  );
}
