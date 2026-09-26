async function loadAdminPlaces() {
  const url = SUPABASE_URL + '/rest/v1/interesting_places?select=*&active=eq.true';
  const r = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + SUPABASE_ANON_KEY
    }
  });
  if (!r.ok) return [];
  return await r.json();
}

function adminPlacesNearRoute(adminPlaces, routeCoords, radiusKm, interests) {
  return adminPlaces
    .filter(p => interests.has(p.category))
    .map(p => ({
      id: 'admin-' + p.id,
      name: p.name_ka || p.name_en || 'Interesting place',
      lat: Number(p.latitude),
      lng: Number(p.longitude),
      type: p.category,
      tags: {
        provider: 'admin',
        description: p.description || '',
        image_url: p.image_url || '',
        rating: p.rating,
        visit_duration_min: p.visit_duration_min
      }
    }))
    .map(p => ({
      ...p,
      dist: nearest(p, routeCoords),
      prog: progress(p, routeCoords)
    }))
    .filter(p => p.dist <= radiusKm && p.prog > 0.02 && p.prog < 0.98);
}

// Inside findStops(coords):
// const adminPlaces = await loadAdminPlaces();
// all.push(...adminPlacesNearRoute(
//   adminPlaces, coords, state.searchRadiusKm, state.interests
// ));
