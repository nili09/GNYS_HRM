import Icon from "../components/Icon.jsx";

export default function Placeholder({ title }) {
  return (
    <div>
      <h2 style={{ fontSize: 17, fontWeight: 650, marginBottom: 20 }}>{title}</h2>
      <div
        style={{
          background: "var(--card)", border: "1px solid var(--line)", borderRadius: "var(--r-card)",
          padding: 40, textAlign: "center",

        }}
      >
        <div style={{ fontSize: 32, marginBottom: 12 }}><Icon name="construction" size="40px" /></div>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>{title}</div>
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>
          This section is coming in a future stage.
        </div>
      </div>
    </div>
  );
}
