/**
 * Organic blob geometry shared by the hero surfaces and the decorative
 * topographic contour field. Authored in a 200x200 viewBox so it can be
 * scaled to any size, and so contour rings are just scaled copies of it.
 */

export const BLOB_VIEWBOX = 200;

export const BLOB_PATH =
  'M104 7 C144 4 180 28 190 66 C199 101 176 128 157 153 C134 182 101 199 68 188 C32 176 11 145 8 108 C5 68 24 33 57 17 C72 10 89 8 104 7 Z';

/** A second, differently-lobed blob so stacked shapes don't look cloned. */
export const BLOB_PATH_ALT =
  'M96 6 C136 3 174 22 187 57 C200 93 182 126 160 150 C136 176 98 197 65 184 C30 170 13 138 10 102 C7 64 30 31 62 16 C73 10 85 7 96 6 Z';
