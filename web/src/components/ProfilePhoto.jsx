/**
 * Renders either the employee's profile photo (via /api/attachments/:id/thumb)
 * or a fallback letter avatar.
 *
 * Props:
 *   employee  — object with at least { name, profile_photo_id }
 *   size      — pixel diameter (default 44)
 *   style     — optional extra styles to merge
 */
export default function ProfilePhoto({ employee, size = 44, style = {} }) {
  const initials = (employee?.name || "?")
    .split(" ")
    .map(w => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  const baseStyle = {
    width: size,
    height: size,
    borderRadius: "50%",
    flexShrink: 0,
    overflow: "hidden",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    ...style,
  };

  if (employee?.profile_photo_id) {
    return (
      <div style={baseStyle}>
        <img
          src={`/api/attachments/${employee.profile_photo_id}/thumb`}
          alt={employee.name || "Photo"}
          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          onError={(e) => {
            // Fallback to initials on load error
            e.target.style.display = "none";
            e.target.parentElement.style.background = "var(--ink)";
            e.target.parentElement.style.color = "var(--lime)";
            e.target.parentElement.style.fontSize = `${Math.round(size * 0.4)}px`;
            e.target.parentElement.style.fontWeight = "700";
            e.target.parentElement.textContent = initials;
          }}
        />
      </div>
    );
  }

  return (
    <div style={{
      ...baseStyle,
      background: style.background || "var(--ink)",
      color: style.color || "var(--lime)",
      fontSize: Math.round(size * 0.4),
      fontWeight: 700,
    }}>
      {initials}
    </div>
  );
}
