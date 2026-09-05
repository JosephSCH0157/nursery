import type { Config } from "@netlify/functions";
import runWorker from "./youtube-publication-background";
export default async function():Promise<void>{await runWorker()}
export const config:Config={schedule:"*/5 * * * *"};
