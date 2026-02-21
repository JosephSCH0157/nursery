export default function Placeholder({ name }: { name: string }) {
  return (
    <div style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>{name}</h2>
      <p style={{ opacity: 0.7 }}>
        This route is a placeholder inside Nursery. Mount the production tool here when ready.
      </p>
    </div>
  );
}
