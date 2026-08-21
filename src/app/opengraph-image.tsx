import {ImageResponse} from "next/og";

export const alt = "LIA Marketplace — shop independent local stores";
export const size = {width: 1200, height: 630};
export const contentType = "image/png";

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background: "linear-gradient(135deg, #fff7ed 0%, #ffffff 52%, #ecfdf5 100%)",
        color: "#0f172a",
        display: "flex",
        height: "100%",
        justifyContent: "center",
        padding: "70px",
        width: "100%",
      }}
    >
      <div style={{display: "flex", flexDirection: "column", maxWidth: "1000px"}}>
        <div style={{color: "#ea580c", display: "flex", fontSize: 34, fontWeight: 800, letterSpacing: 5}}>
          LIA MARKETPLACE
        </div>
        <div style={{display: "flex", fontSize: 76, fontWeight: 900, lineHeight: 1.06, marginTop: 28}}>
          Independent stores, delivered to your door.
        </div>
        <div style={{color: "#475569", display: "flex", fontSize: 30, lineHeight: 1.4, marginTop: 28}}>
          Shop local and international products while supporting small businesses in your community.
        </div>
      </div>
    </div>,
    size,
  );
}
