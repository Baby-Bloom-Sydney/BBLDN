-- 0001_areas.sql — the ordered migration set (02-data-model.md §6 row 0001)
--
-- Creates: `areas` (02 §4.2 row 1; R-9 — the Greater London geography source, natural key
-- `district text` PK, never `area_id uuid`) and seeds it with the real dataset.
--
-- Forced by: user_profiles.district (0002), nanny_positions.district (0006), the lead tables (0014).
-- Rollback twin: supabase/rollbacks/0001_areas.rollback.sql
--
-- The seed is **data of record**, not a dev fixture (HANDOFF §6.3 row 1): 291 Greater London
-- postcode districts derived from the ONS Postcode Directory, August 2026 release, served by
-- postcodes.io — see ../SPECS/00-foundations/_work/areas/README.md for the method, the
-- cross-check against Wikipedia's local-authority lists (282 of 291 two-source verified) and the
-- exclusions (21 non-geographic / PO-box codes, 16 never allocated, 39 outside Greater London).
--
-- Licence: Open Government Licence v3.0 — commercial use permitted **with attribution**. The site
-- must carry the three ONS lines (dataset README §7); that is a Phase 3 legal-page item, not a
-- schema one, and it is recorded as a gap in this unit's PROGRESS entry so it cannot be lost:
--   Contains OS data (c) Crown copyright and database right 2026
--   Contains Royal Mail data (c) Royal Mail copyright and database right 2026
--   Source: Office for National Statistics licensed under the Open Government Licence v3.0
--
-- @adr ADR-101 — `borough` is stored and **seeded** (display / marketing only, never a filter);
--      the accepted set is every Greater London outward code (TW, KT, BR, CR, DA, EN, HA, IG,
--      RM, SM, UB, WD included). This supersedes HANDOFF §6.2's "borough not seeded" and
--      §6.3's 20-area `stub-20 v0` placeholder, both written before ADR-101 landed.
-- @adr ADR-028 / ADR-029 — area + postcode district is the unit of location (C-6); no full
--      postcode, no state, no borough as the unit.
-- Dataset README §8 Q-BAI: the nine boundary-sliver districts (EN6, EN9, IG9, KT18, KT19, KT22,
--      TW19, WD6, WD23) are seeded `is_active = true` — the README's stated default, and ADR-101
--      read literally. Flipping any of them is a one-row data migration, never an edit of this file.

-- ---------------------------------------------------------------------------
-- 1. Table (02 §4.2 row 1 · R-9)
-- ---------------------------------------------------------------------------

create table if not exists public.areas (
  district    text        primary key,
  area        text        not null,
  lat         double precision not null,
  lon         double precision not null,
  borough     text        null,
  is_active   boolean     not null default true,
  source      text        not null,
  seeded_at   timestamptz not null default now(),

  constraint areas_district_shape_check
    check (district = upper(district) and district ~ '^[A-Z]{1,2}[0-9][A-Z0-9]?$'),
  constraint areas_lat_range_check check (lat between -90 and 90),
  constraint areas_lon_range_check check (lon between -180 and 180)
);

comment on table public.areas is
  '02 §4.2 / R-9: the Greater London geography source. Natural key = outward code. Seed-only; rows are never deleted, only is_active = false.';
comment on column public.areas.district is
  'Outward code, upper-case (SW4, E1W, EC2A) - the PostcodeDistrict of 03 §6.2.';
comment on column public.areas.area is
  'One name per district, as a parent would say it ("Clapham"). Denormalised onto profiles, positions and leads at write time by the areas connector (C-6).';
comment on column public.areas.borough is
  'ADR-101: display / marketing only. **Never** filtered on - the service area is all of Greater London.';
comment on column public.areas.source is
  'R-9: dataset + version, so a later refresh is traceable.';
comment on column public.areas.seeded_at is
  'C-4 audit column for a seed-only table: areas has no created_at/updated_at because nothing mutates a row outside a data migration.';

-- ---------------------------------------------------------------------------
-- 2. Seed — 291 rows (291 active), source ONSPD 2026-08 (postcodes.io)
--    Idempotent: a re-run refreshes names, centroids and boroughs but never
--    resurrects a district an operator deactivated.
-- ---------------------------------------------------------------------------

insert into public.areas (district, area, lat, lon, borough, is_active, source)
values
  ('BR1', 'Bromley', 51.41204, 0.02093, 'Bromley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('BR2', 'Hayes', 51.38725, 0.02238, 'Bromley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('BR3', 'Beckenham', 51.40466, -0.02974, 'Bromley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('BR4', 'West Wickham', 51.37498, -0.00829, 'Bromley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('BR5', 'Petts Wood', 51.39172, 0.1034, 'Bromley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('BR6', 'Orpington', 51.36513, 0.09116, 'Bromley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('BR7', 'Chislehurst', 51.41501, 0.06546, 'Bromley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('BR8', 'Swanley', 51.39869, 0.17454, 'Bromley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('CR0', 'Croydon', 51.37325, -0.07795, 'Croydon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('CR2', 'South Croydon', 51.34783, -0.08201, 'Croydon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('CR3', 'Caterham', 51.28836, -0.08261, 'Croydon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('CR4', 'Mitcham', 51.40439, -0.15916, 'Croydon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('CR5', 'Coulsdon', 51.31094, -0.14133, 'Croydon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('CR6', 'Warlingham', 51.30952, -0.05291, 'Bromley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('CR7', 'Thornton Heath', 51.3993, -0.10672, 'Croydon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('CR8', 'Purley', 51.33185, -0.11436, 'Croydon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('DA1', 'Crayford', 51.44808, 0.20952, 'Bexley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('DA5', 'Bexley', 51.44063, 0.14556, 'Bexley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('DA6', 'Bexleyheath', 51.45505, 0.13929, 'Bexley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('DA7', 'Bexleyheath', 51.46566, 0.1462, 'Bexley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('DA8', 'Erith', 51.47576, 0.17558, 'Bexley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('DA14', 'Sidcup', 51.42493, 0.11203, 'Bexley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('DA15', 'Sidcup', 51.44159, 0.09807, 'Bexley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('DA16', 'Welling', 51.46484, 0.10623, 'Bexley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('DA17', 'Belvedere', 51.4865, 0.14879, 'Bexley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('DA18', 'Thamesmead', 51.49428, 0.13629, 'Bexley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E1', 'Whitechapel', 51.51738, -0.05938, 'Tower Hamlets', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E1W', 'Wapping', 51.50943, -0.05892, 'Tower Hamlets', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E2', 'Bethnal Green', 51.52964, -0.06262, 'Tower Hamlets', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E3', 'Bow', 51.5281, -0.02482, 'Tower Hamlets', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E4', 'Chingford', 51.62174, -0.00573, 'Waltham Forest', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E5', 'Clapton', 51.55926, -0.05357, 'Hackney', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E6', 'East Ham', 51.52656, 0.05381, 'Newham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E7', 'Forest Gate', 51.54714, 0.02747, 'Newham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E8', 'Hackney', 51.54378, -0.06609, 'Hackney', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E9', 'Homerton', 51.54399, -0.04176, 'Hackney', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E10', 'Leyton', 51.5677, -0.01439, 'Waltham Forest', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E11', 'Leytonstone', 51.56869, 0.01356, 'Waltham Forest', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E12', 'Manor Park', 51.55073, 0.05307, 'Newham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E13', 'Plaistow', 51.52787, 0.0267, 'Newham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E14', 'Poplar', 51.50616, -0.01816, 'Tower Hamlets', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E15', 'Stratford', 51.54021, 0.00314, 'Newham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E16', 'Canning Town', 51.5103, 0.03015, 'Newham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E17', 'Walthamstow', 51.58696, -0.02084, 'Waltham Forest', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E18', 'South Woodford', 51.59278, 0.02504, 'Redbridge', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('E20', 'Olympic Park', 51.54631, -0.01062, 'Newham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC1A', 'Smithfield', 51.52053, -0.10413, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC1M', 'Clerkenwell', 51.52129, -0.1023, 'Islington', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC1N', 'Hatton Garden', 51.5199, -0.1088, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC1R', 'Clerkenwell', 51.52502, -0.10834, 'Islington', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC1V', 'Finsbury', 51.5268, -0.09777, 'Islington', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC1Y', 'St Luke''s', 51.52309, -0.09238, 'Islington', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC2A', 'Shoreditch', 51.52367, -0.08543, 'Islington', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC2M', 'Liverpool Street', 51.51857, -0.08616, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC2N', 'Old Broad Street', 51.51579, -0.08581, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC2R', 'Bank', 51.51629, -0.09108, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC2V', 'Guildhall', 51.51546, -0.09366, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC2Y', 'Barbican', 51.51947, -0.09355, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC3A', 'Aldgate', 51.51479, -0.08025, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC3M', 'Fenchurch Street', 51.51185, -0.0821, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC3N', 'Tower Hill', 51.51175, -0.07661, 'Tower Hamlets', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC3R', 'Monument', 51.51051, -0.08344, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC3V', 'Cornhill', 51.51301, -0.08578, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC4A', 'Fetter Lane', 51.51579, -0.10817, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC4M', 'St Paul''s', 51.51432, -0.09951, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC4N', 'Mansion House', 51.5128, -0.09129, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC4R', 'Cannon Street', 51.51087, -0.0904, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC4V', 'Blackfriars', 51.51249, -0.10001, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EC4Y', 'Temple', 51.51291, -0.10889, 'City of London', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EN1', 'Enfield Town', 51.6543, -0.06787, 'Enfield', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EN2', 'Enfield Chase', 51.66004, -0.09435, 'Enfield', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EN3', 'Ponders End', 51.66022, -0.03656, 'Enfield', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EN4', 'Cockfosters', 51.64938, -0.16004, 'Barnet', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EN5', 'Barnet', 51.65011, -0.19803, 'Barnet', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EN6', 'Potters Bar', 51.69955, -0.17615, 'Enfield', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EN7', 'Cheshunt', 51.71228, -0.06979, 'Enfield', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EN8', 'Waltham Cross', 51.69939, -0.03381, 'Enfield', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('EN9', 'Waltham Abbey', 51.69629, 0.01529, 'Enfield', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('HA0', 'Wembley', 51.55107, -0.3053, 'Brent', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('HA1', 'Harrow', 51.58037, -0.33862, 'Brent', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('HA2', 'South Harrow', 51.57375, -0.36136, 'Harrow', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('HA3', 'Harrow Weald', 51.59381, -0.32094, 'Brent', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('HA4', 'Ruislip', 51.5703, -0.41067, 'Hillingdon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('HA5', 'Pinner', 51.59503, -0.38632, 'Harrow', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('HA6', 'Northwood', 51.61193, -0.42251, 'Hillingdon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('HA7', 'Stanmore', 51.61131, -0.3107, 'Barnet', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('HA8', 'Edgware', 51.61136, -0.27381, 'Barnet', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('HA9', 'Wembley Park', 51.56063, -0.28509, 'Brent', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('IG1', 'Ilford', 51.55946, 0.07343, 'Redbridge', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('IG2', 'Gants Hill', 51.57619, 0.08157, 'Redbridge', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('IG3', 'Seven Kings', 51.56317, 0.10279, 'Redbridge', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('IG4', 'Redbridge', 51.58006, 0.0512, 'Redbridge', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('IG5', 'Clayhall', 51.5913, 0.06346, 'Redbridge', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('IG6', 'Barkingside', 51.59596, 0.08764, 'Redbridge', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('IG7', 'Chigwell', 51.61428, 0.09601, 'Redbridge', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('IG8', 'Woodford Green', 51.60884, 0.03656, 'Redbridge', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('IG9', 'Buckhurst Hill', 51.6258, 0.04044, 'Redbridge', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('IG11', 'Barking', 51.53444, 0.09384, 'Barking and Dagenham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('KT1', 'Kingston upon Thames', 51.40763, -0.29828, 'Kingston upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('KT2', 'Kingston upon Thames', 51.41904, -0.29045, 'Kingston upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('KT3', 'New Malden', 51.39964, -0.25769, 'Kingston upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('KT4', 'Worcester Park', 51.37838, -0.24305, 'Kingston upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('KT5', 'Berrylands', 51.39053, -0.28674, 'Kingston upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('KT6', 'Surbiton', 51.38743, -0.3028, 'Kingston upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('KT7', 'Thames Ditton', 51.38802, -0.33407, 'Kingston upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('KT8', 'East Molesey', 51.40151, -0.36284, 'Richmond upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('KT9', 'Chessington', 51.36385, -0.3032, 'Kingston upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('KT17', 'Epsom', 51.34132, -0.24924, 'Sutton', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('KT18', 'Epsom', 51.31601, -0.26331, 'Kingston upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('KT19', 'Epsom', 51.35274, -0.27082, 'Kingston upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('KT22', 'Leatherhead', 51.30192, -0.33955, 'Kingston upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N1', 'Islington', 51.53777, -0.09698, 'Hackney', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N1C', 'King''s Cross', 51.53693, -0.1259, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N2', 'East Finchley', 51.59009, -0.16928, 'Barnet', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N3', 'Finchley', 51.60014, -0.19383, 'Barnet', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N4', 'Finsbury Park', 51.57011, -0.10375, 'Haringey', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N5', 'Highbury', 51.5539, -0.09854, 'Islington', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N6', 'Highgate', 51.57323, -0.1462, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N7', 'Holloway', 51.55334, -0.11829, 'Islington', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N8', 'Crouch End', 51.58313, -0.11974, 'Haringey', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N9', 'Lower Edmonton', 51.6285, -0.05807, 'Enfield', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N10', 'Muswell Hill', 51.59495, -0.14522, 'Haringey', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N11', 'New Southgate', 51.61371, -0.13894, 'Enfield', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N12', 'North Finchley', 51.6149, -0.17762, 'Barnet', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N13', 'Palmers Green', 51.61805, -0.10423, 'Enfield', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N14', 'Southgate', 51.63442, -0.13093, 'Enfield', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N15', 'South Tottenham', 51.58279, -0.08098, 'Haringey', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N16', 'Stoke Newington', 51.56252, -0.07663, 'Islington', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N17', 'Tottenham', 51.59772, -0.07124, 'Haringey', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N18', 'Upper Edmonton', 51.61381, -0.06659, 'Enfield', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N19', 'Archway', 51.56526, -0.13005, 'Islington', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N20', 'Whetstone', 51.62925, -0.17431, 'Barnet', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N21', 'Winchmore Hill', 51.63673, -0.09967, 'Enfield', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('N22', 'Wood Green', 51.59979, -0.11019, 'Haringey', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('NW1', 'Camden Town', 51.53341, -0.14385, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('NW2', 'Cricklewood', 51.55832, -0.22014, 'Barnet', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('NW3', 'Hampstead', 51.55235, -0.17254, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('NW4', 'Hendon', 51.58735, -0.22424, 'Barnet', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('NW5', 'Kentish Town', 51.55173, -0.14511, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('NW6', 'Kilburn', 51.54219, -0.19623, 'Brent', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('NW7', 'Mill Hill', 51.61468, -0.23374, 'Barnet', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('NW8', 'St John''s Wood', 51.53218, -0.17432, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('NW9', 'Kingsbury', 51.58818, -0.25473, 'Barnet', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('NW10', 'Willesden', 51.54118, -0.24817, 'Brent', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('NW11', 'Golders Green', 51.57837, -0.19741, 'Barnet', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM1', 'Romford', 51.58294, 0.18356, 'Havering', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM2', 'Gidea Park', 51.5843, 0.20341, 'Havering', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM3', 'Harold Wood', 51.60194, 0.22451, 'Havering', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM4', 'Havering-atte-Bower', 51.6412, 0.15932, 'Havering', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM5', 'Collier Row', 51.60131, 0.16476, 'Havering', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM6', 'Chadwell Heath', 51.57585, 0.1296, 'Barking and Dagenham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM7', 'Rush Green', 51.57517, 0.16854, 'Havering', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM8', 'Becontree', 51.55713, 0.12934, 'Barking and Dagenham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM9', 'Dagenham', 51.54023, 0.13462, 'Barking and Dagenham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM10', 'Dagenham', 51.54489, 0.15791, 'Barking and Dagenham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM11', 'Hornchurch', 51.57118, 0.21872, 'Havering', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM12', 'Elm Park', 51.5526, 0.20755, 'Havering', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM13', 'Rainham', 51.52505, 0.19209, 'Havering', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM14', 'Upminster', 51.55698, 0.26545, 'Havering', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('RM15', 'South Ockendon', 51.50884, 0.27625, 'Havering', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE1', 'Southwark', 51.49916, -0.09145, 'Lambeth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE2', 'Abbey Wood', 51.48989, 0.11625, 'Greenwich', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE3', 'Blackheath', 51.46899, 0.02028, 'Greenwich', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE4', 'Brockley', 51.461, -0.03517, 'Lewisham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE5', 'Camberwell', 51.47391, -0.09146, 'Lambeth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE6', 'Catford', 51.43853, -0.0165, 'Lewisham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE7', 'Charlton', 51.48412, 0.03394, 'Greenwich', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE8', 'Deptford', 51.482, -0.02962, 'Lewisham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE9', 'Eltham', 51.44507, 0.05492, 'Greenwich', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE10', 'Greenwich', 51.48487, 0.00069, 'Greenwich', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE11', 'Kennington', 51.48978, -0.11158, 'Lambeth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE12', 'Lee', 51.44455, 0.01984, 'Lewisham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE13', 'Lewisham', 51.45964, -0.00967, 'Lewisham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE14', 'New Cross', 51.47595, -0.04227, 'Lewisham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE15', 'Peckham', 51.47283, -0.06557, 'Southwark', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE16', 'Rotherhithe', 51.49657, -0.05317, 'Southwark', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE17', 'Walworth', 51.48832, -0.0934, 'Southwark', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE18', 'Woolwich', 51.48448, 0.07235, 'Greenwich', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE19', 'Crystal Palace', 51.41796, -0.08611, 'Croydon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE20', 'Penge', 51.41221, -0.05949, 'Bromley', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE21', 'Dulwich', 51.43897, -0.08873, 'Southwark', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE22', 'East Dulwich', 51.45444, -0.07238, 'Southwark', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE23', 'Forest Hill', 51.44149, -0.04911, 'Lewisham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE24', 'Herne Hill', 51.45577, -0.10036, 'Lambeth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE25', 'South Norwood', 51.39777, -0.07667, 'Croydon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE26', 'Sydenham', 51.42774, -0.05464, 'Lewisham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE27', 'West Norwood', 51.43064, -0.10242, 'Lambeth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SE28', 'Thamesmead', 51.50198, 0.1036, 'Greenwich', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SM1', 'Sutton', 51.36712, -0.19281, 'Sutton', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SM2', 'Sutton', 51.35182, -0.1988, 'Sutton', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SM3', 'Cheam', 51.37129, -0.21625, 'Sutton', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SM4', 'Morden', 51.39302, -0.19969, 'Merton', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SM5', 'Carshalton', 51.36875, -0.16896, 'Sutton', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SM6', 'Wallington', 51.36168, -0.14464, 'Sutton', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SM7', 'Banstead', 51.323, -0.20134, 'Sutton', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW1A', 'St James''s', 51.50453, -0.13214, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW1E', 'Victoria', 51.49808, -0.13982, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW1H', 'St James''s Park', 51.49865, -0.13351, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW1P', 'Westminster', 51.48983, -0.13274, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW1V', 'Pimlico', 51.48951, -0.13999, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW1W', 'Belgravia', 51.49267, -0.1511, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW1X', 'Belgravia', 51.49825, -0.15675, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW1Y', 'St James''s', 51.50764, -0.13453, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW2', 'Brixton', 51.44929, -0.11979, 'Lambeth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW3', 'Chelsea', 51.48939, -0.16592, 'Kensington and Chelsea', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW4', 'Clapham', 51.46098, -0.13647, 'Lambeth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW5', 'Earl''s Court', 51.49163, -0.19189, 'Kensington and Chelsea', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW6', 'Fulham', 51.47657, -0.20098, 'Hammersmith and Fulham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW7', 'South Kensington', 51.49631, -0.17698, 'Kensington and Chelsea', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW8', 'Vauxhall', 51.47679, -0.13197, 'Lambeth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW9', 'Stockwell', 51.46936, -0.11388, 'Lambeth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW10', 'West Brompton', 51.48368, -0.18275, 'Kensington and Chelsea', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW11', 'Battersea', 51.46875, -0.16284, 'Wandsworth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW12', 'Balham', 51.44632, -0.14906, 'Wandsworth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW13', 'Barnes', 51.47631, -0.24319, 'Richmond upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW14', 'East Sheen', 51.46538, -0.267, 'Richmond upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW15', 'Putney', 51.45695, -0.22862, 'Wandsworth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW16', 'Streatham', 51.42123, -0.12925, 'Lambeth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW17', 'Tooting', 51.43103, -0.16525, 'Wandsworth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW18', 'Wandsworth', 51.45152, -0.19145, 'Wandsworth', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW19', 'Wimbledon', 51.42417, -0.20281, 'Merton', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('SW20', 'Raynes Park', 51.41079, -0.22786, 'Merton', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW1', 'Twickenham', 51.45102, -0.32538, 'Richmond upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW2', 'Whitton', 51.44632, -0.35454, 'Richmond upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW3', 'Hounslow', 51.46829, -0.36396, 'Hounslow', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW4', 'Hounslow West', 51.46546, -0.38798, 'Hounslow', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW5', 'Heston', 51.48248, -0.3863, 'Hounslow', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW6', 'Heathrow', 51.47079, -0.44874, 'Hillingdon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW7', 'Isleworth', 51.47288, -0.33601, 'Hounslow', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW8', 'Brentford', 51.48744, -0.3051, 'Hounslow', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW9', 'Richmond', 51.46961, -0.29238, 'Richmond upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW10', 'Richmond', 51.44773, -0.30288, 'Richmond upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW11', 'Teddington', 51.42629, -0.33178, 'Richmond upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW12', 'Hampton', 51.42296, -0.36973, 'Richmond upon Thames', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW13', 'Feltham', 51.43906, -0.40193, 'Hounslow', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW14', 'Feltham', 51.45334, -0.42172, 'Hounslow', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW15', 'Ashford', 51.43124, -0.45875, 'Hounslow', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('TW19', 'Stanwell', 51.45435, -0.49838, 'Hillingdon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('UB1', 'Southall', 51.51535, -0.37366, 'Ealing', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('UB2', 'Southall', 51.49968, -0.37888, 'Ealing', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('UB3', 'Hayes', 51.50515, -0.42439, 'Hillingdon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('UB4', 'Hayes', 51.52599, -0.40855, 'Hillingdon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('UB5', 'Northolt', 51.54307, -0.3765, 'Ealing', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('UB6', 'Greenford', 51.53918, -0.34033, 'Ealing', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('UB7', 'West Drayton', 51.50438, -0.4692, 'Hillingdon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('UB8', 'Uxbridge', 51.53508, -0.47355, 'Hillingdon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('UB9', 'Harefield', 51.58641, -0.49236, 'Hillingdon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('UB10', 'Hillingdon', 51.54932, -0.45206, 'Hillingdon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('UB11', 'Stockley Park', 51.51155, -0.44735, 'Hillingdon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W1B', 'Regent Street', 51.51437, -0.14094, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W1C', 'Oxford Street', 51.51443, -0.14907, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W1D', 'Soho', 51.51332, -0.13269, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W1F', 'Soho', 51.51349, -0.13644, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W1G', 'Marylebone', 51.51933, -0.14825, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W1H', 'Marylebone', 51.5177, -0.16121, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W1J', 'Mayfair', 51.50787, -0.14508, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W1K', 'Mayfair', 51.51112, -0.15103, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W1S', 'Mayfair', 51.5112, -0.14239, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W1T', 'Fitzrovia', 51.52029, -0.13673, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W1U', 'Marylebone', 51.5187, -0.15348, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W1W', 'Fitzrovia', 51.51921, -0.14088, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W2', 'Paddington', 51.51522, -0.18519, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W3', 'Acton', 51.51105, -0.26754, 'Ealing', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W4', 'Chiswick', 51.49118, -0.26409, 'Hounslow', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W5', 'Ealing', 51.51341, -0.30218, 'Ealing', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W6', 'Hammersmith', 51.49256, -0.22844, 'Hammersmith and Fulham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W7', 'Hanwell', 51.5119, -0.33597, 'Ealing', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W8', 'Kensington', 51.50119, -0.19425, 'Kensington and Chelsea', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W9', 'Maida Vale', 51.52486, -0.19263, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W10', 'North Kensington', 51.52319, -0.21675, 'Kensington and Chelsea', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W11', 'Notting Hill', 51.51227, -0.21554, 'Kensington and Chelsea', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W12', 'Shepherd''s Bush', 51.50839, -0.23976, 'Hammersmith and Fulham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W13', 'West Ealing', 51.513, -0.3212, 'Ealing', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('W14', 'West Kensington', 51.49469, -0.21025, 'Hammersmith and Fulham', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WC1A', 'Holborn', 51.52034, -0.11999, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WC1B', 'Bloomsbury', 51.51945, -0.1261, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WC1E', 'Bloomsbury', 51.52172, -0.13283, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WC1H', 'St Pancras', 51.52686, -0.12568, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WC1N', 'Bloomsbury', 51.52292, -0.11973, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WC1R', 'Gray''s Inn', 51.51963, -0.11578, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WC1V', 'Holborn', 51.51802, -0.11655, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WC1X', 'King''s Cross', 51.52664, -0.11496, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WC2A', 'Lincoln''s Inn', 51.51619, -0.11415, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WC2B', 'Aldwych', 51.51494, -0.12047, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WC2E', 'Covent Garden', 51.51189, -0.12333, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WC2H', 'Leicester Square', 51.51332, -0.12735, 'Camden', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WC2N', 'Charing Cross', 51.50913, -0.12489, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WC2R', 'Strand', 51.51177, -0.11815, 'Westminster', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WD3', 'Rickmansworth', 51.64677, -0.4824, 'Hillingdon', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WD6', 'Borehamwood', 51.65745, -0.27558, 'Barnet', true, 'ONSPD 2026-08 (postcodes.io)'),
  ('WD23', 'Bushey', 51.64532, -0.35801, 'Harrow', true, 'ONSPD 2026-08 (postcodes.io)')
on conflict (district) do update set
  area    = excluded.area,
  lat     = excluded.lat,
  lon     = excluded.lon,
  borough = excluded.borough,
  source  = excluded.source;

-- The nine boundary-sliver districts (dataset README §6) are the rows where the
-- borough came from ONSPD alone - Wikipedia lists no London authority for them, and
-- their post town is outside Greater London. ONSPD places a handful of their
-- postcodes inside the borough named, so the row is not wrong, but it is not what a
-- parent would read either: "Epsom, Kingston upon Thames" and "Potters Bar, Enfield"
-- are the labels it produces (database-reviewer M-6 measured the same on BR8, CR3,
-- CR6 and WD3, which the dataset marks verified and this file therefore leaves
-- alone - recorded as a dataset question in this unit's PROGRESS entry).
-- ADR-101 makes `borough` display-only, so the conservative reading is: do not
-- display what only one source supports. `is_active` stays true - the district IS in
-- area, which is the decision ADR-101 actually made - and restoring a borough later
-- is a one-row data migration, never an edit of this file.
update public.areas
set borough = null
where district in ('EN6', 'EN9', 'IG9', 'KT18', 'KT19', 'KT22', 'TW19', 'WD6', 'WD23');

-- ---------------------------------------------------------------------------
-- 3. RLS (02 C-10; 07 §5.2 row `areas`) — every role reads active rows, nobody writes.
--    The admin "SELECT all" row of 07 §5.2 needs is_admin(), which arrives in 0002,
--    so that one policy is added in 0016 with the rest of the cluster wording.
-- ---------------------------------------------------------------------------

alter table public.areas enable row level security;
alter table public.areas force row level security;

drop policy if exists areas_anon_select on public.areas;
create policy areas_anon_select on public.areas
  for select to anon
  using (is_active);

drop policy if exists areas_authenticated_select on public.areas;
create policy areas_authenticated_select on public.areas
  for select to authenticated
  using (is_active);

-- No INSERT / UPDATE / DELETE policy for any client role: seed-only (02 §4.2 row 1).

-- ---------------------------------------------------------------------------
-- 4. Verify
-- ---------------------------------------------------------------------------

do $$
declare
  v_rows int;
  v_active int;
  v_no_borough int;
  v_bad int;
begin
  select count(*), count(*) filter (where is_active), count(*) filter (where borough is null)
    into v_rows, v_active, v_no_borough
  from public.areas;

  if v_rows <> 291 then
    raise exception '0001: expected 291 areas rows (dataset README §4), found %', v_rows;
  end if;
  -- Deliberately NOT asserting that all 291 are active: the seed's ON CONFLICT
  -- preserves is_active precisely so an operator may deactivate a district, and a
  -- later re-run of this file must not then fail (database-reviewer M-2).
  if v_active < 1 then
    raise exception '0001: every area row is inactive - the seed cannot have run correctly';
  end if;
  if v_no_borough <> 9 then
    raise exception '0001: expected the 9 single-source sliver districts to carry a null borough, found %', v_no_borough;
  end if;

  -- the 03 §6.3 stub districts must all resolve, or the areas connector's own fixtures lie
  select count(*) into v_bad
  from unnest(array['SW4','N1','E8','SW2','SW6','W4','NW3','SE10','E15','SW12',
                    'SW19','W5','NW1','SE15','TW9','SW11','E17','N8','SW15','EC2A']) d
  where not exists (select 1 from public.areas a where a.district = d);
  if v_bad <> 0 then
    raise exception '0001: % of the 20 stub-areas districts (03 §6.3) are missing from the seed', v_bad;
  end if;

  if not exists (
    select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'areas' and c.relrowsecurity and c.relforcerowsecurity
  ) then
    raise exception '0001: areas must ENABLE and FORCE row level security (02 C-10)';
  end if;
end
$$;
