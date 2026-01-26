export default function SettingsHome() {
  return (
    <div
      style={{
        border: "1px solid #ddd",
        borderRadius: 8,
        padding: 16,
        background: "#fff",
        maxWidth: 540,
      }}
    >
      <h3 style={{ marginTop: 0 }}>Workspace Settings</h3>
      <p style={{ margin: 0 }}>
        Storage decisions live under <strong>Storage (Mounts)</strong>. Pick your storage path per workspace role and every tool will obey it
        automatically.
      </p>
    </div>
  );
}
