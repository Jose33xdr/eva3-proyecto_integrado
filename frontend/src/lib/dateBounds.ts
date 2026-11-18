export const localDateBound = (
  value: string,
  boundary: "start" | "end",
) => {
  const time = boundary === "start" ? "00:00:00.000" : "23:59:59.999";
  return new Date(`${value}T${time}`).toISOString();
};

export const formatDateOnly = (value: string) =>
  new Date(value).toLocaleDateString("es-CL", { timeZone: "UTC" });
