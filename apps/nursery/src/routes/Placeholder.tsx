export default function Placeholder({ name }: { name: string }) {
  return (
    <div style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0 }}>{name}</h2>
      <p style={{ opacity: 0.7 }}>
        This is a placeholder route inside Nursery. Next step is mounting the real app here.
      </p>
    </div>
  );
}
