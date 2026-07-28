/**
 * Dicebear Personas avatar URLs for employee profile images.
 * Gender shapes hair, eyes, and styling — seed stays tied to userId for consistency.
 */
const DARK_HAIR = "171717,1c1917,292524,362c47,3d2314,4a3728,6c4545";

/** Vibrant circle backgrounds that pair with the HRMS purple theme. */
const VIBRANT_BACKGROUNDS = "a78bfa,f472b6,38bdf8,34d399,818cf8,c084fc,2dd4bf";

export function employeeAvatarUrl(userId: string, gender: string | null): string {
  const seed = encodeURIComponent(userId);
  const root = [
    "https://api.dicebear.com/9.x/personas/svg",
    `seed=${seed}`,
    `backgroundColor=${VIBRANT_BACKGROUNDS}`,
    "clothingColor=7c3aed,6366f1,7555ca",
    "body=rounded,small",
    "nose=smallRound,mediumRound",
  ].join("&").replace("svg&", "svg?");

  if (gender === "female") {
    return [
      root,
      "hair=long,extraLong,curly,pigtails,straightBun,curlyBun",
      `hairColor=${DARK_HAIR}`,
      "eyes=open,happy,wink",
      "mouth=smile,bigSmile,lips",
      "facialHairProbability=0",
    ].join("&");
  }

  if (gender === "male") {
    return [
      root,
      "hair=shortCombover,fade,curlyHighTop,shortComboverChops,sideShave,bunUndercut",
      `hairColor=${DARK_HAIR}`,
      "eyes=open,happy,wink",
      "mouth=smile,bigSmile,smirk",
      "facialHairProbability=0",
    ].join("&");
  }

  return [
    root,
    "hair=long,extraLong,shortCombover,curly,curlyBun,straightBun,fade",
    `hairColor=${DARK_HAIR}`,
    "eyes=open,happy",
    "mouth=smile,bigSmile",
    "facialHairProbability=0",
  ].join("&");
}
