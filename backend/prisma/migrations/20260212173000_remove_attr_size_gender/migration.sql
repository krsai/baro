-- Drop size/gender attribute tables.
-- Size and gender are now managed as fixed app codes:
-- SIZE: XS, S, M, L, XL, 2XL, 3XL, 4XL
-- GENDER: M, W, U
DROP TABLE IF EXISTS "AttrSize";
DROP TABLE IF EXISTS "AttrGender";
