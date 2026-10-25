import { useState } from "react";
import type { AppEntry, GroupColor } from "../schema";
import { generateCover } from "../lib/cover";
import { initialOf } from "../lib/format";

export function Cover({ app, color }: { app: AppEntry; color: GroupColor }) {
  const [shotFailed, setShotFailed] = useState(false);
  const cover = app.cover;

  if (cover.kind === "svg" || cover.kind === "image") {
    return <img src={`/assets/${cover.src}`} alt="" loading="lazy" />;
  }
  if (cover.kind === "shot" && !shotFailed) {
    return (
      <img
        src={`/shots/${app.id}.webp`}
        alt=""
        loading="lazy"
        onError={() => setShotFailed(true)}
      />
    );
  }
  const label = cover.kind === "emoji" ? cover.value : initialOf(app.name);
  return (
    <div
      className="cover-svg"
      dangerouslySetInnerHTML={{ __html: generateCover({ id: app.id, color, label }) }}
    />
  );
}
