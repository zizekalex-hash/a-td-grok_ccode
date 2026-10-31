import { createFileRoute } from "@tanstack/react-router";
import { Stage } from "@/components/game/Stage";

export const Route = createFileRoute("/")({
  component: Stage,
});
