const WEEK_DAYS = [
  { key: "mon", label: "Mon", date: "Jan 26" },
  { key: "tue", label: "Tue", date: "Jan 27" },
  { key: "wed", label: "Wed", date: "Jan 28" },
  { key: "thu", label: "Thu", date: "Jan 29" },
  { key: "fri", label: "Fri", date: "Jan 30" },
  { key: "sat", label: "Sat", date: "Jan 31" },
  { key: "sun", label: "Sun", date: "Feb 01" },
];

const MOCK_SESSIONS = [
  {
    id: "sess-001",
    day: "mon",
    time: "9:30 AM",
    title: "Recording session",
    notes: "Ep 12 - Cold open + intro",
    duration: "90 min",
  },
  {
    id: "sess-002",
    day: "wed",
    time: "1:00 PM",
    title: "Recording session",
    notes: "Guest: Liv (remote)",
    duration: "60 min",
  },
  {
    id: "sess-003",
    day: "thu",
    time: "4:00 PM",
    title: "Recording session",
    notes: "Ep 13 - Q&A",
    duration: "75 min",
  },
  {
    id: "sess-004",
    day: "sat",
    time: "10:00 AM",
    title: "Recording session",
    notes: "Bonus clips",
    duration: "45 min",
  },
];

export default function TongsCalendar() {
  return (
    <div style={{ padding: 8, maxWidth: 1100 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Tongs Calendar</h2>
          <p style={{ marginTop: 6, opacity: 0.7 }}>Week view with local mock sessions.</p>
        </div>
        <div style={{ fontSize: 14, opacity: 0.7 }}>Week of Jan 26</div>
      </div>

      <div
        style={{
          marginTop: 18,
          border: "1px solid rgba(255,255,255,0.15)",
          borderRadius: 14,
          padding: 12,
          background: "rgba(255,255,255,0.05)",
          overflowX: "auto",
        }}
      >
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(160px, 1fr))", gap: 12 }}>
          {WEEK_DAYS.map((day) => {
            const sessions = MOCK_SESSIONS.filter((session) => session.day === day.key);
            return (
              <div
                key={day.key}
                style={{
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 12,
                  padding: 12,
                  minHeight: 200,
                  background: "rgba(0,0,0,0.2)",
                }}
              >
                <div style={{ fontWeight: 700 }}>{day.label}</div>
                <div style={{ fontSize: 12, opacity: 0.7 }}>{day.date}</div>

                <div style={{ marginTop: 12, display: "grid", gap: 10 }}>
                  {sessions.length === 0 && (
                    <div style={{ fontSize: 12, opacity: 0.5 }}>No sessions</div>
                  )}
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      style={{
                        borderRadius: 10,
                        padding: "10px 12px",
                        background: "rgba(255,255,255,0.08)",
                        border: "1px solid rgba(244,207,160,0.35)",
                      }}
                    >
                      <div style={{ fontSize: 12, letterSpacing: 0.3, textTransform: "uppercase", opacity: 0.7 }}>
                        {session.time}
                      </div>
                      <div style={{ marginTop: 4, fontWeight: 700 }}>{session.title}</div>
                      <div style={{ marginTop: 4, fontSize: 13, opacity: 0.8 }}>{session.notes}</div>
                      <div style={{ marginTop: 6, fontSize: 12, opacity: 0.6 }}>{session.duration}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

