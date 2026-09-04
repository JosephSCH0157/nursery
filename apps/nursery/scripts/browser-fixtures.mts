import { cleanBrowserFixtures, provisionBrowserFixtures, verifyBrowserFixtures } from "./browser-fixture-authority.mts";

const command = process.argv[2] ?? "verify";
try {
  if (command === "provision") {
    const manifest = await provisionBrowserFixtures();
    console.log(`[browser-fixtures] provisioned ${manifest.project_ref} workspace=${manifest.workspace_id}`);
  } else if (command === "verify") {
    const manifest = await verifyBrowserFixtures();
    console.log(`[browser-fixtures] verified workspace=${manifest.workspace_id} hammer=${manifest.hammer_workpiece_id}`);
  } else if (command === "clean") {
    await cleanBrowserFixtures(process.argv.includes("--confirm-fixture-destruction"));
    console.log("[browser-fixtures] fixture namespace removed");
  } else throw new Error(`Unknown browser fixture command: ${command}`);
} catch (error) {
  console.error(`[browser-fixtures] ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
}
