export type LatLng = { latitude: number; longitude: number };

const R = 6_371_000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distanceM(a: LatLng, b: LatLng): number {
  const dLat = rad(b.latitude - a.latitude);
  const dLng = rad(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.latitude)) * Math.cos(rad(b.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Distância legível: 350 m, 1,2 km, 12 km. */
export function formatDistance(meters: number): string {
  return meters < 1000 ? `${Math.round(meters)} m` : `${(meters / 1000).toFixed(meters < 10_000 ? 1 : 0).replace('.', ',')} km`;
}

export const toLatLng = (p: [number, number] | { lat: number; lng: number }): LatLng =>
  Array.isArray(p) ? { latitude: p[0], longitude: p[1] } : { latitude: p.lat, longitude: p.lng };

/**
 * Pontos usados para enquadrar o mapa. A posição do usuário só entra quando está perto do resto
 * (até `maxUserKm`): com o GPS em outra cidade o mapa virava um continente e a rota sumia.
 */
export function framingPoints(others: LatLng[], user?: LatLng | null, maxUserKm = 30): LatLng[] {
  if (!user) return others;
  if (others.length === 0) return [user];
  const c = {
    latitude: others.reduce((a, p) => a + p.latitude, 0) / others.length,
    longitude: others.reduce((a, p) => a + p.longitude, 0) / others.length,
  };
  return distanceM(user, c) <= maxUserKm * 1000 ? [...others, user] : others;
}
