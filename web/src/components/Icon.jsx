export default function Icon({ name, filled = false, size, className = '', style }) {
  return (
    <span
      className={`material-symbols-outlined ${className}`}
      style={{
        fontVariationSettings: filled ? "'FILL' 1,'wght' 400,'GRAD' 0,'opsz' 20" : undefined,
        fontSize: size,
        ...style,
      }}
      aria-hidden="true"
    >
      {name}
    </span>
  );
}
