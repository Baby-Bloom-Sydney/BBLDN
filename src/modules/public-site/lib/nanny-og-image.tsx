// `01.21` — the nanny OG image (nanny v1 kept), rebuilt over the marketplace-safe read: first name, area label,
// the DBS line, brand from `config` (L4). The photo is the read model's signed URL; `next/og` fetches it itself.
// No fonts fetched from a third party at request time (07 §10.3) — the default sans is enough for a card.
import { ImageResponse } from "next/og";
import { formatAreaLabel } from "@/modules/areas";
import { BRAND } from "@/modules/config";
import type { PublicNanny } from "@/modules/matching";

const WIDTH = 1200;
const HEIGHT = 630;

export function nannyOgImage(nanny: PublicNanny): ImageResponse {
  const area = formatAreaLabel({
    name: nanny.area.area,
    district: nanny.area.district,
  });
  return new ImageResponse(
    <div
      style={{
        width: WIDTH,
        height: HEIGHT,
        display: "flex",
        alignItems: "center",
        padding: 64,
        background: "linear-gradient(135deg, #f5f3ff 0%, #ffffff 60%)",
        fontFamily: "sans-serif",
        color: "#0f172a",
      }}
    >
      {nanny.photoUrl !== null ? (
        <img
          src={nanny.photoUrl}
          width={360}
          height={360}
          style={{
            width: 360,
            height: 360,
            borderRadius: 180,
            objectFit: "cover",
            marginRight: 64,
          }}
        />
      ) : (
        <div
          style={{
            width: 360,
            height: 360,
            borderRadius: 180,
            background: "#ede9fe",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 160,
            color: "#8b5cf6",
            marginRight: 64,
          }}
        >
          {nanny.firstName.charAt(0)}
        </div>
      )}
      <div style={{ display: "flex", flexDirection: "column" }}>
        <div
          style={{
            fontSize: 28,
            color: "#8b5cf6",
            letterSpacing: 4,
            textTransform: "uppercase",
          }}
        >
          {BRAND.longName}
        </div>
        <div style={{ fontSize: 88, fontWeight: 700, marginTop: 8 }}>
          {nanny.firstName}
        </div>
        <div style={{ fontSize: 40, color: "#475569", marginTop: 8 }}>
          {area}
        </div>
        <div style={{ fontSize: 32, color: "#166534", marginTop: 24 }}>
          ✓ Identity-checked · Enhanced DBS
        </div>
      </div>
    </div>,
    { width: WIDTH, height: HEIGHT },
  );
}
