# Trip Planner Admin v1

Functional admin panel for adding custom interesting places to Trip Planner.

## Features
- Supabase email/password admin login
- Mapbox map
- click the map to choose coordinates
- search Mapbox locations
- add/edit/delete places
- categories match the Android app
- active/inactive places
- Georgian + English names
- description, image URL, rating and visit time

## Setup

1. In Supabase open **SQL Editor** and run `schema.sql`.
2. In **Authentication -> Users**, create your admin user.
3. Copy that user's UUID and run:

```sql
insert into public.admin_users (user_id)
values ('YOUR_ADMIN_USER_UUID');
```

4. Open `config.js` and add:
   - Supabase project URL
   - Supabase anon/public key
   - Mapbox public `pk...` token

5. Start a local server in this folder:

```bash
python -m http.server 8080
```

6. Open `http://localhost:8080`.

## Connect to the Android app
`mobile-integration.js` contains the code pattern for loading admin-added places from Supabase and filtering them by:
- route
- selected radius
- selected interest/category

The app can then merge those admin places with Mapbox/OSM suggestions.

## Security
The SQL uses Row Level Security:
- public/mobile users can only read active places
- only authenticated users present in `admin_users` may create/update/delete
- use the Supabase anon/public key in this panel, never the service-role key
