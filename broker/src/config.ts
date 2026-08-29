import dotenv from "dotenv";

dotenv.config();

export type GridNexusMode = "production" | "simulation" | "test";

export const getGridNexusMode = (): GridNexusMode => {
  const mode = process.env.GRIDNEXUS_MODE?.toLowerCase();
  if (mode === "production" || mode === "simulation" || mode === "test") {
    return mode as GridNexusMode;
  }
  // Default to simulation if not strictly set, as per previous behavior,
  // BUT we strongly encourage explicit setting.
  return "simulation";
};

export const isProduction = () => getGridNexusMode() === "production";
export const isSimulation = () => getGridNexusMode() === "simulation";
export const isTest = () => getGridNexusMode() === "test";
